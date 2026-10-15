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
  evidence?: {url: string;found: string | number | boolean | null;details: string;expected?: string};
};

// A failure to execute a site's JS may not turn a missing DOM signal into a
// scoring issue. Confirmed positive evidence remains valid; HTTP/headers are
// independent of hydration and never demoted.
export function applyJsEvidenceUncertainty(
  checks: EvidenceCheck[], input: { framework: boolean; rendered: boolean; url: string },
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

export type ScoreComparisonEvidence = {
  previousRendering?: string | null;
  currentRendering?: string | null;
  previousCoverage?: number | null;
  currentCoverage?: number | null;
  changedChecks?: string[];
};

// Score changes must be compared only for the exact URL and scan mode, enforced
// by the history query. These factors report observed evidence differences;
// they deliberately never claim to prove why the website's SEO changed.
export function compareScoreVersions(
  previousScore:number, currentScore:number,
  previousModel:string | null, currentModel:string, threshold=3,
  evidence:ScoreComparisonEvidence={},
) {
  const delta=currentScore-previousScore;
  const requiresExplanation=Math.abs(delta)>threshold;
  const modelChanged=Boolean(previousModel && previousModel!==currentModel);
  const factors:string[]=[];
  if(modelChanged) factors.push("Scoremodelversie gewijzigd: "+previousModel+" → "+currentModel);
  if(evidence.previousRendering && evidence.currentRendering && evidence.previousRendering!==evidence.currentRendering)
    factors.push("Scanbewijs wisselde van "+evidence.previousRendering+" naar "+evidence.currentRendering);
  if(evidence.previousCoverage!=null && evidence.currentCoverage!=null
     && Number.isFinite(evidence.previousCoverage) && Number.isFinite(evidence.currentCoverage)
     && Math.abs(evidence.previousCoverage-evidence.currentCoverage)>=1)
    factors.push("Gewogen bewijsdekking "+Math.round(evidence.previousCoverage)+"% → "+Math.round(evidence.currentCoverage)+"%");
  if(evidence.changedChecks?.length) factors.push("Veranderde controlestatus: "+evidence.changedChecks.slice(0,6).join(", "));
  return {
    previousScore,currentScore,delta,previousModel,currentModel,
    requiresExplanation,modelChanged,factors,
    explanation:requiresExplanation
      ? "Scoreverschil van "+(delta>0?"+":"")+delta+" punten ten opzichte van de vorige scan van deze exacte URL en modus. "
        +(factors.length ? "Waargenomen verschillen: "+factors.join("; ")+". " : "Geen specifieke verschilfactor in het beschikbare bewijs vastgesteld. ")
        +"Dit zijn aanwijzingen en geen bewezen oorzaken. Controleer websitewijzigingen, JavaScript-rendering en scoreweging voordat je een SEO-effect concludeert."
      : null,
  };
}

/** Local classification requires trusted identity evidence, not a menu link. */
export function trustedLocalBusinessEvidence(input: {
  explicitLocalSchema: boolean;
  localIdentityEvidence: boolean;
  contactEvidence: boolean;
}): boolean {
  return input.explicitLocalSchema || (input.localIdentityEvidence && input.contactEvidence);
}

/** Both identity schema types can be useful; either one is sufficient evidence. */
export function sufficientIdentitySchema(organization: boolean, website: boolean): boolean {
  return organization || website;
}

/**
 * Substantive server HTML can still contain client templates that only Vue,
 * Angular or a similar runtime resolves. Require multiple expressions and a
 * script asset: a single literal "{{ example }}" in an article is not enough.
 * Ignore code samples, scripts and textareas before checking body markup.
 */
export function hasUnresolvedClientTemplateBindings(html: string): boolean {
  if (!/<script\b[^>]*\bsrc\s*=\s*["'][^"']+["']/i.test(html)) return false;
  const body = html.split(/<body\b[^>]*>/i)[1] ?? html;
  const visibleBody = body.replace(/<(script|style|code|pre|textarea)\b[^>]*>[\s\S]*?<\/\1>/gi, " ");
  const bindings = visibleBody.match(/\{\{\s*[^{}]{1,110}?\s*\}\}/g) ?? [];
  return bindings.length >= 2;
}
