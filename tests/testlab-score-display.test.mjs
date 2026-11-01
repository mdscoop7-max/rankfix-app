import test from "node:test";
import assert from "node:assert/strict";
import { scoreDisplay, scoreEvidenceFields } from "../lib/testlab-score-evidence.ts";

test("98 on 62% coverage is shown as the range with coverage, never as a bare 98", () => {
  const ev = scoreEvidenceFields({ scoreModel: { evidenceLevel: "provisional", range: { low: 71, high: 99 }, headline: { kind: "range", display: "71–99" } }, coverage: { coveragePercent: 62 } });
  const d = scoreDisplay(98, ev, "provisional");
  assert.equal(d.main, "71–99");
  assert.match(d.detail, /punt 98 op bevestigd bewijs · dekking 62% · voorlopig/);
});
test("range is derived when an older stored report has no headline", () => {
  const ev = scoreEvidenceFields({ scoreModel: { range: { low: 80, high: 98 } }, coverage: { coveragePercent: 74 } });
  assert.equal(scoreDisplay(98, ev, "provisional").main, "80–98");
});
test("complete evidence shows the plain score as definitief", () => {
  const ev = scoreEvidenceFields({ scoreModel: { evidenceLevel: "complete", range: { low: 92, high: 92 }, headline: { kind: "score", display: "92" } }, coverage: { coveragePercent: 100 } });
  assert.deepEqual(scoreDisplay(92, ev, "complete"), { main: "92", detail: "dekking 100% · definitief" });
  assert.equal(scoreDisplay(null, ev, "complete").main, "—");
});
test("TestLab row and QA report page use scoreDisplay, not the bare overallScore", async () => {
  const { readFile } = await import("node:fs/promises");
  const lab = await readFile(new URL("../components/qa-testlab.tsx", import.meta.url), "utf8");
  assert.match(lab, /scoreDisplay\(r\?\.score/);
  assert.doesNotMatch(lab, /<td>\{num\(r\?\.score\?\?null\)\}/);
  const report = await readFile(new URL("../app/dashboard/testlab/report/page.tsx", import.meta.url), "utf8");
  assert.match(report, /scoreDisplay\(record\.result\?\.overallScore/);
});

test("stored reports without headline still show the range in dashboard lists", async () => {
  const { headlineDisplay } = await import("../lib/score-qualifier.ts");
  assert.equal(headlineDisplay({ overallScore: 98, scoreModel: { evidenceLevel: "provisional", range: { low: 74, high: 99 } } }), "74–99");
  assert.equal(headlineDisplay({ overallScore: 98, scoreModel: { evidenceLevel: "complete", range: { low: 98, high: 98 } } }), "98");
  assert.equal(headlineDisplay({ overallScore: 98, scoreModel: { headline: { kind: "range", display: "80–99" } } }), "80–99");
  const { readFile } = await import("node:fs/promises");
  const api = await readFile(new URL("../app/api/history/route.ts", import.meta.url), "utf8");
  assert.match(api, /score_display:headlineDisplay\(/);
  const dash = await readFile(new URL("../app/dashboard/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(dash, /<strong>\{(?:scan|latest)\.overall_score\}<\/strong>/);
});
