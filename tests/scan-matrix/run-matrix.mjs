// Offline end-to-end scan matrix: runs the REAL /api/scan route against synthetic
// sites (no network, no DB) and checks sector, page type and report invariants.
// Run: node --experimental-strip-types --import ./tests/scan-matrix/register.mjs tests/scan-matrix/run-matrix.mjs
import { PROFILES, installMatrixFetch2 } from "./profiles.mjs";
import { euRealProfiles, euSyntheticProfiles } from "./eu-real-profiles.mjs";
PROFILES.push(...euRealProfiles(), ...euSyntheticProfiles());
installMatrixFetch2();
const ROOT = new URL("../../", import.meta.url).pathname.replace(/\/$/, "");
const { POST } = await import(ROOT + "/app/api/scan/route.ts");
const { labelFitsSector } = await import(ROOT + "/lib/report-consistency.ts");
const only = process.env.ONLY ? process.env.ONLY.split(",") : null;
const rows = []; const fs = await import("node:fs");
const quiet = () => { const s = [console.info, console.warn, console.log, console.error]; const errs = []; console.info = () => {}; console.warn = () => {}; console.error = (...a) => errs.push(a); return () => { [console.info, console.warn, console.log, console.error] = s; return errs; }; };
for (const p of PROFILES) {
  if (only && !only.includes(p.id)) continue;
  const url = `https://${p.host}${p.scanPath || p.path || "/"}`;
  const restore = quiet(); const t0 = Date.now(); let j, status;
  try { const res = await POST(new Request("http://localhost/api/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url, mode: process.env.MODE || "both", language: process.env.LANG_RF || "nl" }) })); status = res.status; j = await res.json(); }
  catch (e) { j = { thrown: String(e?.stack || e) }; }
  const ms = Date.now() - t0; const errs = restore();
  const problems = [];
  if (p.expectHttp) { if (!p.expectHttp.includes(status)) problems.push(`HTTP ${status} not in ${p.expectHttp} ${j.error || j.thrown || ""} ${JSON.stringify(errs.find(e => /scan failed/i.test(String(e[0])))?.[1] || "").slice(0, 500)}`); if (status !== 200) { rows.push({ id: p.id, status, sector: "-", key: (j.error||"").slice(0,60), conf: "", page: "", score: "", ms, problems }); continue; } }
  if (status !== 200) problems.push(`HTTP ${status} ${j.error || j.thrown || ""} ${JSON.stringify(errs.find(e => /scan failed/i.test(String(e[0])))?.[1] || "").slice(0, 400)}`);
  else {
    const checks = j.checks || []; const s = j.summary;
    const st = (x) => checks.filter(c => c.status === x).length;
    const sum = s.passed + s.issues + s.notApplicable + s.unableToConfirm;
    if (sum !== checks.length) problems.push(`summary total ${sum} != checks ${checks.length}`);
    if (s.passed !== st("pass")) problems.push(`passed ${s.passed} != ${st("pass")}`);
    if (s.issues !== st("warning") + st("fail")) problems.push(`issues ${s.issues} != ${st("warning") + st("fail")}`);
    if (s.notApplicable !== st("not_applicable")) problems.push(`na ${s.notApplicable} != ${st("not_applicable")}`);
    if (s.unableToConfirm !== st("unable_to_confirm")) problems.push(`utc ${s.unableToConfirm} != ${st("unable_to_confirm")}`);
    if (j.seo.checks.length + j.geo.checks.length !== checks.length) problems.push(`seo+geo ${j.seo.checks.length + j.geo.checks.length} != ${checks.length}`);
    for (const c of checks) {
      const issue = { pass: "PASS", warning: "WARNING", fail: "FAIL", not_applicable: "NOT_APPLICABLE", unable_to_confirm: "UNABLE_TO_CONFIRM" }[c.status];
      if (issue && c.issue_status !== issue) problems.push(`status mismatch ${c.key}: ${c.status}/${c.issue_status}`);
      if ((c.status === "not_applicable" || c.status === "unable_to_confirm") && c.points > 0) problems.push(`${c.key} ${c.status} has points ${c.points}`);
      if (c.points > c.maxPoints) problems.push(`${c.key} points>max`);
    }
    const expOverall = Math.round(j.seo.score * 0.6 + j.geo.score * 0.4);
    if ((process.env.MODE||'both')==='both' && Math.abs(expOverall - j.overallScore) > 0 && !(j.overallScore < expOverall)) problems.push(`overall ${j.overallScore} vs 0.6/0.4 ${expOverall}`);
    const bd = j.scoreModel.breakdown || [];
    for (const b of bd) { const c = checks.find(x => x.key === b.key && x.category === b.category); if (!c) { problems.push(`breakdown ${b.key} without check`); continue; } if (c.status !== b.status) problems.push(`breakdown status ${b.key} ${b.status} vs ${c.status}`); if ((b.earnedPoints ?? 0) !== (["not_applicable","unable_to_confirm"].includes(c.status) ? (b.earnedPoints ?? 0) : c.points)) problems.push(`breakdown points ${b.key} ${b.earnedPoints} vs ${c.points}`); if (["not_applicable","unable_to_confirm"].includes(b.status) && b.earnedPoints > 0) problems.push(`breakdown ${b.key} ${b.status} earned ${b.earnedPoints}`); }
    const mode = process.env.MODE || "both";
    if (mode === "seo" && (j.geo.checks.length || j.overallScore !== j.seo.score)) problems.push(`seo-mode mismatch geo=${j.geo.checks.length} overall=${j.overallScore} seo=${j.seo.score}`);
    if (mode === "geo" && (j.seo.checks.length || j.overallScore !== j.geo.score)) problems.push(`geo-mode mismatch seo=${j.seo.checks.length} overall=${j.overallScore} geo=${j.geo.score}`);
    if (j.overallScore < 0 || j.overallScore > 100) problems.push(`score out of range ${j.overallScore}`);
    const r = j.scoreModel.range; if (r && mode === "both" && (j.overallScore < r.low - 1 || j.overallScore > r.high + 1)) problems.push(`score ${j.overallScore} outside range ${r.low}-${r.high}`);
    const sp = j.sectorProfile;
    if (j.classification.sector.key !== sp.key) problems.push(`classification sector ${j.classification.sector.key} != ${sp.key}`);
    if (j.pageTypeEvidence.type !== j.classification.pageType.type) problems.push(`pageType mismatch ${j.pageTypeEvidence.type}/${j.classification.pageType.type}`);
    if (!j.pageTypeInvariant.valid) problems.push(`pageTypeInvariant ${JSON.stringify(j.pageTypeInvariant.contradictions)}`);
    if (sp.sector === "unknown" && sp.confidenceScore >= 60) problems.push(`unknown with confidence ${sp.confidenceScore}`);
    if (sp.sector !== "unknown" && sp.confidenceScore < 60) problems.push(`sector ${sp.sector} with low confidence ${sp.confidenceScore}`);
    if (p.expect && !p.expect.includes(sp.sector)) problems.push(`SECTOR ${sp.sector}/${sp.key} not in ${p.expect.join("|")}`);
    if (p.labelLike && !p.labelLike.test(sp.label)) problems.push(`LABEL "${sp.label}" does not match ${p.labelLike}`);
    if (p.notExpect?.includes(sp.sector)) problems.push(`SECTOR forbidden ${sp.sector}`);
    if (p.page && j.pageTypeEvidence.type !== p.page) problems.push(`PAGE ${j.pageTypeEvidence.type} != ${p.page}`);
    const retailKeys = ["product_schema", "merchant_product_readiness", "checkout_funnel_static", "checkout_trust", "webshop_trust", "commercial_terms_signal", "merchant_feed_signal", "product_stock", "product_price_consistency"];
    if (!p.commerce && sp.sector !== "ecommerce") for (const c of checks) if (retailKeys.includes(c.key) && (c.status === "warning" || c.status === "fail")) problems.push(`retail check on non-shop: ${c.key}=${c.status}`);
    if (p.jsShell) { for (const c of checks) if (["title", "meta_description", "h1", "canonical"].includes(c.key) && c.status === "fail" && !j.rendering.javascriptExecuted) problems.push(`JS shell hard fail ${c.key}`); }
    if (ms > 20000) problems.push(`slow ${ms}ms`);
    const byKey = (k) => checks.find((c) => c.key === k);
    for (const [k, allowed] of Object.entries(p.checkStatus || {})) {
      const c = byKey(k);
      if (allowed.includes("__absent__")) { if (c && c.status === "pass") problems.push(`${k} should not pass (${c.message.slice(0, 80)})`); continue; }
      if (!c) { if ((process.env.MODE || "both") === "both") problems.push(`check ${k} missing`); } else if (!allowed.includes(c.status)) problems.push(`${k}=${c.status} not in ${allowed}: ${c.message.slice(0, 140)}`);
    }
    for (const [k, re] of Object.entries(p.message || {})) { const c = byKey(k); if (c && !re.test(c.message)) problems.push(`${k} message lacks ${re}: ${c.message.slice(0, 140)}`); }
    for (const [k, re] of Object.entries(p.noMessage || {})) { const c = byKey(k); if (c && re.test(c.message)) problems.push(`${k} message has ${re}: ${c.message.slice(0, 140)}`); }
    if (p.maxScore != null && (process.env.MODE || "both") === "both" && j.overallScore > p.maxScore) problems.push(`score ${j.overallScore} > ${p.maxScore} despite issues`);
    for (const m of p.noModules || []) if (j.sectorProfile.applicableModules.includes(m)) problems.push(`module ${m} should not be active`);
    if (p.sitemap && byKey("sitemap")) { const c = byKey("sitemap"); if (!c?.message.includes(p.sitemap)) problems.push(`sitemap chose: ${c?.message.slice(0, 120)}`); }
    // Central self-check: present, label consistent, and the engine itself
    // should not need corrections (a correction means an upstream contradiction).
    if (!j.selfCheck) problems.push("selfCheck missing");
    else {
      if (!labelFitsSector(sp.sector, sp.label)) problems.push(`label "${sp.label}" contradicts sector ${sp.sector}`);
      for (const c of j.selfCheck.corrections) problems.push(`self-check had to correct: ${c.code} ${c.detail.slice(0, 120)}`);
      if (!["high", "medium", "low"].includes(j.selfCheck.reliability)) problems.push("reliability missing");
    }
    // Cross-check consistency: brand identity may not claim business details
    // that the Bedrijfsgegevens check could not confirm; alt wording follows the source.
    { const bd = checks.find((c) => c.key === "business_placeholders"); const idc = checks.find((c) => c.key === "identity");
      if (bd && bd.status !== "pass" && idc && /Gevonden:[^.]*bedrijfs-\/contactgegevens/.test(idc.message)) problems.push("brand identity claims business details that were not confirmed");
      const alt = checks.find((c) => c.key === "alt"); if (alt && j.rendering?.javascriptExecuted && /raw HTML/.test(alt.message)) problems.push("alt message says raw HTML on a rendered page");
      const sd = checks.find((c) => c.key === "schema"); const ow = checks.find((c) => c.key === "organization_website");
      if (sd && ow && sd.rootCause !== ow.rootCause) problems.push("schema and organization_website must share one root cause"); }
    // Issue #151: 100/100 needs complete evidence, and unconfirmed checks must
    // widen the range (no "100–100" next to unconfirmed sector checks).
    if ((process.env.MODE || "both") === "both") {
      const unconfirmed = checks.filter((c) => c.status === "unable_to_confirm" && c.maxPoints > 0).length;
      if (unconfirmed && j.overallScore >= 100) problems.push(`100/100 with ${unconfirmed} unconfirmed checks`);
      if (unconfirmed && r && j.overallScore > 0 && r.low >= r.high) problems.push(`range ${r.low}-${r.high} hides ${unconfirmed} unconfirmed checks`);
      if (!["complete", "provisional", "insufficient"].includes(j.scoreModel.evidenceLevel)) problems.push("evidenceLevel missing");
      if (j.coverage?.coveragePercent < 60 && j.scoreModel.evidenceLevel !== "insufficient") problems.push(`coverage ${j.coverage.coveragePercent}% but evidenceLevel ${j.scoreModel.evidenceLevel}`);
      if (j.scoreModel.evidenceLevel !== "complete" && !j.scoreModel.provisional) problems.push("non-complete evidence not provisional");
    }
    // Homepage score and site sample must be reported side by side and agree.
    { const sw = j.multiPage?.sitewideSummary;
      if (j.multiPage && !sw) problems.push("multiPage.sitewideSummary missing");
      if (sw) {
        if (sw.pagesWithIssues > sw.checkedPages) problems.push(`sitewide ${sw.pagesWithIssues} > ${sw.checkedPages}`);
        for (const t of sw.topIssues) { const a = j.multiPage.sitewideCheckAggregation.find((x) => x.key === t.key); if (!a || a.affectedCount !== t.affected) problems.push(`sitewide topIssue ${t.key} disagrees with aggregation`); }
        if (sw.scoredPageIsHomepage !== (j.pageTypeEvidence.type === "homepage")) problems.push("sitewide scope disagrees with page type");
      } }
    // Global invariant: a report with any warning/fail never shows 100.
    if ((process.env.MODE || "both") === "both" && checks.some((c) => c.status === "warning" || c.status === "fail") && j.overallScore >= 100) problems.push("100/100 with open issues");
  }
  rows.push({ id: p.id, status, sector: j.sectorProfile?.sector, key: j.sectorProfile?.key, conf: j.sectorProfile?.confidenceScore, page: j.pageTypeEvidence?.type, score: j.overallScore, ms, problems });
  if (process.env.SCAN_MATRIX_OUT) fs.writeFileSync(`${process.env.SCAN_MATRIX_OUT}/out-${p.id}.json`, JSON.stringify(j, null, 1));
}
let bad = 0;
for (const r of rows) { if (r.problems.length) bad++; console.log(`${r.problems.length ? "✗" : "✓"} ${r.id.padEnd(30)} ${String(r.sector).padEnd(20)} ${String(r.key).padEnd(22)} ${String(r.conf).padStart(3)} ${String(r.page).padEnd(10)} ${String(r.score).padStart(3)} ${String(r.ms).padStart(5)}ms`); for (const pr of r.problems) console.log("     - " + pr); }
console.log(`\n${rows.length - bad}/${rows.length} zonder problemen`);
console.log("SCAN_MATRIX_RESULT " + JSON.stringify({ total: rows.length, failed: bad }));
process.exit(0);
