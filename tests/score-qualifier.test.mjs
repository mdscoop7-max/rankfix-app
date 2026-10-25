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
  const q = scoreQualifier({ coverage: { coveragePercent: 100 }, scoreModel: { evidenceLevel: "complete", range: { low: 98, high: 98 } } }, "nl");
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
  // A report stored before 3.5 as "complete" at 97% coverage is shown as provisional
  // with its range: "Definitief" next to unconfirmed checks contradicts itself.
  const at97 = scoreQualifier({ coverage: { coveragePercent: 97 }, scoreModel: { evidenceLevel: "complete", range: { low: 92, high: 99 } } }, "nl");
  assert.equal(at97.level, "provisional");
  assert.match(at97.label, /^Voorlopig/);
  assert.match(at97.detail, /bewijsdekking 97%/);
  assert.match(at97.detail, /mogelijk bereik 92–99/);
  assert.equal(scoreQualifier({ coverage: { coveragePercent: 100 }, scoreModel: { evidenceLevel: "complete" } }, "nl").label, "Definitief: alle toepasselijke controles bevestigd");
});

test("provisional only because of an ambiguous sector says so, and a one-value range is hidden", async () => {
  const { scoreQualifier } = await import("../lib/score-qualifier.ts");
  const q = scoreQualifier({ coverage: { coveragePercent: 100 }, scoreModel: { evidenceLevel: "provisional", evidenceReasons: ["Hoofdsector niet eenduidig (zekerheid 72%)"], range: { low: 97, high: 97 } } }, "nl");
  assert.equal(q.label, "Voorlopig: alle controles bevestigd, hoofdsector niet eenduidig");
  assert.doesNotMatch(q.detail, /97–97/);
  const r = scoreQualifier({ coverage: { coveragePercent: 86 }, scoreModel: { evidenceLevel: "provisional", evidenceReasons: ["Bewijsdekking 86% (onder 90%)"], range: { low: 84, high: 99 } } }, "nl");
  assert.match(r.detail, /84–99/);
});

test("an unknown primary sector is provisional, never 'Definitief' (field scan 16-10)", async () => {
  const { evidenceLevel } = await import("../lib/audit-score.ts");
  const lvl = evidenceLevel({ coveragePercent: 100, javascriptRequiredButNotRendered: false, unconfirmed: 0, sectorUnknown: true });
  assert.equal(lvl.level, "provisional");
  assert.ok(lvl.reasons.some((r) => /^Hoofdsector niet vastgesteld/.test(r)));
  for (const l of ["nl", "en", "de", "fr", "it", "es"]) {
    const q = scoreQualifier({ overallScore: 96, coverage: { coveragePercent: 100 }, scoreModel: { evidenceLevel: lvl.level, evidenceReasons: lvl.reasons } }, l);
    assert.equal(q.level, "provisional");
    assert.doesNotMatch(q.label, /Definitief|Final|Endgültig|Définitif|Definitivo/, l);
  }
  assert.match(scoreQualifier({ coverage: { coveragePercent: 100 }, scoreModel: { evidenceLevel: "provisional", evidenceReasons: lvl.reasons } }, "nl").label, /hoofdsector niet vastgesteld/);
  // A known sector with complete evidence stays complete.
  assert.equal(evidenceLevel({ coveragePercent: 100, javascriptRequiredButNotRendered: false, unconfirmed: 0, sectorConfidence: 90 }).level, "complete");
  // A browser snapshot of a page that did not finish loading is provisional too.
  assert.equal(evidenceLevel({ coveragePercent: 100, javascriptRequiredButNotRendered: false, unconfirmed: 0, sectorConfidence: 90, renderPartial: true }).level, "provisional");
});

test("score qualifier uses a valid HTML container around its caution paragraph", async () => {
  const { readFile } = await import("node:fs/promises");
  const qualifier = await readFile(new URL("../components/score-qualifier.tsx", import.meta.url), "utf8");
  const caution = await readFile(new URL("../components/sitewide-issues.tsx", import.meta.url), "utf8");

  // A <p> inside another <p> is auto-corrected by the browser and hydrates differently.
  assert.match(qualifier, /<div className="rf-score-qualifier"/);
  assert.doesNotMatch(qualifier, /<p className="rf-score-qualifier"/);
  assert.match(qualifier, /<ScoreCaution scope=/);
  assert.match(caution, /<p className="rf-score-caution"/);
});
