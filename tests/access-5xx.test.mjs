// 1 Nov 2026: 5xx challenge versus real server error, decided by the body only.
import test from "node:test";
import assert from "node:assert/strict";
import { isChallengeServerError } from "../lib/access-diagnostics.ts";

test("5xx challenge pages are recognised by their body; real errors and headers alone are not", () => {
  assert.equal(isChallengeServerError(503, `<title>Just a moment...</title><script>window._cf_chl_opt={}</script>`), true);
  assert.equal(isChallengeServerError(503, `Request unsuccessful. Incapsula incident ID: 1234`), true);
  assert.equal(isChallengeServerError(503, `<p>Verify you are human by completing the action below.</p>`), true);
  assert.equal(isChallengeServerError(503, `<h1>Service Unavailable</h1><p>maintenance downtime or capacity problems</p>`), false);
  assert.equal(isChallengeServerError(502, `<h1>502 Bad Gateway</h1>nginx`), false);
  assert.equal(isChallengeServerError(500, ""), false);
  assert.equal(isChallengeServerError(403, `<title>Just a moment...</title>`), false, "only 5xx is reclassified here; 4xx already goes through the access path");
});
