// P0-1 correction (7 Nov 2026, Fresh144 group B): the organisation's own About page
// is a second independent source ONLY when its own title/description/H1 names the
// decided activity. The brand itself ("Over Burgers' Zoo") is no evidence, and an
// About page naming another primary activity is counter-evidence. Synthetic sites.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readProcessResult } from "./helpers/process-result.mjs";

function scan(host, pages) {
  const dir = mkdtempSync(join(tmpdir(), "rf-about-"));
  const script = join(dir, "run.mjs");
  writeFileSync(script, `
const pages = ${JSON.stringify(pages)};
globalThis.fetch = async (i) => { const u = new URL(typeof i === "string" ? i : i.url); const body = u.host === ${JSON.stringify(host)} ? pages[u.pathname] : null; return body ? new Response(body, { status: 200, headers: { "content-type": "text/html" } }) : new Response("nf", { status: 404 }); };
globalThis.__RF_RENDER = async () => { throw new Error("no"); };
const { POST } = await import(${JSON.stringify(new URL("../app/api/scan/route.ts", import.meta.url).href)}); console.info = console.warn = console.error = () => {};
const j = await (await POST(new Request("http://localhost/api/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: "https://${host}/", mode: "both", language: "nl" }) }))).json();
const r = j.websiteProfile?.operatingRole || {};
console.log("RESULT " + JSON.stringify({ sector: j.sectorProfile?.sector, conf: j.sectorProfile?.confidenceScore, n: r.independentSources, evidence: (r.evidence || []).map((e) => e.text), counter: (r.counterEvidence || []).map((e) => e.text) }));
process.exit(0);`);
  const out = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", "--import", "./tests/scan-matrix/register.mjs", script], { cwd: new URL("../", import.meta.url), encoding: "utf8", timeout: 240000 });
  return readProcessResult(out, "RESULT ", script);
}
const html = (title, description, h1, body = "") => `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><meta name="description" content="${description}"></head><body><h1>${h1}</h1><nav><a href="/over-ons">Over ons</a> <a href="/contact">Contact</a></nav><p>${body}</p></body></html>`;
const filler = "Wij helpen klanten elke dag met deskundig advies en persoonlijke service. ".repeat(6);
const home = () => html("Netwerk Oost | Netbeheerder voor stroom en gas", "Netwerk Oost is de netbeheerder voor elektriciteit en gas in Oost-Nederland.", "Netbeheerder in Oost-Nederland", filler);

test("an own About page naming the decided activity is a second independent source", () => {
  const r = scan("netoost.test", { "/": home(), "/over-ons": html("Over Netwerk Oost | Netwerk Oost", "Netwerk Oost is een van de netbeheerders in Nederland en beheert het elektriciteitsnet en gasnet.", "Over ons", filler) });
  assert.equal(r.sector, "energy_utilities", JSON.stringify(r));
  assert.equal(r.n, 2, JSON.stringify(r));
  assert.ok(r.evidence.some((t) => /\/over-ons: /.test(t) && /netbeheer/i.test(t)), "the evidence names the page and its activity: " + JSON.stringify(r.evidence));
});

test("an About page that only repeats the brand is no second source", () => {
  const r = scan("dierenparkzoo.test", {
    "/": html("Dierenpark Zoo | Dagje uit met de hele familie", "Beleef een dag vol dieren in Dierenpark Zoo: olifanten, gorilla's en een tropisch regenwoud.", "Welkom", filler),
    "/over-ons": html("Over Dierenpark Zoo | Dierenpark Zoo", "Lees meer over Dierenpark Zoo.", "Over Dierenpark Zoo", filler),
  });
  assert.ok(r.n <= 1, JSON.stringify(r));
  assert.ok(!r.evidence.some((t) => /over-ons-pagina/.test(t)), JSON.stringify(r.evidence));
});
