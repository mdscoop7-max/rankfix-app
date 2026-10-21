import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const url = new URL("./fixtures/sector-acceptance-20261021/plan.json", import.meta.url);
const plan = JSON.parse(readFileSync(url, "utf8"));

export function evaluateSectorAcceptance(fixture, predictions, {allowUnapproved = false} = {}) {
  const sites = fixture.sites;
  if (!allowUnapproved) {
    const pending = sites.filter(site => site.review.status !== "approved" || !site.review.approvedBy || !site.review.approvedAt || !Array.isArray(site.review.sourceUrls) || !site.review.sourceUrls.length);
    if (pending.length) return {status: "BLOCKED_GROUND_TRUTH", pending: pending.map(site => site.host)};
  }
  const rows = sites.map(site => {
    const predicted = predictions.get(site.host);
    const main = predicted?.mainSector || "unknown";
    const subtype = predicted?.subtype || "unknown";
    return {
      host:site.host,expectedMain:site.proposed.expectedMain,observedMain:main,
      expectedSubtype:site.proposed.expectedSubtype,observedSubtype:subtype,
      mainCorrect: main === site.proposed.expectedMain,
      subtypeCorrect: subtype === site.proposed.expectedSubtype,
      confidence:predicted?.confidence ?? null,
      evidenceUrls:predicted?.evidenceUrls ?? [],
      scanned:Boolean(predicted),
    };
  });
  const n = rows.length;
  const mainCorrect = rows.filter(row => row.mainCorrect).length;
  const subtypeCorrect = rows.filter(row => row.subtypeCorrect).length;
  const missing = rows.filter(row => !row.scanned);
  const confusion = rows.filter(row => !row.mainCorrect || !row.subtypeCorrect).map(row => ({
    host:row.host,expectedMain:row.expectedMain,observedMain:row.observedMain,
    expectedSubtype:row.expectedSubtype,observedSubtype:row.observedSubtype,
    confidence:row.confidence,evidenceUrls:row.evidenceUrls,
  }));
  return {
    status:missing.length ? "BLOCKED_MISSING_SCANS" : mainCorrect/n >= fixture.thresholds.minimumMainAccuracy && subtypeCorrect/n >= fixture.thresholds.minimumSubtypeAccuracy ? "PASS" : "FAIL",
    denominator:n,mainCorrect,subtypeCorrect,
    mainPct:100*mainCorrect/n,subtypePct:100*subtypeCorrect/n,
    confusion,missing:missing.map(row => row.host),
  };
}

test("18 proposed labels must not silently become approved ground truth", () => {
  assert.equal(plan.status, "PROPOSED_NOT_APPROVED");
  assert.equal(plan.sites.length, 18);
  assert.equal(new Set(plan.sites.map(s=>s.host)).size,18);
  for(const site of plan.sites){
    assert.equal(site.review.status,"pending_independent_review");
    assert.equal(site.review.approvedBy,null);
    assert.deepEqual(site.review.sourceUrls,[]);
    assert.ok(site.proposed.expectedMain);
    assert.ok(site.proposed.expectedSubtype);
  }
  assert.equal(evaluateSectorAcceptance(plan, new Map()).status, "BLOCKED_GROUND_TRUTH");
});

test("95% main and 90% subtype on 18 means 18 and 17 correct respectively", () => {
  const approved = structuredClone(plan);
  for (const s of approved.sites) s.review={status:"approved",approvedBy:"independent-reviewer",approvedAt:"2026-10-21",sourceUrls:["https://example.test/reviewer-evidence"],notes:"fixture-only"};
  const all = new Map(approved.sites.map(s=>[s.host,{mainSector:s.proposed.expectedMain,subtype:s.proposed.expectedSubtype}]));
  assert.equal(evaluateSectorAcceptance(approved,all).status,"PASS");
  const oneWrong = new Map(all);
  oneWrong.set("bosch.de",{mainSector:"unknown",subtype:"unknown",confidence:0});
  let result=evaluateSectorAcceptance(approved,oneWrong);
  assert.equal(result.mainCorrect,17);
  assert.equal(result.status,"FAIL");
  assert.deepEqual(result.confusion.map(x=>x.host),["bosch.de"]);
  const oneSubtypeWrong = new Map(all);
  oneSubtypeWrong.set("bosch.de",{mainSector:"manufacturing_industrial",subtype:"general_corporate"});
  result=evaluateSectorAcceptance(approved,oneSubtypeWrong);
  assert.equal(result.subtypeCorrect,17);
  assert.equal(result.status,"PASS");
  const twoSubtypeWrong = new Map(oneSubtypeWrong);
  twoSubtypeWrong.set("vesteda.com",{mainSector:"real_estate",subtype:"real_estate_agent"});
  result=evaluateSectorAcceptance(approved,twoSubtypeWrong);
  assert.equal(result.subtypeCorrect,16);
  assert.equal(result.status,"FAIL");
  const missing = new Map(all);
  missing.delete("nu.nl");
  result=evaluateSectorAcceptance(approved,missing);
  assert.equal(result.status,"BLOCKED_MISSING_SCANS");
  assert.deepEqual(result.missing,["nu.nl"]);
});

test("truth set protects risky platform/hybrid distinctions and a cross-sector follow-up shortlist", () => {
  const sites=Object.fromEntries(plan.sites.map(site=>[site.host,site.proposed]));
  assert.equal(sites["vesteda.com"].expectedSubtype,"institutional_property_rental");
  assert.equal(sites["bosch.de"].expectedMain,"manufacturing_industrial");
  assert.equal(sites["booking.com"].expectedSubtype,"accommodation_booking_platform");
  assert.equal(sites["umcutrecht.nl"].expectedSubtype,"academic_hospital");
  assert.equal(sites["bol.com"].expectedSubtype,"marketplace");
  assert.deepEqual(["coolblue.nl","umcutrecht.nl","nu.nl"].map(x=>sites[x].expectedMain),["ecommerce","health_wellness","news_media"]);
});
