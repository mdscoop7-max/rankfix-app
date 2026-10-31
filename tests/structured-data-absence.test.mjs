// 31 Oct (PDF P5): JSON-LD absence is "unconfirmed" only when the page may really
// be client-rendered; on a substantive server-rendered page it is a finding.
import test from "node:test";
import assert from "node:assert/strict";
import { structuredDataAbsence } from "../lib/structured-data-evidence.ts";
test("structured data absence: server-rendered pages prove absence even with a tag manager", () => {
  const base = { validJsonLd: 0, rendered: false, clientRenderedRisk: false, injectors: ["Google Tag Manager"] };
  assert.deepEqual(structuredDataAbsence({ ...base, serverRendered: true }), { proven: true, basis: "raw_html_server_rendered" });
  assert.deepEqual(structuredDataAbsence(base), { proven: false, basis: "tag_manager_unrendered" });
  assert.deepEqual(structuredDataAbsence({ ...base, clientRenderedRisk: true, serverRendered: true }), { proven: false, basis: "client_rendered_unrendered" });
  assert.deepEqual(structuredDataAbsence({ ...base, validJsonLd: 1 }), { proven: false, basis: "present" });
  assert.deepEqual(structuredDataAbsence({ ...base, injectors: [] }), { proven: true, basis: "raw_html_no_injectors" });
});

test("PDF P4: a link to an error page is a missing page, whatever its HTTP status", async () => {
  const { isErrorPageUrl, linkOutcome } = await import("../lib/link-status.ts");
  for (const u of ["https://x.nl/pagenotfound", "https://x.nl/404", "https://x.nl/nl/not-found/", "https://x.nl/error?code=1", "https://x.nl/404.html"]) assert.equal(isErrorPageUrl(u), true, u);
  for (const u of ["https://x.nl/errors-and-omissions", "https://x.nl/404-tips", "https://x.nl/foutloos", "https://x.nl/"]) assert.equal(isErrorPageUrl(u), false, u);
  assert.equal(linkOutcome({ url: "https://x.nl/pagenotfound", status: 200, error: false }), "missing");
  assert.equal(linkOutcome({ url: "https://x.nl/banden", status: 200, error: false, finalUrl: "https://x.nl/404" }), "missing");
  assert.equal(linkOutcome({ url: "https://x.nl/banden", status: null, error: true }), "unconfirmed");
});
