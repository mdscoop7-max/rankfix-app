// Ballast Nedam-type (7 Nov 2026, Fresh144 replay "webshop 92%"): a construction
// company homepage with a cart/"Cart" link and project links. Synthetic page, no
// domains in code. Finding: the live engine does NOT make this a webshop; the 92%
// came from the replay harness, which turned a recorded cart signal into an
// add-to-cart form plus product cards (tests/scan-matrix/run-route-replay.mjs,
// commerceMarkup, fixed to replay only recorded signals). Second finding:
// "bouw- en ontwikkelbedrijf" was not recognised as construction; the title
// segment that IS the activity now declares it (one source: probable, not confirmed).
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readProcessResult } from "./helpers/process-result.mjs";

function scan(home) {
  const dir = mkdtempSync(join(tmpdir(), "rf-bouw-"));
  const script = join(dir, "run.mjs");
  writeFileSync(script, `
const home = ${JSON.stringify(home)};
globalThis.fetch = async (i) => { const u = new URL(typeof i === "string" ? i : i.url); return u.host === "bouw.test" && u.pathname === "/" ? new Response(home, { status: 200, headers: { "content-type": "text/html" } }) : new Response("nf", { status: 404 }); };
globalThis.__RF_RENDER = async () => { throw new Error("no"); };
const { POST } = await import(${JSON.stringify(new URL("../app/api/scan/route.ts", import.meta.url).href)}); console.info = console.warn = console.error = () => {};
const j = await (await POST(new Request("http://localhost/api/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: "https://bouw.test/", mode: "both", language: "nl" }) }))).json();
console.log("RESULT " + JSON.stringify({ sector: j.sectorProfile?.sector, key: j.sectorProfile?.key, conf: j.sectorProfile?.confidenceScore, websiteType: j.websiteProfile?.websiteType?.value, role: j.websiteProfile?.operatingRole?.role }));
process.exit(0);`);
  const out = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", "--import", "./tests/scan-matrix/register.mjs", script], { cwd: new URL("../", import.meta.url), encoding: "utf8", timeout: 240000 });
  return readProcessResult(out, "RESULT ", script);
}
const projects = Array.from({ length: 6 }, (_, i) => `<a href="/wat-we-doen/projectenoverzicht/2024/project-${i}">Project ${i}</a>`).join(" ");
const page = (extra = "") => `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Voorbeeld Bouw | Nederlands bouw- en ontwikkelbedrijf</title><meta name="description" content="Samen bouwen we aan een duurzame leefomgeving. Een omgeving waarin gezondheid, comfort en welzijn het allerbelangrijkst zijn."><link rel="canonical" href="https://bouw.test/"></head><body><h1>Voorbeeld Bouw corporate website</h1><nav><a href="/wie-we-zijn/ons-verhaal">Ons verhaal</a> <a href="/wat-we-doen">Wat doet Voorbeeld Bouw?</a> <a href="/contact">Contact</a> <a href="/cart">Cart</a></nav>${projects}<p>Samen bouwen we aan een duurzame leefomgeving: woningen, utiliteitsbouw en infrastructuur.</p>${extra}</body></html>`;

test("construction company with only a cart link and project links is not a webshop", () => {
  const r = scan(page());
  assert.notEqual(r.sector, "ecommerce", JSON.stringify(r));
  assert.notEqual(r.websiteType, "ecommerce_store");
  assert.notEqual(r.role, "webshop");
});

test("construction identity from 'bouw- en ontwikkelbedrijf' as the activity segment of the own title", () => {
  const r = scan(page());
  assert.equal(r.sector, "manufacturing_industrial", JSON.stringify(r));
  assert.ok(r.conf <= 70, "one homepage is one source");
});

test("a brand name ending in a trade word is not that trade (Elektricien Bakker)", async () => {
  const { detectDeclaredIndustry } = await import("../lib/site-sector-corroboration.mjs");
  const d = detectDeclaredIndustry({ title: "Elektricien Bakker | Groepenkast, laadpaal en storingen", description: "Erkend elektricien in Haarlem voor groepenkasten, laadpalen en storingen.", identityHeadings: ["Elektricien in Haarlem"] });
  assert.notEqual(d?.key, "bakery");
});

test("general words alone do not declare construction", async () => {
  const { detectDeclaredIndustry } = await import("../lib/site-sector-corroboration.mjs");
  for (const title of ["Voorbeeld | Samen bouwen aan de toekomst", "Voorbeeld | Ontwikkeling en innovatie", "Bouwbedrijf Jansen | Woningbouw en renovatie"]) {
    assert.notEqual(detectDeclaredIndustry({ title, description: "Wij bouwen aan een duurzame leefomgeving.", identityHeadings: ["Welkom"] })?.key, "construction_infrastructure", title);
  }
});
