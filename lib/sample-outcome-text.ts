import type { SampleOutcomeCounts } from "./scan-feedback.ts";

/**
 * Why selected sample pages were not assessed, in the customer's words. Live QA
 * scan 345f4d24 (Heathrow) said "3 niet opgehaald" for two pages that were
 * fetched but had too little content and one duplicate. Reports stored before
 * the outcome counts existed only know "not assessed", and say exactly that.
 */
export function sampleOutcomeText(outcomes: Partial<SampleOutcomeCounts> | null | undefined, noindex: number, notAssessed: number, language: string): string {
  const nl = language === "nl";
  if (!outcomes || typeof outcomes.selected !== "number") {
    const parts = [
      noindex > 0 ? (nl ? `${noindex} noindex uitgesloten` : `${noindex} noindex excluded`) : "",
      notAssessed > 0 ? (nl ? `${notAssessed} niet beoordeeld` : `${notAssessed} not assessed`) : "",
    ].filter(Boolean);
    return parts.length ? `${parts.join(" · ")}. ` : "";
  }
  const n = (v: number | undefined) => Number(v || 0);
  const parts = [
    n(outcomes.unscored) > 0 ? (nl ? `${n(outcomes.unscored)} beoordeeld zonder score (metadata niet volledig te bevestigen)` : `${n(outcomes.unscored)} assessed without a score (metadata not fully confirmable)`) : "",
    n(outcomes.noindex) > 0 ? (nl ? `${n(outcomes.noindex)} uitgesloten (noindex)` : `${n(outcomes.noindex)} excluded (noindex)`) : "",
    n(outcomes.thinContent) > 0 ? (nl ? `${n(outcomes.thinContent)} wel opgehaald, maar te weinig inhoud om te beoordelen` : `${n(outcomes.thinContent)} fetched, but too little content to assess`) : "",
    n(outcomes.nonContent) > 0 ? (nl ? `${n(outcomes.nonContent)} uitgesloten (blokkade-, fout-, onderhouds- of accountpagina)` : `${n(outcomes.nonContent)} excluded (block, error, maintenance or account page)`) : "",
    n(outcomes.missing) > 0 ? (nl ? `${n(outcomes.missing)} bestaan niet (HTTP 404/410; de website linkt naar een ontbrekende pagina)` : `${n(outcomes.missing)} do not exist (HTTP 404/410; the site links to a missing page)`) : "",
    n(outcomes.notRetrieved) > 0 ? (nl ? `${n(outcomes.notRetrieved)} niet opgehaald (serverfout, toegang geweigerd, tijdelijk beperkt of tijdslimiet)` : `${n(outcomes.notRetrieved)} not retrieved (server error, access refused, rate limited or time limit)`) : "",
    n(outcomes.duplicate) > 0 ? (nl ? `${n(outcomes.duplicate)} dubbel (zelfde pagina na doorverwijzing) en één keer geteld` : `${n(outcomes.duplicate)} duplicate (same page after a redirect), counted once`) : "",
  ].filter(Boolean);
  return parts.length ? `${parts.join(" · ")}. ` : "";
}
