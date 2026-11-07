// Repairs 1 and 2 (7 Nov 2026, Codex points 5 and 4).
// 1: a pass that rests on absence is only proven on a complete document; on an
//    unrendered JavaScript page it is "niet bevestigd" (0 points), never full points.
// 2: relative links resolve against <base href> like a browser; no invented 404s.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyJsEvidenceUncertainty } from "../lib/scan-feedback.ts";
import { documentBaseUrl, resolveDocumentHref } from "../lib/document-base.ts";
import { readProcessResult } from "./helpers/process-result.mjs";

const pass = (key, message) => ({ key, status: "pass", issue_status: "PASS", points: 5, maxPoints: 5, message, fix: "" });

test("absence passes on an unrendered JS page become unconfirmed with 0 points", () => {
  const checks = [pass("image_sources", "Geen externe afbeeldingshosts gevonden in de statische HTML."), pass("html_escape", "Geen duidelijke zichtbare HTML-escape-fout gevonden.")];
  assert.equal(applyJsEvidenceUncertainty(checks, { framework: true, rendered: false, url: "https://x.test/" }), 2);
  for (const c of checks) { assert.equal(c.status, "unable_to_confirm"); assert.equal(c.points, 0); assert.equal(c.reasonCode, "needs_js"); }
});

test("positive passes and complete documents keep their points", () => {
  const positive = [pass("image_sources", "3 afbeelding(en) worden via een externe host/CDN geladen; de bronnen zijn in de opgehaalde HTML bevestigd.")];
  applyJsEvidenceUncertainty(positive, { framework: true, rendered: false, url: "https://x.test/" });
  assert.equal(positive[0].status, "pass", "something WAS found and checked");
  const rendered = [pass("html_escape", "Geen duidelijke zichtbare HTML-escape-fout gevonden.")];
  applyJsEvidenceUncertainty(rendered, { framework: true, rendered: true, url: "https://x.test/" });
  assert.equal(rendered[0].status, "pass", "a rendered page is a complete document");
  const ssr = [pass("html_escape", "Geen duidelijke zichtbare HTML-escape-fout gevonden.")];
  applyJsEvidenceUncertainty(ssr, { framework: true, rendered: false, rawSubstantive: true, url: "https://x.test/" });
  assert.equal(ssr[0].status, "pass", "a substantive server render is real evidence for the body");
});

test("<base href> decides how relative links resolve; entities are decoded", () => {
  const base = documentBaseUrl(`<html><head><base href="/nl/"></head><body></body></html>`, "https://x.test/nl/start");
  assert.equal(resolveDocumentHref("producten", base).href, "https://x.test/nl/producten");
  assert.equal(resolveDocumentHref("?a=1&amp;b=2", base).href, "https://x.test/nl/?a=1&b=2");
  assert.equal(documentBaseUrl("<html><head></head><body><base href='/wrong/'></body>", "https://x.test/a/b").href, "https://x.test/a/b", "a <base> outside the head is ignored");
  assert.equal(documentBaseUrl(`<head><base href="javascript:alert(1)"></head>`, "https://x.test/a").href, "https://x.test/a", "only http(s) bases");
});

function scan(pages) {
  const dir = mkdtempSync(join(tmpdir(), "rf-base-"));
  const script = join(dir, "run.mjs");
  writeFileSync(script, `
const pages = ${JSON.stringify(pages)};
globalThis.fetch = async (i) => { const u = new URL(typeof i === "string" ? i : i.url); const body = u.host === "base.test" ? pages[u.pathname] : null; return body ? new Response(body, { status: 200, headers: { "content-type": "text/html" } }) : new Response("<html><head><title>Niet gevonden</title></head><body>404</body></html>", { status: 404, headers: { "content-type": "text/html" } }); };
globalThis.__RF_RENDER = async () => { throw new Error("no"); };
const { POST } = await import(${JSON.stringify(new URL("../app/api/scan/route.ts", import.meta.url).href)}); console.info = console.warn = console.error = () => {};
const j = await (await POST(new Request("http://localhost/api/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: "https://base.test/start", mode: "both", language: "nl" }) }))).json();
const c = (j.seo?.checks || []).find((x) => x.key === "broken_links") || {};
console.log("RESULT " + JSON.stringify({ status: c.status, message: c.message, links: (c.links || []).map((l) => [l.url, l.httpStatus]) }));
process.exit(0);`);
  const out = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", "--import", "./tests/scan-matrix/register.mjs", script], { cwd: new URL("../", import.meta.url), encoding: "utf8", timeout: 240000 });
  return readProcessResult(out, "RESULT ", script);
}
const page = (title, body) => `<!doctype html><html lang="nl"><head><meta charset="utf-8"><base href="/nl/"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><meta name="description" content="Voorbeeld installatiebedrijf voor warmtepompen en onderhoud in de regio."></head><body><h1>${title}</h1>${body}</body></html>`;
const filler = "<p>" + "Wij installeren en onderhouden warmtepompen, cv-ketels en ventilatie voor particulieren en bedrijven. ".repeat(8) + "</p>";

test("route: relative links under <base href> are not reported as 404", () => {
  const r = scan({
    "/start": page("Installatiebedrijf Voorbeeld", `<nav><a href="diensten">Diensten</a> <a href="contact">Contact</a> <a href="over-ons">Over ons</a></nav>${filler}`),
    "/nl/diensten": page("Diensten", filler), "/nl/contact": page("Contact", filler), "/nl/over-ons": page("Over ons", filler),
  });
  assert.ok(!(r.links || []).some(([, status]) => status === 404), JSON.stringify(r));
  assert.ok((r.links || []).every(([url]) => url.startsWith("https://base.test/nl/")), "links resolved under the base: " + JSON.stringify(r.links));
  assert.notEqual(r.status, "fail", JSON.stringify(r));
});
