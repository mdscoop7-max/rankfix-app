// 31 Oct (fresh144 @5531fc41): 27 scans showed GEO 99 on insufficient GEO
// evidence. Every surface must show a range or "indicatie" instead.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dimensionDisplay, dimensionDisplayOf } from "../lib/dimension-score-display.mjs";

const scan = (geoLevel, geoRange = { low: 64, high: 100 }) => ({
  overallScore: 98, seo: { score: 97 }, geo: { score: 99 },
  scoreModel: { seoRange: { low: 95, high: 98 }, geoRange, dimensionEvidence: { seo: { level: "provisional", coveragePercent: 96 }, geo: { level: geoLevel, coveragePercent: 47 } } },
});

test("insufficient dimension evidence shows a range marked as indication, never a bare 99", () => {
  assert.equal(dimensionDisplayOf(scan("insufficient"), "geo").text, "64–100 (indicatie)");
  assert.equal(dimensionDisplayOf(scan("insufficient"), "geo").indication, true);
  assert.equal(dimensionDisplayOf(scan("insufficient", { low: 99, high: 99 }), "geo").text, "99 (indicatie)");
  assert.equal(dimensionDisplayOf(scan("insufficient", null), "geo").text, "99 (indicatie)");
  assert.equal(dimensionDisplayOf(scan("insufficient"), "geo", "en").text, "64–100 (indication)");
});

test("sufficient evidence and older reports keep the number; the score is never changed", () => {
  assert.equal(dimensionDisplayOf(scan("provisional"), "geo").text, "99");
  assert.equal(dimensionDisplayOf(scan("complete"), "geo").text, "99");
  assert.equal(dimensionDisplayOf(scan("insufficient"), "seo").text, "97");
  assert.equal(dimensionDisplayOf({ geo: { score: 88 } }, "geo").text, "88");
  assert.equal(dimensionDisplay(null, { level: "insufficient" }, null).text, "—");
  const data = scan("insufficient");
  dimensionDisplayOf(data, "geo");
  assert.equal(data.geo.score, 99);
});

test("TestLab evidence fields and CSV carry the displayed SEO/GEO value", async () => {
  const { scoreEvidenceFields, scoreEvidenceCsvValues, SCORE_EVIDENCE_CSV_HEADERS } = await import("../lib/testlab-score-evidence.ts");
  const f = scoreEvidenceFields(scan("insufficient"));
  assert.equal(f.geoDisplay, "64–100 (indicatie)");
  assert.equal(f.seoDisplay, "97");
  const csv = scoreEvidenceCsvValues(f);
  assert.equal(csv.length, SCORE_EVIDENCE_CSV_HEADERS.length);
  assert.equal(csv[SCORE_EVIDENCE_CSV_HEADERS.indexOf("geo_display")], "64–100 (indicatie)");
  const { summarizeScanResponse } = await import("../lib/testlab-evidence-export.mjs");
  const s = summarizeScanResponse(scan("insufficient"));
  assert.equal(s.score.geoDisplay, "64–100 (indicatie)");
  assert.equal(s.score.geo, 99);
});

test("no customer or QA surface prints a bare SEO/GEO score next to its evidence", () => {
  const surfaces = {
    "app/page.tsx": /dimensionScoreText\(result as never, key, language\)/,
    "app/[locale]/scan/scan-client.tsx": /dimensionScoreText\(result as never,"geo",locale\)/,
    "app/dashboard/page.tsx": /geo_display \?\? latest\?\.geo_score|latest\?\.geo_display/,
    "app/dashboard/scan/page.tsx": /dimensionScoreText\(result as never,"geo",language\)/,
    "app/dashboard/audit/[id]/page.tsx": /dimensionScoreText\(scan\.result as never,"geo",language\)/,
    "app/dashboard/audit/[id]/report/page.tsx": /dimensionScoreText\(r as never,"geo",language\)/,
    "app/dashboard/history/page.tsx": /geo_display\?\?scan\.geo_score/,
    "app/api/history/route.ts": /geo_display:dimensionScoreText/,
    "components/qa-testlab.tsx": /scoreEvidence\?\.geoDisplay/,
    "app/dashboard/testlab/report/page.tsx": /ev\.geoDisplay/,
  };
  for (const [file, used] of Object.entries(surfaces)) {
    const src = readFileSync(new URL("../" + file, import.meta.url), "utf8");
    assert.match(src, used, file);
    assert.doesNotMatch(src, /GEO \{[^}]*\.geo\?\.score\s*\?\?/, file + " prints the bare GEO score");
    assert.doesNotMatch(src, /\{data\.score\}/, file + " prints the bare dimension score");
  }
});
