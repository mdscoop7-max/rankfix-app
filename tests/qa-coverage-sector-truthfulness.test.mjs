import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildDeepScanDiagnosis } from "../lib/deep-scan-diagnosis.ts";

test("tentative sector is diagnosed as unconfirmed without losing its candidate", () => {
  const diagnosis = buildDeepScanDiagnosis({
    checks: [],
    sector: { sector: "transport_travel", key: "transport_travel", confidenceScore: 72, evidence: ["Weak own-navigation identity"] },
    sample: { discoveredInternalUrls: 150, siteSampleCoverage: { selected: 19, scored: 13, checked: 15, fetchFailed: 4 } },
  });
  assert.equal(diagnosis.scope.scored, 13);
  assert.equal(diagnosis.scope.sampled, 19);
  assert.equal(diagnosis.scope.fullSiteVerified, false);
  assert.ok(diagnosis.rootCauseGroups.some(group => group.code === "partial_site_sampling" && group.status === "unconfirmed"));
  assert.ok(diagnosis.rootCauseGroups.some(group => group.code === "sector_unconfirmed" && group.status === "unconfirmed"));
  assert.equal(diagnosis.fixReadiness.liveChangesAllowed, false);
});

test("strong independently confirmed sector is not marked unconfirmed", () => {
  const diagnosis = buildDeepScanDiagnosis({ checks: [], sector: {sector:"financial_services",confidenceScore:92} });
  assert.equal(diagnosis.rootCauseGroups.some(group=>group.code==="sector_unconfirmed"),false);
});

test("the QA report explains that evidence coverage and page coverage are different denominators", async () => {
  const dashboard = await readFile(new URL("../app/dashboard/database-free-qa.tsx", import.meta.url), "utf8");
  assert.match(dashboard, /gewogen toepasselijke scancontroles, geen paginadekking/);
  assert.match(dashboard, /Pagina-steekproefdekking:/);
  assert.match(dashboard, /Dit staat los van de bewijsdekking van controles/);
});
