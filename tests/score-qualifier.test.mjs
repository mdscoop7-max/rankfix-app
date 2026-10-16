import test from "node:test";
import assert from "node:assert/strict";
import { scoreQualifier, scoreScope } from "../lib/score-qualifier.ts";

test("headline qualifier: insufficient evidence is never presented as final, in every locale", () => {
  const r = { overallScore: 99, coverage: { coveragePercent: 53 }, scoreModel: { evidenceLevel: "insufficient", provisional: true, range: { low: 52, high: 99 } }, selfCheck: { reliability: "low" } };
  for (const l of ["nl", "en", "de", "fr", "it", "es"]) {
    const q = scoreQualifier(r, l);
    assert.equal(q.level, "insufficient");
    assert.match(q.detail, /53%/);
    assert.match(q.detail, /52–99/);
    assert.ok(q.note.length > 10);
  }
  assert.match(scoreQualifier(r, "nl").label, /onvoldoende bewijs/);
});

test("complete evidence shows no range and no caveat", () => {
  const q = scoreQualifier({ coverage: { coveragePercent: 97 }, scoreModel: { evidenceLevel: "complete", range: { low: 98, high: 99 } } }, "nl");
  assert.equal(q.level, "complete");
  assert.doesNotMatch(q.detail, /bereik/);
  assert.equal(q.note, "");
});

test("homepage score and site sample are named together", () => {
  const r = { multiPage: { sitewideSummary: { scoredPageIsHomepage: true, checkedPages: 30, pagesWithIssues: 16, topIssues: [{ key: "description", affected: 16, checked: 30 }, { key: "h1", affected: 1, checked: 30 }], sampleScore: 92 } } };
  assert.equal(scoreScope(r, "nl"), "Score van de homepage · Steekproef: 16 van 30 pagina's met aandachtspunten (meta description 16, H1 1) · steekproefscore 92");
  assert.match(scoreScope(r, "en"), /16 of 30 pages/);
  assert.equal(scoreScope({}, "nl"), "Score van de homepage");
});

test("'complete evidence' wording only at 100% coverage", async () => {
  const { scoreQualifier } = await import("../lib/score-qualifier.ts");
  const at97 = scoreQualifier({ coverage: { coveragePercent: 97 }, scoreModel: { evidenceLevel: "complete" } }, "nl");
  assert.equal(at97.label, "Definitief");
  assert.match(at97.detail, /bewijsdekking 97%/);
  assert.equal(scoreQualifier({ coverage: { coveragePercent: 100 }, scoreModel: { evidenceLevel: "complete" } }, "nl").label, "Definitief: volledig bewijs");
});
