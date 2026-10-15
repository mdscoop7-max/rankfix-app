// Generic, site-independent scan policy. Keep it pure so the same decisions
// can be used by both the primary scanner and representative-page scanner.
export function isJavaScriptFramework(html: string): boolean {
  return /(?:__NUXT__|__NUXT_DATA__|\/_nuxt\/|__NEXT_DATA__|\/_next\/|data-reactroot|data-react-helmet|react-dom|ng-version\s*=|ng-app\s*=|__vue_app__|data-v-[a-f\d]{4,}|__APOLLO_STATE__|webpackJsonp|id\s*=\s*["'](?:__next|__nuxt)["']|id\s*=\s*["'](?:root|app)["'][^>]*>\s*<\/div>)/i.test(html);
}

export const DOM_DEPENDENT_CHECKS = new Set([
  "title","description","canonical","schema","organization_website","entity",
  "h1","headings","breadcrumbs","faq","answer","content","identity",
  "trust","trust_legal_signals","social","twitter_card","business_placeholders",
  "accessibility_basics","product_schema","product_optimizer","product_copy_optimizer",
  "product_price_consistency","product_availability","product_availability_consistency",
  "merchant_product_readiness","checkout_funnel_static","price_format","commercial_terms_signal",
  "semantic_link_destination","alt","form_labels","form_accessibility",
]);

export type EvidenceCheck = {
  key: string;
  status: string;
  issue_status: string;
  points: number;
  maxPoints: number;
  confidence?: string;
  reasonCode?: string;
  message: string;
  fix: string;
  evidence?: {url?: string;found?: boolean | null;details?: string};
};

// A failure to execute a site's JS may not turn a missing DOM signal into a
// scoring issue. Confirmed positive evidence remains valid; HTTP/headers are
// independent of hydration and never demoted.
export function applyJsEvidenceUncertainty<T extends EvidenceCheck>(
  checks: T[], input: { framework: boolean; rendered: boolean; url: string },
): number {
  if (!input.framework || input.rendered) return 0;
  let changed = 0;
  for (const c of checks) {
    if (!DOM_DEPENDENT_CHECKS.has(c.key) || !["warning","fail"].includes(c.status)) continue;
    if (c.evidence?.found === true) continue;
    c.status = "unable_to_confirm";
    c.issue_status = "UNABLE_TO_CONFIRM";
    c.points = 0;
    c.confidence = "low";
    c.reasonCode = "needs_js";
    c.message = "Dit DOM-afhankelijke signaal kon niet worden bevestigd: JavaScript-rendering is niet volledig gelukt. De raw HTML bewijst niet dat het ontbreekt.";
    c.fix = "Controleer dit signaal in de gerenderde pagina; pas geen onbevestigde fout automatisch aan.";
    c.evidence = {url:input.url,found:null,details:c.message};
    changed++;
  }
  return changed;
}

// Search appearance depends on rendered pixels and Google may rewrite titles.
// The browser supplies an Arial 20px canvas measurement as an approximation,
// so a wide title is gentle preview guidance rather than a ranking defect.
export function titlePixelAdvice(widthPx: number | null | undefined) {
  if (widthPx == null || !Number.isFinite(widthPx)) return {measured:false,warning:false,credit:1,message:"Pixelbreedte kon niet worden gemeten; geen aftrek op basis van tekens."};
  const width = Math.round(widthPx);
  return width <= 580
    ? {measured:true,warning:false,credit:1,message:`Geschatte zoekresultaatbreedte ${width}px (richtwaarde circa 580px).`}
    : {measured:true,warning:true,credit:0.95,message:`Geschatte zoekresultaatbreedte ${width}px boven circa 580px; controleer de echte preview. Dit is licht advies, geen bewezen rankingfout.`};
}

// An auditable per-check table. Scoring also deduplicates root causes and
// applies coverage caps; raw deductions in this table are not additive to a
// guaranteed overall-score difference.
export function scoreBreakdown<T extends {key?: string;title: string;category?: string;status: string;points: number;maxPoints: number;rootCause?: string}>(checks: T[]) {
  return checks.map((item) => ({
    key:item.key||item.title, title:item.title, category:item.category||"seo",
    status:item.status, maxPoints:item.maxPoints,
    earnedPoints:["not_applicable","unable_to_confirm"].includes(item.status)?null:item.points,
    rawDeduction:["not_applicable","unable_to_confirm"].includes(item.status)?null:Math.max(0,item.maxPoints-item.points),
    rootCause:item.rootCause||null,
  }));
}

export function sampleSummary(selected:number,scored:number,noindex:number,fetchFailed:number,headOnly:number) {
  return {selected,scored,noindex,fetchFailed,headOnly,
    excluded:Math.max(0,selected-scored),
    consistent: selected>=scored && noindex>=0 && fetchFailed>=0 && headOnly>=0};
}

export function commerceServiceSignals(input:{subscription:boolean;booking:boolean;lead:boolean;price:boolean}) {
  return {
    subscription:input.subscription,
    booking:input.booking,
    lead:input.lead,
    price:input.price,
    hasCommercialActivity:input.subscription||input.booking||input.lead,
  };
}
