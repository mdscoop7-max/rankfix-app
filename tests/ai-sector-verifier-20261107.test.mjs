// AI sector verification: AI only proposes; RankFix verifies verbatim quotes on
// >=2 own pages. Mocked AI responses; no network.
import test from "node:test";
import assert from "node:assert/strict";
import { verifySectorWithAi, verifyProposal, shouldAskAi, buildEvidencePack } from "../lib/ai-sector-verifier.ts";

const ON = { RANKFIX_AI_SECTOR: "1", OPENAI_API_KEY: "sk-test" };
const options = [
  { sector: "education", key: "driving_school", label: "Rijschool & rijopleiding", vocab: [/rijschool|rijles|rijbewijs|instructeur/i] },
  { sector: "hospitality", key: "hotel", label: "Hotel & accommodatie", vocab: [/hotel/i] },
  { sector: "transport_travel", key: "travel", label: "Reisbemiddeling (online reisbureau)", vocab: [/vluchten|reisbureau/i] },
];
const pages = [
  { url: "https://x.test/", type: "homepage", title: "Grow | Eerder ANWB Rijopleiding", description: "Plan een proefles direct online.", headings: ["Eerder ANWB Rijopleiding, nu Grow."], text: "Haal je rijbewijs bij Grow. Onze instructeurs geven rijles in heel Nederland." },
  { url: "https://x.test/over-ons", type: "corporate", title: "Over ons | Grow", description: "", headings: ["Over Grow"], text: "Grow is een rijschool met meer dan 300 instructeurs voor auto en motor." },
];
const ai = (content, status = 200) => async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }), { status });
let calls = 0;
const counting = (content) => async (...a) => { calls++; return ai(content)(...a); };

test("off by default and without a key: no AI call", async () => {
  calls = 0;
  const r1 = await verifySectorWithAi({ profile: { sector: "unknown" }, pages, options, env: {}, fetchImpl: counting({}) });
  const r2 = await verifySectorWithAi({ profile: { sector: "unknown" }, pages, options, env: { RANKFIX_AI_SECTOR: "1" }, fetchImpl: counting({}) });
  assert.equal(r1.status, "disabled"); assert.equal(r2.status, "disabled"); assert.equal(calls, 0);
});

test("a rule-confirmed sector is never sent to AI (no cost, no override)", async () => {
  calls = 0;
  const r = await verifySectorWithAi({ profile: { sector: "hospitality", key: "hotel", confidenceScore: 90 }, pages, options, env: ON, fetchImpl: counting({}) });
  assert.equal(r.status, "not_needed"); assert.equal(calls, 0);
  assert.equal(shouldAskAi({ sector: "hospitality", confidenceScore: 76 }, ON).ask, true);
});

test("verified quotes on two own pages confirm an unknown sector", async () => {
  const r = await verifySectorWithAi({ profile: { sector: "unknown" }, pages, options, env: ON, fetchImpl: ai({ key: "driving_school", role: "eigen_dienstverlener", quotes: [
    { url: "https://x.test/", quote: "Onze instructeurs geven rijles in heel Nederland" },
    { url: "https://x.test/over-ons", quote: "Grow is een rijschool met meer dan 300 instructeurs" },
  ] }) });
  assert.equal(r.status, "confirmed"); assert.equal(r.option.key, "driving_school"); assert.equal(r.quotes.length, 2);
});

test("invented quotes, invented keys and single-page evidence are rejected", async () => {
  const fake = await verifySectorWithAi({ profile: { sector: "unknown" }, pages, options, env: ON, fetchImpl: ai({ key: "driving_school", role: "eigen_dienstverlener", quotes: [
    { url: "https://x.test/", quote: "De grootste rijschool van Europa sinds 1950" },
    { url: "https://x.test/over-ons", quote: "Grow is een rijschool met meer dan 300 instructeurs" },
  ] }) });
  assert.equal(fake.status, "rejected");
  const badKey = verifyProposal({ key: "flight_school", role: "eigen_dienstverlener", quotes: [] }, buildEvidencePack(pages), options);
  assert.equal(badKey.ok, false);
  const onePage = verifyProposal({ key: "driving_school", role: "eigen_dienstverlener", quotes: [
    { url: "https://x.test/", quote: "Onze instructeurs geven rijles in heel Nederland" },
    { url: "https://x.test/", quote: "Haal je rijbewijs bij Grow" },
  ] }, buildEvidencePack(pages), options);
  assert.equal(onePage.ok, false);
});

test("verified AI evidence contradicting an unconfirmed rule sector is a conflict", async () => {
  const r = await verifySectorWithAi({ profile: { sector: "hospitality", key: "hotel", confidenceScore: 72 }, pages, options, env: ON, fetchImpl: ai({ key: "driving_school", role: "eigen_dienstverlener", quotes: [
    { url: "https://x.test/", quote: "Onze instructeurs geven rijles in heel Nederland" },
    { url: "https://x.test/over-ons", quote: "Grow is een rijschool met meer dan 300 instructeurs" },
  ] }) });
  assert.equal(r.status, "conflict");
});

test("AI answering unknown, HTTP errors, bad JSON and timeouts never change anything", async () => {
  assert.equal((await verifySectorWithAi({ profile: { sector: "unknown" }, pages, options, env: ON, fetchImpl: ai({ key: "unknown", role: "onbekend", quotes: [] }) })).status, "unknown");
  assert.equal((await verifySectorWithAi({ profile: { sector: "unknown" }, pages, options, env: ON, fetchImpl: ai({}, 500) })).status, "error");
  assert.equal((await verifySectorWithAi({ profile: { sector: "unknown" }, pages, options, env: ON, fetchImpl: async () => new Response(JSON.stringify({ choices: [{ message: { content: "geen json" } }] })) })).status, "error");
  const slow = (u, init) => new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(new Error("aborted"))));
  const t = await verifySectorWithAi({ profile: { sector: "unknown" }, pages, options, env: ON, fetchImpl: slow, timeoutMs: 50 });
  assert.equal(t.status, "error"); assert.match(t.reason, /tijdslimiet/);
});

test("evidence pack: homepage and about first, capped text, at most 6 pages", () => {
  const many = Array.from({ length: 10 }, (_, i) => ({ url: `https://x.test/p${i}`, type: "other", title: `P${i}`, text: "x".repeat(5000) }));
  const pack = buildEvidencePack([...many, ...pages]);
  assert.equal(pack.length, 6); assert.equal(pack[0].type, "homepage"); assert.equal(pack[1].type, "corporate");
  assert.ok(pack.every((p) => (p.text || "").length <= 1200));
});

test("verbatim but irrelevant quotes (brand line, privacy page) do not prove the activity", async () => {
  const withPrivacy = [...pages, { url: "https://x.test/privacy", type: "other", title: "Privacyverklaring | Grow rijschool", text: "Grow rijschool verwerkt persoonsgegevens zorgvuldig." }];
  const r = await verifySectorWithAi({ profile: { sector: "unknown" }, pages: withPrivacy, options, env: ON, fetchImpl: ai({ key: "driving_school", role: "eigen_dienstverlener", quotes: [
    { url: "https://x.test/", quote: "Grow | Eerder ANWB Rijopleiding" },
    { url: "https://x.test/privacy", quote: "Grow rijschool verwerkt persoonsgegevens zorgvuldig" },
  ] }) });
  assert.equal(r.status, "rejected");
  const noVocab = verifyProposal({ key: "x", role: "eigen_dienstverlener", quotes: [] }, buildEvidencePack(pages), [{ sector: "s", key: "x", label: "X" }]);
  assert.equal(noVocab.ok, false);
});
