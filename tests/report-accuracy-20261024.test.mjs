import test from "node:test";
import assert from "node:assert/strict";
import { sampleOutcomeCounts } from "../lib/scan-feedback.ts";
import { sampleOutcomeText } from "../lib/sample-outcome-text.ts";
import { scoreQualifier } from "../lib/score-qualifier.ts";

// Live QA scan 345f4d24 (heathrow.com, QA b8a35f0): 23 selected, 19 assessed,
// 1 noindex, 2 fetched (HTTP 200) with too little content, 1 duplicate after a
// redirect. Before: counts.fetchFailed = 3 and the report said "3 niet opgehaald".
const heathrowNonAudited = [
  { status: "unable_to_confirm", httpStatus: 200, score: null, evidenceChecks: [{ key: "noindex", details: "Pagina staat op noindex en telt daarom niet mee in de steekproefscore." }] },
  { status: "unable_to_confirm", httpStatus: 200, score: null, evidenceChecks: [{ key: "quality", details: "HTTP 200; response bevat onvoldoende betrouwbare pagina-inhoud voor scoring." }] },
  { status: "unable_to_confirm", httpStatus: 200, score: null, evidenceChecks: [{ key: "quality", details: "HTTP 200; response bevat onvoldoende betrouwbare pagina-inhoud voor scoring." }] },
];
const audited = Array.from({ length: 19 }, () => ({ status: "audited", httpStatus: 200, score: 90, evidenceChecks: [{ key: "http", details: "HTTP 200" }] }));

test("Heathrow sample: fetched-but-thin pages and duplicates are not 'not fetched'", () => {
  const c = sampleOutcomeCounts([...audited, ...heathrowNonAudited], 1);
  assert.deepEqual(c, { selected: 23, scored: 19, unscored: 0, noindex: 1, nonContent: 0, thinContent: 2, missing: 0, notRetrieved: 0, duplicate: 1 });
  assert.equal(c.scored + c.unscored + c.noindex + c.nonContent + c.thinContent + c.missing + c.notRetrieved + c.duplicate, c.selected);
  const text = sampleOutcomeText(c, 1, 3, "nl");
  assert.doesNotMatch(text, /niet opgehaald/);
  assert.match(text, /2 wel opgehaald, maar te weinig inhoud/);
  assert.match(text, /1 uitgesloten \(noindex\)/);
  assert.match(text, /1 dubbel/);
});

test("real fetch failures, refusals and block pages keep their own category", () => {
  const c = sampleOutcomeCounts([
    { status: "unable_to_confirm", httpStatus: null, evidenceChecks: [{ key: "fetch", details: "Niet opgehaald: de tijdslimiet van de scan was bereikt." }] },
    { status: "unable_to_confirm", httpStatus: 403, evidenceChecks: [{ key: "http", details: "HTTP 403: de website weigerde de toegang tot deze pagina" }] },
    { status: "unable_to_confirm", httpStatus: 200, nonContent: "error", evidenceChecks: [{ key: "quality", details: "De website toonde een foutpagina" }] },
    { status: "unable_to_confirm", httpStatus: 200, evidenceChecks: [{ key: "quality", details: "HTTP-response lijkt een bot-/securitychallenge in plaats van de bedoelde pagina" }] },
    { status: "unable_to_confirm", httpStatus: 200, excludedUtility: true, evidenceChecks: [{ key: "excluded", details: "Doorverwezen naar een account- of persoonlijke pagina" }] },
    { status: "audited", httpStatus: 200, score: null, evidenceChecks: [] },
    { status: "unable_to_confirm", httpStatus: 404, evidenceChecks: [{ key: "http", details: "HTTP 404: deze pagina bestaat niet (meer)" }] },
  ], 0);
  assert.deepEqual(c, { selected: 7, scored: 0, unscored: 1, noindex: 0, nonContent: 3, thinContent: 0, missing: 1, notRetrieved: 2, duplicate: 0 });
});

test("reports stored before outcome counts say 'not assessed', never 'not fetched'", () => {
  assert.equal(sampleOutcomeText(undefined, 1, 3, "nl"), "1 noindex uitgesloten · 3 niet beoordeeld. ");
  assert.equal(sampleOutcomeText(undefined, 0, 0, "nl"), "");
});

test("100% evidence coverage shows page coverage next to it and no 'volledig bewijs'", () => {
  const q = scoreQualifier({ coverage: { coveragePercent: 100 }, scoreModel: { evidenceLevel: "complete" }, multiPage: { counts: { selected: 23, audited: 19 } } }, "nl");
  assert.equal(q.label, "Definitief: alle toepasselijke controles bevestigd");
  assert.match(q.detail, /bewijsdekking 100% · pagina's beoordeeld 19\/23/);
  assert.doesNotMatch(q.label, /volledig bewijs/);
  for (const l of ["en", "de", "fr", "it", "es"]) assert.match(scoreQualifier({ coverage: { coveragePercent: 100 }, scoreModel: { evidenceLevel: "complete" }, multiPage: { counts: { selected: 23, audited: 19 } } }, l).detail, /19\/23/);
});

// HTTP status matrix for internal links (lib/link-status.ts).
import { brokenLinkSummary, linkOutcome } from "../lib/link-status.ts";
test("internal links: missing, server error, unconfirmed and account links are kept apart", () => {
  const L = (path, status, extra = {}) => ({ url: `https://site.test${path}`, status, error: status === null, ...extra });
  assert.equal(linkOutcome(L("/a", 200)), "ok");
  assert.equal(linkOutcome(L("/a", 404)), "missing");
  assert.equal(linkOutcome(L("/a", 410)), "missing");
  assert.equal(linkOutcome(L("/a", 200, { softNotFound: true })), "missing");
  assert.equal(linkOutcome(L("/a", 500)), "server_error");
  assert.equal(linkOutcome(L("/a", 403)), "unconfirmed");
  assert.equal(linkOutcome(L("/a", 429)), "unconfirmed");
  assert.equal(linkOutcome(L("/a", null)), "unconfirmed");
  assert.equal(linkOutcome(L("/login", 403, { accountLink: true })), "skipped");
  const s = brokenLinkSummary([L("/a", 200), L("/b", 200), L("/weg", 404), L("/storing", 503), L("/prive", 403)]);
  assert.equal(s.status, "warning");
  assert.match(s.message, /1 verwijzen naar een ontbrekende pagina: \/weg \(HTTP 404\)/);
  assert.match(s.message, /serverfout[^.]*\/storing \(HTTP 503\)/);
  assert.match(s.message, /niet te bevestigen[^.]*\/prive \(HTTP 403, toegang geweigerd voor RankFix\)/);
  assert.match(s.fix, /301-redirect/);
  // Blocked links never produce a silent pass: mostly unchecked → unconfirmed.
  assert.equal(brokenLinkSummary([L("/a", 200), L("/b", 403), L("/c", 429)]).status, "unable_to_confirm");
  // One unconfirmed link out of many still passes, and says so.
  const p = brokenLinkSummary([...Array.from({ length: 9 }, (_, i) => L(`/p${i}`, 200)), L("/druk", 429)]);
  assert.equal(p.status, "pass");
  assert.match(p.message, /niet te bevestigen[^.]*\/druk/);
  assert.equal(brokenLinkSummary([L("/a", 200), L("/b", 200)]).message, "2 interne link(s) gecontroleerd; geen 404, 410, soft 404 of serverfout gevonden.");
});
