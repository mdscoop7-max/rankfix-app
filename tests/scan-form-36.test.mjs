import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// RankFix 3.6 (P3, seen during the pilot: a freshly typed URL was replaced by the
// remembered one when the history request finished, so the wrong site was scanned).
const page = readFileSync(new URL("../app/dashboard/scan/page.tsx", import.meta.url), "utf8");
const publicScan = readFileSync(new URL("../app/[locale]/scan/scan-client.tsx", import.meta.url), "utf8");

test("3.6 scan form: a remembered URL never overwrites what the user typed", () => {
  assert.match(page, /onChange=\{e=>\{userEdited\.current=true;/);
  assert.match(page, /else if\(saved&&!userEdited\.current\)setUrl\(/);
  // An explicit verification link is a deliberate target and still applies.
  assert.match(page, /if\(verificationUrl\)setUrl\(/);
});

test("3.6 scan form: one scan at a time, also on a repeated Enter", () => {
  assert.match(page, /if\(inFlight\.current\)return;/);
  assert.match(page, /finally\{setBusy\(false\); inFlight\.current=false;\}/);
  assert.match(page, /type="submit" disabled=\{busy\}/);
  assert.match(publicScan, /if \(busy\) return;/);
});
