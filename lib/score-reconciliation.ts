import { scoreApplicableChecks, stableCoreChecks, type ScorableAuditCheck } from "./audit-score.ts";

/** Descriptive reconstruction from exactly the checks used by the score engine. */
export function explainCoreScore(
  checks:Array<ScorableAuditCheck & {key:string}>,
  category:"seo"|"geo",
  displayedScore:number,
) {
  const core=stableCoreChecks(checks,category) as Array<ScorableAuditCheck & {key:string}>;
  const assessed=core.filter(c=>c.issue_status!=="NOT_APPLICABLE"&&c.issue_status!=="UNABLE_TO_CONFIRM");
  const totalMax=assessed.reduce((sum,c)=>sum+c.maxPoints,0);
  const totalEarned=assessed.reduce((sum,c)=>sum+c.points,0);
  const rawPercent=totalMax?Math.round(100*totalEarned/totalMax):0;
  const rootCauses=[...new Set(assessed.map(c=>c.rootCause).filter(Boolean))];
  const normalizedScore=scoreApplicableChecks(core);
  return {
    category,
    coreKeys:core.map(c=>c.key),
    excludedFromCore:checks.filter(c=>!core.includes(c)).map(c=>c.key),
    unconfirmedCore:core.filter(c=>c.issue_status==="UNABLE_TO_CONFIRM").map(c=>c.key),
    assessedCount:assessed.length,
    pointsEarned:totalEarned,
    pointsAvailable:totalMax,
    rawPercent,
    normalizedScore,
    displayedScore,
    capOrConsistencyDifference:displayedScore-normalizedScore,
    rootCauses,
    explanation:"Alleen de vaste kernset bepaalt de SEO/GEO-score. Niet toepasselijke en onbevestigde controles tellen niet mee in de noemer. Ruwe kernpunten worden genormaliseerd met eenmalige oorzaakcorrectie en daarna begrensd volgens bewezen fouten en bewijsstatus. Alle aanvullende controles blijven zichtbaar maar beïnvloeden dit getal niet.",
  };
}
