// P0-1 (7 Nov 2026): business model before sector. A site that lets visitors find
// and compare many providers of a trade is a platform about that trade, not the
// trade itself (Gymsearch-type directories); a chain counting its own clubs is
// still the trade. Synthetic pages, no domains in code.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { providerDirectoryIdentity } from "../lib/provider-directory.ts";
import { detectDeclaredIndustry } from "../lib/site-sector-corroboration.mjs";
import { readProcessResult } from "./helpers/process-result.mjs";
import mkb48 from "./fixtures/testlab-144/catalog-mkb-48-20261104.json" with { type: "json" };

test("directory: counted providers + visitor discovery = platform (any trade, NL/EN)", () => {
  for (const [title, description] of [
    ["Vind de beste sportschool bij jou in de buurt", "Vergelijk 3.029 sportscholen in heel Nederland. Bekijk reviews en openingstijden."],
    ["Afspraak maken bij kapper of nagelstyliste", "Vind meer dan 9.000 salons met echte reviews en boek direct."],
    ["Top 20 tandartsen in Utrecht", "Vergelijk tandartsen bij jou in de buurt op ervaringen van patiënten."],
    ["Find a plumber", "Compare 1,200 plumbers near you with verified reviews."],
    ["Advocaat zoeken", "Vergelijk meer dan 500 advocaten per stad op reviews."],
  ]) assert.ok(providerDirectoryIdentity({ title, description }), `${title} | ${description}`);
});

test("counter-evidence: own units, own possessive, products or no discovery are not a directory", () => {
  for (const [title, description] of [
    ["Sportschool met meer dan 200 clubs | FitKeten", "Train bij de sportschool met meer dan 200 clubs. Vind een club bij jou in de buurt."],
    ["Kapsalon Knip | 12 vestigingen", "Vind onze 12 kapsalons in Nederland en lees reviews."],
    ["Onze 30 tandartsen staan voor u klaar", "Tandartspraktijk in Utrecht, bekijk openingstijden."],
    ["Webshop | 10.000 producten", "Vind meer dan 10.000 producten met reviews."],
    ["Installatiebedrijf Jansen", "Al 25 jaar uw installateur in de regio. 40 monteurs."],
    ["3.000 sportscholen gebruiken ons", "Ledenadministratie voor sportscholen."],
  ]) assert.equal(providerDirectoryIdentity({ title, description }), null, `${title} | ${description}`);
});

test("declared industry: a directory homepage declares a platform, not the trade", () => {
  const d = detectDeclaredIndustry({ title: "Gymgids - Vind de beste sportschool bij jou in de buurt", description: "Vergelijk 3.029 sportscholen in heel Nederland. Bekijk reviews, openingstijden en faciliteiten.", identityHeadings: ["Vind de beste sportschool bij jou in de buurt"] });
  assert.equal(d?.key, "service_marketplace");
});

test("MKB48 label: a booking platform for salons is labelled a platform, not a beauty business", () => {
  const t = mkb48.sites.find((x) => x.hosts.includes("treatwell.nl"));
  assert.equal(t.expected, "service_marketplace");
  assert.match(t.labelCorrection, /beauty/);
});

function scan(home) {
  const dir = mkdtempSync(join(tmpdir(), "rf-dir-"));
  const script = join(dir, "run.mjs");
  writeFileSync(script, `
const home = ${JSON.stringify(home)};
globalThis.fetch = async (i) => { const u = new URL(typeof i === "string" ? i : i.url); return u.host === "dir.test" && u.pathname === "/" ? new Response(home, { status: 200, headers: { "content-type": "text/html" } }) : new Response("nf", { status: 404 }); };
globalThis.__RF_RENDER = async () => { throw new Error("no"); };
const { POST } = await import(${JSON.stringify(new URL("../app/api/scan/route.ts", import.meta.url).href)}); console.info = console.warn = console.error = () => {};
const j = await (await POST(new Request("http://localhost/api/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: "https://dir.test/", mode: "both", language: "nl" }) }))).json();
console.log("RESULT " + JSON.stringify({ sector: j.sectorProfile?.sector, key: j.sectorProfile?.key, conf: j.sectorProfile?.confidenceScore, websiteType: j.websiteProfile?.websiteType?.value }));
process.exit(0);`);
  const out = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", "--import", "./tests/scan-matrix/register.mjs", script], { cwd: new URL("../", import.meta.url), encoding: "utf8", timeout: 240000 });
  return readProcessResult(out, "RESULT ", script);
}
const page = (title, description, h1, body) => `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><meta name="description" content="${description}"><link rel="canonical" href="https://dir.test/"></head><body><h1>${h1}</h1>${body}<a href="/contact">Contact</a></body></html>`;

test("route: a gym directory is a platform, never a confirmed gym", () => {
  const listing = Array.from({ length: 6 }, (_, i) => `<li><a href="/sportscholen/stad-${i}/club-${i}">Sportschool Club ${i}</a> Hoofdstraat ${i}, ${1011 + i} AB Stad</li>`).join("");
  const r = scan(page("Gymgids - Vind de beste sportschool bij jou in de buurt", "Vergelijk 3.029 sportscholen in heel Nederland. Bekijk reviews, openingstijden, faciliteiten en vind de perfecte sportschool bij jou in de buurt.", "Vind de beste sportschool bij jou in de buurt", `<ul>${listing}</ul>`));
  assert.equal(r.key, "service_marketplace", JSON.stringify(r));
  assert.equal(r.websiteType, "marketplace");
  assert.ok(r.conf < 80, "platform role from own fields only stays probable, not confirmed");
});

test("route: a gym chain counting its own clubs stays a gym", () => {
  const r = scan(page("Sportschool met meer dan 200 clubs | FitKeten", "Train bij FitKeten, de sportschool met meer dan 200 clubs in Nederland. Vind een club bij jou in de buurt en word vandaag lid.", "Sportschool FitKeten", "<p>Word lid van onze sportschool. Onze clubs zijn 24/7 open.</p>"));
  assert.equal(r.sector, "fitness_sports", JSON.stringify(r));
});
