// 31 Oct (five-site QA, P6/P9): YMYL expertise from the site's own sampled pages.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readProcessResult } from "./helpers/process-result.mjs";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ymylSampleEvidence } from "../lib/page-quality-signals.ts";

test("sample evidence: organisation, team/expert and legal oversight pages, own host only, multilingual", () => {
  const pages = [
    { url: "https://klinik.test/die_klinik/", status: "audited", title: "Die Klinik: Klinikum Nord", ownIdentityText: "Struktur, Organisation, Leitbild und Kennzahlen der Klinik" },
    { url: "https://klinik.test/experten/", status: "audited", title: "Klinik-Experten finden: Klinikum Nord", ownIdentityText: "Klinik-Experten finden" },
    { url: "https://klinik.test/impressum/", status: "audited", type: "legal", title: "Impressum", identityText: "Zuständige Aufsichtsbehörde: Senatsverwaltung für Gesundheit" },
    { url: "https://other.test/about", status: "audited", title: "About us" },
    { url: "https://klinik.test/team", status: "unable_to_confirm", title: "Unser Team" },
  ];
  assert.deepEqual(ymylSampleEvidence(pages, "www.klinik.test").map((x) => x.label.split(" ")[0]), ["organisatie-/over-ons-pagina", "team-/specialisten-", "toezicht,"]);
  // Press releases or the homepage do not count; nor an "experts" word in someone else's site.
  assert.deepEqual(ymylSampleEvidence([{ url: "https://klinik.test/", status: "audited", title: "Über uns" }, { url: "https://klinik.test/presse/artikel", status: "audited", title: "Neue Studie", ownIdentityText: "Pressemitteilung" }], "klinik.test"), []);
  assert.equal(ymylSampleEvidence([{ url: "https://bank.test/legal", status: "audited", type: "legal", title: "Juridische informatie", identityText: "Bank X staat onder toezicht van De Nederlandsche Bank (DNB) en de AFM." }], "bank.test")[0].label.startsWith("toezicht"), true);
});

const run = (pages) => {
  const dir = mkdtempSync(join(tmpdir(), "rf-ymyl-"));
  const script = join(dir, "run.mjs");
  writeFileSync(script, `
const PAGES = ${JSON.stringify(pages)};
const nav = Object.keys(PAGES).filter((p) => p !== "/").map((p) => '<a href="' + p + '">' + PAGES[p].t + '</a>').join("");
const doc = (p) => '<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' + p.t + '</title><meta name="description" content="' + (p.d || p.t) + '"></head><body><nav>' + nav + '<a href="/a1">Klinikum</a><a href="/a2">Forschung</a></nav><h1>' + p.t + '</h1><p>' + p.b + '</p></body></html>';
globalThis.fetch = async (i) => { const u = new URL(typeof i === "string" ? i : i.url); const p = PAGES[u.pathname]; return u.host === "klinik.test" && p ? new Response(doc(p), { status: 200, headers: { "content-type": "text/html" } }) : new Response("nf", { status: 404 }); };
globalThis.__RF_RENDER = async () => { throw new Error("no"); };
const { POST } = await import(${JSON.stringify(new URL("../app/api/scan/route.ts", import.meta.url).href)}); console.info = console.warn = console.error = () => {};
const j = await (await POST(new Request("http://localhost/api/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: "https://klinik.test/", mode: "both", language: "nl" }) }))).json();
const a = j.geo.checks.find((c) => c.key === "author");
console.log("RESULT " + JSON.stringify({ sector: j.sectorProfile?.sector, status: a.status, points: a.points, message: a.message, found: a.evidence?.found, level: j.scoreModel?.evidenceLevel || j.scoreEvidence?.level || null }));
process.exit(0);`);
  const out = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", "--import", "./tests/scan-matrix/register.mjs", script], { cwd: new URL("../", import.meta.url), encoding: "utf8", timeout: 240000 });
  return readProcessResult(out, "RESULT ", script);
};
const home = { t: "Klinikum Nord – Universitätsklinikum Hamburg", d: "Das Klinikum Nord ist ein Krankenhaus der Maximalversorgung mit 30 Kliniken für Patienten in Hamburg.", b: "Unsere Ärzte behandeln jährlich 80.000 Patienten im Krankenhaus. ".repeat(30) };
const filler = "Informationen für Patienten und Angehörige im Klinikum. ".repeat(25);

test("route: hospital homepage with one YMYL signal + own organisation and expert pages → pass, sources named", () => {
  const r = run({ "/": home, "/die_klinik/": { t: "Die Klinik: Klinikum Nord", d: "Struktur, Organisation, Leitbild und Kennzahlen des Klinikums.", b: filler }, "/experten/": { t: "Klinik-Experten finden: Klinikum Nord", d: "Alle Expertinnen und Experten des Klinikums.", b: filler } });
  assert.equal(r.sector, "health_wellness");
  assert.equal(r.status, "pass", r.message);
  assert.match(r.message, /die_klinik|experten/);
  assert.match(String(r.found), /ymyl=true/);
});

test("route: hospital without own organisation/team/legal evidence stays unconfirmed (no deduction)", () => {
  const r = run({ "/": { ...home, b: "Willkommen im Klinikum. Termine und Anfahrt. ".repeat(40) }, "/presse/": { t: "Presse: Klinikum Nord", d: "Pressemitteilungen des Klinikums.", b: filler } });
  assert.equal(r.status, "unable_to_confirm", r.message);
  assert.equal(r.points, 0);
});

test("1 Nov: footer 'about' labels (multilingual) and named supervisors on privacy pages; a data-protection authority alone never counts", async () => {
  const { ymylExpertiseEvidence, accountabilitySnippet } = await import("../lib/page-quality-signals.ts");
  const ev = (label, host) => ymylExpertiseEvidence({ text: "", navigation: ["Home", label], schemaTypes: [], host }).some((x) => /over-ons/.test(x));
  for (const [label, host] of [["Over Argenta", "www.argenta.be"], ["About Acme", "acme-bank.com"], ["Über die Charité", "charite.de"], ["À propos de Banque Lumière", "banquelumiere.fr"], ["Chi siamo", "x.it"], ["Sobre nosotros", "y.es"], ["Over ons", "z.nl"]]) assert.ok(ev(label, host), label);
  // Topics and other brands are not the organisation page.
  for (const [label, host] of [["Over beleggen", "www.argenta.be"], ["Over hypotheken", "bank.nl"], ["About cookies", "acme.com"], ["Overstappen", "bank.nl"], ["Over Mollie", "www.argenta.be"]]) assert.equal(ev(label, host), false, label);
  assert.match(accountabilitySnippet("https://bank.test/nl/privacy/privacyverklaring.html", "Lange tekst. ".repeat(500) + "We delen gegevens met de Nationale Bank van België (NBB) en de FSMA als de wet dat voorschrijft."), /NBB|FSMA/);
  // Every privacy statement names the data-protection authority: not accountability evidence.
  assert.equal(accountabilitySnippet("https://shop.test/privacy", "Je kunt een klacht indienen bij de Autoriteit Persoonsgegevens, de toezichthouder voor privacy."), null);
  assert.equal(accountabilitySnippet("https://shop.test/producten/fiets", "Onder toezicht van de AFM."), null);
  assert.match(accountabilitySnippet("https://klinik.test/impressum", "Zuständige Aufsichtsbehörde: Senatsverwaltung für Gesundheit"), /Aufsichtsbeh/);
});
