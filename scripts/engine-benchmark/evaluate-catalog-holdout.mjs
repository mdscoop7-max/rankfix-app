// Frozen, offline evidence review. Never calculates an independent quality score.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const [reportPath, revision, outputPath, planDirectory = "tests/fixtures/quality-20261101", measurementKind = "frozen_synthetic"] = process.argv.slice(2);
assert.ok(["development","frozen_synthetic"].includes(measurementKind));
const root = new URL('../../', import.meta.url);
const raw = readFileSync(new URL(`${planDirectory}/catalog-holdout.json`,root));
const plan = JSON.parse(readFileSync(new URL(`${planDirectory}/plan.json`,root)));
assert.equal(createHash('sha256').update(raw).digest('hex'),plan.fixtureSha256,'frozen fixture changed');
assert.ok(measurementKind === 'development' ? /^[a-f0-9]{40}$/.test(revision) : [plan.baselineCommit,plan.candidateCommit].includes(revision),'unplanned engine revision');
const sites = JSON.parse(raw).sites, input = readFileSync(reportPath), reports = JSON.parse(input).reports;
assert.deepEqual(Object.keys(reports).sort(),Object.keys(sites).sort(),'missing or extra reports');
const retailKeys = new Set(['product_schema','merchant_product_readiness','checkout_funnel_static','checkout_trust','webshop_trust','commercial_terms_signal','merchant_feed_signal','product_stock','product_availability','product_price_consistency','variant_url']);
const moduleKeys = ['ecommerce','product','checkout','merchant'];
const dimensions = ['sector','applicability','seoGeoEvidence','coverage','consistency'];
const rows = Object.entries(sites).map(([host,site]) => {
 const j=reports[host], expected=site.evaluation, findings=Object.fromEntries(dimensions.map(k=>[k,[]]));
 const checks=[...(j.seo?.checks||[]),...(j.geo?.checks||[])], modules=j.sectorProfile?.applicableModules||[];
 const actual=j.sectorProfile?.sector, fp=[],fn=[];
 if(actual!==expected.expectedSector){findings.sector.push(`sector ${actual}; expected ${expected.expectedSector}`);if(expected.expectedSector!=='unknown')fn.push('sector');if(actual!=='unknown')fp.push('sector');}
 if(expected.retail){for(const m of ['ecommerce','product','checkout'])if(!modules.includes(m)){findings.applicability.push(`missing ${m}`);fn.push(`module:${m}`);}}
 else {
  for(const m of moduleKeys)if(modules.includes(m)){findings.applicability.push(`unexpected ${m}`);fp.push(`module:${m}`);}
  for(const c of checks)if(retailKeys.has(c.key)&&['warning','fail'].includes(c.status)){findings.applicability.push(`retail warning ${c.key}`);fp.push(`check:${c.key}`);}
 }
 for(const [key,value] of Object.entries({title:site.title,description:site.desc,canonical:`https://${host}/`,jsonLdBlocks:expected.jsonLdBlocks}))if(j.metrics?.[key]!==value)findings.seoGeoEvidence.push(`${key}: ${j.metrics?.[key]} expected ${value}`);
 for(const c of checks.filter(c=>['warning','fail'].includes(c.status))){const e=c.evidence;if(!e?.url||!e?.source||!(e?.found||e?.details))findings.seoGeoEvidence.push(`incomplete evidence ${c.key}`);}
 if(actual==='unknown' && (j.sectorProfile?.confidence !== 'low' || !(j.sectorProfile?.confidenceScore >= 0 && j.sectorProfile.confidenceScore <= 35)))findings.consistency.push('unknown sector with unsupported certainty');
 const mp=j.multiPage,counts=mp?.counts, outcomes=counts?.outcomes;
 if(j.scope?.mode!=='PAGE_SAMPLE')findings.coverage.push(`scope ${j.scope?.mode}`);
 if(!outcomes||Object.entries(outcomes).filter(([k])=>k!=='selected').reduce((n,[,v])=>n+v,0)!==counts.selected)findings.coverage.push('selected/outcome mismatch');
 if(!counts||counts.audited!==(mp?.pageAudits||[]).filter(p=>p.status==='audited').length)findings.coverage.push('audited/page evidence mismatch');
 if(j.classification?.sector?.key!==j.sectorProfile?.key)findings.consistency.push('classification/sector mismatch');
 if(j.classification?.pageType?.type!==j.pageTypeEvidence?.type)findings.consistency.push('page type mismatch');
 const issue={pass:'PASS',warning:'WARNING',fail:'FAIL',not_applicable:'NOT_APPLICABLE',unable_to_confirm:'UNABLE_TO_CONFIRM'};
 for(const c of checks){if(issue[c.status]!==c.issue_status)findings.consistency.push(`issue_status ${c.key}`);if(['not_applicable','unable_to_confirm'].includes(c.status)&&c.points>0)findings.consistency.push(`unearned points ${c.key}`);}
 for(const [key,status] of [['passed','pass'],['issues',null],['notApplicable','not_applicable'],['unableToConfirm','unable_to_confirm']]){const n=checks.filter(c=>status?c.status===status:['warning','fail'].includes(c.status)).length;if(j.summary?.[key]!==n)findings.consistency.push(`summary ${key}: ${j.summary?.[key]}/${n}`);}
 for(const b of j.scoreModel?.breakdown||[]){const c=checks.find(c=>c.key===b.key&&c.category===b.category);if(!c||b.status!==c.status)findings.consistency.push(`breakdown ${b.key}`);if(['not_applicable','unable_to_confirm'].includes(b.status)&&b.earnedPoints>0)findings.consistency.push(`breakdown unearned ${b.key}`);}
 return {host,catalogKey:expected.catalogKey,language:site.lang,expectedSector:expected.expectedSector,actualSector:actual,actualKey:j.sectorProfile?.key,abstained:actual==='unknown'&&expected.expectedSector!=='unknown',subtypeExact:j.sectorProfile?.key===expected.catalogKey,modules,commerce:j.commerceApplicability?.state,counts:{selected:counts?.selected,audited:counts?.audited,notConfirmed:counts?.unableToConfirm,outcomes},findings,falsePositives:fp,falseNegatives:fn};
});
const totals=Object.fromEntries(dimensions.map(k=>[k,{correct:rows.filter(r=>!r.findings[k].length).length,total:rows.length}]));
const result={planSha256:createHash('sha256').update(JSON.stringify(plan)).digest('hex'),fixtureSha256:plan.fixtureSha256,rawReportSha256:createHash('sha256').update(input).digest('hex'),revision,sourceKind:measurementKind==='development'?'development_regression_synthetic':'same_author_synthetic_offline',measurementKind,qualityScore:null,accepted:false,blockers:plan.certificationBlockers,totals,subtypeExact:rows.filter(r=>r.subtypeExact).length,abstentions:rows.filter(r=>r.abstained).length,falsePositives:rows.reduce((n,r)=>n+r.falsePositives.length,0),falseNegatives:rows.reduce((n,r)=>n+r.falseNegatives.length,0),rows};
writeFileSync(outputPath,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({revision,qualityScore:null,totals,falsePositives:result.falsePositives,falseNegatives:result.falseNegatives,abstentions:result.abstentions}));
