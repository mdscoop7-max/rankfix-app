import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  applyMetaDescriptionToSource, buildEvidenceDescription, checkDescriptionCandidate,
  generateMetaDescription, parseAiJsonObject, normalizeDescriptionText,
} from "../lib/meta-description-fix.ts";

const NEW = "Bekijk het assortiment van Voorbeeldshop: keukenspullen, tuingereedschap en opbergoplossingen, overzichtelijk per categorie geordend.";

test("new text fixture itself satisfies the 120–160 guideline", () => {
  assert.ok(NEW.length >= 120 && NEW.length <= 160, String(NEW.length));
  assert.equal(checkDescriptionCandidate(NEW).ok, true);
});

test("html: only the description content attribute changes", () => {
  const src = `<!doctype html><html><head><title>Voorbeeldshop | Alles voor huis</title>\n<meta name="description" content="Korte tekst over de winkel.">\n<meta property="og:description" content="Korte tekst over de winkel.">\n</head><body><h1>Welkom</h1></body></html>`;
  const r = applyMetaDescriptionToSource("templates/index.html", src, NEW, "Korte tekst over de winkel.");
  assert.equal(r.ok, true);
  assert.equal(r.mode, "html_attribute");
  assert.equal(r.content, src.replace('<meta name="description" content="Korte tekst over de winkel.">', `<meta name="description" content="${NEW}">`));
  assert.match(r.content, /og:description" content="Korte tekst over de winkel\."/);
});

test("html: attribute order and quoting variants, special characters escaped", () => {
  const src = `<head><meta content='Oud & kort' name='description' data-x></head>`;
  const r = applyMetaDescriptionToSource("index.html", src, NEW + "", "Oud & kort");
  assert.equal(r.ok, true);
  const amp = applyMetaDescriptionToSource("index.html", src, NEW.replace("keukenspullen", "pannen & \"potten\""), "Oud &amp; kort");
  assert.equal(amp.ok, true);
  assert.match(amp.content, /pannen &amp; &quot;potten&quot;/);
  assert.match(amp.content, /data-x>/);
});

test("jinja child template: only the description block changes", () => {
  const src = `{% extends "base.html" %}\n{% block title %}Account | Voorbeeldshop{% endblock %}\n{% block description %}Je accountomgeving.{% endblock %}\n{% block content %}<h1>Account</h1>{% endblock %}`;
  const r = applyMetaDescriptionToSource("templates/account.html", src, NEW, "Je accountomgeving.");
  assert.equal(r.ok, true);
  assert.equal(r.mode, "template_block");
  assert.equal(r.content, src.replace("Je accountomgeving.", NEW));
});

test("dynamic and parent-default descriptions are never edited", () => {
  const dyn = `<head><meta name="description" content="{{ product.seo_description }}"></head>`;
  assert.deepEqual(applyMetaDescriptionToSource("product.html", dyn, NEW, ""), { ok: false, code: "DYNAMIC_DESCRIPTION" });
  const base = `<head><title>{% block title %}Shop{% endblock %}</title><meta name="description" content="{% block description %}Standaardtekst.{% endblock %}"></head>`;
  assert.equal(applyMetaDescriptionToSource("base.html", base, NEW, "Standaardtekst.").ok, false);
});

test("file whose description differs from the live scan is not edited", () => {
  const src = `<head><meta name="description" content="Een andere pagina."></head>`;
  assert.deepEqual(applyMetaDescriptionToSource("about.html", src, NEW, "Korte tekst over de winkel."), { ok: false, code: "SCAN_MISMATCH" });
});

test("two description tags: ambiguous, nothing changes", () => {
  const src = `<head><meta name="description" content="A"><meta name="description" content="B"></head>`;
  assert.deepEqual(applyMetaDescriptionToSource("index.html", src, NEW, ""), { ok: false, code: "AMBIGUOUS_DESCRIPTION" });
});

test("missing description: one tag is inserted in this file's head", () => {
  const src = `<html><head><title>X</title></head><body></body></html>`;
  const r = applyMetaDescriptionToSource("index.html", src, NEW, "");
  assert.equal(r.ok, true);
  assert.equal(r.mode, "html_insert");
  assert.equal((r.content.match(/name="description"/g) || []).length, 1);
});

test("next.js metadata: top-level description only, openGraph untouched", () => {
  const src = `export const metadata = {\n  title: "Voorbeeldshop",\n  openGraph: { description: "Kort OG." },\n  description: "Kort.",\n};\n`;
  const r = applyMetaDescriptionToSource("app/layout.tsx", src, NEW, "Kort.");
  assert.equal(r.ok, true);
  assert.match(r.content, /openGraph: \{ description: "Kort OG\." \}/);
  assert.ok(r.content.includes(`description: ${JSON.stringify(NEW)}`));
});

test("evidence fallback uses only verified text and stays within the guideline", () => {
  const input = {
    current: "Ontdek keukenspullen, tuingereedschap en opbergoplossingen bij Voorbeeldshop.",
    h1: "Alles voor een opgeruimd en praktisch huis",
    title: "Voorbeeldshop | Handige spullen voor binnen en buiten",
  };
  const out = buildEvidenceDescription(input);
  assert.ok(out, "fallback expected");
  assert.ok(out.length >= 120 && out.length <= 160, String(out.length));
  const sourceWords = new Set(Object.values(input).join(" ").toLowerCase().match(/[\p{L}\p{N}]+/gu));
  for (const word of out.toLowerCase().match(/[\p{L}\p{N}]+/gu)) assert.ok(sourceWords.has(word), `invented word: ${word}`);
});

test("evidence fallback refuses when verified text is too thin", () => {
  assert.equal(buildEvidenceDescription({ current: "Webshop.", title: "Shop", h1: "" }), null);
});

test("ai json is extracted from fenced or chatty output", () => {
  assert.deepEqual(parseAiJsonObject('```json\n{"description":"a {b} c"}\n```'), { description: "a {b} c" });
  assert.deepEqual(parseAiJsonObject('Hier is het: {"description":"x \\" y"} klaar'), { description: 'x " y' });
  assert.equal(parseAiJsonObject(""), null);
});

test("normalize strips tags, entities and wrapping quotes", () => {
  assert.equal(normalizeDescriptionText(' "Pannen &amp; <b>potten</b>" '), "Pannen & potten");
});

function mockFetch(responses, seen) {
  return async (_url, init) => {
    seen.push(JSON.parse(init.body));
    const next = responses.shift();
    return new Response(typeof next.body === "string" ? next.body : JSON.stringify(next.body), { status: next.status || 200, headers: { "content-type": "application/json" } });
  };
}

async function withKey(fn, model) {
  const prev = { key: process.env.OPENAI_API_KEY, model: process.env.OPENAI_MODEL };
  process.env.OPENAI_API_KEY = "test-key-not-real";
  if (model) process.env.OPENAI_MODEL = model; else delete process.env.OPENAI_MODEL;
  const origError = console.error; console.error = () => {};
  try { return await fn(); } finally {
    console.error = origError;
    if (prev.key === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = prev.key;
    if (prev.model === undefined) delete process.env.OPENAI_MODEL; else process.env.OPENAI_MODEL = prev.model;
  }
}

const base = { url: "https://voorbeeld.test/", current: "Korte tekst over de winkel.", title: "Voorbeeldshop", h1: "Welkom" };

test("reasoning model: incomplete answer (budget spent on reasoning) is retried, not a 500", async () => {
  const seen = [];
  const r = await withKey(() => generateMetaDescription({ ...base, fetchImpl: mockFetch([
    { body: { status: "incomplete", output: [{ type: "reasoning", content: [] }] } },
    { body: { status: "completed", output_text: JSON.stringify({ description: NEW }) } },
  ], seen) }));
  assert.deepEqual(r, { ok: true, text: NEW, source: "ai", attempts: 2 });
  assert.equal(seen[0].reasoning.effort, "low");
  assert.ok(seen[0].max_output_tokens >= 2000);
});

test("too-short AI text is rejected and retried with feedback", async () => {
  const seen = [];
  const r = await withKey(() => generateMetaDescription({ ...base, fetchImpl: mockFetch([
    { body: { output_text: '{"description":"Te kort."}' } },
    { body: { output_text: JSON.stringify({ description: NEW }) } },
  ], seen) }));
  assert.equal(r.ok, true);
  assert.match(seen[1].input, /rejected: TOO_SHORT/);
});

test("model that rejects the reasoning parameter is retried without it", async () => {
  const seen = [];
  const r = await withKey(() => generateMetaDescription({ ...base, fetchImpl: mockFetch([
    { status: 400, body: { error: { message: "Unsupported parameter: 'reasoning'" } } },
    { body: { output_text: JSON.stringify({ description: NEW }) } },
  ], seen) }), "gpt-5-mini");
  assert.equal(r.ok, true);
  assert.ok(seen[0].reasoning && !seen[1].reasoning);
});

test("provider outage with thin evidence returns a clear code instead of throwing", async () => {
  const seen = [];
  const r = await withKey(() => generateMetaDescription({ ...base, fetchImpl: mockFetch([
    { status: 503, body: { error: { message: "overloaded" } } },
    { status: 503, body: { error: { message: "overloaded" } } },
  ], seen) }));
  assert.deepEqual(r, { ok: false, code: "AI_PROVIDER_ERROR", attempts: 2 });
});

test("no API key: evidence fallback when possible, never an exception", async () => {
  const prev = process.env.OPENAI_API_KEY; delete process.env.OPENAI_API_KEY;
  try {
    const r = await generateMetaDescription({ url: "https://voorbeeld.test/", current: "Ontdek keukenspullen, tuingereedschap en opbergoplossingen bij Voorbeeldshop.", title: "Voorbeeldshop | Handige spullen voor binnen en buiten", h1: "Alles voor een opgeruimd en praktisch huis" });
    assert.equal(r.ok, true);
    assert.equal(r.source, "evidence");
    const thin = await generateMetaDescription(base);
    assert.deepEqual(thin, { ok: false, code: "AI_UNAVAILABLE", attempts: 0 });
  } finally { if (prev !== undefined) process.env.OPENAI_API_KEY = prev; }
});

test("routes: description proposals and GitHub edits use the shared deterministic path", () => {
  const aiFix = readFileSync(new URL("../app/api/ai-fix/route.ts", import.meta.url), "utf8");
  assert.match(aiFix, /if \(type === "meta_description"\) \{\s*const generated = await generateMetaDescription/);
  const gh = readFileSync(new URL("../app/api/github/fix/route.ts", import.meta.url), "utf8");
  const descIdx = gh.indexOf('if(issueId==="META_DESCRIPTION_GUIDANCE"||issueId==="META_DESCRIPTION_MISSING"){\n        // Deterministic');
  const aiIdx = gh.indexOf("await generateCodeFix(path,current,issue,context,issueId)");
  assert.ok(descIdx > 0 && aiIdx > descIdx, "description patch must run before (and instead of) the full-file AI rewrite");
  assert.match(gh, /applyMetaDescriptionToSource\(path,current,descriptionText,liveDescription\)/);
  const page = readFileSync(new URL("../app/dashboard/github/page.tsx", import.meta.url), "utf8");
  assert.match(page, /proposed_value:!publish&&\/\^META_DESCRIPTION_/);
});
