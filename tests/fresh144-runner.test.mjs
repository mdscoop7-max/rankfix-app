import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("../scripts/testlab/run-fresh144-local.mjs", import.meta.url), "utf8");
test("fresh144 terminal runner keeps full evidence, archives earlier runs and does not stop on website blocks", () => {
  assert.match(src, /classifyScanAnswer/);
  assert.match(src, /website_outcome/);
  assert.match(src, /stopsRun\(outcome\)/);
  assert.match(src, /audits-'\+sha\.slice\(0,12\)/);
  assert.match(src, /fresh144-evidence-'\+sha\.slice\(0,12\)/);
  assert.match(src, /const older=report\.results\.filter\(x=>x\.commitSha!==sha\)/);
  assert.doesNotMatch(src, /\/api\/scan.*bypass/i);
});
