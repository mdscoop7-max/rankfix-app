/** Versioned assessment protocol. Offline fixtures are regressions, never an
 * independent real-website quality rating. Review items are frozen in the plan,
 * so missing audits/reviews cannot disappear from the denominator. */
export const REPORT_QUALITY_RUBRIC = Object.freeze({
 version:'1.0.0',minimum:9,minCriterionRate:0.8,minFamilySupport:3,minLanguages:3,
 criteria:Object.freeze([
  {key:'sector',weight:1.5},{key:'applicability',weight:1.5},{key:'seo_geo',weight:1.5},
  {key:'page_coverage',weight:1},{key:'false_positives',weight:1},{key:'consistency',weight:1},
  {key:'international',weight:1},{key:'regression',weight:1},{key:'security',weight:0.5},
 ]),
 families:Object.freeze(['payments_banking','retail','lodging_travel','restaurants','healthcare','beauty','industry','logistics_energy','professional','hybrid']),
});
export { compareSectorRuns } from "./sector-regression.mjs";

const validHash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
export function assessReportQuality(manifest,baseline,candidate,verifiedArtifacts=[]){
 const blocked=[];const plan=manifest||{},cases=Array.isArray(plan.cases)?plan.cases:[],items=Array.isArray(plan.reviewItems)?plan.reviewItems:[];
 const knownCases=new Map(cases.map(c=>[c.id,c]));const verified=new Set(verifiedArtifacts);
 if(plan.rubricVersion!==REPORT_QUALITY_RUBRIC.version)blocked.push('rubric_not_frozen');
 if(!plan.author||!plan.reviewer||plan.author===plan.reviewer||plan.reviewState!=='independently_reviewed')blocked.push('independent_label_review_missing');
 if(!Number.isFinite(Date.parse(plan.frozenAt))||!Number.isFinite(Date.parse(plan.tuningStartedAt))||Date.parse(plan.frozenAt)>=Date.parse(plan.tuningStartedAt))blocked.push('plan_not_frozen_before_tuning');
 if(!cases.length||knownCases.size!==cases.length)blocked.push('missing_or_duplicate_cases');
 if(!items.length||new Set(items.map(i=>i.id)).size!==items.length)blocked.push('missing_or_duplicate_review_items');
 const missingAudits=cases.filter(c=>!validHash(c.artifactSha256)||!verified.has(c.artifactSha256)).map(c=>c.id);
 if(missingAudits.length)blocked.push('missing_or_unverified_audits');
 const exposed=cases.filter(c=>c.exposed!==false||c.sourceKind!=='stored_real_audit').map(c=>c.id);
 if(exposed.length)blocked.push('exposed_or_synthetic_cases');
 const familySupport=Object.fromEntries(REPORT_QUALITY_RUBRIC.families.map(f=>[f,cases.filter(c=>c.family===f&&c.exposed===false&&c.sourceKind==='stored_real_audit').length]));
 if(Object.values(familySupport).some(n=>n<REPORT_QUALITY_RUBRIC.minFamilySupport))blocked.push('insufficient_independent_family_support');
 if(new Set(cases.map(c=>c.language).filter(Boolean)).size<REPORT_QUALITY_RUBRIC.minLanguages)blocked.push('insufficient_languages');
 const before=new Map((baseline?.reviews||[]).map(r=>[r.id,r])),after=new Map((candidate?.reviews||[]).map(r=>[r.id,r]));
 if(!baseline?.planSha256||baseline.planSha256!==candidate?.planSha256||baseline.planSha256!==plan.planSha256)blocked.push('plan_hash_mismatch');
 if(!/^[a-f0-9]{40}$/.test(baseline?.commit||'')||!/^[a-f0-9]{40}$/.test(candidate?.commit||'')||baseline.commit===candidate.commit)blocked.push('engine_revisions_missing');
 if((candidate?.reviews||[]).length!==after.size||(baseline?.reviews||[]).length!==before.size)blocked.push('duplicate_reviews');
 const invalidReviews=[],invalidBaselineReviews=[],regressions=[],fixed=[];
 const isVerdict=r=>r?.verdict==='correct'||r?.verdict==='incorrect';
 for(const item of items){
  const c=knownCases.get(item.caseId),b=before.get(item.id),a=after.get(item.id);
  if(!isVerdict(b)||!c||b.artifactSha256!==c.artifactSha256)invalidBaselineReviews.push(item.id);
  if(!c||!REPORT_QUALITY_RUBRIC.criteria.some(v=>v.key===item.criterion)||!isVerdict(a)||a.artifactSha256!==c.artifactSha256||!/^https?:\/\//.test(item.url||''))invalidReviews.push(item.id);
  if(b?.verdict==='correct'&&a?.verdict!=='correct')regressions.push(item.id);
  if(b?.verdict==='incorrect'&&a?.verdict==='correct')fixed.push(item.id);
 }
 if(invalidReviews.length)blocked.push('missing_or_invalid_reviews');
 if(invalidBaselineReviews.length)blocked.push('baseline_reviews_missing');
 if(regressions.length)blocked.push('regressions');
 const criteria=REPORT_QUALITY_RUBRIC.criteria.map(rule=>{
  const planned=items.filter(i=>i.criterion===rule.key),complete=planned.length>0&&planned.every(i=>!invalidReviews.includes(i.id));
  const correct=planned.filter(i=>after.get(i.id)?.verdict==='correct').length;
  const rate=complete?correct/planned.length:null;
  return {...rule,planned:planned.length,correct,rate,points:rate===null?null:Math.round(rate*rule.weight*1000)/1000};
 });
 if(criteria.some(c=>c.rate===null))blocked.push('unmeasured_criteria');
 if(criteria.some(c=>c.rate!==null&&c.rate<REPORT_QUALITY_RUBRIC.minCriterionRate))blocked.push('criterion_below_floor');
 if(items.some(i=>(i.critical||i.criterion==='security')&&after.get(i.id)?.verdict!=='correct'))blocked.push('critical_failure_or_unreviewed');
 const subgroup = (key,criterion) => Object.fromEntries([...new Set(cases.map(c=>c[key]).filter(Boolean))].map(value=>{
  const members=cases.filter(c=>c[key]===value),reviewed=members.filter(c=>items.some(i=>i.caseId===c.id&&i.criterion===criterion));
  const correct=reviewed.filter(c=>items.filter(i=>i.caseId===c.id&&i.criterion===criterion).every(i=>after.get(i.id)?.verdict==='correct')).length;
  return [value,{reviewed:reviewed.length,correct,rate:reviewed.length?correct/reviewed.length:null}];
 }));
 const perFamily=subgroup('family','sector'),perLanguage=subgroup('language','international');
 if([...Object.values(perFamily),...Object.values(perLanguage)].some(g=>g.reviewed<REPORT_QUALITY_RUBRIC.minFamilySupport))blocked.push('subgroup_review_support_missing');
 if([...Object.values(perFamily),...Object.values(perLanguage)].some(g=>g.rate!==null&&g.rate<REPORT_QUALITY_RUBRIC.minCriterionRate))blocked.push('subgroup_below_floor');
 // No numerical quality rating for synthetic, incomplete or unverified evidence.
 const measurementBlocked=blocked.filter(b=>!['regressions','criterion_below_floor','critical_failure_or_unreviewed','subgroup_below_floor'].includes(b));
 const qualityScore=measurementBlocked.length?null:Math.round(criteria.reduce((n,c)=>n+c.points,0)*100)/100;
 return {rubricVersion:REPORT_QUALITY_RUBRIC.version,qualityScore,accepted:qualityScore!==null&&qualityScore>=REPORT_QUALITY_RUBRIC.minimum&&!blocked.length,blocked:[...new Set(blocked)],criteria,familySupport,perFamily,perLanguage,missingAudits,exposed,invalidReviews,invalidBaselineReviews,regressions,fixed};
}
