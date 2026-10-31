import test from "node:test";
import assert from "node:assert/strict";
import { SCORE_EVIDENCE_CSV_HEADERS, scoreEvidenceCsvValues, scoreEvidenceFields } from "../lib/testlab-score-evidence.ts";

const scan = {
  overallScore: 99,
  coverage: { coveragePercent: 31, unableToConfirm: 9 },
  seo: { score: 99, coverage: { coveragePercent: 82 } },
  geo: { score: 99, coverage: { coveragePercent: 10 } },
  rendering: { completeness: "render_incomplete" },
  scoreModel: {
    evidenceLevel: "insufficient",
    evidenceReasons: ["Bewijsdekking 31% (onder 60%)", "JavaScript-pagina niet volledig gerenderd"],
    range: { low: 41, high: 99 },
    headline: { kind: "range", display: "41–99" },
  },
};

test("export carries the evidence behind a score, not only the number", () => {
  const f = scoreEvidenceFields(scan);
  assert.equal(f.headline, "41–99");
  assert.equal(f.headlineKind, "range");
  assert.equal(f.rangeLow, 41);
  assert.equal(f.rangeHigh, 99);
  assert.equal(f.coveragePercent, 31);
  assert.equal(f.unableToConfirm, 9);
  assert.equal(f.seoCoveragePercent, 82);
  assert.equal(f.geoCoveragePercent, 10);
  assert.equal(f.renderingCompleteness, "render_incomplete");
  assert.deepEqual(f.evidenceReasons, scan.scoreModel.evidenceReasons);
});

test("per-dimension evidence from scoreModel wins over the raw dimension coverage", () => {
  const f = scoreEvidenceFields({ ...scan, scoreModel: { ...scan.scoreModel, dimensionEvidence: { seo: { level: "provisional", coveragePercent: 80 }, geo: { level: "insufficient", coveragePercent: 12 } } } });
  assert.equal(f.geoEvidenceLevel, "insufficient");
  assert.equal(f.geoCoveragePercent, 12);
  assert.equal(f.seoEvidenceLevel, "provisional");
});

test("missing or malformed fields give nulls and never throw or invent values", () => {
  for (const input of [null, undefined, {}, { scoreModel: null }, { coverage: { coveragePercent: "high" } }, { scoreModel: { evidenceReasons: "text", range: { low: "a" } } }]) {
    const f = scoreEvidenceFields(input);
    assert.equal(f.coveragePercent, null);
    assert.equal(f.rangeLow, null);
    assert.deepEqual(f.evidenceReasons, []);
    assert.equal(f.headline, null);
  }
});

test("projection does not mutate the scan response", () => {
  const copy = JSON.parse(JSON.stringify(scan));
  scoreEvidenceFields(scan);
  assert.deepEqual(scan, copy);
});

test("CSV columns and values line up one-to-one, also for failed scans", () => {
  assert.equal(scoreEvidenceCsvValues(scoreEvidenceFields(scan)).length, SCORE_EVIDENCE_CSV_HEADERS.length);
  const empty = scoreEvidenceCsvValues(null);
  assert.equal(empty.length, SCORE_EVIDENCE_CSV_HEADERS.length);
  assert.ok(empty.every((value) => value === ""));
});
