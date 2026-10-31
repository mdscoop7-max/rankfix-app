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
