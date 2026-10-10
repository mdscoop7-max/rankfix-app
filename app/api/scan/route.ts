import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { ensureDatabase } from "@/lib/db-init";
import { CRAWLER_VERSION, RULES_VERSION, FIX_POLICY_VERSION, AI_POLICY_VERSION, statusCode } from "@/lib/seo-rules";
import { getFixPolicy } from "@/lib/fix-policy";
import { extractImageMetrics } from "@/lib/image-metrics";
import { readResponseTextLimited, safePublicFetch, validatePublicHttpUrl } from "@/lib/safe-fetch";
import { buildAdsKeywordIntelligence } from "@/lib/ads-keyword-intelligence";
import { applyEvidenceBasedScoreCap, SCORE_MODEL_VERSION, scoreApplicableChecks, scoreRange, summarizeAuditChecks, weightedCoverage } from "@/lib/audit-score";
import { normalizePlan, planLimits } from "@/lib/plans";
import { consumeRateLimit, requestIp } from "@/lib/rate-limit";
import { renderPublicPage } from "@/lib/headless-render";
import { buildScanEvidence, collectEvidencePartners } from "@/lib/scan-evidence";
import { assessSectorConflict, modulesForCapabilities, rankSectorCandidates, sectorCatalogSummary } from "@/lib/sector-catalog";

type Status = "pass" | "warning" | "fail" | "not_applicable" | "unable_to_confirm";

type AuditMode = "seo" | "geo" | "both";

type EvidenceCapabilityState = "detected" | "likely" | "unknown" | "absent_proven";
type EvidenceCapability = {
  id: string;
  state: EvidenceCapabilityState;
  confidence: number;
  proof: string[];
  reason?: "weak_evidence" | "insufficient_coverage" | "explicit_negative_evidence";
};

const buildCapabilityState = (
  id:string,
  proof:string[],
  coverage:number,
  confidence=0.95,
  options?:{ weakProof?:string[]; explicitNegativeProof?:string[] }
):EvidenceCapability => {
  const uniqueProof = [...new Set(proof.filter(Boolean))];
  const weakProof = [...new Set((options?.weakProof||[]).filter(Boolean))];
  const negativeProof = [...new Set((options?.explicitNegativeProof||[]).filter(Boolean))];
  if (uniqueProof.length) return {id,state:"detected",confidence,proof:uniqueProof};
  // Weak hints are surfaced as likely, never silently promoted to detected.
  if (weakProof.length) return {id,state:"likely",confidence:Math.min(confidence,0.7),proof:weakProof,reason:"weak_evidence"};
  // "Absent" requires explicit negative evidence plus representative coverage.
  // Merely not finding a signal can never prove absence.
  if (coverage >= 3 && negativeProof.length) return {id,state:"absent_proven",confidence:0.9,proof:negativeProof,reason:"explicit_negative_evidence"};
  if (coverage < 3) return {id,state:"unknown",confidence:0,proof:[],reason:"insufficient_coverage"};
  return {id,state:"unknown",confidence:0,proof:[],reason:"weak_evidence"};
};

type Check = {
  key: string;
  category: "seo" | "geo" | "security" | "accessibility";
  title: string;
  fix_status?: "WAITING" | "AWAITING_MERGE" | "STILL_PRESENT" | "DONE";
  recurring_issue?: {
    recognized: true;
    lastConfirmedAt: string | Date;
    previousFilePath: string | null;
    previousRepository: string | null;
    previousPrNumber: number | null;
    previousFixSummary: string | null;
    previousEvidence: unknown;
    recurrenceCount: number;
    requiresFreshVerification: true;
  };
  status: Status;
  message: string;
  fix: string;
  points: number;
  maxPoints: number;
  issue_id: string;
  rule_id: string;
  issue_status: "PASS" | "FAIL" | "WARNING" | "INFO" | "NOT_APPLICABLE" | "UNABLE_TO_CONFIRM";
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
  confidence: "high" | "medium" | "low";
  rootCause?: string;
  reasonCode?: "cap_absent" | "needs_js" | "insufficient_pages" | "weak_evidence" | "type_uncertain";
  impactClaim: "proven_impact" | "best_practice" | "hygiene";
  formKind?: "contact" | "appointment" | "booking" | "quote" | "checkout" | "newsletter" | "login" | "search";
  evidence: { url: string; found: string | number | boolean | null; expected?: string; details: string };
  fix_category: "A" | "B" | "C";
};

const decode = (value: string) =>
  value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#x27;/gi, "'")
    .replace(/&#x2F;/gi, "/")
    .replace(/&#(x[0-9a-f]+|[0-9]+);/gi, (_, code: string) => {
      const value = code.toLowerCase().startsWith("x") ? parseInt(code.slice(1), 16) : parseInt(code, 10);
      return Number.isFinite(value) ? String.fromCodePoint(value) : "";
    })
    .trim();

const safeDecodeURIComponent = (value: string) => {
  try { return decodeURIComponent(value); } catch { return value; }
};

const stripHtml = (html: string) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

function firstMatch(html: string, regex: RegExp) {
  const match = html.match(regex);
  return match?.[1] ? decode(match[1]) : "";
}

function allMatches(html: string, regex: RegExp) {
  return [...html.matchAll(regex)].map((m) => decode(m[1] || ""));
}

function attrFromTag(tag: string, attr: string) {
  // HTML attributes may be quoted, unquoted, empty, and appear in any order.
  const safeAttr = attr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = tag.match(new RegExp(
    "(?:^|\\s)" + safeAttr + "\\s*=\\s*(?:[\"']([^\"']*)[\"']|([^\\s>]+))",
    "i"
  ));
  return decode(match?.[1] ?? match?.[2] ?? "");
}

function check(
  status: Status,
  key: string,
  category: Check["category"],
  title: string,
  message: string,
  fix: string,
  points: number,
  maxPoints: number
): Check {
  return {
    key, category, title, status, message, fix, points, maxPoints,
    issue_id: key, rule_id: key, issue_status: status === "not_applicable" ? "NOT_APPLICABLE" : status === "unable_to_confirm" ? "UNABLE_TO_CONFIRM" : statusCode(status),
    severity: status === "fail" ? "HIGH" : status === "warning" ? "MEDIUM" : "INFO",
    confidence: status === "unable_to_confirm" ? "low" : status === "not_applicable" ? "medium" : "high",
    reasonCode: status === "unable_to_confirm" ? "weak_evidence" : status === "not_applicable" ? "cap_absent" : undefined,
    impactClaim: status === "fail" ? "proven_impact" : status === "warning" ? "best_practice" : "hygiene",
    evidence: { url: "", found: null, details: message },
    fix_category: getFixPolicy(key).category,
    rootCause: ({
      description: "meta_description",
      geo_description: "meta_description",
      schema: "structured_data_context",
      entity: "structured_data_context",
      social: "social_metadata",
      twitter: "social_metadata",
    } as Record<string,string>)[key],
  };
}

function grade(score: number) {
  return score >= 90 ? "A" : score >= 75 ? "B" : score >= 60 ? "C" : score >= 45 ? "D" : "E";
}

function normalizeScanUrl(value: string) {
  try {
    const url = new URL(value);
    url.hash = "";
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    // Tracking parameters do not identify a different hreflang/canonical target.
    // Remove only well-known marketing parameters; preserve functional query parameters.
    ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "gbraid", "wbraid", "fbclid", "msclkid", "gad_source", "gad_campaignid", "gad_adgroupid", "gad_creative", "_gl", "_up", "_gs", "from_srp", "prevent-auto-open-privacy-settings"]
      .forEach((param) => url.searchParams.delete(param));
    return url.toString();
  } catch {
    return value.trim().replace(/\/+$/, "");
  }
}

type TechnologyProfile = {
  siteType: "Webshop" | "Landingpage" | "Website";
  cms: string | null;
  commercePlatform: string | null;
  framework: string | null;
  isCommerce: boolean;
  confidence: number;
  confidenceLabel: "high" | "medium" | "low";
  evidence: string[];
};

function detectTechnologyProfile(html: string, headers: Headers, commerceSignal: boolean): TechnologyProfile {
  const source = html.toLowerCase();
  const headerText = [...headers.entries()].map(([key, value]) => `${key}:${value}`).join("\\n").toLowerCase();
  const evidence: string[] = [];
  const hit = (pattern: RegExp, label: string) => {
    if (pattern.test(source) || pattern.test(headerText)) {
      evidence.push(label);
      return true;
    }
    return false;
  };

  const wordpressSignals = [
    hit(/\/wp-content\//i, "WordPress wp-content"),
    hit(/\/wp-includes\//i, "WordPress wp-includes"),
    hit(/(?:api\.w\.org|\/wp-json\/)/i, "WordPress REST/API"),
    hit(/generator[^>]+wordpress/i, "WordPress generator"),
  ].filter(Boolean).length;
  const wooSignals = [
    hit(/wp-content\/plugins\/woocommerce/i, "WooCommerce plugin assets"),
    hit(/(?:wc-ajax|woocommerce-cart|woocommerce-checkout|woocommerce-page)/i, "WooCommerce storefront"),
    hit(/(?:add_to_cart|add-to-cart)[^a-z]/i, "WooCommerce add-to-cart"),
  ].filter(Boolean).length;
  const shopifySignals = [
    hit(/(?:cdn\.shopify\.com|\/cdn\/shop\/)/i, "Shopify CDN"),
    hit(/(?:shopify\.theme|shopify-section|shopify-payment-button)/i, "Shopify storefront"),
    hit(/\.myshopify\.com/i, "Shopify domain reference"),
  ].filter(Boolean).length;
  const magentoMageCookies = hit(/mage\/cookies/i, "Magento mage/cookies marker");
  const magentoNamedMarker = hit(/magento_/i, "Magento named marker");
  const magentoResponseHeader = hit(/x-magento/i, "Magento response header");
  const magentoVersionedStatic = hit(/\/static\/version\d+/i, "Magento versioned static asset");
  const magentoCommercePattern = hit(/(?:form_key|checkout\/cart)/i, "Magento commerce pattern");
  const magentoSignals = [magentoMageCookies, magentoNamedMarker, magentoResponseHeader, magentoVersionedStatic, magentoCommercePattern].filter(Boolean).length;
  const prestashopSignals = [
    hit(/prestashop/i, "PrestaShop marker"),
    hit(/\/modules\/(?:ps_|blockcart|blockreassurance)/i, "PrestaShop module assets"),
  ].filter(Boolean).length;
  const bigCommerceSignals = [
    hit(/(?:bigcommerce|cdn\d*\.bigcommerce\.com|stencil-utils)/i, "BigCommerce storefront"),
  ].filter(Boolean).length;
  const wixSignals = [
    hit(/(?:wixstatic\.com|wix-code|x-wix-)/i, "Wix platform"),
  ].filter(Boolean).length;
  const squarespaceSignals = [
    hit(/(?:static\d*\.squarespace\.com|squarespace)/i, "Squarespace platform"),
  ].filter(Boolean).length;
  const webflowSignals = [
    hit(/(?:data-wf-page|webflow\.js|website-files\.com)/i, "Webflow platform"),
  ].filter(Boolean).length;
  const nextSignals = [
    hit(/(?:__next_data__|\/_next\/static\/)/i, "Next.js runtime"),
  ].filter(Boolean).length;
  const nuxtSignals = [
    hit(/(?:__nuxt__|\/_nuxt\/)/i, "Nuxt runtime"),
  ].filter(Boolean).length;

  let cms: string | null = null;
  let commercePlatform: string | null = null;
  let framework: string | null = null;
  let strongest = 0;

  // CMS/platform labels require distinctive evidence. Generic commerce strings such
  // as add-to-cart or checkout/cart may occur in headless/custom storefronts.
  if (wordpressSignals >= 2 || /generator[^>]+wordpress/i.test(source)) {
    cms = "WordPress";
    strongest = Math.max(strongest, wordpressSignals);
  }

  const strongShopify = shopifySignals >= 2;
  const strongMagento = magentoMageCookies || magentoNamedMarker || magentoResponseHeader || magentoVersionedStatic;
  const platformCandidates: Array<{ name: string; strength: number }> = [];
  const strongWoo = /wp-content\/plugins\/woocommerce/i.test(source) || (wordpressSignals >= 2 && wooSignals >= 2);
  if (strongWoo) platformCandidates.push({ name: "WooCommerce", strength: Math.max(2, wooSignals + Math.min(wordpressSignals, 1)) });
  if (strongShopify) platformCandidates.push({ name: "Shopify", strength: shopifySignals });
  if (strongMagento) platformCandidates.push({ name: "Magento / Adobe Commerce", strength: magentoSignals });
  // PrestaShop/BigCommerce names can appear in unrelated text or third-party assets.
  // Require either multiple independent markers or one platform-specific asset/runtime marker.
  const strongPrestaShop = prestashopSignals >= 2 || /\/modules\/(?:ps_|blockcart|blockreassurance)/i.test(source);
  const strongBigCommerce = bigCommerceSignals >= 1 && /(?:cdn\d*\.bigcommerce\.com|stencil-utils)/i.test(source);
  if (strongPrestaShop) platformCandidates.push({ name: "PrestaShop", strength: Math.max(2, prestashopSignals) });
  if (strongBigCommerce) platformCandidates.push({ name: "BigCommerce", strength: Math.max(2, bigCommerceSignals) });

  platformCandidates.sort((a, b) => b.strength - a.strength);
  if (platformCandidates.length) {
    const top = platformCandidates[0];
    const tiedStrongPlatforms = platformCandidates.filter((candidate) => candidate.strength === top.strength);
    if (tiedStrongPlatforms.length === 1) commercePlatform = top.name;
    strongest = Math.max(strongest, top.strength);
    if (top.name === "WooCommerce") cms = "WordPress";
  }
  // Hosted builders are only labelled when their distinctive runtime/assets are present.
  // This prevents a plain mention of a builder name from becoming a confirmed CMS.
  if (wixSignals && /(?:wixstatic\.com|wix-code|x-wix-)/i.test(source + "\\n" + headerText)) { cms = "Wix"; strongest = Math.max(strongest, 2); }
  if (squarespaceSignals && /(?:static\d*\.squarespace\.com|squarespace-cdn|squarespace\.com\/universal\/scripts)/i.test(source)) { cms = "Squarespace"; strongest = Math.max(strongest, 2); }
  if (webflowSignals && /(?:data-wf-page|webflow\.js|website-files\.com)/i.test(source)) { cms = "Webflow"; strongest = Math.max(strongest, 2); }
  if (nextSignals) { framework = "Next.js"; strongest = Math.max(strongest, nextSignals); }
  else if (nuxtSignals) { framework = "Nuxt"; strongest = Math.max(strongest, nuxtSignals); }

  const isCommerce = Boolean(commercePlatform || commerceSignal);
  if (!commercePlatform && isCommerce) {
    commercePlatform = "Custom / niet bevestigd";
    evidence.push("Commerce-signalen bevestigd; platform niet eenduidig");
  }

  // Confidence describes the labels we can actually show, not every incidental
  // technology marker seen in the source. A framework alone must not make an
  // unknown CMS/platform look highly confirmed.
  // Score confidence per displayed label. Do not let a strong marker for one
  // technology accidentally inflate the confidence of another label (for example
  // a framework marker making an otherwise weak CMS detection look certain).
  const cmsStrength = cms === "WordPress" ? wordpressSignals
    : cms === "Wix" || cms === "Squarespace" || cms === "Webflow" ? 2
    : 0;
  const commerceStrength = commercePlatform === "WooCommerce" ? Math.max(2, wooSignals + Math.min(wordpressSignals, 1))
    : commercePlatform === "Shopify" ? shopifySignals
    : commercePlatform === "Magento / Adobe Commerce" ? magentoSignals
    : commercePlatform === "PrestaShop" ? Math.max(2, prestashopSignals)
    : commercePlatform === "BigCommerce" ? Math.max(2, bigCommerceSignals)
    : 0;
  const frameworkStrength = framework === "Next.js" ? nextSignals
    : framework === "Nuxt" ? nuxtSignals
    : 0;
  const confirmedLabelStrength = Math.max(
    commerceStrength,
    cmsStrength,
    Math.min(frameworkStrength, 2),
  );
  const confidence = confirmedLabelStrength >= 3 ? 97
    : confirmedLabelStrength === 2 ? 90
    : confirmedLabelStrength === 1 ? 72
    : isCommerce ? 55
    : 40;
  const confidenceLabel = confidence >= 90 ? "high" : confidence >= 70 ? "medium" : "low";

  return {
    siteType: isCommerce ? "Webshop" : "Website",
    cms,
    commercePlatform,
    framework,
    isCommerce,
    confidence,
    confidenceLabel,
    evidence: [...new Set(evidence)].filter((label) => {
      if (label.startsWith("WordPress") && cms !== "WordPress") return false;
      if (label.startsWith("WooCommerce") && commercePlatform !== "WooCommerce") return false;
      if (label.startsWith("Magento") && commercePlatform !== "Magento / Adobe Commerce") return false;
      if (label.startsWith("Shopify") && commercePlatform !== "Shopify") return false;
      if (label.startsWith("PrestaShop") && commercePlatform !== "PrestaShop") return false;
      if (label.startsWith("BigCommerce") && commercePlatform !== "BigCommerce") return false;
      if (label.startsWith("Wix") && cms !== "Wix") return false;
      if (label.startsWith("Squarespace") && cms !== "Squarespace") return false;
      if (label.startsWith("Webflow") && cms !== "Webflow") return false;
      if (label.startsWith("Next.js") && framework !== "Next.js") return false;
      if (label.startsWith("Nuxt") && framework !== "Nuxt") return false;
      return true;
    }).slice(0, 8),
  };
}

export async function POST(request: Request) {
  let fallbackLanguage = "nl";
  try {
    const body = await request.json();
    const rawUrl = typeof body?.url === "string" ? body.url.trim() : "";
    const mode: AuditMode = body?.mode === "seo" || body?.mode === "geo" || body?.mode === "both" ? body.mode : "both";
    const dashboardScan = body?.dashboard === true;
    // Every authenticated dashboard rescan automatically rechecks prepared fixes.
    // A fix is still marked DONE only by the strict fresh-evidence PASS gate below.
    const scanLanguage = ["nl","en","de","fr","it","es"].includes(body?.language) ? body.language : "nl";
    fallbackLanguage = scanLanguage;
    const errors: Record<string, Record<string, string>> = {
      nl:{url:"Vul een website URL in.",unsafe:"Deze URL kan niet veilig worden gescand.",fetch:"De website kon niet worden opgehaald. Controleer de URL en probeer opnieuw.",rate:"Deze website beperkt tijdelijk scanverzoeken. RankFix heeft opnieuw geprobeerd, maar de limiet is nog actief. Probeer later opnieuw.",html:"De website gaf geen bruikbare HTML terug.",session:"Je sessie is verlopen. Log opnieuw in om deze scan in je dashboard op te slaan.",history:"De scan is uitgevoerd, maar kon niet in je historie worden opgeslagen. Probeer opnieuw.",generic:"Er ging iets mis tijdens de SEO/GEO-scan."},
      en:{url:"Enter a website URL.",unsafe:"This URL cannot be scanned safely.",fetch:"The website could not be retrieved. Check the URL and try again.",rate:"This website is temporarily limiting scan requests. RankFix retried, but the limit is still active. Try again later.",html:"The website did not return usable HTML.",session:"Your session has expired. Log in again to save this scan to your dashboard.",history:"The scan completed but could not be saved to your history. Try again.",generic:"Something went wrong during the SEO/GEO scan."},
      de:{url:"Gib eine Website-URL ein.",unsafe:"Diese URL kann nicht sicher gescannt werden.",fetch:"Die Website konnte nicht abgerufen werden. Prüfe die URL und versuche es erneut.",rate:"Diese Website begrenzt Scan-Anfragen vorübergehend. RankFix hat es erneut versucht, aber das Limit ist noch aktiv. Versuche es später erneut.",html:"Die Website hat kein verwendbares HTML zurückgegeben.",session:"Deine Sitzung ist abgelaufen. Melde dich erneut an, um diesen Scan im Dashboard zu speichern.",history:"Der Scan wurde ausgeführt, konnte aber nicht im Verlauf gespeichert werden. Versuche es erneut.",generic:"Beim SEO/GEO-Scan ist ein Fehler aufgetreten."},
      fr:{url:"Saisissez l’URL d’un site.",unsafe:"Cette URL ne peut pas être analysée en toute sécurité.",fetch:"Le site n’a pas pu être récupéré. Vérifiez l’URL et réessayez.",rate:"Ce site limite temporairement les demandes d’analyse. RankFix a réessayé, mais la limite est toujours active. Réessayez plus tard.",html:"Le site n’a renvoyé aucun HTML exploitable.",session:"Votre session a expiré. Reconnectez-vous pour enregistrer cette analyse dans votre tableau de bord.",history:"L’analyse est terminée, mais n’a pas pu être enregistrée dans votre historique. Réessayez.",generic:"Une erreur s’est produite pendant l’analyse SEO/GEO."},
      it:{url:"Inserisci l’URL di un sito.",unsafe:"Questo URL non può essere analizzato in sicurezza.",fetch:"Impossibile recuperare il sito. Controlla l’URL e riprova.",rate:"Questo sito limita temporaneamente le richieste di scansione. RankFix ha riprovato, ma il limite è ancora attivo. Riprova più tardi.",html:"Il sito non ha restituito HTML utilizzabile.",session:"La sessione è scaduta. Accedi di nuovo per salvare la scansione nella dashboard.",history:"La scansione è stata completata, ma non è stato possibile salvarla nella cronologia. Riprova.",generic:"Si è verificato un errore durante la scansione SEO/GEO."},
      es:{url:"Introduce la URL de un sitio web.",unsafe:"Esta URL no se puede analizar de forma segura.",fetch:"No se pudo obtener el sitio web. Comprueba la URL e inténtalo de nuevo.",rate:"Este sitio limita temporalmente las solicitudes de análisis. RankFix lo ha intentado de nuevo, pero el límite sigue activo. Inténtalo más tarde.",html:"El sitio no devolvió HTML utilizable.",session:"Tu sesión ha caducado. Inicia sesión de nuevo para guardar este análisis en tu panel.",history:"El análisis se completó, pero no pudo guardarse en tu historial. Inténtalo de nuevo.",generic:"Se produjo un error durante el análisis SEO/GEO."}
    };
    const scanError = errors[scanLanguage];
    const cleanAdsField = (value: unknown, max = 120) => typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";
    const adsProfile = {
      industry: cleanAdsField(body?.adsProfile?.industry),
      primaryOffer: cleanAdsField(body?.adsProfile?.primaryOffer, 160),
      targetArea: cleanAdsField(body?.adsProfile?.targetArea),
      targetCountries: cleanAdsField(body?.adsProfile?.targetCountries, 160),
      campaignGoal: cleanAdsField(body?.adsProfile?.campaignGoal, 80),
      audience: cleanAdsField(body?.adsProfile?.audience, 80),
      adLanguages: cleanAdsField(body?.adsProfile?.adLanguages, 80),
      excludeIntent: cleanAdsField(body?.adsProfile?.excludeIntent, 160),
    };
    const hasAdsProfile = Object.values(adsProfile).some(Boolean);

    if (!rawUrl) {
      return NextResponse.json({ error: scanError.url }, { status: 400 });
    }

    let target: URL;
    try {
      // Customers may enter example.com, www.example.com or a complete http(s) URL.
      // Prefer HTTPS when the scheme is omitted; safePublicFetch still validates every redirect.
      const preparedUrl = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
      target = validatePublicHttpUrl(preparedUrl);
      ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "gbraid", "wbraid", "fbclid", "msclkid", "gad_source", "gad_campaignid", "gad_adgroupid", "gad_creative", "_gl", "_up", "_gs"]
        .forEach((param) => target.searchParams.delete(param));
      const host = target.hostname.toLowerCase().replace(/^www\./, "");
      // Reject obvious non-host input early instead of turning it into a confusing fetch error.
      if (!host.includes(".") && !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) throw new Error("URL_HOST_INVALID");
    } catch {
      return NextResponse.json({ error: scanError.unsafe }, { status: 400 });
    }

    // share.google is only a redirect resolver, never a scan target or evidence source.
    // Resolve it once before plan limits, history, scoring and reporting, then discard
    // the Google URL completely and continue from the real destination website.
    if (target.hostname.toLowerCase() === "share.google") {
      try {
        const resolvedShare = await safePublicFetch(target.toString(), {
          timeoutMs: 8000,
          maxRedirects: 6,
          userAgent: "RankFixBot/2.1 (+https://rankfix-app.onrender.com)",
          accept: "text/html,application/xhtml+xml",
        });
        const resolvedHost = resolvedShare.finalUrl.hostname.toLowerCase().replace(/^www\./, "");
        try { await resolvedShare.response.body?.cancel(); } catch {}
        if (resolvedHost === "share.google" || resolvedHost === "google.com" || resolvedHost.endsWith(".google.com")) {
          throw new Error("SHARE_GOOGLE_UNRESOLVED");
        }
        target = validatePublicHttpUrl(normalizeScanUrl(resolvedShare.finalUrl.toString()));
      } catch {
        return NextResponse.json({ error: scanError.fetch }, { status: 502 });
      }
    }

    // Public scans are intentionally available without login, but the endpoint can
    // trigger network fetches and bounded browser rendering. Apply a coarse per-network
    // limit so anonymous automation cannot consume unbounded scan capacity.
    if (!dashboardScan) {
      await ensureDatabase();
      const publicIp=requestIp(request);
      const publicAllowed=await consumeRateLimit("public-scan",publicIp,8,3600);
      if(!publicAllowed){
        const publicRateMessages:Record<string,string>={
          nl:"Er zijn vanaf dit netwerk veel gratis scans uitgevoerd. Probeer het over ongeveer een uur opnieuw.",
          en:"Many free scans have been run from this network. Please try again in about an hour.",
          de:"Von diesem Netzwerk wurden viele kostenlose Scans ausgeführt. Bitte versuche es in etwa einer Stunde erneut.",
          fr:"De nombreuses analyses gratuites ont été lancées depuis ce réseau. Réessayez dans environ une heure.",
          it:"Da questa rete sono state eseguite molte scansioni gratuite. Riprova tra circa un’ora.",
          es:"Se han realizado muchos análisis gratuitos desde esta red. Vuelve a intentarlo dentro de aproximadamente una hora."
        };
        return NextResponse.json({error:publicRateMessages[scanLanguage],code:"PUBLIC_SCAN_RATE_LIMIT"},{status:429,headers:{"Retry-After":"3600"}});
      }
    }

    // Dashboard allowances are enforced server-side before starting an expensive crawl.
    // Free keeps the cross-account per-domain allowance; paid plans use account-level monthly allowances.
    let usageUser: Awaited<ReturnType<typeof getCurrentUser>> = null;
    const usageWebsiteHost = target.hostname.toLowerCase().replace(/^www\./, "");
    let usageIpHash: string | null = null;
    if (dashboardScan) {
      try { usageUser = await getCurrentUser(); } catch {}
      if (!usageUser) return NextResponse.json({ error: scanError.session }, { status: 401 });
      await ensureDatabase();
      const planResult = await getDb().query("SELECT plan_code FROM users WHERE id=$1 LIMIT 1", [usageUser.id]);
      const planCode = normalizePlan(planResult.rows[0]?.plan_code);
      const limits = planLimits(planCode);
      const accountHosts = await getDb().query(
        "SELECT DISTINCT lower(regexp_replace(split_part(split_part(COALESCE(final_url,scanned_url),'://',2),'/',1),'^www\\.','')) AS website_host FROM scans WHERE user_id=$1 ORDER BY website_host",
        [usageUser.id]
      );
      const existingHosts = accountHosts.rows.map(row=>String(row.website_host||"").split(":")[0]).filter(Boolean);
      const configuredTestUserId = (process.env.RANKFIX_INTERNAL_TEST_USER_ID || "").trim();
      const configuredTestEmail = (process.env.RANKFIX_INTERNAL_TEST_EMAIL || "").trim().replace(/^["']|["']$/g, "").trim().toLowerCase();
      const signedInEmail = String(usageUser.email || "").trim().toLowerCase();
      const internalTestAccount = (Boolean(configuredTestUserId) && configuredTestUserId === usageUser.id) || (Boolean(configuredTestEmail) && configuredTestEmail === signedInEmail);
      if (!internalTestAccount && process.env.RANKFIX_INTERNAL_TEST_EMAIL) {
        console.warn("RankFix internal test account mismatch", { configured: Boolean(configuredTestEmail), signedInEmailPresent: Boolean(signedInEmail), matchingEmail: configuredTestEmail === signedInEmail });
      }
      if (!internalTestAccount && !existingHosts.includes(usageWebsiteHost) && existingHosts.length >= limits.websites) {
        const websiteMessages: Record<string,string> = {
          nl:`Je ${planCode} abonnement ondersteunt maximaal ${limits.websites} website(s). Upgrade je abonnement om meer websites te beheren.`,
          en:`Your ${planCode} plan supports up to ${limits.websites} website(s). Upgrade your plan to manage more websites.`,
          de:`Dein ${planCode}-Tarif unterstützt bis zu ${limits.websites} Website(s). Upgrade deinen Tarif, um mehr Websites zu verwalten.`,
          fr:`Votre offre ${planCode} prend en charge jusqu’à ${limits.websites} site(s). Passez à une offre supérieure pour gérer plus de sites.`,
          it:`Il piano ${planCode} supporta fino a ${limits.websites} sito/i. Effettua l’upgrade per gestire più siti.`,
          es:`Tu plan ${planCode} admite hasta ${limits.websites} sitio(s). Mejora tu plan para gestionar más sitios.`
        };
        return NextResponse.json({error:websiteMessages[scanLanguage],code:"WEBSITE_LIMIT",usage:{plan:planCode,used:existingHosts.length,limit:limits.websites}},{status:403});
      }
      const monthStart = new Date(); monthStart.setUTCDate(1); monthStart.setUTCHours(0,0,0,0);
      const scanUsage = planCode==="free"
        ? await getDb().query("SELECT COUNT(*)::int AS count FROM usage_events WHERE website_host=$1 AND event_type='SCAN' AND created_at >= $2",[usageWebsiteHost,monthStart.toISOString()])
        : await getDb().query("SELECT COUNT(*)::int AS count FROM usage_events WHERE user_id=$1 AND event_type='SCAN' AND created_at >= $2",[usageUser.id,monthStart.toISOString()]);
      const used = Number(scanUsage.rows[0]?.count || 0);
      // Only an explicitly configured internal test account may bypass customer limits.
      if (!internalTestAccount && used >= limits.scans) {
        const limitMessages: Record<string,string> = {
          nl:`Je ${limits.scans} scans van deze maand zijn gebruikt. Je bestaande rapporten blijven beschikbaar.`,
          en:`Your ${limits.scans} scans for this month have been used. Your existing reports remain available.`,
          de:`Deine ${limits.scans} Scans für diesen Monat wurden verwendet. Deine bestehenden Berichte bleiben verfügbar.`,
          fr:`Vos ${limits.scans} analyses de ce mois ont été utilisées. Vos rapports existants restent disponibles.`,
          it:`Le ${limits.scans} scansioni di questo mese sono state utilizzate. I rapporti esistenti restano disponibili.`,
          es:`Tus ${limits.scans} análisis de este mes ya se han utilizado. Tus informes existentes seguirán disponibles.`
        };
        return NextResponse.json({error:limitMessages[scanLanguage],code:"SCAN_LIMIT",usage:{plan:planCode,used,limit:limits.scans}},{status:429});
      }
      if(planCode==="free"){
        const ip = requestIp(request);
        const salt = process.env.USAGE_HASH_SALT || process.env.SESSION_SECRET || "rankfix-usage";
        usageIpHash = createHash("sha256").update(salt + ":" + ip).digest("hex");
        // Count attempts, not only completed scans, so repeated failed crawls cannot
        // bypass the coarse Free-plan network protection.
        const allowed = await consumeRateLimit("free-scan", ip, 8, 3600);
        if (!allowed) {
          const rateMessages: Record<string,string> = {nl:"Er zijn vanaf dit netwerk veel gratis scans uitgevoerd. Probeer het over ongeveer een uur opnieuw.",en:"Many free scans have been run from this network. Please try again in about an hour.",de:"Von diesem Netzwerk wurden viele kostenlose Scans ausgeführt. Bitte versuche es in etwa einer Stunde erneut.",fr:"De nombreuses analyses gratuites ont été lancées depuis ce réseau. Réessayez dans environ une heure.",it:"Da questa rete sono state eseguite molte scansioni gratuite. Riprova tra circa un’ora.",es:"Se han realizado muchos análisis gratuitos desde esta red. Vuelve a intentarlo dentro de aproximadamente una hora."};
          return NextResponse.json({error:rateMessages[scanLanguage],code:"FREE_SCAN_RATE_LIMIT"},{status:429,headers:{"Retry-After":"3600"}});
        }
      }
    }

    const started = Date.now();
    let response: Response;
    let fetchedFinalUrl: URL | null = null;
    let redirectChain: Array<{ from: string; to: string; status: number }> = [];
    try {
      let activeTarget = target;
      const fetchTarget = () => safePublicFetch(activeTarget, { timeoutMs: 12000, maxRedirects: 4, userAgent: "RankFixBot/2.1 (+https://rankfix-app.onrender.com)", accept: "text/html,application/xhtml+xml,text/plain,application/xml" });
      try {
        ({ response, finalUrl: fetchedFinalUrl, redirectChain } = await fetchTarget());
      } catch (httpsError) {
        // For a scheme-less domain RankFix first tries HTTPS. Some legacy sites still only
        // answer on HTTP, so retry HTTP once. Never downgrade an explicitly supplied HTTPS URL.
        if (!/^https?:\/\//i.test(rawUrl) && target.protocol === "https:") {
          activeTarget = validatePublicHttpUrl(`http://${target.host}${target.pathname}${target.search}`);
          ({ response, finalUrl: fetchedFinalUrl, redirectChain } = await fetchTarget());
          target = activeTarget;
        } else {
          throw httpsError;
        }
      }

      // A 429 is a temporary rate limit, not an SEO finding. Respect Retry-After
      // when practical and retry at most twice so RankFix never creates a request loop.
      for (let retry = 0; response.status === 429 && retry < 2; retry++) {
        const retryAfter = response.headers.get("retry-after");
        const seconds = retryAfter && /^\d+$/.test(retryAfter.trim()) ? Number(retryAfter.trim()) : null;
        const retryDateMs = retryAfter && seconds === null ? Date.parse(retryAfter) - Date.now() : NaN;
        const requestedDelayMs = seconds !== null ? seconds * 1000 : Number.isFinite(retryDateMs) ? Math.max(0, retryDateMs) : 750 * (retry + 1);
        const delayMs = Math.min(Math.max(requestedDelayMs, 500), 5000);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        ({ response, finalUrl: fetchedFinalUrl, redirectChain } = await fetchTarget());
      }
    } catch {
      return NextResponse.json(
        { error: scanError.fetch },
        { status: 502 }
      );
    }

    const responseTime = Date.now() - started;
    // safePublicFetch follows redirects manually for SSRF safety. Response.url therefore
    // is not a reliable source of the terminal URL. Always use the validated finalUrl
    // returned by safePublicFetch so share/short links are classified from the actual site.
    const finalUrl = fetchedFinalUrl ?? new URL(response.url || target.toString());
    console.info("RankFix redirect resolution", { requested: target.toString(), final: finalUrl.toString(), hops: redirectChain.length });

    if (response.status === 429) {
      return NextResponse.json(
        { error: scanError.rate, retryable: true, charged: false },
        { status: 429 }
      );
    }

    // Recovery Evidence: a normal public request can receive 403/405 while a
    // legitimate browser receives the public page. Try one bounded browser
    // render only; never rotate proxies, bypass CAPTCHAs or evade a WAF.
    const recovery = {
      attempted: false,
      originalHttpStatus: response.status,
      browserRecovered: false,
      limitedScope: false,
      reason: null as string | null,
      evidenceSource: null as "rendered_html" | null,
    };
    let recoveredHtml: string | null = null;
    let recoveredRenderElapsedMs: number | null = null;
    if (!response.ok && (response.status === 202 || response.status === 403 || response.status === 405)) {
      recovery.attempted = true;
      try {
        const recovered = await renderPublicPage(finalUrl.toString(), 12000);
        if (recovered.html && recovered.html.length >= 20) {
          recoveredHtml = recovered.html;
          recoveredRenderElapsedMs = recovered.elapsedMs;
          recovery.browserRecovered = true;
          recovery.limitedScope = true;
          recovery.evidenceSource = "rendered_html";
        }
      } catch (recoveryError) {
        recovery.reason = recoveryError instanceof Error ? recoveryError.message.slice(0, 120) : "RECOVERY_RENDER_FAILED";
      }
    }
    if (!response.ok && !recoveredHtml) {
      const httpMessages: Record<string,string> = {
        nl:`Scan geblokkeerd door website (HTTP ${response.status}). RankFix kon deze website niet betrouwbaar analyseren. Er is daarom geen score berekend.`,
        en:`The website returned HTTP ${response.status} and cannot be analysed reliably.`,
        de:`Die Website hat HTTP ${response.status} zurückgegeben und kann nicht zuverlässig analysiert werden.`,
        fr:`Le site a renvoyé HTTP ${response.status} et ne peut pas être analysé de manière fiable.`,
        it:`Il sito ha restituito HTTP ${response.status} e non può essere analizzato in modo affidabile.`,
        es:`El sitio devolvió HTTP ${response.status} y no se puede analizar de forma fiable.`
      };
      return NextResponse.json({ error: httpMessages[scanLanguage], recovery }, { status: 422 });
    }

    // Modern commerce/product pages can contain large SSR payloads and JSON-LD. Keep a strict cap, but allow enough room to audit them safely.
    let html = recoveredHtml ?? await readResponseTextLimited(response, 8_000_000);
    if (!html || html.length < 20) {
      return NextResponse.json({ error: scanError.html, recovery }, { status: 422 });
    }

    const rawHtml = recoveredHtml ? "" : html;
    const rawVisibleText = stripHtml(rawHtml);
    const rawVisibleWords = rawVisibleText.split(/\s+/).filter(Boolean).length;
    const rawScriptCount = (rawHtml.match(/<script\b/gi) || []).length;
    const thinClientShell = rawVisibleWords < 80 && rawScriptCount >= 4;
    const javascriptFrameworkSignal = /(?:__NEXT_DATA__|\/_next\/|__NUXT__|\/_nuxt\/|data-reactroot|data-react-helmet|shopify|webpackJsonp|__APOLLO_STATE__)/i.test(rawHtml);
    // Bounded render: framework evidence alone is useful, but a thin client shell
    // is also a strong reason to render once. This improves Shopify/Next/Nuxt sites
    // without rendering every SSR page or retrying indefinitely.
    const javascriptCandidate = !recoveredHtml && (javascriptFrameworkSignal || thinClientShell);
    let javascriptExecuted = Boolean(recoveredHtml);
    let renderElapsedMs: number | null = recoveredRenderElapsedMs;
    let renderFallbackReason: string | null = recovery.reason;
    if (javascriptCandidate) {
      try {
        const rendered = await renderPublicPage(finalUrl.toString(), 12000);
        html = rendered.html;
        javascriptExecuted = true;
        renderElapsedMs = rendered.elapsedMs;
      } catch (renderError) {
        renderFallbackReason = renderError instanceof Error ? renderError.message.slice(0, 120) : "RENDER_FAILED";
        console.info("RankFix headless fallback", { page: finalUrl.toString(), reason: renderFallbackReason });
      }
    }

    // Central Scan Quality Gate: HTTP 200 can still be a holding/challenge page.
    // Reject it before SEO/GEO/Security scoring to prevent misleading reports.
    // Motor v2.1 Recovery Pipeline: an HTTP 200 challenge is not immediately fatal.
    // Try one bounded browser render, then run the same Quality Gate on the recovered
    // document. This never bypasses CAPTCHA/WAF controls; failed recovery still stops safely.
    const preliminaryQualityTitle = firstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
    const preliminaryQualityText = stripHtml(html).slice(0, 12000);
    const preliminaryInterstitial = /\b(hang tight|routing to checkout|checking your browser|just a moment|please wait|verify (?:you are|that you are) human|access denied|security check|attention required|radware page|incapsula incident|request unsuccessful|je bent bijna op de pagina die je zoekt|you(?:'|’)re almost at the page you(?:'|’)re looking for)\b/i.test(preliminaryQualityTitle)
      || /\b(checking your browser|verify (?:you are|that you are) human|enable javascript and cookies to continue|performing security verification|routing to checkout|challenge-platform|radware|incapsula|imperva|akamai bot manager|request unsuccessful|je bent bijna op de pagina die je zoekt|you(?:'|’)re almost at the page you(?:'|’)re looking for)\b/i.test(preliminaryQualityText);
    if (preliminaryInterstitial && !javascriptExecuted) {
      try {
        const recovered = await renderPublicPage(finalUrl.toString(), 12000);
        if (recovered.html && recovered.html.length >= 20) {
          html = recovered.html;
          javascriptExecuted = true;
          renderElapsedMs = recovered.elapsedMs;
          recovery.attempted = true;
          recovery.browserRecovered = true;
          recovery.limitedScope = true;
          recovery.evidenceSource = "rendered_html";
          recovery.reason = "QUALITY_GATE_BROWSER_RECOVERY";
        }
      } catch (qualityRecoveryError) {
        recovery.attempted = true;
        recovery.reason = qualityRecoveryError instanceof Error ? qualityRecoveryError.message.slice(0,120) : "QUALITY_GATE_RECOVERY_FAILED";
      }
    }

    const qualityTitle = firstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
    const qualityText = stripHtml(html).slice(0, 12000);
    const qualityWords = qualityText.split(/\s+/).filter(Boolean).length;
    const qualityDescription =
      firstMatch(html, /<meta[^>]+(?:name|property)\s*=\s*["']description["'][^>]+content\s*=\s*["']([\s\S]*?)["'][^>]*>/i) ||
      firstMatch(html, /<meta[^>]+content\s*=\s*["']([\s\S]*?)["'][^>]+(?:name|property)\s*=\s*["']description["'][^>]*>/i);
    const strongInterstitialTitle = /\b(hang tight|routing to checkout|checking your browser|just a moment|please wait|verify (?:you are|that you are) human|access denied|security check|attention required|radware page|incapsula incident|request unsuccessful|je bent bijna op de pagina die je zoekt|you(?:'|’)re almost at the page you(?:'|’)re looking for)\b/i.test(qualityTitle);
    const strongInterstitialBody = /\b(checking your browser|verify (?:you are|that you are) human|enable javascript and cookies to continue|performing security verification|routing to checkout|challenge-platform|radware|incapsula|imperva|akamai bot manager|request unsuccessful|je bent bijna op de pagina die je zoekt|you(?:'|’)re almost at the page you(?:'|’)re looking for)\b/i.test(qualityText);
    // A 2xx status other than 200 can represent asynchronous routing rather than the
    // requested indexable document. Only stop when the response is also materially
    // empty, so legitimate 202 endpoints are not rejected on status alone.
    const nonStandardEmptyDocument = response.status !== 200 && qualityWords < 40 && !qualityTitle && !qualityDescription;
    const emptyDocument = qualityWords < 15 && !qualityTitle && !qualityDescription;
    if (strongInterstitialTitle || (strongInterstitialBody && qualityWords < 350) || nonStandardEmptyDocument || emptyDocument) {
      const qualityMessages: Record<string,string> = {
        nl:"Website kon niet betrouwbaar worden geanalyseerd. De server leverde een tussen-, challenge- of routingpagina in plaats van de verwachte website. Er is daarom geen score berekend.",
        en:"The website could not be analysed reliably. The server returned an interstitial, challenge or routing page instead of the expected website, so no score was calculated.",
        de:"Die Website konnte nicht zuverlässig analysiert werden. Der Server lieferte eine Zwischen-, Challenge- oder Routing-Seite statt der erwarteten Website. Daher wurde keine Bewertung berechnet.",
        fr:"Le site n’a pas pu être analysé de manière fiable. Le serveur a renvoyé une page intermédiaire, de vérification ou de routage au lieu du site attendu. Aucun score n’a donc été calculé.",
        it:"Il sito non ha potuto essere analizzato in modo affidabile. Il server ha restituito una pagina intermedia, di verifica o di routing invece del sito previsto. Non è stato quindi calcolato alcun punteggio.",
        es:"El sitio no pudo analizarse de forma fiable. El servidor devolvió una página intermedia, de verificación o de enrutamiento en lugar del sitio esperado. Por eso no se calculó ninguna puntuación."
      };
      return NextResponse.json({ error: qualityMessages[scanLanguage], charged: false }, { status: 422 });
    }

    const title = firstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
    const descriptionMetaTag = html.match(/<meta\b[^>]*(?:name|property)\s*=\s*["']description["'][^>]*>/i)?.[0] ||
      html.match(/<meta\b[^>]*content\s*=\s*["'][^"']*["'][^>]*(?:name|property)\s*=\s*["']description["'][^>]*>/i)?.[0] || "";
    const descriptionContentMatch = descriptionMetaTag.match(/\bcontent\s*=\s*(["'])([\s\S]*?)\1/i);
    const description = descriptionContentMatch ? stripHtml(descriptionContentMatch[2]).trim() : "";
    const descriptionState: "missing" | "empty" | "present" = !descriptionMetaTag ? "missing" : !description ? "empty" : "present";
    const h1s = allMatches(html, /<h1[^>]*>([\s\S]*?)<\/h1>/gi).map(stripHtml).filter(Boolean);
    const headingTags = [...html.matchAll(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi)];
    const headings = headingTags.map((m) => ({ level: Number(m[1]), text: stripHtml(m[2]) })).filter((h) => h.text);
    const canonical =
      firstMatch(html, /<link[^>]+rel\s*=\s*["']canonical["'][^>]+href\s*=\s*["']([^"']+)["'][^>]*>/i) ||
      firstMatch(html, /<link[^>]+href\s*=\s*["']([^"']+)["'][^>]+rel\s*=\s*["']canonical["'][^>]*>/i);
    const lang = firstMatch(html, /<html[^>]+lang\s*=\s*["']([^"']+)["']/i);
    const langIsValid = /^(?:[a-z]{2,3})(?:-[a-z0-9]{2,8})*$/i.test(lang);
    const viewportContent =
      firstMatch(html, /<meta[^>]+name\s*=\s*["']viewport["'][^>]+content\s*=\s*["']([^"']+)["']/i) ||
      firstMatch(html, /<meta[^>]+content\s*=\s*["']([^"']+)["'][^>]+name\s*=\s*["']viewport["']/i);
    const viewportIsResponsive = /(?:^|[,;\s])width\s*=\s*device-width(?:$|[,;\s])/i.test(viewportContent);
    const robots =
      firstMatch(html, /<meta[^>]+name\s*=\s*["']robots["'][^>]+content\s*=\s*["']([^"']+)["']/i) ||
      firstMatch(html, /<meta[^>]+content\s*=\s*["']([^"']+)["'][^>]+name\s*=\s*["']robots["']/i);
    const xRobotsTag = response.headers.get("x-robots-tag") || "";
    const noindexSignal = /(?:^|[,;\s])noindex(?:$|[,;\s])/i.test(robots) || /(?:^|[,;\s])noindex(?:$|[,;\s])/i.test(xRobotsTag);
    const imageMetrics = extractImageMetrics(html);
    const imageCount = imageMetrics.uniqueImageReferences;
    const imageElementCount = imageMetrics.elementCount;
    const imagesMissingAlt = imageMetrics.missingAlt;
    const imageAltCandidates = [...html.matchAll(/<img\b[^>]*>/gi)]
      .filter((m) => {
        const tag = m[0];
        // alt="" intentionally marks a decorative image. Only images without
        // an alt attribute belong in the actionable fix candidates.
        return !/\balt(?:\s*=|\s|\/?>)/i.test(tag);
      })
      .slice(0, 10)
      .map((m) => {
        const tag = m[0];
        const attr = (name: string) => attrFromTag(tag, name);
        const src = attr("src") || attr("data-src") || attr("data-lazy-src") || attr("data-original") || attr("data-image") ||
          (attr("srcset") || attr("data-srcset")).split(",")[0]?.trim().split(/\s+/)[0] || "";
        return { src };
      })
      .filter((item) => item.src);
    const links = [...html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi)].map((m) => m[1]);
    const internalLinks = links.filter((href) => {
      try { return new URL(href, finalUrl).hostname === finalUrl.hostname; } catch { return false; }
    }).length;
    const text = stripHtml(html);
    const wordCount = text ? text.split(/\s+/).filter(Boolean).length : 0;

    const metaTags = [...html.matchAll(/<meta\b[^>]*>/gi)].map((m) => m[0]);
    const getMeta = (key: string) =>
      decode(metaTags.map((tag) => ({
        property: attrFromTag(tag, "property"),
        name: attrFromTag(tag, "name"),
        content: attrFromTag(tag, "content"),
      })).find((x) => x.property.toLowerCase() === key.toLowerCase() || x.name.toLowerCase() === key.toLowerCase())?.content || "");

    const ogTitle = getMeta("og:title");
    const ogDescription = getMeta("og:description");
    const ogImage = getMeta("og:image");
    const ogUrl = getMeta("og:url");
    const twitterCardRaw = getMeta("twitter:card").trim();
    const twitterCard = /^(summary|summary_large_image|app|player)$/i.test(twitterCardRaw) ? twitterCardRaw : "";
    const twitterCardInvalidValue = Boolean(twitterCardRaw && !twitterCard);
    const isAbsoluteHttpUrl = (value: string) => {
      if (!value) return false;
      try {
        const parsed = new URL(value);
        return /^https?:$/.test(parsed.protocol);
      } catch {
        return false;
      }
    };
    const ogImageIsAbsolute = isAbsoluteHttpUrl(ogImage);
    const ogUrlIsAbsolute = !ogUrl || isAbsoluteHttpUrl(ogUrl);

    const jsonLdBlocks = [...html.matchAll(/<script\b(?=[^>]*\btype\s*=\s*(?:(["'])application\/ld\+json\1|application\/ld\+json(?:\s|>|\/)))[^>]*>([\s\S]*?)<\/script>/gi)].map((match) => decode(match[2] || ""));
    const schemaTypes: string[] = [];
    const schemaObjects: any[] = [];
    let validJsonLd = 0;
    const collectSchemaObjects = (value: unknown, seen = new Set<object>()) => {
      if (!value || typeof value !== "object") return;
      const objectValue = value as Record<string, unknown>;
      if (seen.has(objectValue)) return;
      seen.add(objectValue);
      schemaObjects.push(objectValue);
      const rawTypes = objectValue["@type"];
      if (rawTypes) {
        const types = Array.isArray(rawTypes) ? rawTypes : [rawTypes];
        schemaTypes.push(...types.filter((type) => typeof type === "string").map(String));
      }
      for (const nested of Object.values(objectValue)) {
        if (Array.isArray(nested)) nested.forEach((item) => collectSchemaObjects(item, seen));
        else if (nested && typeof nested === "object") collectSchemaObjects(nested, seen);
      }
    };
    for (const raw of jsonLdBlocks) {
      try {
        const parsed = JSON.parse(raw);
        validJsonLd++;
        if (Array.isArray(parsed)) parsed.forEach((item) => collectSchemaObjects(item));
        else collectSchemaObjects(parsed);
      } catch {}
    }
    const schemaSet = new Set(schemaTypes.map((v) => v.toLowerCase()));
    const hasEntitySchema = ["organization", "localbusiness", "person", "product", "article", "website"].some((t) => schemaSet.has(t));
    const organizationObjects = schemaObjects.filter((item) => {
      const types = Array.isArray(item?.["@type"]) ? item["@type"] : [item?.["@type"]];
      return types.some((type: unknown) => String(type || "").toLowerCase() === "organization");
    });
    const organizationSchema = organizationObjects[0] || null;
    const organizationSchemaName = typeof organizationSchema?.name === "string" ? organizationSchema.name.trim() : "";
    const organizationSchemaUrl = typeof organizationSchema?.url === "string" ? organizationSchema.url.trim() : "";
    const organizationSchemaLogo = typeof organizationSchema?.logo === "string"
      ? organizationSchema.logo.trim()
      : typeof organizationSchema?.logo?.url === "string"
        ? organizationSchema.logo.url.trim()
        : "";
    const organizationSchemaSameAs = Array.isArray(organizationSchema?.sameAs)
      ? organizationSchema.sameAs.filter((value: unknown) => typeof value === "string" && value.trim()).length
      : 0;
    const organizationSchemaContact = organizationSchema?.contactPoint ? 1 : 0;
    const hasOrganizationIdentity = Boolean(organizationSchema && (
      organizationSchemaName ||
      organizationSchemaUrl ||
      organizationSchemaLogo ||
      organizationSchemaSameAs ||
      organizationSchemaContact
    ));
    const hasBreadcrumb = schemaSet.has("breadcrumblist");
    const hasFaqSchema = schemaSet.has("faqpage");
    console.info("RankFix scan phase", { phase: "schema_parsed", page: finalUrl.toString(), schemaObjects: schemaObjects.length });
    const hasProductSchema = schemaSet.has("product");
    const productSchemaObjects = schemaObjects.filter((item) => {
      const types = Array.isArray(item?.["@type"]) ? item["@type"] : [item?.["@type"]];
      return types.some((type: unknown) => String(type || "").toLowerCase() === "product");
    });
    type ProductOfferEvidence = {
      type: string;
      price: unknown;
      highPrice: unknown;
      currency: string;
      availability: string;
      shippingDetails: boolean;
      returnPolicy: boolean;
    };
    const productOfferEvidence = productSchemaObjects.map((product) => {
      const offers = Array.isArray(product?.offers) ? product.offers : product?.offers ? [product.offers] : [];
      const normalizedOffers: ProductOfferEvidence[] = offers.map((offer: any) => ({
        type: Array.isArray(offer?.["@type"]) ? offer["@type"].map(String).join(",") : String(offer?.["@type"] || ""),
        price: offer?.price ?? offer?.lowPrice ?? null,
        highPrice: offer?.highPrice ?? null,
        currency: typeof offer?.priceCurrency === "string" ? offer.priceCurrency.trim().toUpperCase() : "",
        availability: typeof offer?.availability === "string" ? offer.availability.trim() : "",
        shippingDetails: Boolean(offer?.shippingDetails),
        returnPolicy: Boolean(offer?.hasMerchantReturnPolicy),
      }));
      const rawImage = Array.isArray(product?.image) ? product.image[0] : product?.image;
      const imageUrl = typeof rawImage === "string"
        ? rawImage.trim()
        : typeof rawImage?.url === "string"
          ? rawImage.url.trim()
          : typeof rawImage?.contentUrl === "string"
            ? rawImage.contentUrl.trim()
            : "";
      return {
        name: typeof product?.name === "string" ? product.name.trim() : "",
        hasImage: Boolean(product?.image),
        imageUrl,
        sku: typeof product?.sku === "string" ? product.sku.trim() : "",
        offers: normalizedOffers,
      };
    });
    console.info("RankFix scan phase", { phase: "product_evidence_built", page: finalUrl.toString(), hasProductSchema, productSchemaObjects: productSchemaObjects.length, productEvidence: productOfferEvidence.length });
    const offerHasPrice = (offer: { price: unknown }) => {
      if (offer.price === null || offer.price === undefined || offer.price === "") return false;
      const numeric = typeof offer.price === "number" ? offer.price : Number(String(offer.price).replace(",", "."));
      return Number.isFinite(numeric) && numeric >= 0;
    };
    const offerHasValidCurrency = (offer: { currency: string }) => /^[A-Z]{3}$/.test(offer.currency);
    const offerHasAvailability = (offer: { availability: string }) => Boolean(offer.availability && /(?:InStock|OutOfStock|PreOrder|BackOrder|LimitedAvailability|SoldOut|OnlineOnly|InStoreOnly|Discontinued)/i.test(offer.availability));
    const hasCompleteProductOffer = productOfferEvidence.some((product) =>
      Boolean(product.name && product.hasImage && product.offers.some((offer) => offerHasPrice(offer) && offerHasValidCurrency(offer) && offerHasAvailability(offer)))
    );
    const hasStructuredShipping = schemaSet.has("offershippingdetails") || productOfferEvidence.some((product) => product.offers.some((offer) => offer.shippingDetails));
    const hasStructuredReturns = schemaSet.has("merchantreturnpolicy") || productOfferEvidence.some((product) => product.offers.some((offer) => offer.returnPolicy));
    const productOfferSummary = productOfferEvidence.map((product) => ({
      name: product.name || null,
      image: product.hasImage,
      sku: product.sku || null,
      offers: product.offers.map((offer) => ({
        type: offer.type || null,
        price: offer.price,
        highPrice: offer.highPrice,
        currency: offer.currency || null,
        availability: offer.availability || null,
        shippingDetails: offer.shippingDetails,
        returnPolicy: offer.returnPolicy,
      })),
    }));
    const hasAuthorSignal = /\b(author|auteur|geschreven door|written by|byline)\b/i.test(text) || schemaSet.has("person");

    const hasFaqContent = /\b(faq|veelgestelde vragen|frequently asked questions|questions fréquentes|häufig gestellte fragen)\b/i.test(text) ||
      /<details\b/i.test(html) || /<h[2-6][^>]*>[^<]*(\?|faq|vragen|questions)[^<]*<\/h[2-6]>/i.test(html);
    const hasContactSignal = /\b(contact|contacteer|e-mail|email|telefoon|phone|adres|address|kontakt|contatti|contacto)\b/i.test(text);
    const hasContactFormSignal = /<form\b[\s\S]*?(?:name\s*=\s*["'](?:email|message|name)["']|type\s*=\s*["']email["'])[\s\S]*?<\/form>/i.test(html);
    const hasContactActionSignal = /<(?:a|button)\b[^>]*(?:href\s*=\s*["'][^"']*(?:#contact|\/contact)|aria-label\s*=\s*["'][^"']*contact)[^>]*>|<(?:a|button)\b[^>]*>\s*(?:contact|kontakt|contatti|contacto)\s*<\/(?:a|button)>/i.test(html);
    const hasAboutSignal = /\b(over ons|over [a-z0-9][a-z0-9 .&-]{1,40}|about us|about [a-z0-9][a-z0-9 .&-]{1,40}|über [a-z0-9][a-z0-9 .&-]{1,40}|à propos|chi è|sobre [a-z0-9][a-z0-9 .&-]{1,40})\b/i.test(text);
    const organizationName = firstMatch(html, /<meta[^>]+(?:property|name)\s*=\s*["'](?:og:site_name|application-name)["'][^>]+content\s*=\s*["']([^"']+)["']/i);
    const sameAsCount = (html.match(/"sameAs"\s*:/gi) || []).length;
    const pathname = finalUrl.pathname.replace(/\/+$/, "") || "/";
    const pathSegmentsForType = pathname.split("/").filter(Boolean).map((segment) => safeDecodeURIComponent(segment).toLowerCase());
    const knownLanguageSegments = new Set(["nl","en","de","fr","es","it","pt","pl","sv","no","da","fi","cs","sk","hu","ro","bg","el","tr"]);
    const localeSegmentPattern = /^(?:[a-z]{2})(?:-[a-z]{2})?$/i;
    // Localized roots such as /nl/, /nl/nl/ and /en-gb/ are homepages.
    // Do not treat arbitrary short slugs as locale roots.
    const isLocalizedHomepage = pathSegmentsForType.length > 0 && pathSegmentsForType.length <= 2 &&
      pathSegmentsForType.every((segment) => localeSegmentPattern.test(segment) && knownLanguageSegments.has(segment.split("-")[0]));
    const isHomepage = pathname === "/" || isLocalizedHomepage;
    const localBusinessKeywordSignal = /\b(restaurant|eetcafé|eetgelegenheid|brasserie|bistro|menukaart|kapsalon|kapper|hairdresser|salon|coiffeur|barbier|bakker|bakery|bar|café|cafe|dentist|tandarts|tandheelkunde|mondzorg|orthodontist|electrician|elektricien|elektro|elektrotechniek|installatietechniek|plumber|loodgieter|loodgieters|cv-installateur|installateur|aannemer|contractor|bouwbedrijf|bouwservice|verbouwing|renovatie|dakdekker|dakbedekking|dakwerken|beautysalon|beauty salon|schoonheidssalon|winkel|store|shop|boetiek|retail|garage|autogarage|autoservice|autobedrijf|autodealer|makelaar|makelaars|vastgoedmakelaar|real estate agent|realtor|woningmakelaar|advocaat|advocatenkantoor|law firm|jurist|notaris|notariskantoor|accountant|accountantskantoor|boekhouder|boekhoudkantoor|administratiekantoor|reisbureau|reisorganisatie|travel agency|tour operator|reisagent|hotel|bed and breakfast|b&b|pension)\b/i.test([title, description, ...h1s, finalUrl.hostname, finalUrl.pathname].join(" "));
    const localContactSignal = /\b(opening hours|openingstijden|adres|address|telephone|telefoon|phone|contact)\b/i.test(text) &&
      /\b(address|adres|phone|telefoon|telephone|\+?31|0\d{1,3}[\s-]?\d)\b/i.test(text);
    const hasLocalBusinessSignal =
      schemaSet.has("localbusiness") ||
      (localContactSignal && (localBusinessKeywordSignal || /\b(menu|menukaart|reserveren|reservation|openingstijden|opening hours)\b/i.test(text)));
    const hasVisibleBusinessIdentity = Boolean(
      organizationName ||
      (title && /\b(restaurant|salon|kapsalon|bakker|bakery|bar|cafe|café|dentist|tandarts|electrician|elektricien|plumber|loodgieter|aannemer|contractor|hairdresser|kapper|store|winkel)\b/i.test(title)) ||
      hasLocalBusinessSignal
    );
    const hasBusinessContactDetails = /\b(\+?\d[\d\s().-]{7,}\b)/.test(text) ||
      /\b(e-mail|email|mailto:)\b/i.test(html) ||
      /\b(adres|address|straat|street|postcode|postal code)\b/i.test(text);
    const hasSocialOrReviewSignal = /\b(instagram|facebook|linkedin|google reviews|reviews|tripadvisor|trustpilot)\b/i.test(text) || sameAsCount > 0;
    const hasContactChannelSignal = hasBusinessContactDetails || (hasContactSignal && (hasContactFormSignal || hasContactActionSignal));
    const hasServiceExpertiseSignal = /\b(diensten|services|service|specialist|specialisten|expert|expertise|seo|geo|structured data|schema\.org|technical seo|technische seo|ai[- ]search|search readiness|auditsoftware|auditing|behandeling|behandelingen|hair|haar|knippen|kleur|color|styling|restaurant|keuken|cuisine|tandarts|elektricien|loodgieter|aannemer|dakdekker)\b/i.test(text);
    const hasStrongCommerceAction = /\b(add to cart|add-to-cart|add to basket|buy now|in winkelwagen|toevoegen(?: aan winkelwagen)?|koop nu|jetzt kaufen|in den warenkorb|ajouter au panier|acheter maintenant|añadir al carrito|comprar ahora|aggiungi al carrello|acquista ora)\b/i.test(text);
    const hasSkuSignal = /\b(sku|artikelnummer|productcode|référence produit|referencia del producto|codice prodotto)\b/i.test(text);
    const hasStockSignal = /\b(in stock|out of stock|op voorraad|niet op voorraad|uitverkocht|auf lager|nicht auf lager|en stock|rupture de stock|agotado|disponible|esaurito|disponibile|pre-?order|backorder)\b/i.test(text);
    const hasExplicitPriceSignal = /(?:€|£|\$)\s*\d|\d[\d.,]*\s*(?:€|EUR|GBP|USD)\b|\b(?:prijs|price|preis|prix|precio|prezzo)\s*[:€£$]?\s*\d/i.test(text);
    const productOgType = firstMatch(html, /<meta[^>]+(?:property|name)\s*=\s*["']og:type["'][^>]+content\s*=\s*["']([^"']+)["']/i) || firstMatch(html, /<meta[^>]+content\s*=\s*["']([^"']+)["'][^>]+(?:property|name)\s*=\s*["']og:type["']/i);
    const hasProductMetaSignal = /(?:^|[.:_-])product(?:$|[.:_-])/i.test(productOgType) || /(?:product|sku|price|availability)[.:_-]/i.test(html.match(/<meta\b[^>]*(?:property|name)\s*=\s*["'][^"']+["'][^>]*>/gi)?.join(" ") || "");
    const hasProductSignal = hasProductSchema || (hasStrongCommerceAction && (hasExplicitPriceSignal || hasStockSignal || hasSkuSignal)) || (hasSkuSignal && hasExplicitPriceSignal && hasStockSignal) || (hasProductMetaSignal && hasExplicitPriceSignal);
    // Product cards and stock text on a webshop homepage do not make that URL a product detail page.
    // Some marketplace/listing detail pages expose sparse Product markup in raw HTML
    // but have a stable detail URL and specialist identity. Treat only strong, portable
    // detail-path patterns as supporting evidence; never use a customer/domain exception.
    const specialistDetailPathSignal = !isHomepage && (
      /^\/a\/[^/]+-\d+(?:\/)?$/i.test(pathname) ||
      pathSegmentsForType.some((segment) => /^(?:vehicle|voertuig|auto|car|listing|advert|advertentie|occasion)$/.test(segment))
    );
    // Ticket/booking sites can expose prices and availability without being retail product pages.
    // Establish transport context before page typing so downstream modules share one decision.
    const transportBookingIdentityEarly = /(?:\b(train|railway|rail|spoorweg|trein|bahn|zug|ferrovi|trenitalia|intercity|flight|flights|airline|airport|vols?|vlucht|flug|voli|voo|billet|ticket|fahrplan|timetable|prijevoz|putnički|vlak|vozni red|karta|karte|željeznice|železnice|dráhy)\b|hellenic\s+train|cyprus\s+airways|δρομολόγ|εισιτήρ|τρένο|σιδηρόδρομ|πτήσ)/iu.test([title, description, text.slice(0,30000), finalUrl.hostname].join(" "));
    const propertyDetailPathEarly = !isHomepage && /\/(?:woningaanbod|residential-listings)\/(?:koop|huur|sale|rent)\//i.test(pathname);
    // Some real-estate platforms publish Product schema for a property object. That
    // schema describes an offer, but must not activate retail product/stock/copy checks.
    const isProductPage = !isHomepage && !transportBookingIdentityEarly && !propertyDetailPathEarly && (hasProductSignal || (specialistDetailPathSignal && (hasExplicitPriceSignal || hasSkuSignal || hasStockSignal)));
    const strongArticleMarkupSignal = /<article\b/i.test(html) && (/<time\b[^>]*(?:datetime|pubdate)/i.test(html) || /\b(?:author|byline|published|publication date|auteur|geschreven door)\b/i.test(text));
    const rawArticleSignal = !isHomepage && (schemaSet.has("article") || schemaSet.has("newsarticle") || schemaSet.has("blogposting") || strongArticleMarkupSignal);
    // A page can contain editorial markup around a retail template. Strong product
    // evidence wins over Article so the visible classification never contradicts
    // the same commerce evidence used by product checks.
    const articleSuppressedByCommerce = isProductPage && rawArticleSignal;
    const hasArticleSignal = rawArticleSignal && !isProductPage;
    const hasItemListSignal = schemaSet.has("itemlist");
    const commerceNavigationSignal = /\b(winkelwagen|cart|checkout|afrekenen|shop|webshop|producten|products)\b/i.test(text);
    const visiblePriceCount = (text.match(/(?:€|£|\$)\s*\d|\d[\d.,]*\s*(?:€|EUR|GBP|USD)\b/gi) || []).length;
    // Category detection must be portable across customer sites: use generic taxonomy paths
    // plus repeated commerce evidence, never customer-specific category slugs.
    const genericCategoryPathSignal = !isHomepage && pathSegmentsForType.some((segment) =>
      /^(?:shop|store|winkel|products?|producten?|catalog(?:ue)?|catalogus|category|categories|categorie|categorieen|collection|collections|departments?|assortiment|angebote|produits?|productos?|prodotti)$/.test(segment)
    );
    const repeatedProductCardSignal = !isHomepage && hasStrongCommerceAction && visiblePriceCount >= 2;
    const commerceCategoryContentSignal = !isHomepage &&
      commerceNavigationSignal &&
      visiblePriceCount >= 2 &&
      !hasSkuSignal &&
      !hasStockSignal;
    const hasCategorySignal = !isProductPage && (
      hasItemListSignal ||
      genericCategoryPathSignal ||
      repeatedProductCardSignal ||
      commerceCategoryContentSignal
    );
    // Pricing tables on SaaS/service sites are not webshop evidence by themselves.
    // A homepage needs an actual commerce action before webshop-only checks are enabled.
    const hasConfirmedCommercePlatform = /wp-content\/plugins\/woocommerce|wc-ajax|woocommerce-cart|woocommerce-checkout|woocommerce-page|cdn\.shopify\.com|\/cdn\/shop\/|shopify\.theme|shopify-section|shopify-payment-button|mage\/cookies|magento_|x-magento|\/static\/version\d+/i.test(html);
    const hasCommerceHrefSignal = /href\s*=\s*["'][^"']*(?:cart|winkelwagen|checkout|product|producten|shop|store)[^"']*["']/i.test(html);
    // Custom storefronts often render product cards server-side without a literal add-to-cart
    // button on the homepage. Repeated product-detail links + repeated prices + shop/cart
    // navigation are independent commerce signals and avoid confusing a SaaS pricing table
    // with a webshop.
    const productHrefCount = (html.match(/href\s*=\s*["'][^"']*(?:\/product(?:en|s)?\/|\/p\/|\/shop\/[^"'#?]+|\/store\/[^"'#?]+)[^"']*["']/gi) || []).length;
    const repeatedProductLinkSignal = productHrefCount >= 2 && visiblePriceCount >= 2 && commerceNavigationSignal;
    // Framework-agnostic storefront evidence: repeated server-rendered product cards carrying
    // prices plus a real cart form/action is stronger evidence than URL shape alone.
    // Requiring both independent signals prevents ordinary SaaS pricing cards from becoming shops.
    const pricedProductCardCount = (html.match(/<(?:article|div)[^>]+(?:data-product-card|class\s*=\s*["'][^"']*product-card[^"']*["'])[^>]*(?:data-price\s*=\s*["'][^"']+["'])?/gi) || []).length;
    const cartFormSignal = /<form[^>]+(?:action\s*=\s*["'][^"']*(?:cart|winkelwagen|checkout)[^"']*["']|class\s*=\s*["'][^"']*(?:cart|basket)[^"']*["'])/i.test(html);
    const hasStoreSchema = schemaSet.has("store") || schemaSet.has("onlinestore");
    const storefrontMarkupSignal = pricedProductCardCount >= 2 && visiblePriceCount >= 2 && (cartFormSignal || hasStrongCommerceAction) && commerceNavigationSignal;
    // Generic links such as "product", "pricing" or "support" are common on SaaS sites.
    // A homepage is only a storefront when catalog/product evidence is repeated, not merely
    // because several prices and a commerce-looking navigation link are present.
    const homepageStorefrontSignal = isHomepage &&
      commerceNavigationSignal &&
      visiblePriceCount >= 3 &&
      (productHrefCount >= 2 || pricedProductCardCount >= 2 || hasStoreSchema || hasConfirmedCommercePlatform);
    // Site-level commerce evidence must not depend on a homepage rendering prices or
    // add-to-cart controls. Large storefronts often keep those client-side while the
    // raw HTML still exposes Store schema and commercial navigation/support routes.
    const commerceSupportHrefCount = links.filter((href) =>
      /(?:verzend|shipping|delivery|bezorg|retour|return|refund|betaal|payment|bestel|order|winkelwagen|cart|checkout|klantenservice|customer-service)/i.test(href)
    ).length;
    const shopCatalogHrefCount = links.filter((href) =>
      /(?:\/shop(?:\/|$)|\/store(?:\/|$)|\/product(?:en|s)?(?:\/|$)|\/collection(?:s)?(?:\/|$)|\/categor(?:y|ie|ies|ien)(?:\/|$))/i.test(href)
    ).length;
    const commercialNavigationEvidence = commerceNavigationSignal && (shopCatalogHrefCount >= 2 || commerceSupportHrefCount >= 2);
    const transportBookingIdentity = transportBookingIdentityEarly;
    // Repeated catalog + customer-service evidence is sufficient for large SSR/headless
    // retailers whose prices or cart controls are client-rendered. Transport booking
    // flows are excluded unless independent retail evidence exists.
    const catalogStorefrontSignal = !transportBookingIdentity && shopCatalogHrefCount >= 2 && commerceSupportHrefCount >= 1 && (commerceNavigationSignal || visiblePriceCount >= 2);
    // Booking/ticket flows can look like checkout, but they are services rather than
    // product storefronts unless independent store/catalog evidence also exists.
    const hardPurchaseFlowSignal = !transportBookingIdentity && hasStrongCommerceAction && (hasExplicitPriceSignal || visiblePriceCount >= 2) && (hasCommerceHrefSignal || cartFormSignal);
    const siteLevelCommerceSignal = hasStoreSchema && (hasConfirmedCommercePlatform || hardPurchaseFlowSignal || repeatedProductLinkSignal || storefrontMarkupSignal);
    // Product schema is also used for software/SaaS offers. It may support a product-detail
    // classification, but it is not by itself proof that the whole site is a webshop.
    const productSchemaCommerceSignal = hasProductSignal && (
      hasStrongCommerceAction ||
      hasConfirmedCommercePlatform ||
      repeatedProductLinkSignal ||
      storefrontMarkupSignal ||
      hasStoreSchema ||
      (hasSkuSignal && hasStockSignal)
    );
    const retailCommerceSignal = hasConfirmedCommercePlatform || productSchemaCommerceSignal || repeatedProductLinkSignal || storefrontMarkupSignal || homepageStorefrontSignal || siteLevelCommerceSignal || catalogStorefrontSignal || hardPurchaseFlowSignal;
    const transportRetailStoreEvidence = hasConfirmedCommercePlatform && (repeatedProductLinkSignal || storefrontMarkupSignal || hasStoreSchema);
    const hasEcommerceSignal = transportBookingIdentity ? transportRetailStoreEvidence : retailCommerceSignal;
    // EU consumer/Omnibus checks are jurisdiction-sensitive. A non-EU country
    // storefront (for example .com.au) must not receive EU compliance signals
    // merely because it is an e-commerce site.
    const hostLower = finalUrl.hostname.toLowerCase();
    const euCountryTld = /\.(?:at|be|bg|hr|cy|cz|de|dk|ee|es|fi|fr|gr|hu|ie|it|lt|lu|lv|mt|nl|pl|pt|ro|se|si|sk)$/.test(hostLower);
    const explicitNonEuCountryTld = /\.(?:com\.au|co\.uk|ca|us|co\.nz|jp|cn|in|br|mx|ch|no)$/.test(hostLower);
    const euLanguageSignal = /^(?:nl|de|fr|it|es|pt|pl|sv|da|fi|cs|sk|hu|ro|bg|el|hr|et|lv|lt|sl|mt)(?:-|$)/i.test(lang || "");
    const euroMarketSignal = /(?:€|\bEUR\b)/i.test(text);
    const euConsumerApplicable = hasEcommerceSignal && !explicitNonEuCountryTld && (euCountryTld || euLanguageSignal || euroMarketSignal);
    const requestedLanguages = adsProfile.adLanguages.split(/[,;]/).map((value) => value.trim().toLowerCase()).filter(Boolean).slice(0, 6);
    const requestedCountries = adsProfile.targetCountries.split(/[,;]/).map((value) => value.trim()).filter(Boolean).slice(0, 8);
    const pageLanguage = (requestedLanguages[0] || lang || "").toLowerCase().split("-")[0].trim();
    const ogSiteName = html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i)?.[1]
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:site_name["']/i)?.[1]
      || "";
    const localBusinessObjects = schemaObjects.filter((item) => {
      const types = Array.isArray(item?.["@type"]) ? item["@type"] : [item?.["@type"]];
      return types.some((type: unknown) => {
        const normalized = String(type || "").toLowerCase();
        return normalized === "localbusiness" || normalized.endsWith("store") || normalized === "restaurant";
      });
    });
    const hasTrustedLocalEvidence = localBusinessObjects.some((item) =>
      Boolean(item?.address && (item?.telephone || item?.geo || item?.areaServed))
    );
    const adsKeywordIntelligence = buildAdsKeywordIntelligence({
      pageUrl: finalUrl.toString(),
      pageLanguage: (lang || "").toLowerCase().trim(),
      requestedLanguages,
      requestedCountries,
      targetArea: adsProfile.targetArea,
      campaignGoal: adsProfile.campaignGoal || (hasEcommerceSignal ? "sales" : hasLocalBusinessSignal ? "leads" : ""),
      industry: adsProfile.industry,
      primaryOffer: adsProfile.primaryOffer,
      excludeIntent: adsProfile.excludeIntent,
      productNames: productOfferEvidence.map((product) => product.name).filter(Boolean),
      organizationName: organizationSchemaName,
      siteName: stripHtml(ogSiteName).trim(),
      hasLocalBusinessSchema: hasLocalBusinessSignal,
      hasTrustedLocalEvidence,
    });
    const goal = adsKeywordIntelligence.campaignGoal || "";

    const localSchemaCandidates = [
      { type: "Restaurant", pattern: /\b(restaurant|eetcafé|eetgelegenheid|brasserie|bistro|menukaart)\b/i },
      { type: "Hairdresser", pattern: /\b(hairdresser|kapper|kappers|kapsalon|knippen|haarkleur|haarstyling|coiffeur|barbier)\b/i },
      { type: "Dentist", pattern: /\b(dentist|tandarts|tandheelkunde|mondzorg|orthodontist)\b/i },
      { type: "Electrician", pattern: /\b(electrician|elektricien|elektro|elektrotechniek|installatietechniek)\b/i },
      { type: "Plumber", pattern: /\b(plumber|loodgieter|loodgieters|cv-installateur|installateur)\b/i },
      { type: "GeneralContractor", pattern: /\b(aannemer|contractor|bouwbedrijf|bouwservice|verbouwing|renovatie|bouw\s+en\s+verbouw)\b/i },
      { type: "RoofingContractor", pattern: /\b(dakdekker|dakdekkers|dakbedekking|dakwerken|dakwerk)\b/i },
      { type: "BeautySalon", pattern: /\b(beauty salon|beautysalon|schoonheidssalon|beauty)\b/i },
      { type: "Store", pattern: /\b(store|winkel|shop|boetiek|retail)\b/i },
      { type: "AutomotiveBusiness", pattern: /\b(garage|autogarage|autoservice|autobedrijf|autodealer|car dealer|auto onderhoud|autowerkplaats)\b/i },
      { type: "RealEstateAgent", pattern: /\b(makelaar|makelaars|vastgoedmakelaar|real estate agent|realtor|woningmakelaar)\b/i },
      { type: "LegalService", pattern: /\b(advocaat|advocatenkantoor|law firm|jurist|notaris|notariskantoor)\b/i },
      { type: "AccountingService", pattern: /\b(accountant|accountantskantoor|boekhouder|boekhoudkantoor|administratiekantoor)\b/i },
      { type: "TravelAgency", pattern: /\b(reisbureau|reisorganisatie|travel agency|tour operator|reisagent)\b/i },
      { type: "Hotel", pattern: /\b(hotel|bed and breakfast|b&b|pension)\b/i },
    ];
    const localIdentityText = [title, description, h1s.join(" "), finalUrl.hostname, finalUrl.pathname].filter(Boolean).join(" ");
    const localClassificationText = [localIdentityText, text].filter(Boolean).join(" ");
    const identityLocalSchema = localSchemaCandidates.find((candidate) => candidate.pattern.test(localIdentityText))?.type;
    // A specific LocalBusiness subtype must be supported by page-identity evidence.
    // Broad body/navigation text can mention unrelated categories (for example a retailer
    // linking to beauty products) and must never turn into BeautySalon/Dentist/etc advice.
    const specificLocalSchema = hasLocalBusinessSignal
      ? identityLocalSchema || "LocalBusiness"
      : null;
    const hasRelevantLocalSchema = schemaSet.has("localbusiness") || schemaSet.has("onlinestore") || (specificLocalSchema ? schemaSet.has(specificLocalSchema.toLowerCase()) : false);
    const governmentIdentitySignal = /\b(rijksoverheid|government|government of|ministerie|ministry|rijksoverheid\.nl|overheid|gemeente|municipality|provincie|province|public authority|publieke sector)\b/i.test([title, description, h1s.join(" "), finalUrl.hostname].join(" "));
    const governmentSchemaPresent = schemaSet.has("governmentorganization") || schemaSet.has("governmentoffice");
    const transportLogisticsSchemaContext = !hasEcommerceSignal && !isProductPage && /\b(transport|logistics?|logistiek|freight|vracht|forwarding|expeditie|warehousing|opslag|supply chain|distribution|distributie|4pl|3pl)\b/i.test(localIdentityText);
    const transportServicePath = /\/(?:dienst|diensten|service|services|oplossing|oplossingen|solution|solutions|expertise|transport)(?:\/|$)/i.test(finalUrl.pathname);
    const ecommerceSchemaContext = hasEcommerceSignal || schemaSet.has("onlinestore") || schemaSet.has("product");
    // Government, international transport/logistics and e-commerce identities
    // override generic LocalBusiness hints so advice follows the actual business model.
    const effectiveLocalSchemaSignal = hasLocalBusinessSignal && !governmentIdentitySignal && !governmentSchemaPresent && !transportLogisticsSchemaContext && !ecommerceSchemaContext;
    const recommendedSchema = governmentIdentitySignal || governmentSchemaPresent
      ? (isHomepage ? "GovernmentOrganization + WebSite" : "GovernmentOrganization / WebPage")
      : transportLogisticsSchemaContext
        ? (isHomepage ? "Organization + WebSite" : transportServicePath ? "Service + Organization" : "Organization / WebPage")
        : ecommerceSchemaContext
          ? (isProductPage ? "Product" : isHomepage ? "OnlineStore + WebSite" : hasCategorySignal ? "ItemList / CollectionPage" : "Organization / WebPage")
          : effectiveLocalSchemaSignal
            ? specificLocalSchema || "LocalBusiness"
            : isHomepage ? "Organization + WebSite" : isProductPage ? "Product" : hasCategorySignal ? "ItemList / CollectionPage" : hasArticleSignal ? "Article" : "WebPage";
    const schemaContextLabel = governmentIdentitySignal || governmentSchemaPresent ? "overheids-/publieke pagina" : transportLogisticsSchemaContext ? (isHomepage ? "transport-/logistiekhomepage" : "transport-/dienstpagina") : ecommerceSchemaContext ? (isProductPage ? "productpagina" : isHomepage ? "webshophomepage" : hasCategorySignal ? "webshopcategorie" : "webshoppagina") : effectiveLocalSchemaSignal ? "lokale bedrijfs-/dienstpagina" : isHomepage ? "homepage" : isProductPage ? "productpagina" : hasCategorySignal ? "lijst-/categoriepagina" : hasArticleSignal ? "artikel-/nieuwspagina" : "contentpagina";
    const hasRelevantContextSchema = governmentIdentitySignal || governmentSchemaPresent
      ? governmentSchemaPresent || schemaSet.has("organization") || schemaSet.has("website") || schemaSet.has("webpage")
      : transportLogisticsSchemaContext
        ? (isHomepage
            ? schemaSet.has("organization") || schemaSet.has("website") || schemaSet.has("service")
            : schemaSet.has("service") || schemaSet.has("organization") || schemaSet.has("webpage"))
        : ecommerceSchemaContext
          ? (isProductPage
              ? hasProductSchema
              : isHomepage
                ? schemaSet.has("onlinestore") || schemaSet.has("website") || schemaSet.has("organization")
                : hasCategorySignal
                  ? schemaSet.has("itemlist") || schemaSet.has("collectionpage") || schemaSet.has("onlinestore")
                  : schemaSet.has("webpage") || schemaSet.has("organization") || schemaSet.has("onlinestore"))
          : effectiveLocalSchemaSignal
            ? hasRelevantLocalSchema
            : isProductPage
            ? hasProductSchema
            : hasCategorySignal
              ? schemaSet.has("itemlist") || schemaSet.has("collectionpage")
              : hasArticleSignal
                ? schemaSet.has("article") || schemaSet.has("newsarticle") || schemaSet.has("blogposting")
                : isHomepage
                  ? schemaSet.has("organization") || schemaSet.has("website")
                  : schemaSet.has("webpage") || schemaSet.has("article") || schemaSet.has("organization") || schemaSet.has("website");
    const businessName = organizationName || (title.split(/[|–—-]/)[0] || "").trim();
    const phoneMatch = text.match(/(?:\\+31\s?6|0)[\\d\s().-]{8,}/);
    const emailMatch = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}/i);
    const addressMatch = text.match(/\b([^,]{3,60}\s+\\d+[A-Za-z]?)\s+(\\d{4}\s?[A-Z]{2})\s+([A-Za-zÀ-ÿ' -]{2,40})\b/);
    const localBusinessDetails = effectiveLocalSchemaSignal ? {
      name: businessName || null,
      streetAddress: addressMatch?.[1]?.trim() || null,
      postalCode: addressMatch?.[2]?.trim() || null,
      addressLocality: addressMatch?.[3]?.trim() || null,
      telephone: phoneMatch?.[0]?.trim() || null,
      email: emailMatch?.[0]?.trim() || null,
      url: finalUrl.toString(),
    } : null;

    const robotsUrl = new URL("/robots.txt", finalUrl);
    const sitemapUrl = new URL("/sitemap.xml", finalUrl);
    let robotsTxt = "";
    let robotsStatus: "PASS" | "FAIL" | "UNABLE_TO_CONFIRM" = "UNABLE_TO_CONFIRM";
    let sitemapFound = false;
    let sitemapStatus: "PASS" | "FAIL" | "UNABLE_TO_CONFIRM" = "UNABLE_TO_CONFIRM";
    let sitemapFetchCompleted = false;
    let robotsDeclaredSitemapUrls: string[] = [];
    let confirmedSitemapUrl: string | null = null;
    let sitemapDiagnostic = "";
    try {
      const r = (await safePublicFetch(robotsUrl, { timeoutMs: 5000, maxRedirects: 2, userAgent: "RankFixBot/2.1 (+https://rankfix-app.onrender.com)", accept: "text/plain,application/xml,text/xml" })).response;
      if (r.ok) {
        robotsTxt = await readResponseTextLimited(r, 512_000);
        robotsStatus = "PASS";
        const declared = [...robotsTxt.matchAll(/^\s*Sitemap\s*:\s*(\S+)/gim)].map((match) => match[1]).filter(Boolean);
        const scanHost = finalUrl.hostname.toLowerCase().replace(/^www\./, "");
        robotsDeclaredSitemapUrls = [...new Set(declared.flatMap((value) => {
          try {
            const parsed = new URL(value, finalUrl);
            const sitemapHost = parsed.hostname.toLowerCase().replace(/^www\./, "");
            return sitemapHost === scanHost ? [parsed.toString()] : [];
          } catch { return []; }
        }))].slice(0, 20);
      } else if (r.status === 404) robotsStatus = "FAIL";
    } catch { robotsStatus = "UNABLE_TO_CONFIRM"; }
    const robotsPath = finalUrl.pathname || "/";
    const robotsGroups = robotsTxt
      .split(/\\r?\\n/)
      .map((line) => line.replace(/#.*$/, "").trim())
      .reduce((groups: Array<{ agents: string[]; rules: Array<{ kind: "allow" | "disallow"; path: string }> }>, line) => {
        const agent = line.match(/^user-agent\s*:\s*(.+)$/i)?.[1]?.trim().toLowerCase();
        if (agent) {
          const last = groups[groups.length - 1];
          if (!last || last.rules.length) groups.push({ agents: [agent], rules: [] });
          else last.agents.push(agent);
          return groups;
        }
        const rule = line.match(/^(allow|disallow)\s*:\s*(.*)$/i);
        if (rule && groups.length) groups[groups.length - 1].rules.push({ kind: rule[1].toLowerCase() as "allow" | "disallow", path: rule[2].trim() });
        return groups;
      }, []);
    const applicableRobotsGroups = robotsGroups.filter((group) => group.agents.includes("*") || group.agents.some((agent) => /rankfixbot|googlebot/.test(agent)));
    const robotsRuleMatches = (rulePath: string, candidatePath: string) => {
      if (!rulePath) return false;
      const anchored = rulePath.endsWith("$");
      const rawPattern = anchored ? rulePath.slice(0, -1) : rulePath;
      // Escape regex metacharacters except the robots wildcard, then expand *.
      const escapedPattern = rawPattern
        .split("*")
        .map((part) => part.replace(/[.+?^{}()|[\]\\]/g, "\\$&"))
        .join(".*");
      try {
        return new RegExp("^" + escapedPattern + (anchored ? "$" : "")).test(candidatePath);
      } catch {
        return false;
      }
    };
    const matchingRobotsRules = applicableRobotsGroups
      .flatMap((group) => group.rules)
      .filter((rule) => robotsRuleMatches(rule.path, robotsPath))
      .sort((a, b) => b.path.length - a.path.length || (a.kind === "allow" ? -1 : 1));
    const robotsPathBlocked = robotsStatus === "PASS" && matchingRobotsRules.length > 0 && matchingRobotsRules[0].kind === "disallow";
    const htmlDeclaredSitemapUrls = [...html.matchAll(/<link\b[^>]*>/gi)]
      .map((match) => match[0])
      .filter((tag) => /\brel\s*=\s*["'][^"']*\bsitemap\b[^"']*["']/i.test(tag))
      .flatMap((tag) => {
        const href = attrFromTag(tag, "href");
        if (!href) return [];
        try { return [new URL(href, finalUrl).toString()]; } catch { return []; }
      });
    const commonSitemapUrls = [
      sitemapUrl.toString(),
      new URL("/wp-sitemap.xml", finalUrl).toString(),
      new URL("/sitemap_index.xml", finalUrl).toString(),
      new URL("/sitemap-index.xml", finalUrl).toString(),
    ];
    const normalizeSitemapEvidenceUrl = (value: string) => {
      try {
        const parsed = new URL(value);
        parsed.hash = "";
        parsed.hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
        parsed.pathname = parsed.pathname.replace(/\/+$/, "") || "/";
        return parsed.toString();
      } catch {
        return value.trim().replace(/\/+$/, "").toLowerCase();
      }
    };
    type SitemapCandidate = { url: string; source: "robots" | "html" | "fallback" };
    const candidateMap = new Map<string, SitemapCandidate>();
    const addSitemapCandidates = (urls: string[], source: SitemapCandidate["source"]) => {
      for (const url of urls) {
        const key = normalizeSitemapEvidenceUrl(url);
        const existing = candidateMap.get(key);
        // Preserve the strongest provenance. A robots.txt declaration is direct
        // evidence and must never be downgraded to a guessed fallback URL.
        if (!existing || source === "robots" || (source === "html" && existing.source === "fallback")) {
          candidateMap.set(key, { url, source });
        }
      }
    };
    addSitemapCandidates(robotsDeclaredSitemapUrls, "robots");
    addSitemapCandidates(htmlDeclaredSitemapUrls, "html");
    addSitemapCandidates(commonSitemapUrls, "fallback");
    // Keep sitemap discovery cheap: direct declarations are strongest evidence.
    // Only probe a small fallback set when the site did not declare a sitemap.
    const declaredSitemapCandidates = [...candidateMap.values()].filter((candidate) => candidate.source !== "fallback");
    const fallbackSitemapCandidates = [...candidateMap.values()].filter((candidate) => candidate.source === "fallback");
    const sitemapCandidates = declaredSitemapCandidates.length
      ? declaredSitemapCandidates.slice(0, 8)
      : fallbackSitemapCandidates.slice(0, 4);
    let sitemapFetchFailed = false;
    let declaredSitemapFetchFailed = false;
    const brokenDeclaredSitemaps: string[] = [];
    const declaredSitemapHttpFailures: Array<{ url: string; status: number }> = [];
    for (const candidate of sitemapCandidates) {
      try {
        const r = (await safePublicFetch(new URL(candidate.url), { timeoutMs: 5000, maxRedirects: 2, userAgent: "RankFixBot/2.1 (+https://rankfix-app.onrender.com)", accept: "text/plain,application/xml,text/xml" })).response;
        sitemapFetchCompleted = true;
        if (r.ok) {
          const contentType = r.headers.get("content-type") || "onbekend";
          const sitemapBody = await readResponseTextLimited(r, 2_000_000);
          const rootMatch = sitemapBody.match(/<(?:(?:[a-z0-9_-]+):)?(urlset|sitemapindex)\b[^>]*>/i);
          const hasSitemapRoot = !!rootMatch;
          const sitemapKind = String(rootMatch?.[1] || "").toLowerCase();
          const locValues = [...sitemapBody.matchAll(/<(?:(?:[a-z0-9_-]+):)?loc\b[^>]*>([\s\S]*?)<\/(?:(?:[a-z0-9_-]+):)?loc>/gi)]
            .map((match) => decode(String(match[1] || "").trim()))
            .filter(Boolean);
          const validLocValues = locValues.filter((value) => {
            try { const parsed = new URL(value); return /^https?:$/.test(parsed.protocol); } catch { return false; }
          });
          const sitemapOrigin = new URL(candidate.url).origin;
          const sameOriginLocValues = validLocValues.filter((value) => {
            try { return new URL(value).origin === sitemapOrigin; } catch { return false; }
          });
          const structurallyValid = hasSitemapRoot && validLocValues.length > 0;
          const sitemapEntriesMatchSite = sitemapKind === "sitemapindex"
            ? sameOriginLocValues.length > 0
            : sameOriginLocValues.length > 0;
          if (structurallyValid && sitemapEntriesMatchSite) {
            sitemapFound = true;
            sitemapStatus = "PASS";
            confirmedSitemapUrl = candidate.url;
            sitemapDiagnostic = `${candidate.url} bevat een geldige ${sitemapKind || "sitemap"} met ${validLocValues.length} geldige URL-verwijzing(en), waarvan ${sameOriginLocValues.length} voor dezelfde site, in de gecontroleerde response.`;
            // Keep scanning when robots.txt already declared a broken sitemap so
            // the report can mention both the broken declaration and valid fallback.
            if (declaredSitemapHttpFailures.length === 0) break;
          } else if (candidate.source === "robots" || candidate.source === "html") {
            sitemapStatus = "FAIL";
            sitemapDiagnostic = hasSitemapRoot
              ? validLocValues.length === 0
                ? `${candidate.url} gaf HTTP ${r.status}; content-type: ${contentType}; sitemap-root gevonden maar geen geldige absolute URL in <loc>.`
                : `${candidate.url} gaf HTTP ${r.status}; content-type: ${contentType}; geldige <loc>-URL's gevonden, maar geen daarvan hoort bij dezelfde site-origin.`
              : `${candidate.url} gaf HTTP ${r.status}; content-type: ${contentType}; geen geldige urlset/sitemapindex gevonden.`;
          }
        } else {
          sitemapDiagnostic = `${candidate.url} gaf HTTP ${r.status}; content-type: ${r.headers.get("content-type") || "onbekend"}.`;
          if ((r.status === 404 || r.status === 410) && candidate.source === "robots") {
            sitemapStatus = "FAIL";
            brokenDeclaredSitemaps.push(candidate.url);
            declaredSitemapHttpFailures.push({ url: candidate.url, status: r.status });
          }
        }
      } catch (error) {
        sitemapFetchFailed = true;
        if (candidate.source === "robots") declaredSitemapFetchFailed = true;
        sitemapDiagnostic = `${candidate.url} kon niet worden opgehaald: ${error instanceof Error ? error.message : "fetchfout of timeout"}.`;
      }
    }
    // Evidence precedence: a hard 404/410 on a robots-declared sitemap is a
    // proven warning. Guessed fallback failures never become a site problem.
    if (declaredSitemapHttpFailures.length > 0 || brokenDeclaredSitemaps.length > 0) sitemapStatus = "FAIL";
    else if (sitemapFound) sitemapStatus = "PASS";
    else if (declaredSitemapFetchFailed || sitemapFetchFailed) sitemapStatus = "UNABLE_TO_CONFIRM";
    else if (robotsDeclaredSitemapUrls.length > 0 || htmlDeclaredSitemapUrls.length > 0) sitemapStatus = "FAIL";
    else sitemapStatus = "UNABLE_TO_CONFIRM";
    console.info("RankFix sitemap diagnostic", {
      page: finalUrl.toString(),
      robotsDeclaredSitemapUrls,
      candidates: sitemapCandidates.map((candidate) => ({ url: candidate.url, source: candidate.source })),
      declaredSitemapHttpFailures,
      brokenDeclaredSitemaps,
      sitemapFound,
      confirmedSitemapUrl,
      sitemapFetchCompleted,
      sitemapFetchFailed,
      declaredSitemapFetchFailed,
      sitemapStatus,
      sitemapDiagnostic,
    });
    const robotsMentionsSitemap = robotsDeclaredSitemapUrls.length > 0;

    // Lightweight internal-link audit. Keep this bounded so one page cannot turn a scan
    // into an unbounded crawler. HTTP evidence and semantic evidence stay separate.
    type LinkAuditResult = { sourceHref: string; url: string; status: number | null; finalUrl: string | null; redirected: boolean; error: boolean; context: string };
    const anchorTags = [...html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
      .map((match) => {
        const sourceHref = decode(match[1] || "");
        const body = match[2] || "";
        const anchorText = stripHtml(body);
        const imageAlt = [...body.matchAll(/<img\b[^>]*\balt\s*=\s*["']([^"']+)["'][^>]*>/gi)].map((m) => decode(m[1] || "")).filter(Boolean).join(" ");
        return { sourceHref, context: [anchorText, imageAlt].filter(Boolean).join(" ").trim().slice(0, 220) };
      })
      .filter((item) => item.sourceHref && !/^(?:#|mailto:|tel:|javascript:)/i.test(item.sourceHref));
    const allUniqueInternalAnchors = [...new Map(anchorTags.flatMap((item) => {
      try {
        const parsed = new URL(item.sourceHref, finalUrl);
        if (!/^https?:$/.test(parsed.protocol) || parsed.hostname !== finalUrl.hostname) return [];
        parsed.hash = "";
        return [[parsed.toString(), { ...item, url: parsed.toString() }] as const];
      } catch { return []; }
    })).values()];
    // A representative bounded sample is enough for the synchronous scan.
    // Keep network fan-out modest so adding more motor checks does not make RankFix slower.
    const uniqueInternalAnchors = allUniqueInternalAnchors.slice(0, 16);
    const linkAuditResults: LinkAuditResult[] = await Promise.all(uniqueInternalAnchors.map(async (item) => {
      try {
        const result = await safePublicFetch(new URL(item.url), { timeoutMs: 4500, maxRedirects: 4, userAgent: "RankFixBot/2.1 (+https://rankfix-app.onrender.com)", accept: "text/html,application/xhtml+xml,text/plain" });
        const res = result.response;
        const destination = res.url || item.url;
        return { sourceHref: item.sourceHref, url: item.url, status: res.status, finalUrl: destination, redirected: normalizeScanUrl(destination) !== normalizeScanUrl(item.url), error: false, context: item.context };
      } catch {
        return { sourceHref: item.sourceHref, url: item.url, status: null, finalUrl: null, redirected: false, error: true, context: item.context };
      }
    }));
    // A timeout/DNS/fetch failure is not proof of a broken link. Only an HTTP response
    // that proves the destination is gone or server-broken is actionable here.
    const unconfirmedInternalLinks = linkAuditResults.filter((item) => item.error || item.status === null);
    const brokenInternalLinks = linkAuditResults.filter((item) => item.status === 404 || item.status === 410 || (item.status !== null && item.status >= 500));
    const isAuthUtilityRedirect = (item: LinkAuditResult) => {
      if (!item.redirected || item.error) return false;
      try {
        const source = new URL(item.url);
        const destination = item.finalUrl ? new URL(item.finalUrl) : null;
        const sourceAuthPath = /(?:^|\/)(?:myaccount|my-account|account|mijn-account|login|signin|sign-in|register|auth|sso)(?:\/|$)/i.test(source.pathname) ||
          /(?:^|\/)(?:sales\/order\/history|customer\/account|orders?|order-history)(?:\/|$)/i.test(source.pathname);
        const sourcePersonalizationPath = /(?:^|\/)(?:recomendacoes|recomendacoes-personalizadas|recommendations|preferences|profile|favorites|favourites|wishlist|personalization|personalisatie)(?:\/|$)/i.test(source.pathname);
        const destinationAuth = Boolean(destination && (
          /(?:^|\.)(?:accounts?|auth|login|sso)\./i.test(destination.hostname) ||
          /(?:^|\/)(?:oauth|oauth2|authorize|auth|login|signin|sign-in|sso)(?:\/|$)/i.test(destination.pathname)
        ));
        return destinationAuth && (sourceAuthPath || sourcePersonalizationPath);
      } catch { return false; }
    };
    // Login/account links intentionally redirect to SSO/OAuth providers on many sites.
    // They are not SEO redirect debt and must never produce "link to the OAuth URL" advice.
    const redirectedInternalLinks = linkAuditResults.filter((item) => item.redirected && !item.error && !isAuthUtilityRedirect(item));
    const productSlugStopWords = new Set(["product","products","shop","winkel","store","category","categorie","tag","product-tag","collections","collection","the","and","voor","van","met","een","het","de"]);
    const semanticTokens = (value: string) => safeDecodeURIComponent(value).toLowerCase().replace(/[^a-z0-9à-ÿ]+/gi, " ").split(/\s+/).filter((token) => token.length >= 3 && !productSlugStopWords.has(token));
    const semanticLinkMismatches = linkAuditResults.flatMap((item) => {
      if (item.error || !item.status || item.status >= 400 || !item.context) return [];
      let destination: URL;
      try { destination = new URL(item.finalUrl || item.url); } catch { return []; }
      // Only judge product-like destinations when the visible anchor itself names a product.
      // Price-only anchors do not contain enough semantic evidence and therefore never fail here.
      const contextTokens = [...new Set(semanticTokens(item.context))];
      const destinationTokens = [...new Set(semanticTokens(destination.pathname))];
      if (contextTokens.length < 2 || destinationTokens.length < 2) return [];
      const overlap = contextTokens.filter((token) => destinationTokens.includes(token));
      const productLikeDestination = /\/(?:product|products|shop)\//i.test(destination.pathname);
      if (!productLikeDestination || overlap.length > 0) return [];
      return [{ ...item, contextTokens: contextTokens.slice(0, 8), destinationTokens: destinationTokens.slice(0, 8) }];
    }).slice(0, 8);

    const productCardMismatches: { urls: string[] }[] = [];
    const productCardPattern = /<li\b[^>]*class=["'][^"']*product[^"']*["'][^>]*>([\s\S]*?)<\/li>/gi;
    for (const cardMatch of html.matchAll(productCardPattern)) {
      const cardHtml = cardMatch[1] || "";
      const urls = [...cardHtml.matchAll(/href\s*=\s*["']([^"']+)["']/gi)].flatMap((linkMatch) => {
        try {
          const target = new URL(decode(linkMatch[1] || ""), finalUrl);
          if (target.hostname !== finalUrl.hostname || !/\/(?:product|products)\//i.test(target.pathname)) return [];
          return [target.toString()];
        } catch { return []; }
      });
      const uniqueUrls = [...new Set(urls.map((url) => normalizeScanUrl(url)))];
      if (uniqueUrls.length < 2) continue;
      const identities = uniqueUrls.map((url) => ({ url, tokens: semanticTokens(new URL(url).pathname) }));
      const conflict = identities.some((left, index) => identities.slice(index + 1).some((right) =>
        left.tokens.length > 0 && right.tokens.length > 0 && !left.tokens.some((token) => right.tokens.includes(token))
      ));
      if (conflict) productCardMismatches.push({ urls: uniqueUrls.slice(0, 5) });
      if (productCardMismatches.length >= 8) break;
    }

    // Featured product: a named product/tag link followed immediately by a separately linked price.
    // Keep the fragment deliberately small so navigation/category links cannot become the product identity.
    const featuredProductMismatches: { label: string; namedUrl: string; priceUrl: string }[] = [];
    const featuredPairPattern = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]{1,220}?)<\/a>[\s\S]{0,420}?<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>[\s\S]{0,220}?<\/a>/gi;
    for (const pair of html.matchAll(featuredPairPattern)) {
      try {
        const label = stripHtml(pair[2] || "").trim();
        if (!label || /(?:€|EUR|&euro;)/i.test(pair[2] || "")) continue;
        const namedUrl = new URL(decode(pair[1] || ""), finalUrl);
        const priceUrl = new URL(decode(pair[3] || ""), finalUrl);
        if (namedUrl.hostname !== finalUrl.hostname || priceUrl.hostname !== finalUrl.hostname) continue;
        if (!/\/(?:product-tag|tag)\//i.test(namedUrl.pathname) || !/\/(?:product|products)\//i.test(priceUrl.pathname)) continue;
        if (normalizeScanUrl(namedUrl.toString()) === normalizeScanUrl(priceUrl.toString())) continue;
        const labelTokens = semanticTokens(label);
        const namedTokens = semanticTokens(namedUrl.pathname);
        const priceTokens = semanticTokens(priceUrl.pathname);
        if (labelTokens.length < 2 || namedTokens.length < 1 || priceTokens.length < 1) continue;
        if (!labelTokens.some((token) => namedTokens.includes(token))) continue;
        if (labelTokens.some((token) => priceTokens.includes(token))) continue;
        featuredProductMismatches.push({ label: label.slice(0, 160), namedUrl: namedUrl.toString(), priceUrl: priceUrl.toString() });
        if (featuredProductMismatches.length >= 8) break;
      } catch { continue; }
    }

    // Sector intelligence is computed before scoring so only relevant specialist checks
    // can participate. Low-confidence classification stays generic and never penalizes.
    // Evidence Layer v1 runs alongside the proven audit rules. It records facts first;
    // classification can evolve without changing the underlying scan evidence.
    const scanEvidence = buildScanEvidence({
      url: finalUrl.toString(),
      html,
      rawHtml,
      rendered: javascriptExecuted,
      language: lang || null,
      title: title || null,
    });
    const evidenceSectorCandidates = rankSectorCandidates(
      scanEvidence,
      [title, description, h1s.join(" "), text].filter(Boolean).join(" ").slice(0, 250000),
    ).slice(0, 8);
    const evidenceLayer: {
      version: typeof scanEvidence.version;
      evidence: typeof scanEvidence;
      sectorCandidates: typeof evidenceSectorCandidates;
      catalogSize: number;
      note: string;
      master?: unknown;
    } = {
      version: scanEvidence.version,
      evidence: scanEvidence,
      sectorCandidates: evidenceSectorCandidates,
      catalogSize: sectorCatalogSummary().length,
      note: "Evidence-first: ontbrekend bewijs is niet automatisch een fout. Sectoren en functies worden alleen bevestigd op gevonden signalen.",
    };

    type SectorKey = "ecommerce"|"real_estate"|"automotive"|"home_services"|"professional_services"|"hospitality"|"health_wellness"|"beauty"|"recruitment"|"government"|"news_media"|"tourism_recreation"|"transport_travel"|"telecom_technology"|"service_marketplace"|"food_local_retail"|"saas_b2b"|"general_business"|"unknown";
    const sectorSignals: Array<{sector:SectorKey; label:string; patterns:RegExp[]; modules:string[]}> = [
      {sector:"real_estate",label:"Vastgoed & Makelaardij",patterns:[/\b(makelaar|vastgoed|woning(?:en)?|huizen|koopwoning|huurwoning|real estate|property|immobilier|inmobiliaria|realestateagent)\b/i,/\b(te koop|te huur|for sale|for rent|woningaanbod)\b/i],modules:["core_seo","geo","local","lead_conversion","real_estate"]},
      {sector:"automotive",label:"Automotive",patterns:[/\b(garage|autobedrijf|autodealer|occasions?|auto[- ]?onderhoud|car dealer|vehicle|automotive|automotivebusiness)\b/i,/\b(apk|proefrit|werkplaats|banden|reparatie|autoservice)\b/i],modules:["core_seo","geo","local","lead_conversion","automotive"]},
      {sector:"home_services",label:"Lokale vakdienst",patterns:[/\b(loodgieter|plumber|aannemer|installateur|elektricien|schilder|dakdekker|klus(?:sen)?bedrijf|bouwbedrijf|bouwservice|general contractor|electrician|contractor|riool(?:service|specialist)?|rioolprobleem|ontstopping|ontstoppen|afvoer|schoonmaak(?:bedrijf|dienst(?:en)?)?|kantoorschoonmaak|cleaning service|cleaning company)\b/i,/\b(offerte|werkgebied|servicegebied|installatie|reparatie|renovatie|verbouwing|bouw|verstopping|riolering|riooldienst(?:en)?|schoonmaak|cleaning)\b/i],modules:["core_seo","geo","local","lead_conversion","home_services"]},
      {sector:"professional_services",label:"Zakelijke dienstverlening",patterns:[/\b(advocaat|accountant|boekhouder|consultant|notaris|law firm|legalservice|legal services|accounting|consultancy)\b/i,/\b(diensten|expertise|advies|consult)\b/i],modules:["core_seo","geo","local","lead_conversion","professional_services"]},
      {sector:"hospitality",label:"Horeca",patterns:[/\b(restaurant|cafe|café|hotel|brasserie|bistro|reserveren|reservation|restaurantmenu|menukaart)\b/i,/\b(openingstijden|opening hours|tafel reserveren)\b/i],modules:["core_seo","geo","local","lead_conversion","hospitality"]},
      {sector:"health_wellness",label:"Zorg & Gezondheid",patterns:[/\b(kliniek|clinic|fysiotherap|tandarts|dentist|medicalclinic|physician|mondzorg|acupunctuur|acupuncture|acupuncturist|therapeut|therapist|therapie|therapy|tuina)\b/i,/\b(afspraak|appointment|behandeling|behandelingen|treatment|treatments|patient|patiënt|praktijk|practice)\b/i],modules:["core_seo","geo","local","lead_conversion","health_wellness"]},
      {sector:"beauty",label:"Beauty & Verzorging",patterns:[/\b(kapper|hairdresser|hairsalon|hair salon|hairstyling|beauty salon|beautysalon|schoonheidssalon|nagelsalon|nail salon|barber|day spa|dayspa|city spa|wellness|manicure|pedicure|facial|gezichtsbehandeling)\b/i,/\b(afspraak|appointment|salons?|knippen|haar|hair|spa|wellness|manicure|pedicure|beauty treatment|beauty treatments)\b/i],modules:["core_seo","geo","local","lead_conversion","beauty"]},
      {sector:"recruitment",label:"Recruitment & Werk",patterns:[/\b(recruitment|uitzendbureau|uitzendorganisatie|employment agency|staffing agency|staffing|werving en selectie|recruitmentbureau|recruitment agency)\b/i,/\b(werkgevers?|kandidaten?|talent acquisition|detachering|interim professionals?|recruiter)\b/i],modules:["core_seo","geo","lead_conversion","recruitment"]},
      {sector:"government",label:"Overheid & Publieke sector",patterns:[/\b(gemeente|municipality|overheid|government|rijksoverheid|ministry|ministerie|public service|stadhuis|burgerzaken)\b/i,/\b(digid|vergunning|paspoort|loket|inwoners|wetgeving|beleid|minister|cabinet)\b/i],modules:["core_seo","geo","government"]},
      {sector:"transport_travel",label:"Transport & Logistiek",patterns:[/(?:\b(logistiek|logistics|transportbedrijf|transport company|wegtransport|road transport|freight|vrachtvervoer|distributie|distribution|expeditie|forwarding|koerier|courier|spoorweg|railway|railways|train operator|national railway|nationale? vervoerder|airline|luchtvaartmaatschappij|public transport|openbaar vervoer|ferroviaria|železnice|željeznice|dráhy|intercity|prijevoz|putnički|vlak)\b|hellenic\s+train|cyprus\s+airways|σιδηρόδρομ|τρένο)/iu,/(?:\b(zending|shipments?|warehousing|opslag|supply chain|groupage|pallets?|containers?|internationaal transport|international transport|tickets?|billet|fahrplan|timetable|dienstregeling|journey planner|vluchten?|flights?|destinations?|reizen|travel|utazás|dopravca|vozni red|karta|karte)\b|δρομολόγ|εισιτήρ|πτήσ)/iu],modules:["core_seo","geo","technical","local","lead_conversion","transport_travel"]},
      {sector:"telecom_technology",label:"Telecom & Technologie",patterns:[/\b(telekom|telecom|telecommunications?|mobile network|internet provider|broadband provider|telefoonprovider)\b/i,/\b(fiber|fibre|glasvezel|internet|mobile|mobiel|5g|4g|broadband|telefonie|tv pakket)\b/i],modules:["core_seo","geo","technical","telecom_technology"]},
      {sector:"news_media",label:"Nieuws & Media",patterns:[/\b(nieuws|news|journalist|redactie|breaking news|sportnieuws|nieuwsartikel|newsarticle)\b/i,/\b(binnenland|buitenland|politiek|sport|economie)\b/i],modules:["core_seo","geo","news_media"]},
      {sector:"tourism_recreation",label:"Toerisme & Recreatie",patterns:[/\b(toerisme|tourism board|tourist information|destination management|citymarketing|visitor centre|visitor center|v v v|bezoekerscentrum)\b/i,/\b(toeristische informatie|tourist attractions|bezienswaardigheden|guided tours|excursies|things to do)\b/i],modules:["core_seo","geo","local","tourism_recreation"]},
      {sector:"food_local_retail",label:"Voeding & lokale retail",patterns:[/\b(bakkerij|bakker|bakery|baker|patisserie|pastry|brood|bread|banket|artisan bakery)\b/i,/\b(gebak|taart|cakes?|croissant|sourdough|zuurdesem|vers brood|fresh bread)\b/i],modules:["core_seo","geo","local","lead_conversion","food_local_retail"]},
      {sector:"service_marketplace",label:"Dienstenplatform",patterns:[/\b(vind (?:de )?beste bedrijven|vergelijk (?:bedrijven|specialisten|dienstverleners)|dienstverleners vergelijken|professionals vergelijken|bedrijven vergelijken)\b/i,/\b(top 10|reviews?|beoordelingen|offertes? vergelijken|bedrijven voor jou|specialisten in jouw regio)\b/i],modules:["core_seo","geo","technical","structured_data","links","service_marketplace"]},
      {sector:"saas_b2b",label:"SaaS / B2B",patterns:[/\b(saas|software platform|software-as-a-service|api platform|business software|auditsoftware|seo software|geo software|website audit|seo audit|geo audit)\b/i,/\b(demo|features|integrations|integraties|dashboard|website scan|website scannen|website analyseren|audit platform)\b/i],modules:["core_seo","geo","technical","security","structured_data","links","accessibility","lead_conversion","saas_b2b"]},
    ];
    const sectorIdentitySource = [title, description, h1s.join(" "), finalUrl.hostname, finalUrl.pathname].join(" ");
    const sectorSource = [sectorIdentitySource, text.slice(0,120000), schemaTypes.join(" ")].join(" ");
    // Strong page/site identity must beat incidental words elsewhere in long pages.
    // In particular, sewer/drain services often mention generic "reparatie", which is not automotive evidence.
    const sewerIdentity = /\b(riool|riolering|verstopping|ontstoppen|ontstopping|afvoer)\b/i.test(sectorIdentitySource);
    const schemaSectorBoost: Partial<Record<SectorKey, number>> = {};
    if (schemaSet.has("dentist") || schemaSet.has("medicalclinic") || schemaSet.has("physician")) schemaSectorBoost.health_wellness = 3;
    if (schemaSet.has("plumber") || schemaSet.has("electrician") || schemaSet.has("homeandconstructionbusiness")) schemaSectorBoost.home_services = 3;
    if (schemaSet.has("restaurant") || schemaSet.has("foodestablishment")) schemaSectorBoost.hospitality = 3;
    if (schemaSet.has("hairsalon") || schemaSet.has("beautysalon")) schemaSectorBoost.beauty = 3;
    if (schemaSet.has("automotivebusiness") || schemaSet.has("autodealer") || schemaSet.has("autorepair")) schemaSectorBoost.automotive = 3;
    if (schemaSet.has("realestateagent")) schemaSectorBoost.real_estate = 3;
    if (schemaSet.has("newsarticle")) schemaSectorBoost.news_media = 3;
    // Scanbewijs priority: domain identity outranks incidental generic words.
    const sectorPriority: Partial<Record<SectorKey, number>> = { government: 30, real_estate: 28, automotive: 27, transport_travel: 20, telecom_technology: 20, news_media: 10 };
    const sectorCandidates = sectorSignals.map(item=>{
      const contentHits = item.patterns.filter(pattern=>pattern.test(sectorSource)).length;
      const identityBoost = item.patterns[0]?.test(sectorIdentitySource) ? 1 : 0;
      const identityPriorityBoost = item.patterns[0]?.test(sectorIdentitySource) && item.patterns[1]?.test(sectorSource) ? 1 : 0;
      const transportContextBoost = item.sector === "transport_travel" && transportBookingIdentity ? 2 : 0;
      const suppressedHits = item.sector === "automotive" && sewerIdentity && !(schemaSectorBoost.automotive || item.patterns[0]?.test(sectorIdentitySource)) ? 0 : contentHits + identityBoost + identityPriorityBoost + transportContextBoost + (schemaSectorBoost[item.sector] || 0);
      return {sector:item.sector,label:item.label,hits:suppressedHits,modules:item.modules,priority:sectorPriority[item.sector] || 0};
    }).filter(item=>item.hits>0).sort((a,b)=>b.hits-a.hits || b.priority-a.priority);
    const strongSectorCandidate = sectorCandidates[0] && sectorCandidates[0].hits>=2 && (!sectorCandidates[1] || sectorCandidates[0].hits>sectorCandidates[1].hits || (sectorCandidates[0].hits===sectorCandidates[1].hits && sectorCandidates[0].priority>sectorCandidates[1].priority));
    const evidencePartners = collectEvidencePartners(scanEvidence);
    const partnerCapabilities = [...new Set(evidencePartners.flatMap(partner=>partner.capabilities))];
    const partnerSources = [...new Set(evidencePartners.flatMap(partner=>partner.sources))];
    const confirmedPartners = evidencePartners.filter(partner=>partner.status==="confirmed").length;

    // Commerce identity is confidence-aware. Medium URL/link hints may support a
    // decision, but they cannot add the same weight as confirmed actions/schema.
    const commerceSignals = [
      { active: scanEvidence.commerce.cart.value, confidence: scanEvidence.commerce.cart.confidence },
      { active: scanEvidence.commerce.addToCart.value, confidence: scanEvidence.commerce.addToCart.confidence },
      { active: scanEvidence.commerce.checkout.value, confidence: scanEvidence.commerce.checkout.confidence },
      { active: scanEvidence.commerce.products.value, confidence: scanEvidence.commerce.products.confidence },
      { active: scanEvidence.commerce.productPage.value, confidence: scanEvidence.commerce.productPage.confidence },
      { active: scanEvidence.commerce.productLinks.value >= 2, confidence: scanEvidence.commerce.productLinks.confidence },
      { active: scanEvidence.commerce.prices.value.count >= 2, confidence: scanEvidence.commerce.prices.confidence },
      { active: scanEvidence.schema.product, confidence: "high" as const },
    ].filter(signal=>signal.active);
    const evidenceCommerceStrength = commerceSignals.reduce((sum,signal)=>sum+(signal.confidence==="high"?1:signal.confidence==="medium"?0.5:0),0);
    const confirmedCommerceSignals = commerceSignals.filter(signal=>signal.confidence==="high").length;
    const evidenceCommerceConfirmed = confirmedCommerceSignals >= 2 && evidenceCommerceStrength >= 3;
    const catalogTop = evidenceSectorCandidates[0];
    const catalogRunnerUp = evidenceSectorCandidates[1];
    const catalogSectorStrong = Boolean(catalogTop && catalogTop.score >= 4 && (!catalogRunnerUp || catalogTop.score >= catalogRunnerUp.score + 2));
    const legacyProfile = hasEcommerceSignal
      ? {sector:"ecommerce" as SectorKey,label:"Webshop / e-commerce",confidence:"high" as const,confidenceScore:95,evidence:["Harde aankoop-/storefrontsignalen bevestigd"],applicableModules:["core_seo","geo","ecommerce","product","pricing_currency","merchant","checkout",...(euConsumerApplicable?["eu_consumer"]:[])]}
      : strongSectorCandidate
        ? {sector:sectorCandidates[0].sector,label:sectorCandidates[0].label,confidence:(sectorCandidates[0].hits>=3 ? "high" : "medium") as "high"|"medium",confidenceScore:sectorCandidates[0].hits>=3 ? 95 : 75,evidence:[`${sectorCandidates[0].hits} sectorsignalen inclusief gedeeld schema-/contentsbewijs`],applicableModules:sectorCandidates[0].modules}
        : {sector:"unknown" as SectorKey,label:"Sector niet bevestigd",confidence:"low" as const,confidenceScore:sectorCandidates[0]?.hits ? 35 : 0,evidence:sectorCandidates.slice(0,2).map(x=>`${x.label}: ${x.hits} signaal/signalen`),applicableModules:["core_seo","geo","technical"]};

    // Scanbewijs decision v1. Commerce capabilities outrank incidental sector
    // words, fixing the "Webshop profile but unknown sector/modules" contradiction.
    // Other catalog sectors only replace an unknown legacy result when their evidence
    // is clearly stronger; this keeps existing sector-specific checks backward safe.
    const catalogLegacyMap: Partial<Record<string,SectorKey>> = {
      automotive:"automotive", car_repair:"automotive", car_rental:"automotive", real_estate:"real_estate", property_rental:"real_estate", recruitment:"recruitment",
      government:"government", news_media:"news_media", saas_b2b:"saas_b2b", logistics:"transport_travel", travel:"transport_travel",
      home_services:"home_services", professional_services:"professional_services", legal:"professional_services",
      restaurant:"hospitality", cafe_bar:"hospitality", hotel:"hospitality", bed_breakfast:"hospitality", holiday_rental:"hospitality", holiday_park:"hospitality", camping:"hospitality",
      dentist:"health_wellness", healthcare:"health_wellness", medical_clinic:"health_wellness",
      beauty_salon:"beauty", hair_salon:"beauty",
    };
    const mappedCatalogSector = catalogTop ? catalogLegacyMap[catalogTop.key] : undefined;
    const lodgingDetail = scanEvidence.sectorDetails.lodging;
    const shortStayIdentity = Boolean(
      (lodgingDetail.bedBreakfast.value && lodgingDetail.bedBreakfast.confidence !== "low") ||
      (lodgingDetail.holidayRental.value && lodgingDetail.holidayRental.confidence !== "low") ||
      (lodgingDetail.holidayPark.value && lodgingDetail.holidayPark.confidence !== "low") ||
      (lodgingDetail.camping.value && lodgingDetail.camping.confidence !== "low") ||
      (lodgingDetail.shortStay.value && lodgingDetail.shortStay.confidence !== "low" &&
        scanEvidence.appointments.booking.value && scanEvidence.appointments.booking.confidence !== "low")
    );
    const lodgingSubtype = lodgingDetail.bedBreakfast.value
      ? {key:"bed_breakfast",label:"B&B / guesthouse"}
      : lodgingDetail.holidayPark.value
        ? {key:"holiday_park",label:"Vakantiepark / resort"}
        : lodgingDetail.camping.value
          ? {key:"camping",label:"Camping / chaletpark"}
          : lodgingDetail.holidayRental.value
            ? {key:"holiday_rental",label:"Vakantiehuis / vakantieverhuur"}
            : {key:"hotel",label:"Hotel / accommodatie"};
    // Short-stay accommodation must outrank generic words such as "te huur".
    // Long-term housing remains real estate; guest/night/date/booking evidence is hospitality.
    const realEstateIdentity = Boolean(!shortStayIdentity && scanEvidence.inventory.properties.value && scanEvidence.inventory.properties.confidence !== "low" && (/\/(?:woningaanbod|residential-listings|properties?|real-estate)(?:\/|$)/i.test(finalUrl.pathname) || /\b(?:makelaar|woningaanbod|te koop|te huur|for sale|for rent|real estate)\b/i.test(sectorIdentitySource)));
    const automotiveServiceIdentity = Boolean(/\b(?:apk|autobanden|banden|uitlijnen|werkplaats|autoservice|auto-onderhoud|car repair|tyres?)\b/i.test(sectorIdentitySource) || schemaSet.has("autorepair"));
    const explicitMedicalIdentity = /\b(?:tandarts|dentist|kliniek|clinic|medical|medicalclinic|fysiotherap|mondzorg|patient|patiënt|physician|huisarts|doctor)\b/i.test(sectorIdentitySource) || schemaSet.has("dentist") || schemaSet.has("medicalclinic");
    const beautyServiceIdentity = /\b(?:beauty salon|beautysalon|schoonheidssalon|day spa|dayspa|city spa|wellness|manicure|pedicure|nail salon|nagelsalon|facial|gezichtsbehandeling)\b/i.test(sectorIdentitySource) || schemaSet.has("beautysalon") || schemaSet.has("dayspa");
    const masterIdentityOverride: {sector:SectorKey;key:string;label:string;evidence:string[]} | null = shortStayIdentity
      ? {sector:"hospitality",key:lodgingSubtype.key,label:lodgingSubtype.label,evidence:["Scanbewijs: kort verblijf/accommodatie bevestigd", ...lodgingDetail.shortStay.evidence, ...lodgingDetail.stayDates.evidence, ...lodgingDetail.guests.evidence]}
      : realEstateIdentity
        ? {sector:"real_estate",key:"real_estate",label:"Vastgoed & Makelaardij",evidence:["Scanbewijs: vastgoed/woningidentiteit bevestigd", ...scanEvidence.inventory.properties.evidence]}
        : beautyServiceIdentity && !explicitMedicalIdentity
          ? {sector:"beauty",key:"beauty_salon",label:"Beauty & Wellness",evidence:["Scanbewijs: beauty-/wellnessidentiteit bevestigd"]}
          : automotiveServiceIdentity ? {sector:"automotive",key:"car_repair",label:"Automotive · garage / autoservice",evidence:["Scanbewijs: garage-/autoservice-identiteit bevestigd"]} : null;
    // Primary identity outranks generic commerce capability. A dealer, hotel,
    // service provider or other clearly identified business may publish inventory
    // and prices without being an e-commerce storefront. Commerce becomes the
    // primary sector only when no stronger non-commerce identity is established.
    const primaryNonCommerceIdentity = masterIdentityOverride
      || (strongSectorCandidate && sectorCandidates[0].sector !== "ecommerce"
        ? {sector:sectorCandidates[0].sector,key:sectorCandidates[0].sector,label:sectorCandidates[0].label,evidence:[`Primary identity: ${sectorCandidates[0].hits} independent sector signals`]}
        : null);
    // A verified storefront with multiple independent commerce signals must not be
    // reclassified by incidental hospitality, media or other generic page copy.
    // Preserve genuinely distinct business models (property, automotive, lodging,
    // healthcare and services) when supported by their own strong identity evidence.
    const explicitStoreSchema = schemaSet.has("onlinestore") || schemaSet.has("store") || schemaSet.has("furniturestore");
    const verifiedStorefront = evidenceCommerceConfirmed && explicitStoreSchema &&
      (scanEvidence.commerce.products.value || scanEvidence.commerce.cart.value || scanEvidence.commerce.addToCart.value);
    const incidentalSectorConflict = primaryNonCommerceIdentity !== null &&
      (primaryNonCommerceIdentity.sector === "hospitality" || primaryNonCommerceIdentity.sector === "news_media" || primaryNonCommerceIdentity.sector === "general_business");
    const commerceAsPrimaryIdentity = evidenceCommerceConfirmed &&
      (!primaryNonCommerceIdentity || (verifiedStorefront && incidentalSectorConflict && !shortStayIdentity));
    const sectorProfile = commerceAsPrimaryIdentity
      ? {
          sector:"ecommerce" as SectorKey,
          key:"ecommerce",
          label:"Webshop / e-commerce",
          confidence:"high" as const,
          confidenceScore:Math.min(99, Math.round(86 + evidenceCommerceStrength * 2)),
          evidence:[`Evidence Layer: ${evidenceCommerceStrength} onafhankelijke commerce-signalen`, ...(catalogTop?.key==="ecommerce" ? catalogTop.evidence : [])].slice(0,6),
          applicableModules:["core_seo","geo","technical","ecommerce","product","pricing_currency","merchant","checkout",...(euConsumerApplicable?["eu_consumer"]:[])],
        }
      : primaryNonCommerceIdentity
        ? {sector:primaryNonCommerceIdentity.sector,key:primaryNonCommerceIdentity.key,label:primaryNonCommerceIdentity.label,confidence:"high" as const,confidenceScore:Math.max(90, strongSectorCandidate && sectorCandidates[0].sector===primaryNonCommerceIdentity.sector ? (sectorCandidates[0].hits>=3?95:90) : 96),evidence:primaryNonCommerceIdentity.evidence.slice(0,6),applicableModules:[...new Set(["core_seo","geo","technical",...(sectorSignals.find(x=>x.sector===primaryNonCommerceIdentity.sector)?.modules||[])])]}
      : legacyProfile.sector==="unknown" && catalogSectorStrong && mappedCatalogSector
        ? {
            sector:mappedCatalogSector,
            key:catalogTop.key,
            label:catalogTop.label,
            confidence:(catalogTop.score>=7?"high":"medium") as "high"|"medium",
            confidenceScore:catalogTop.score>=7?92:78,
            evidence:[...catalogTop.evidence, `Evidence Layer sectorscore: ${catalogTop.score}`].slice(0,6),
            applicableModules:[...new Set(["core_seo","geo","technical",...(sectorSignals.find(x=>x.sector===mappedCatalogSector)?.modules||[])])],
          }
        : {...legacyProfile,key:legacyProfile.sector};

    const evidenceCapabilities = [
      (scanEvidence.commerce.products.value && scanEvidence.commerce.products.confidence === "high") && "products",
      (scanEvidence.commerce.prices.value.count > 0 && scanEvidence.commerce.prices.confidence === "high") && "pricing",
      (scanEvidence.commerce.cart.value && scanEvidence.commerce.cart.confidence === "high") && "cart",
      (scanEvidence.commerce.addToCart.value && scanEvidence.commerce.addToCart.confidence === "high") && "add_to_cart",
      (scanEvidence.commerce.checkout.value && scanEvidence.commerce.checkout.confidence === "high") && "checkout",
      (scanEvidence.appointments.appointment.value && scanEvidence.appointments.appointment.confidence !== "low") && "appointment",
      (scanEvidence.appointments.reservation.value && scanEvidence.appointments.reservation.confidence !== "low") && "reservation",
      (scanEvidence.appointments.booking.value && scanEvidence.appointments.booking.confidence !== "low") && "booking",
      (scanEvidence.appointments.quoteRequest.value && scanEvidence.appointments.quoteRequest.confidence !== "low") && "quote_request",
      (scanEvidence.inventory.vehicles.value && scanEvidence.inventory.vehicles.confidence !== "low") && "vehicles",
      (scanEvidence.inventory.properties.value && scanEvidence.inventory.properties.confidence !== "low") && "properties",
      (scanEvidence.inventory.jobs.value && scanEvidence.inventory.jobs.confidence !== "low") && "jobs",
      (scanEvidence.inventory.rooms.value && scanEvidence.inventory.rooms.confidence !== "low") && "rooms",
      (scanEvidence.inventory.menu.value && scanEvidence.inventory.menu.confidence !== "low") && "menu",
      (scanEvidence.organization.contact.value && scanEvidence.organization.contact.confidence !== "low") && "contact",
      (scanEvidence.organization.address.value && scanEvidence.organization.address.confidence !== "low") && "local",
      (scanEvidence.organization.openingHours.value && scanEvidence.organization.openingHours.confidence !== "low") && "opening_hours",
      (scanEvidence.organization.reviews.value && scanEvidence.organization.reviews.confidence !== "low") && "reviews",
    ].filter((value): value is string => Boolean(value));
    const capabilityModules = modulesForCapabilities([
      ...evidenceCapabilities,
      ...(evidenceCommerceConfirmed ? ["products","pricing","merchant","consumer_rights"] : []),
    ]);
    const lodgingSectorKeys = new Set(["bed_breakfast","holiday_rental","holiday_park","camping","hotel"]);
    const isLodgingSector = sectorProfile.sector === "hospitality" && lodgingSectorKeys.has(sectorProfile.key);
    const primarySectorModules: Partial<Record<string,string[]>> = {
      ecommerce:["ecommerce","product","pricing_currency","merchant","checkout"],
      automotive:["automotive"],
      real_estate:["real_estate"],
      recruitment:["recruitment"],
      hospitality:isLodgingSector ? ["accommodation"] : ["hospitality"],
      health_wellness:["health_wellness"],
      professional_services:["professional_services"],
      home_services:["home_services"],
      beauty:["beauty"],
      transport_travel:["transport_travel"],
      saas_b2b:["saas_b2b"],
    };
    // Motor v2: sector modules come only from the primary identity decision.
    // Capabilities may add generic functional modules (lead conversion, booking,
    // local, trust) but may never turn an incidental topic into another sector.
    const sectorDefiningModules = new Set(["automotive","real_estate","recruitment","hospitality","accommodation","marketplace"]);
    sectorProfile.applicableModules = [...new Set([
      ...sectorProfile.applicableModules.filter((module)=>!sectorDefiningModules.has(module)),
      ...(primarySectorModules[sectorProfile.sector] || []),
      ...capabilityModules.filter((module)=>!sectorDefiningModules.has(module)),
    ])];

    const masterEvidence = {
      version:"1.0",
      primarySector:{
        key:sectorProfile.key,
        label:sectorProfile.label,
        confidence:sectorProfile.confidence,
        confidenceScore:sectorProfile.confidenceScore,
        displayPolicy: sectorProfile.confidenceScore >= 80 ? "confirmed" : sectorProfile.confidenceScore >= 60 ? "probable" : "unconfirmed",
      },
      partners:evidencePartners,
      partnerSummary:{
        total:evidencePartners.length,
        confirmed:confirmedPartners,
        partial:evidencePartners.filter(partner=>partner.status==="partial").length,
        unconfirmed:evidencePartners.filter(partner=>partner.status==="unconfirmed").length,
      },
      capabilities:[...new Set([...evidenceCapabilities,...partnerCapabilities])],
      activeModules:sectorProfile.applicableModules,
      businessModels:[...new Set([
        evidenceCommerceConfirmed && "commerce",
        evidenceCapabilities.includes("vehicles") && "automotive_inventory",
        evidenceCapabilities.includes("properties") && "real_estate_inventory",
        (sectorProfile.key === "recruitment" && evidenceCapabilities.includes("jobs")) && "recruitment",
        evidenceCapabilities.includes("rooms") && "hospitality_rooms",
        evidenceCapabilities.includes("menu") && "hospitality_food",
        evidenceCapabilities.includes("appointment") && "appointments",
        evidenceCapabilities.includes("reservation") && "reservations",
        evidenceCapabilities.includes("booking") && "bookings",
        evidenceCapabilities.includes("quote_request") && "lead_generation",
        evidenceCapabilities.includes("local") && "local_business",
      ].filter((value): value is string => Boolean(value)))],
      sectorMotor3Assessment:assessSectorConflict(evidenceSectorCandidates),
      secondarySectorCandidates:evidenceSectorCandidates
        .filter(candidate=>candidate.key!==sectorProfile.key && candidate.score>=3)
        .slice(0,4)
        .map(candidate=>({key:candidate.key,label:candidate.label,score:candidate.score,evidence:candidate.evidence})),
      commerce:{confirmed:evidenceCommerceConfirmed,strength:evidenceCommerceStrength},
      coverage:{
        confirmedCapabilities:evidenceCapabilities.length,
        evidenceSources:[...new Set([
          ...partnerSources,
          ...scanEvidence.commerce.products.sources,
          ...scanEvidence.organization.contact.sources,
          ...scanEvidence.organization.address.sources,
        ])],
        partnerCoverage: evidencePartners.length ? Math.round(((confirmedPartners + evidencePartners.filter(partner=>partner.status==="partial").length * 0.5) / evidencePartners.length) * 100) : 0,
      },
      // Cross-check with technologyProfile is added later, after that profile exists.
      conflicts: [] as string[],
      policy:"Evidence-first: ontbrekend bewijs blijft onbevestigd en wordt niet automatisch als defect beoordeeld.",
    };
    evidenceLayer.master = masterEvidence;

    const seoChecks: Check[] = [];
    const geoChecks: Check[] = [];
    const accessibilityChecks: Check[] = [];

    // Security-header readiness uses the main page response already fetched by the
    // scanner, so this adds no network work. Absence is guidance, not proof of a
    // vulnerability: CSP/HSTS deployment depends on the site's architecture.
    const securityHeaders = {
      hsts: response.headers.get("strict-transport-security"),
      csp: response.headers.get("content-security-policy"),
      contentTypeOptions: response.headers.get("x-content-type-options"),
      frameOptions: response.headers.get("x-frame-options"),
      referrerPolicy: response.headers.get("referrer-policy"),
      permissionsPolicy: response.headers.get("permissions-policy"),
    };
    const presentSecurityHeaders = Object.entries(securityHeaders).filter(([, value]) => Boolean(value));
    const coreSecurityHeadersPresent = Boolean(securityHeaders.hsts && securityHeaders.contentTypeOptions && (securityHeaders.csp || securityHeaders.frameOptions));

    // Passive Security Engine: evidence comes only from the already fetched response
    // and HTML. It never probes admin paths, exploits endpoints or brute-forces.
    const securityChecks: Check[] = [];
    const securityCheck = (status: Status, key: string, titleText: string, message: string, fixText: string, points = 5, maxPoints = 5) => {
      // Security is independent from SEO. Warnings receive partial credit only.
      const awardedPoints = status === "pass"
        ? Math.min(points, maxPoints)
        : status === "warning"
          ? Math.min(points, Math.max(0, maxPoints - 1))
          : 0;
      const item = check(status, key, "security", titleText, message, fixText, awardedPoints, maxPoints);
      item.evidence = {
        url: finalUrl.toString(),
        found: status === "pass" ? true : status === "fail" ? false : null,
        details: message
      };
      return item;
    };
    const isHttps = finalUrl.protocol === "https:";
    securityChecks.push(isHttps
      ? securityCheck("pass","security_https","HTTPS","De gescande pagina gebruikt HTTPS.","Houd HTTPS verplicht en stuur HTTP-verkeer permanent door naar HTTPS.")
      : securityCheck("fail","security_https","HTTPS","De gescande pagina gebruikt geen HTTPS.","Activeer HTTPS/TLS en stuur HTTP permanent door naar HTTPS."));

    const missingSecurityHeaders = Object.entries(securityHeaders).filter(([, value]) => !value).map(([name])=>name);
    const securityHeaderEvidence = `aanwezig: ${presentSecurityHeaders.map(([name])=>name).join(", ") || "geen"}; niet aangetroffen in de response: ${missingSecurityHeaders.join(", ") || "geen"}`;
    securityChecks.push(coreSecurityHeadersPresent
      ? securityCheck("pass","security_headers","Security headers",`Browser-securityheaders voldoen aan de huidige kernregel (${securityHeaderEvidence}).`,"Houd deze headers actief en test wijzigingen aan CSP/HSTS eerst tegen de applicatie.",6,6)
      : securityCheck("warning","security_headers","Security headers",`RankFix bevestigde ${presentSecurityHeaders.length} van 6 gecontroleerde securityheaders (${securityHeaderEvidence}). Dit is hardening-advies en op zichzelf geen bewijs van een kwetsbaarheid.`,"Controleer HSTS, CSP/frame-bescherming, X-Content-Type-Options, Referrer-Policy en Permissions-Policy op server/CDN-niveau.",Math.max(0, presentSecurityHeaders.length),6));

    const mixedContentMatches = isHttps
      ? [...html.matchAll(new RegExp("(?:src|href)\\\\s*=\\\\s*[\\\"']http://[^\\\"'\\\\s>]+[\\\"']", "gi"))].map((m)=>m[0]).slice(0,5)
      : [];
    securityChecks.push(!isHttps
      ? securityCheck("not_applicable","security_mixed_content","Mixed content","Mixed-contentcontrole is alleen van toepassing op HTTPS-pagina's.","Activeer eerst HTTPS.",0,4)
      : mixedContentMatches.length === 0
        ? securityCheck("pass","security_mixed_content","Mixed content","Geen expliciete HTTP-assets gevonden in de gescande HTTPS-HTML.","Blijf assets via HTTPS of relatieve URL's laden.",4,4)
        : securityCheck("fail","security_mixed_content","Mixed content",`${mixedContentMatches.length} expliciete HTTP-assetverwijzing(en) gevonden op een HTTPS-pagina.`,"Vervang HTTP-asset-URL's door HTTPS of veilige relatieve URL's.",4,4));

    // Read individual Set-Cookie records where supported. A combined header can
    // contain commas in Expires dates, so splitting it is only a fallback.
    const individualSetCookies = typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [];
    const setCookieHeaders = response.headers.get("set-cookie") || "";
    const cookiePresent = individualSetCookies.length > 0 || Boolean(setCookieHeaders);
    // Strict Set-Cookie parsing. Commas inside Expires must stay inside the cookie,
    // and attributes are evaluated only on their own cookie record.
    const splitSetCookieHeader = (header:string) => {
      const out:string[] = [];
      let from = 0;
      let inExpires = false;
      for (let i=0;i<header.length;i++) {
        const tail = header.slice(i).toLowerCase();
        if (tail.startsWith("expires=")) inExpires = true;
        if (inExpires && header[i] === ";") inExpires = false;
        if (!inExpires && header[i] === "," && /^\\s*[^;,=\\s]+=[^;,]*/.test(header.slice(i+1))) {
          out.push(header.slice(from,i).trim()); from=i+1;
        }
      }
      out.push(header.slice(from).trim());
      return out.filter(Boolean);
    };
    const observedCookies = individualSetCookies.length ? individualSetCookies : setCookieHeaders ? splitSetCookieHeader(setCookieHeaders) : [];
    const cookieObservations = observedCookies.map((raw)=>{
      const first = raw.split(";")[0] || "";
      const name = first.split("=")[0]?.trim() || "cookie";
      const sameSiteMatch = raw.match(/(?:^|;\\s*)samesite=(lax|strict|none)(?:;|$)/i);
      const antiCsrf = /(?:csrf|xsrf|verification[-_]?token|requestverificationtoken)/i.test(name);
      const sessionLike = !antiCsrf && /(?:^|[-_.])(session|sess|auth|jwt|login|sid)(?:$|[-_.])/i.test(name);
      return {
        name, raw,
        secure: /(?:^|;\\s*)secure(?:;|$)/i.test(raw),
        httpOnly: /(?:^|;\\s*)httponly(?:;|$)/i.test(raw),
        sameSite: sameSiteMatch ? sameSiteMatch[1].toLowerCase() : "missing",
        sessionLike,
      };
    });
    const cookiesMissingSecure = cookieObservations.filter((cookie)=>isHttps && !cookie.secure);
    const cookiesMissingSameSite = cookieObservations.filter((cookie)=>cookie.sameSite === "missing");
    const sessionCookiesMissingHttpOnly = cookieObservations.filter((cookie)=>cookie.sessionLike && !cookie.httpOnly);
    const cookieIssueCount = cookiesMissingSecure.length + cookiesMissingSameSite.length + sessionCookiesMissingHttpOnly.length;
    const cookieEvidenceSummary = cookieObservations.map((cookie)=>{
      const missing = [
        isHttps && !cookie.secure ? "Secure ontbreekt" : null,
        cookie.sameSite === "missing" ? "SameSite ontbreekt" : null,
        cookie.sessionLike && !cookie.httpOnly ? "HttpOnly ontbreekt" : null,
      ].filter(Boolean);
      return `${cookie.name}: ${missing.length ? missing.join(", ") : "relevante flags bevestigd"}`;
    }).join(" · ");
    securityChecks.push(!cookiePresent
      ? securityCheck("unable_to_confirm","security_cookie_flags","Cookie-beveiliging","De hoofdresponse bevatte geen zichtbare Set-Cookie-header. RankFix kan daardoor cookieflags voor browser-, consent- of ingelogde flows niet bevestigen.","Controleer sessie-, consent- en authenticatiecookies in de relevante flows; ken zonder cookie-evidence geen veiligheidspunten toe.",0,5)
      : cookieIssueCount === 0
        ? securityCheck("pass","security_cookie_flags","Cookie-beveiliging",`De zichtbare Set-Cookie-response bevestigt passende relevante flags voor ${cookieObservations.length} cookie(s).`,"Houd gevoelige sessiecookies voorzien van passende beveiligingsflags.",5,5)
        : securityCheck("warning","security_cookie_flags","Cookie-beveiliging",`Per-cookie controle vond ${cookieIssueCount} ontbrekende relevante flag(s). ${cookieEvidenceSummary}. HttpOnly wordt alleen beoordeeld voor bevestigde sessie-/authenticatiecookies.`,"Controleer de genoemde cookies afzonderlijk: Secure op HTTPS, een passende SameSite-instelling en HttpOnly voor sessie-/authenticatiecookies.",Math.max(1,5-Math.min(4,cookieIssueCount)),5));
    const forms = [...html.matchAll(new RegExp("<form\\\\b[\\\\s\\\\S]*?</form>", "gi"))].map((m)=>m[0]);
    const passwordForm = forms.some((form)=>new RegExp("<input[^>]+type\\\\s*=\\\\s*[\\\"']password[\\\"']", "i").test(form));
    const insecureFormActions = forms.filter((form)=>new RegExp("action\\\\s*=\\\\s*[\\\"']http://", "i").test(form)).length;
    securityChecks.push(forms.length === 0
      ? securityCheck("not_applicable","security_forms","Formuliertransport","Geen HTML-formulier gevonden in de gescande pagina.","Geen actie nodig voor deze pagina.",0,5)
      : insecureFormActions > 0
        ? securityCheck("fail","security_forms","Formuliertransport",`${insecureFormActions} formulier(en) sturen expliciet naar een HTTP-endpoint.`,"Gebruik uitsluitend HTTPS voor formulieracties en gevoelige gegevens.",5,5)
        : isHttps
          ? securityCheck("pass","security_forms","Formuliertransport",`${forms.length} formulier(en) gevonden zonder expliciete onveilige HTTP-action${passwordForm ? "; wachtwoordveld aanwezig" : ""}.`,"Controleer server-side validatie, CSRF-bescherming en autorisatie aanvullend; die zijn niet uit statische HTML te bewijzen.",5,5)
          : securityCheck("warning","security_forms","Formuliertransport",`${forms.length} formulier(en) gevonden op een niet-HTTPS-pagina.`,"Bescherm formulieren met HTTPS; beoordeel server-side validatie en CSRF apart.",2,5));

    const exposedSecretPatterns = [
      { label:"private key", re:/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i },
      { label:"AWS access key", re:/\\bAKIA[0-9A-Z]{16}\\b/ },
      { label:"GitHub token", re:/\\bgh[pousr]_[A-Za-z0-9_]{20,}\\b/ },
      { label:"generic bearer token", re:/authorization\\s*[:=]\\s*["']?bearer\\s+[A-Za-z0-9._~-]{20,}/i },
    ];
    const exposedSignals = exposedSecretPatterns.filter((item)=>item.re.test(html)).map((item)=>item.label);
    securityChecks.push(exposedSignals.length
      ? securityCheck("fail","security_exposed_secrets","Blootgestelde secrets",`Mogelijk gevoelig secretpatroon gevonden: ${exposedSignals.join(", ")}. Handmatige verificatie is vereist.`,"Verwijder secrets uit client-side HTML/bundles, roteer bevestigde gelekte credentials en gebruik server-side secretopslag.",8,8)
      : securityCheck("pass","security_exposed_secrets","Blootgestelde secrets","Geen bekende high-confidence secretpatronen gevonden in de opgehaalde HTML.","Bewaar API-sleutels en credentials uitsluitend server-side.",8,8));

    const externalScriptTags = [...html.matchAll(/<script\\b[^>]*\\bsrc\\s*=\\s*["']([^"']+)["'][^>]*>/gi)].map((m)=>({tag:m[0],src:m[1]}));
    const crossOriginScripts = externalScriptTags.filter((item)=>{ try { return new URL(item.src,finalUrl).origin !== finalUrl.origin; } catch { return false; } });
    const crossOriginWithoutSri = crossOriginScripts.filter((item)=>!/\\bintegrity\\s*=/i.test(item.tag));
    securityChecks.push(crossOriginScripts.length === 0
      ? securityCheck("pass","security_script_integrity","Externe scripts","Geen cross-origin scripts aangetroffen in de opgehaalde HTML.","Geen actie nodig; JavaScript kan runtime aanvullend scripts laden die buiten deze statische controle vallen.",4,4)
      : crossOriginWithoutSri.length === 0
        ? securityCheck("pass","security_script_integrity","Externe scripts",`Alle ${crossOriginScripts.length} zichtbare cross-origin script(s) bevatten een integrity-attribuut.`,"Houd externe scripts beperkt en gebruik SRI waar versievaste assets dit ondersteunen.",4,4)
        : securityCheck("warning","security_script_integrity","Externe scripts",`${crossOriginWithoutSri.length} van ${crossOriginScripts.length} cross-origin script(s) hebben geen zichtbaar integrity-attribuut. SRI is niet voor elke dynamische provider toepasbaar.`,"Beperk derde-partij scripts en gebruik Subresource Integrity voor versievaste externe assets waar mogelijk.",2,4));

    const securityApplicable = securityChecks.filter((item)=>item.issue_status !== "NOT_APPLICABLE" && item.issue_status !== "UNABLE_TO_CONFIRM");
    const securityMax = securityApplicable.reduce((sum,item)=>sum+item.maxPoints,0);
    const securityPoints = securityApplicable.reduce((sum,item)=>sum+item.points,0);
    const securityScore = securityMax ? Math.round((securityPoints/securityMax)*100) : 0;
    const securitySummary = summarizeAuditChecks(securityChecks);
    const securityEngine = {
      version:"1.1-passive",
      mode:"PASSIVE_STATIC_EVIDENCE" as const,
      score:securityScore,
      grade:grade(securityScore),
      summary:securitySummary,
      checks:securityChecks,
      note:"Passieve security-audit op responseheaders en opgehaalde HTML. Geen exploit-, brute-force-, login- of actieve kwetsbaarheidstests uitgevoerd."
    };
    const accessibilityApplicable = accessibilityChecks.filter((item)=>item.issue_status !== "NOT_APPLICABLE" && item.issue_status !== "UNABLE_TO_CONFIRM");
    const accessibilityMax = accessibilityApplicable.reduce((sum,item)=>sum+item.maxPoints,0);
    const accessibilityPointsTotal = accessibilityApplicable.reduce((sum,item)=>sum+item.points,0);
    const accessibilityScore = accessibilityMax ? Math.round((accessibilityPointsTotal/accessibilityMax)*100) : 0;
    const accessibilityEngine = {
      version:"1.0-static-basics",
      score:accessibilityScore,
      grade:grade(accessibilityScore),
      coverage:weightedCoverage(accessibilityChecks),
      summary:summarizeAuditChecks(accessibilityChecks),
      checks:accessibilityChecks,
      note:"Technische HTML-basiscontrole voor toegankelijkheid. Dit is geen volledige WCAG- of EAA-conformiteitsbeoordeling en verandert de SEO/GEO-totaalscore niet."
    };
    // Security remains a separate engine and must never change SEO scoring/counts.

    // First specialist sector checks. Positive raw-HTML evidence can pass; absence is
    // "unable to confirm" rather than a penalty because JavaScript is not executed.
    const sectorCheck = (key:string,titleText:string,found:boolean,foundMessage:string,missingMessage:string,fixText:string) => {
      const item = found
        ? check("pass",key,"seo",titleText,foundMessage,fixText,4,4)
        : check("unable_to_confirm",key,"seo",titleText,missingMessage,fixText,0,4);
      item.evidence = { url: finalUrl.toString(), found: found ? true : null, details: found ? foundMessage : missingMessage };
      return item;
    };
    if (sectorProfile.sector === "real_estate") {
      const listingSignal = (scanEvidence.sectorDetails.realEstate.listing.value && scanEvidence.sectorDetails.realEstate.listing.confidence !== "low") || /\\b(te koop|te huur|koopwoning|huurwoning|woningaanbod|objecten|properties|for sale|for rent)\\b/i.test(text) || schemaSet.has("realestatelisting");
      const leadSignal = hasContactChannelSignal || /\\b(bezichtiging|waardebepaling|verkoopadvies|plan een afspraak|contact opnemen)\\b/i.test(text);
      const areaSignal = /\\b(werkgebied|regio|buurt|wijk|plaats|gemeente|service area|area served)\\b/i.test(text) || schemaObjects.some((item:any)=>Boolean(item?.areaServed));
      seoChecks.push(
        sectorCheck("sector_real_estate_listings","Vastgoedaanbod",listingSignal,"Vastgoed-/woningsignalen zijn in de pagina bevestigd.","RankFix kon in de raw HTML geen vastgoedaanbod betrouwbaar bevestigen.","Maak woningaanbod en de bijbehorende bestemming duidelijk vindbaar wanneer dit voor deze pagina relevant is."),
        sectorCheck("sector_real_estate_leads","Makelaar conversie",leadSignal,"Een contact-, bezichtigings- of waardebepalingssignaal is bevestigd.","Een duidelijke makelaar-CTA kon in de raw HTML niet betrouwbaar worden bevestigd.","Maak de belangrijkste vervolgstap, zoals contact, bezichtiging of waardebepaling, duidelijk zichtbaar."),
        sectorCheck("sector_real_estate_area","Werkgebied makelaar",areaSignal,"Een lokaal werkgebied-/regiosignaal is bevestigd.","Het werkgebied kon in de raw HTML niet betrouwbaar worden bevestigd.","Beschrijf relevante plaatsen of regio's wanneer lokale vindbaarheid belangrijk is.")
      );
    } else if (sectorProfile.sector === "automotive") {
      const workshopSignal = /\\b(apk|onderhoud|reparatie|werkplaats|autoservice|banden|diagnose)\\b/i.test(text);
      const appointmentSignal = hasContactChannelSignal || /\\b(afspraak|proefrit|werkplaatsafspraak|plan afspraak|book service)\\b/i.test(text);
      const inventorySignal = /\\b(occasion|occasions|voorraad|auto(?:'s)? te koop|used cars?|vehicles? for sale)\\b/i.test(text);
      const inventoryCheck = automotiveServiceIdentity && !inventorySignal
        ? check("not_applicable","sector_automotive_inventory","seo","Voertuigaanbod","Deze site is als garage/autoservice herkend zonder bewijs van autoverkoop; voertuigvoorraad is daarom niet van toepassing.","Geen actie nodig tenzij de onderneming ook voertuigen verkoopt.",0,4)
        : sectorCheck("sector_automotive_inventory","Voertuigaanbod",inventorySignal,"Voertuig-/occasionaanbod is in de pagina bevestigd.","RankFix kon voertuigaanbod niet betrouwbaar bevestigen; dit kan ook niet van toepassing zijn.","Toon voertuigaanbod duidelijk wanneer de onderneming auto's verkoopt; anders is geen actie nodig.");
      seoChecks.push(
        sectorCheck("sector_automotive_services","Garage diensten",workshopSignal,"Garage-/werkplaatsdiensten zijn in de pagina bevestigd.","Garage-/werkplaatsdiensten konden in de raw HTML niet betrouwbaar worden bevestigd.","Maak de belangrijkste garage- en werkplaatsdiensten duidelijk vindbaar."),
        sectorCheck("sector_automotive_conversion","Afspraak / proefrit",appointmentSignal,"Een afspraak-, proefrit- of contactsignaal is bevestigd.","Een duidelijke afspraak- of proefritactie kon niet betrouwbaar worden bevestigd.","Maak de belangrijkste vervolgstap voor klanten duidelijk zichtbaar."), inventoryCheck
      );
    } else if (sectorProfile.sector === "home_services") {
      const serviceSignal = /\\b(loodgieter|elektricien|installateur|aannemer|dakdekker|schilder|renovatie|reparatie|installatie|onderhoud|riool|riolering|verstopping|ontstoppen|ontstopping|afvoer)\\b/i.test(text);
      const quoteSignal = /\\b(offerte|prijsopgave|aanvraag|bel ons|contact opnemen|request a quote|get a quote)\\b/i.test(text) || hasContactChannelSignal;
      const areaSignal = /\\b(werkgebied|servicegebied|regio|gemeente|in en rondom|omgeving|area served|service area)\\b/i.test(text) || schemaObjects.some((item:any)=>Boolean(item?.areaServed));
      seoChecks.push(
        sectorCheck("sector_home_services_offer","Vakdiensten",serviceSignal,"De belangrijkste vak-/servicediensten zijn in de pagina bevestigd.","De aangeboden vakdiensten konden niet betrouwbaar worden bevestigd.","Maak concreet welke werkzaamheden en diensten worden uitgevoerd."),
        sectorCheck("sector_home_services_quote","Offerte / contact",quoteSignal,"Een offerte- of contactactie is bevestigd.","Een duidelijke offerte- of contactactie kon niet betrouwbaar worden bevestigd.","Maak offerte aanvragen of contact opnemen eenvoudig en duidelijk."),
        sectorCheck("sector_home_services_area","Servicegebied",areaSignal,"Een servicegebied-/regiosignaal is bevestigd.","Het servicegebied kon in de raw HTML niet betrouwbaar worden bevestigd.","Noem relevante plaatsen of regio's wanneer het bedrijf lokaal werkt.")
      );
    } else if (sectorProfile.sector === "professional_services") {
      const expertiseSignal = /\\b(expertise|specialis(?:t|atie)|advocaat|accountant|boekhouder|consultant|notaris|lawyer|attorney|accounting|consultancy|diensten|services)\\b/i.test(text) || hasServiceExpertiseSignal;
      const contactSignal = hasContactChannelSignal || hasContactFormSignal || /\\b(afspraak|kennismaking|consult|adviesgesprek|contact|plan a call|book a consultation)\\b/i.test(text);
      const authorSignal = schemaSet.has("person") || /\\b(auteur|author|door|by)\\s+[A-ZÀ-Ý][\\p{L}.'-]+/iu.test(text);
      seoChecks.push(
        sectorCheck("sector_professional_expertise","Expertise & diensten",expertiseSignal,"Diensten of expertise zijn in de pagina bevestigd.","Diensten of expertise konden in de raw HTML niet betrouwbaar worden bevestigd.","Maak specialisaties en concrete diensten duidelijk zichtbaar zonder niet-bewezen kwalificaties toe te voegen."),
        sectorCheck("sector_professional_contact","Zakelijk contact",contactSignal,"Een contact- of adviesactie is bevestigd.","Een duidelijke contact- of adviesactie kon niet betrouwbaar worden bevestigd.","Maak de belangrijkste vervolgstap, zoals contact of een kennismaking, duidelijk zichtbaar."),
        sectorCheck("sector_professional_authorship","Expertise-auteurschap",authorSignal,"Een auteurs-/persoonsignaal is in de pagina bevestigd.","Auteurschap of een verantwoordelijke expert kon in de raw HTML niet betrouwbaar worden bevestigd.","Koppel inhoud aan een echte auteur of expert wanneer dat feitelijk juist en relevant is.")
      );
    } else if (sectorProfile.sector === "hospitality") {
      const openingSignal = /\\b(openingstijden|opening hours|geopend|open today|hours)\\b/i.test(text) || schemaObjects.some((item:any)=>Boolean(item?.openingHours || item?.openingHoursSpecification));
      const menuSignal = /\\b(menu|menukaart|ontbijt|lunch|diner|dinner|drinks|gerechten)\\b/i.test(text) || links.some((href)=>/menu|menukaart/i.test(href));
      const reservationSignal = hasContactChannelSignal || /\\b(reserveren|reserveer|reservation|book a table|boek een tafel|kamer boeken|book a room)\\b/i.test(text);
      seoChecks.push(
        sectorCheck("sector_hospitality_hours","Openingstijden",openingSignal,"Openingstijden of opening-hours structured data zijn bevestigd.","Openingstijden konden in de raw HTML niet betrouwbaar worden bevestigd.","Maak actuele openingstijden duidelijk vindbaar wanneer die voor deze locatie relevant zijn."),
        sectorCheck("sector_hospitality_menu","Menu / aanbod",menuSignal,"Menu- of aanbodsignalen zijn bevestigd.","Een menu of concreet horeca-aanbod kon niet betrouwbaar worden bevestigd.","Maak menu of aanbod duidelijk bereikbaar wanneer dit voor deze onderneming relevant is."),
        sectorCheck("sector_hospitality_reservation","Reserveren / contact",reservationSignal,"Een reserverings- of contactactie is bevestigd.","Een duidelijke reserverings- of contactactie kon niet betrouwbaar worden bevestigd.","Maak reserveren of contact opnemen duidelijk en eenvoudig.")
      );
    } else if (sectorProfile.sector === "health_wellness") {
      const treatmentSignal = /\\b(behandeling|behandelingen|therapie|fysiotherap|tandarts|dentist|kliniek|clinic|wellness|salon|treatment|services)\\b/i.test(text);
      const appointmentSignal = hasContactChannelSignal || /\\b(afspraak|appointment|boek afspraak|plan afspraak|book now|consult)\\b/i.test(text);
      const trustSignal = hasAboutSignal || hasServiceExpertiseSignal || schemaSet.has("person") || /\\b(team|specialist|behandelaar|therapeut|practitioner)\\b/i.test(text);
      seoChecks.push(
        sectorCheck("sector_health_services","Behandelingen & diensten",treatmentSignal,"Behandelingen of diensten zijn in de pagina bevestigd.","Behandelingen of diensten konden in de raw HTML niet betrouwbaar worden bevestigd.","Beschrijf feitelijk welke diensten of behandelingen worden aangeboden; voeg geen medische werkzaamheidsclaims toe zonder bewijs."),
        sectorCheck("sector_health_appointment","Afspraak maken",appointmentSignal,"Een afspraak- of contactactie is bevestigd.","Een duidelijke afspraak- of contactactie kon niet betrouwbaar worden bevestigd.","Maak de route naar afspraak of contact duidelijk zichtbaar."),
        sectorCheck("sector_health_trust","Team & expertise",trustSignal,"Een team-, expertise- of behandelaarssignaal is bevestigd.","Team of expertise kon in de raw HTML niet betrouwbaar worden bevestigd.","Toon echte team- en expertise-informatie wanneer die beschikbaar en verifieerbaar is.")
      );
    } else if (sectorProfile.sector === "saas_b2b") {
      const featureSignal = /\\b(features?|functies|mogelijkheden|platform|software|integrations?|integraties|api)\\b/i.test(text);
      const leadSignal = hasContactChannelSignal || /\\b(demo|start gratis|free trial|try free|get started|contact sales|plan gesprek|boek demo)\\b/i.test(text);
      const audienceSignal = /\\b(voor bedrijven|for businesses|for teams|teams|bedrijven|organisaties|business|enterprise|b2b)\\b/i.test(text);
      seoChecks.push(
        sectorCheck("sector_saas_features","Product & functies",featureSignal,"Software-/functiesignalen zijn in de pagina bevestigd.","Product- of functiesignalen konden in de raw HTML niet betrouwbaar worden bevestigd.","Maak duidelijk welk probleem het product oplost en welke functies werkelijk beschikbaar zijn."),
        sectorCheck("sector_saas_conversion","Demo / conversie",leadSignal,"Een demo-, trial- of contactactie is bevestigd.","Een duidelijke demo-, trial- of contactactie kon niet betrouwbaar worden bevestigd.","Maak de primaire zakelijke vervolgstap duidelijk zichtbaar."),
        sectorCheck("sector_saas_audience","Doelgroep",audienceSignal,"Een zakelijke doelgroep is in de pagina bevestigd.","De zakelijke doelgroep kon in de raw HTML niet betrouwbaar worden bevestigd.","Beschrijf voor welke echte klantgroepen of teams het product bedoeld is.")
      );
    }

    const checkedInternalLinkCount = linkAuditResults.length;
    // Keep this local evidence gate independent of the later shared content gate.
    const linkEvidenceUnavailable = !javascriptExecuted && uniqueInternalAnchors.length === 0 && (
      rawVisibleWords < 60 ||
      (rawVisibleWords < 100 && rawScriptCount >= 4) ||
      /<div\b[^>]*\bid\s*=\s*["'](?:root|app|__next|__nuxt)["'][^>]*>\s*<\/div>/i.test(rawHtml)
    );
    const brokenInternalLinkRatio = checkedInternalLinkCount ? brokenInternalLinks.length / checkedInternalLinkCount : 0;
    const brokenLinkPoints = brokenInternalLinkRatio <= 0.05 ? 4 : brokenInternalLinkRatio <= 0.15 ? 3 : brokenInternalLinkRatio <= 0.30 ? 2 : 1;
    const redirectedInternalLinkRatio = checkedInternalLinkCount ? redirectedInternalLinks.length / checkedInternalLinkCount : 0;
    const internalRedirectPoints = redirectedInternalLinkRatio <= 0.10 ? 3 : redirectedInternalLinkRatio <= 0.30 ? 2 : 1;
    seoChecks.push(
      linkEvidenceUnavailable
        ? check("unable_to_confirm", "broken_links", "seo", "Broken links", "De raw HTML is een dunne JavaScript-shell en bevat geen betrouwbare interne linkset.", "Controleer broken links opnieuw na geslaagde JavaScript-rendering.", 0, 5)
        : uniqueInternalAnchors.length === 0
        ? check("not_applicable", "broken_links", "seo", "Broken links", "Geen controleerbare interne links gevonden op deze pagina.", "Controleer links opnieuw wanneer de pagina interne navigatie bevat.", 0, 5)
        : brokenInternalLinks.length > 0
          ? check("warning", "broken_links", "seo", "Broken links", `${brokenInternalLinks.length} van ${linkAuditResults.length} gecontroleerde interne link(s) gaf een bewezen foutstatus (${Math.round(brokenInternalLinkRatio * 100)}%). Voorbeeld: ${brokenInternalLinks[0]?.url} → HTTP ${brokenInternalLinks[0]?.status}.`, "Herstel de bestemming, verwijder de link of redirect een oude URL naar de juiste relevante pagina.", brokenLinkPoints, 5)
          : unconfirmedInternalLinks.length > 0
            ? check("unable_to_confirm", "broken_links", "seo", "Broken links", `${unconfirmedInternalLinks.length} van ${linkAuditResults.length} interne link(s) kon tijdens deze scan niet betrouwbaar worden opgehaald. Er is geen 404/410/5xx bewezen.`, "Controleer deze links opnieuw; een fetchfout alleen is geen bewijs van een kapotte link.", 0, 5)
            : check("pass", "broken_links", "seo", "Broken links", `${linkAuditResults.length} interne link(s) steekproefsgewijs gecontroleerd; geen 404, 410 of 5xx gevonden.`, "Blijf interne links controleren bij wijzigingen en verwijderde pagina's.", 5, 5)
    );
    seoChecks.push(
      linkEvidenceUnavailable
        ? check("unable_to_confirm", "internal_redirects", "seo", "Interne redirects", "De raw HTML is een dunne JavaScript-shell en bevat geen betrouwbare interne linkset.", "Controleer redirects opnieuw na geslaagde JavaScript-rendering.", 0, 4)
        : uniqueInternalAnchors.length === 0
        ? check("not_applicable", "internal_redirects", "seo", "Interne redirects", "Geen controleerbare interne links gevonden op deze pagina.", "Gebruik directe interne links zodra er navigatie aanwezig is.", 0, 4)
        : redirectedInternalLinks.length === 0
          ? check("pass", "internal_redirects", "seo", "Interne redirects", `${linkAuditResults.length} interne link(s) gecontroleerd; geen doorgestuurde bestemmingen gevonden.`, "Link intern bij voorkeur direct naar de definitieve URL.", 4, 4)
          : check("warning", "internal_redirects", "seo", "Interne redirects", `${redirectedInternalLinks.length} van ${linkAuditResults.length} gecontroleerde interne link(s) komt via een redirect op een andere URL uit (${Math.round(redirectedInternalLinkRatio * 100)}%). Voorbeeld: ${redirectedInternalLinks[0]?.url} → ${redirectedInternalLinks[0]?.finalUrl}.`, "Werk interne links bij naar de definitieve URL om onnodige redirects te vermijden.", internalRedirectPoints, 4)
    );
    seoChecks.push(
      linkEvidenceUnavailable
        ? check("unable_to_confirm", "semantic_link_destination", "seo", "Verkeerde linkbestemming", "De raw HTML is een dunne JavaScript-shell; RankFix kan linktekst en bestemmingen niet betrouwbaar vergelijken.", "Controleer linkbestemmingen opnieuw na geslaagde JavaScript-rendering.", 0, 5)
        : uniqueInternalAnchors.length === 0
        ? check("not_applicable", "semantic_link_destination", "seo", "Verkeerde linkbestemming", "Geen controleerbare interne links gevonden.", "Controleer belangrijke interne links zodra ze op de pagina aanwezig zijn.", 0, 5)
        : semanticLinkMismatches.length === 0 && productCardMismatches.length === 0 && featuredProductMismatches.length === 0
          ? check("pass", "semantic_link_destination", "seo", "Verkeerde linkbestemming", hasEcommerceSignal ? "Geen sterke semantische mismatch gevonden tussen benoemde productlinks en hun productbestemming. Prijs-only links worden bewust niet als bewijs gebruikt." : "Geen sterke semantische mismatch gevonden tussen benoemde interne links en hun bestemming.", hasEcommerceSignal ? "Houd titel, afbeelding en productbestemming binnen productkaarten consistent." : "Houd linktekst en bestemming inhoudelijk consistent.", 5, 5)
          : check("warning", "semantic_link_destination", "seo", "Verkeerde linkbestemming", featuredProductMismatches.length > 0 ? `Mogelijke verkeerde linkbestemming in een uitgelicht product: "${featuredProductMismatches[0].label}" verwijst naar ${featuredProductMismatches[0].namedUrl}, terwijl de prijs naar ${featuredProductMismatches[0].priceUrl} verwijst. Beide links werken technisch, maar wijzen naar verschillende bestemmingen.` : productCardMismatches.length > 0 ? `Binnen één productkaart verwijzen onderdelen naar verschillende productbestemmingen: ${productCardMismatches[0].urls.join(" ↔ ")}. De links werken technisch, maar lijken niet bij hetzelfde product te horen.` : `Mogelijke verkeerde productbestemming gevonden: "${semanticLinkMismatches[0]?.context}" verwijst naar ${semanticLinkMismatches[0]?.finalUrl || semanticLinkMismatches[0]?.url}. De URL werkt technisch, maar de productnaam en bestemming delen geen duidelijke producttermen.`, "Controleer handmatig of titel/afbeelding/prijs binnen dezelfde productkaart naar hetzelfde product verwijzen. Markeer dit pas als definitieve fout na bevestiging.", 2, 5)
    );

    // Extended audit signals: trust, ecommerce quality, URL hygiene, social metadata and multilingual SEO.
    const placeholderMatches = text.match(/\[(?:kvk|btw|adres|e-?mail|email|telefoon|phone|address|postcode|plaats|company|naam)\]/gi) || [];
    const hasPlaceholders = placeholderMatches.length > 0;
    const normalizeLegalText = (value: string) =>
      safeDecodeURIComponent(value)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[_-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    const legalAnchorEvidence = [...html.matchAll(/<a\b([^>]*)href\s*=\s*["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi)]
      .map((match) => {
        const attrs = (match[1] || "") + " " + (match[3] || "");
        const href = decode(match[2] || "");
        const label = stripHtml(match[4] || "");
        const aria = attrFromTag("<a " + attrs + ">", "aria-label");
        const titleAttr = attrFromTag("<a " + attrs + ">", "title");
        return { href, label, aria, title: titleAttr, haystack: normalizeLegalText([href, label, aria, titleAttr].join(" ")) };
      });
    const legalLexicon = {
      privacy: /\b(?:privacy|privacybeleid|privacy policy|privacidade|privatnost\w*|zasebnost\w*|datenschutz|confidentialite|vie privee|privacidad|riservatezza)\b/i,
      cookies: /\b(?:cookie\w*|piskotk\w*|kolacic\w*|galleta\w*|biscott\w*)\b/i,
      terms: /\b(?:voorwaarden|terms|conditions|agb|cgv|condiciones|condizioni|termos|uvjet\w*|pogoj\w*|conditions generales)\b/i,
      contact: /\b(?:contact\w*|kontakt\w*|contatt\w*|contacto\w*|klantenservice|customer service|support|helpdesk|help center|help centre|assistenza\w*|apoio ao cliente|pomoc\w*)\b/i,
    };
    const findLegalSignal = (pattern: RegExp) => legalAnchorEvidence.find((item) => pattern.test(item.haystack)) || null;
    const privacyEvidence = findLegalSignal(legalLexicon.privacy);
    const cookieEvidence = findLegalSignal(legalLexicon.cookies);
    const termsEvidence = findLegalSignal(legalLexicon.terms);
    const contactEvidence = findLegalSignal(legalLexicon.contact);
    const hasPrivacyLink = Boolean(privacyEvidence);
    const hasCookieLink = Boolean(cookieEvidence);
    const hasTermsLink = Boolean(termsEvidence);
    const hasContactLink = Boolean(contactEvidence);
    const legalLanguageCode = (lang || "").toLowerCase().split("-")[0];
    const legalLanguageSupported = new Set(["nl","en","it","pt","sl","hr","de","fr","es"]).has(legalLanguageCode);
    const legalEvidenceSummary = [privacyEvidence && `privacy: "${privacyEvidence.label || privacyEvidence.aria || privacyEvidence.title}" → ${privacyEvidence.href}`, cookieEvidence && `cookies: "${cookieEvidence.label || cookieEvidence.aria || cookieEvidence.title}" → ${cookieEvidence.href}`, contactEvidence && `contact: "${contactEvidence.label || contactEvidence.aria || contactEvidence.title}" → ${contactEvidence.href}`].filter(Boolean).join(" · ");
    const formControls = [...html.matchAll(/<(input|select|textarea)\b([^>]*)>/gi)];
    const wrappingLabelRanges = [...html.matchAll(/<label\b[^>]*>[\s\S]*?<\/label>/gi)]
      .map((match) => ({ start: match.index ?? -1, end: (match.index ?? -1) + match[0].length }));
    const unlabeledFormControls = formControls.filter((match) => {
      const attrs=match[2]||"";
      const type=(attrs.match(/\btype\s*=\s*["']?([^"'\s>]+)/i)?.[1]||"").toLowerCase();
      if(["hidden","submit","button","reset","image"].includes(type)) return false;
      const id=attrs.match(/\bid\s*=\s*["']([^"']+)["']/i)?.[1]||"";
      const hasAria=/\baria-label(?:ledby)?\s*=\s*["'][^"']+["']/i.test(attrs);
      const hasTitle=/\btitle\s*=\s*["'][^"']+["']/i.test(attrs);
      const labelPattern=id ? new RegExp("<label[^>]+for\s*=\s*[\\\"']"+id.replace(/[^a-zA-Z0-9_-]/g,"")+"[\\\"']","i") : null;
      const controlIndex=match.index ?? -1;
      const hasWrappingLabel=controlIndex >= 0 && wrappingLabelRanges.some((range) => controlIndex > range.start && controlIndex < range.end);
      return !hasAria&&!hasTitle&&!hasWrappingLabel&&!(labelPattern&&labelPattern.test(html));
    }).length;
    const buttonTags=[...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi)];
    const emptyButtonMatches=buttonTags.filter((match)=>{
      const attrs=match[1]||"";
      const body=match[2]||"";
      const hasText=Boolean(stripHtml(body).trim());
      const hasAccessibleAttribute=/\baria-label(?:ledby)?\s*=\s*["'][^"']+["']/i.test(attrs)||/\btitle\s*=\s*["'][^"']+["']/i.test(attrs);
      const hasNamedImage=/<img\b[^>]*\balt\s*=\s*["'][^"']+["'][^>]*>/i.test(body);
      const hasInlineSvgName=/<svg\b[^>]*(?:\baria-label\s*=\s*["'][^"']+["']|\brole\s*=\s*["']img["'])[^>]*>[\s\S]*?<title\b[^>]*>\s*[^<]+\s*<\/title>/i.test(body);
      return !hasText&&!hasAccessibleAttribute&&!hasNamedImage&&!hasInlineSvgName;
    });
    const emptyButtons=emptyButtonMatches.length;
    const emptyButtonEvidence=emptyButtonMatches.slice(0,3).map((match)=>{
      const attrs=(match[1]||"").replace(/\s+/g," ").trim().slice(0,220);
      return `<button${attrs ? " "+attrs : ""}>…</button>`;
    });
    // Missing image alt is already scored by IMAGE_ALT_MISSING. Keep the accessibility
    // aggregate independent so one defect cannot lower the audit twice.
    const accessibilityIssueCount=unlabeledFormControls+emptyButtons;
    const dutchEuroDecimalPattern = /€\s?\d{1,3}(?:[.,]\d{3})*[.]\d{2}\b/g;
    const priceFormatMatches = text.match(dutchEuroDecimalPattern) || [];
    const hasDotDecimalPrices = priceFormatMatches.length > 0;
    const parseVisiblePrice = (value: string) => {
      const compact = value.replace(/\s/g, "").replace(/[^0-9.,-]/g, "");
      if (!compact) return null;
      const lastDot = compact.lastIndexOf(".");
      const lastComma = compact.lastIndexOf(",");
      const separator = lastDot > lastComma ? "." : lastComma > lastDot ? "," : "";
      let normalized = compact;
      if (separator) {
        const separatorIndex = Math.max(lastDot, lastComma);
        const decimals = compact.length - separatorIndex - 1;
        const other = separator === "." ? "," : ".";
        if (decimals === 3 && !compact.slice(separatorIndex + 1).includes(other)) {
          // 2.699 / 2,699 is a thousands-group price, not 2.69.
          normalized = compact.replace(/[.,]/g, "");
        } else {
          normalized = compact.replace(new RegExp("\\" + other, "g"), "");
          if (separator === ",") normalized = normalized.replace(",", ".");
        }
      }
      const numeric = Number(normalized);
      return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
    };
    const explicitProductPriceCandidates = [...new Set(
      [...html.matchAll(/<(?:meta|span|div|p)[^>]*(?:itemprop\s*=\s*["']price["']|property\s*=\s*["']product:price:amount["']|class\s*=\s*["'][^"']*(?:product[-_ ]?price|price)[^"']*["'])[^>]*?(?:content\s*=\s*["']([^"']+)["']|>([^<]{0,80}))/gi)]
        .flatMap((match) => {
          const tag = String(match[0] || "");
          const raw = String(match[1] || match[2] || "");
          const rawPrice = raw.match(/(\d{1,9}(?:[.,]\d{2})?)/)?.[1];
          if (!rawPrice) return [];
          // Schema-style/meta price attributes use a machine-readable decimal value.
          // Visible class text follows locale formatting. Treating "21850" from a
          // content attribute as 21.85 created false product-price mismatches.
          const machineReadable = /(?:itemprop\s*=\s*["']price["']|property\s*=\s*["']product:price:amount["'])/i.test(tag) && /content\s*=/i.test(tag);
          const parsed = machineReadable ? Number(rawPrice.replace(",", ".")) : parseVisiblePrice(rawPrice);
          return parsed !== null && Number.isFinite(parsed) && parsed >= 0 ? [parsed] : [];
        })
    )].slice(0, 20);
    // Broad price evidence is intentionally currency-aware. It remains weaker
    // than explicit product markup, but should not silently exclude non-EUR shops.
    const broadVisiblePriceCandidates = [...new Set(
      [...text.matchAll(/(?:€\s*|£\s*|\$\s*|(?:EUR|GBP|USD)\s*)(\d{1,6}(?:[.,]\d{2})?)/gi)]
        .flatMap((match) => {
          const parsed = parseVisiblePrice(String(match[1]));
          return parsed === null ? [] : [parsed];
        })
    )].slice(0, 20);
    const visiblePriceCandidates = explicitProductPriceCandidates.length ? explicitProductPriceCandidates : broadVisiblePriceCandidates;
    const visiblePriceEvidenceStrength = explicitProductPriceCandidates.length ? "explicit_product_markup" : broadVisiblePriceCandidates.length ? "broad_page_text" : "none";
    const explicitPriceMarkupText = explicitProductPriceCandidates.length
      ? [...html.matchAll(/<(?:meta|span|div|p)[^>]*(?:itemprop\s*=\s*["']price["']|property\s*=\s*["']product:price:(?:amount|currency)["']|class\s*=\s*["'][^"']*(?:product[-_ ]?price|price)[^"']*["'])[^>]*?(?:content\s*=\s*["']([^"']+)["']|>([^<]{0,80}))/gi)]
          .map((match) => String(match[0] || "")).join(" ")
      : "";
    const explicitVisibleCurrencyCodes = [...new Set([
      ...(explicitPriceMarkupText.match(/\b(?:EUR|GBP|USD)\b/gi) || []).map((value) => value.toUpperCase()),
      ...(explicitPriceMarkupText.includes("€") ? ["EUR"] : []),
      ...(explicitPriceMarkupText.includes("£") ? ["GBP"] : []),
      ...(explicitPriceMarkupText.includes("$") ? ["USD"] : []),
    ])];
    const pageCurrencyCodes = [...new Set([
      ...(text.match(/\b(?:EUR|GBP|USD)\b/gi) || []).map((value) => value.toUpperCase()),
      ...(text.includes("€") ? ["EUR"] : []),
      ...(text.includes("£") ? ["GBP"] : []),
      ...(text.includes("$") ? ["USD"] : []),
    ])];
    const visibleCurrencyCodes = explicitVisibleCurrencyCodes.length ? explicitVisibleCurrencyCodes : pageCurrencyCodes;
    const structuredCurrencyCodes = [...new Set(productOfferEvidence.flatMap((product) => product.offers.map((offer) => offer.currency).filter((currency) => /^[A-Z]{3}$/.test(currency))))];
    // A currency mismatch is actionable only when the visible price is tied to
    // explicit product markup. Currency symbols elsewhere on the page may belong
    // to selectors, shipping examples or other products and are not contradiction proof.
    const currencyConflict = isProductPage && visiblePriceEvidenceStrength === "explicit_product_markup" && structuredCurrencyCodes.length === 1 && visibleCurrencyCodes.length === 1 && structuredCurrencyCodes[0] !== visibleCurrencyCodes[0];
    const mixedVisibleCurrencies = hasEcommerceSignal && visibleCurrencyCodes.length > 1 && explicitVisibleCurrencyCodes.length > 1;
    const pricingCurrencyEvidence = {
      visibleCurrencies: visibleCurrencyCodes,
      structuredCurrencies: structuredCurrencyCodes,
      visiblePriceCount: visiblePriceCandidates.length,
      visiblePriceEvidenceStrength,
      structuredPriceCount: productOfferEvidence.flatMap((product) => product.offers).filter((offer) => offerHasPrice(offer)).length,
      currencyConflict,
      mixedVisibleCurrencies,
    };
    const structuredPriceCandidates = [...new Set(
      productOfferEvidence
        .flatMap((product) => product.offers.map((offer) => offer.price))
        .map((value) => typeof value === "number" ? value : Number(String(value ?? "").replace(",", ".")))
        .filter((value): value is number => Number.isFinite(value))
    )].slice(0, 20);
    const canCompareVisibleAndStructuredPrice = hasProductSignal && visiblePriceCandidates.length > 0 && structuredPriceCandidates.length > 0;
    const hasMatchingVisibleStructuredPrice = canCompareVisibleAndStructuredPrice && structuredPriceCandidates.some((schemaPrice) =>
      visiblePriceCandidates.some((visiblePrice) => Math.abs(visiblePrice - schemaPrice) < 0.005)
    );
    const visibleStockSignal = /\b(op voorraad|voorraad|in stock|out of stock|uitverkocht|sold out|pre-?order|backorder|niet op voorraad|auf lager|nicht auf lager|ausverkauft|vorbestellung|en stock|rupture de stock|épuisé|epuise|précommande|precommande|disponibile|disponibilità|disponibilita|esaurito|non disponibile|preordine|agotado|sin stock|no disponible|preventa)\b/i.test(text);
    // Availability must be unambiguous before comparing it with Product/Offer schema.
    // Global navigation, recommendations and hidden variant text can contain several states.
    const visibleAvailabilityMatches = {
      out_of_stock: text.match(/\b(niet op voorraad|out of stock|uitverkocht|sold out|nicht auf lager|ausverkauft|rupture de stock|épuisé|epuise|esaurito|non disponibile|agotado|sin stock|no disponible)\b/gi) || [],
      preorder: text.match(/\b(pre-?order|vorbestellung|précommande|precommande|preordine|preventa)\b/gi) || [],
      backorder: text.match(/\b(backorder|lieferrückstand|lieferrueckstand|commande en attente|ordine arretrato|pedido pendiente)\b/gi) || [],
      in_stock: text.match(/\b(op voorraad|in stock|auf lager|en stock|disponibile|disponibilità|disponibilita)\b/gi) || [],
    };
    type AvailabilityState = "out_of_stock" | "preorder" | "backorder" | "in_stock";
    const visibleAvailabilityStates: AvailabilityState[] = (Object.keys(visibleAvailabilityMatches) as AvailabilityState[])
      .filter((state) => visibleAvailabilityMatches[state].length > 0);
    const visibleAvailabilityState = visibleAvailabilityStates.length === 1 ? visibleAvailabilityStates[0] : null;
    const visibleAvailabilityAmbiguous = visibleAvailabilityStates.length > 1;
    const structuredAvailabilityValues = [...new Set(productOfferEvidence.flatMap((product) => product.offers.map((offer) => offer.availability).filter(Boolean)))];
    const structuredAvailabilityStates = [...new Set(structuredAvailabilityValues.map((value) =>
      /OutOfStock|SoldOut|Discontinued/i.test(value) ? "out_of_stock" :
      /PreOrder/i.test(value) ? "preorder" :
      /BackOrder/i.test(value) ? "backorder" :
      /InStock|LimitedAvailability|OnlineOnly|InStoreOnly/i.test(value) ? "in_stock" : "unknown"
    ).filter((value) => value !== "unknown"))];
    const availabilityContradiction = Boolean(visibleAvailabilityState && structuredAvailabilityStates.length && !structuredAvailabilityStates.includes(visibleAvailabilityState));
    const genericVariantSelectorSignal = /<(?:select|button|input)[^>]*(?:name|id|class|aria-label|data-option-label)\s*=\s*["'][^"']*(?:variant|option|size|maat|color|colour|kleur|swatch)[^"']*["']/i.test(html);
    const magentoVariantSelectorSignal = /(?:swatch-attribute|swatch-option|super_attribute|product-options-wrapper|data-role\s*=\s*["']swatch-options["']|data-mage-init\s*=\s*["'][^"']*(?:configurable|swatch))/i.test(html);
    const shopifyVariantSelectorSignal = /(?:name\s*=\s*["'](?:id|options\[[^\]]+\])["']|product-form__input|variant-radios|variant-selects)/i.test(html);
    const wooVariantSelectorSignal = /(?:variations_form|woocommerce-variation|attribute_pa_|name\s*=\s*["']attribute_[^"']+["'])/i.test(html);
    const hasVariantSelectorSignal = hasProductSignal && (
      genericVariantSelectorSignal ||
      magentoVariantSelectorSignal ||
      shopifyVariantSelectorSignal ||
      wooVariantSelectorSignal
    );
    const pathSegments = finalUrl.pathname.split("/").filter(Boolean).map((segment) => safeDecodeURIComponent(segment).toLowerCase().trim());
    const duplicatePathSegments = pathSegments.filter((segment, index) => index > 0 && segment === pathSegments[index - 1]);
    // Repeated locale segments such as /nl/nl/ can be a deliberate international routing convention.
    const actionableDuplicatePathSegments = duplicatePathSegments.filter((segment) => !localeSegmentPattern.test(segment));
    const hasDuplicatePathSegments = actionableDuplicatePathSegments.length > 0;
    const imageSrcs = [...html.matchAll(/<img\b[^>]*>/gi)].map((m) => {
      const tag = m[0];
      return attrFromTag(tag, "src") || attrFromTag(tag, "data-src") || attrFromTag(tag, "data-lazy-src") || "";
    }).filter(Boolean);
    const stockImageHosts = ["images.unsplash.com", "source.unsplash.com", "unsplash.com", "pexels.com", "images.pexels.com", "pixabay.com", "images.pixabay.com"];
    const externalImageUrls = imageSrcs.filter((src) => {
      try { return new URL(src, finalUrl).hostname !== finalUrl.hostname; } catch { return false; }
    });
    const stockImageUrls = externalImageUrls.filter((src) => {
      try { return stockImageHosts.some((host) => new URL(src, finalUrl).hostname === host || new URL(src, finalUrl).hostname.endsWith("." + host)); } catch { return false; }
    });
    const hasStockImages = stockImageUrls.length > 0;
    const hasExternalImageHotlinks = externalImageUrls.length > 0;
    // stripHtml keeps entities encoded, so decode the visible text before checking rendering.
    // A normal "&amp;" in source HTML renders as "&" and is not a visible escape defect.
    const decodedVisibleText = decode(text);
    const hasVisibleHtmlEscape = /&(?:amp|quot|lt|gt|#(?:x[0-9a-f]+|\d+));/i.test(decodedVisibleText);
    const hreflangTags = [...html.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]).filter((tag) => /\brel\s*=\s*["']alternate["']/i.test(tag) && /\bhreflang\s*=/i.test(tag));
    const hreflangValues = hreflangTags.map((tag) => attrFromTag(tag, "hreflang").toLowerCase()).filter(Boolean);
    const hasHreflang = hreflangValues.length > 0;
    const hreflangEntries = hreflangTags.map((tag) => {
      const language = attrFromTag(tag, "hreflang").toLowerCase();
      const href = attrFromTag(tag, "href");
      let validHref = false;
      try {
        const parsed = new URL(href, finalUrl);
        validHref = parsed.protocol === "http:" || parsed.protocol === "https:";
      } catch {}
      const validLanguage = language === "x-default" || /^(?:[a-z]{2,3})(?:-[a-z]{2}|-[0-9]{3})?$/i.test(language);
      return { language, href, validHref, validLanguage };
    });
    const invalidHreflangEntries = hreflangEntries.filter((entry) => !entry.validLanguage || !entry.validHref);
    const hreflangTargetsByLanguage = new Map<string, string[]>();
    for (const entry of hreflangEntries) {
      if (!entry.language || !entry.validHref) continue;
      try {
        const normalizedHref = normalizeScanUrl(new URL(entry.href, finalUrl).toString());
        hreflangTargetsByLanguage.set(entry.language, [...(hreflangTargetsByLanguage.get(entry.language) || []), normalizedHref]);
      } catch {}
    }
    const duplicateHreflangLanguages = [...hreflangTargetsByLanguage.entries()]
      .filter(([, urls]) => urls.length > 1)
      .map(([language]) => language);
    const conflictingHreflangLanguages = [...hreflangTargetsByLanguage.entries()]
      .filter(([, urls]) => new Set(urls).size > 1)
      .map(([language]) => language);
    const identicalDuplicateHreflangLanguages = duplicateHreflangLanguages.filter((language) => !conflictingHreflangLanguages.includes(language));
    const currentNormalizedUrl = normalizeScanUrl(finalUrl.toString());
    const selfHreflangEntries = hreflangEntries.filter((entry) => {
      if (!entry.validHref) return false;
      try { return normalizeScanUrl(new URL(entry.href, finalUrl).toString()) === currentNormalizedUrl; } catch { return false; }
    });
    const documentLanguage = lang.trim().toLowerCase().replace("_", "-");
    const documentLanguageBase = documentLanguage.split("-")[0] || "";
    const hasMatchingSelfHreflang = selfHreflangEntries.some((entry) => {
      if (entry.language === "x-default") return false;
      const hreflangBase = entry.language.split("-")[0] || "";
      return Boolean(documentLanguageBase && hreflangBase === documentLanguageBase);
    });
    const selfHreflangMismatch = Boolean(documentLanguage && selfHreflangEntries.length && !hasMatchingSelfHreflang);
    const hreflangHostMismatches = hreflangEntries.filter((entry) => {
      if (!entry.validHref) return false;
      try {
        const target = new URL(entry.href, finalUrl);
        return target.hostname.replace(/^www\./i, "").toLowerCase() !== finalUrl.hostname.replace(/^www\./i, "").toLowerCase();
      } catch { return false; }
    });
    const languageSelectorSignal = /(?:language|taal|sprache|idioma|lingua|français|deutsch|italiano|español|english|nederlands)\b/i.test(text) && /(?:select|dropdown|menu|switch|\bEN\b|\bNL\b|\bDE\b|\bFR\b|\bES\b|\bIT\b)/i.test(text);
    // A language/country selector alone does not prove equivalent translated URLs exist.
    // Only explicit hreflang markup is strong enough in a single raw-HTML page scan.
    const multilingualUrlEvidence = hasHreflang;
    const organizationSchemaPresent = schemaSet.has("organization");
    const websiteSchemaPresent = schemaSet.has("website");
    const productSchemaPresent = schemaSet.has("product");
    const ga4MeasurementIds = [...new Set(html.match(/\bG-[A-Z0-9]{6,}\b/gi) || [])];
    const googleAdsIds = [...new Set(html.match(/\bAW-[0-9-]+\b/gi) || [])];
    const gtmContainerIds = [...new Set(html.match(/\bGTM-[A-Z0-9]{4,}\b/gi) || [])];
    const hasGtagLoader = /googletagmanager\.com\/gtag\/js/i.test(html);
    const hasGtmLoader = /googletagmanager\.com\/gtm\.js/i.test(html);
    const configuredGa4Ids = [...new Set(
      [...html.matchAll(/gtag\s*\(\s*["']config["']\s*,\s*["'](G-[A-Z0-9]{6,})["']/gi)].map((match) => match[1].toUpperCase())
    )];
    const configuredAdsIds = [...new Set(
      [...html.matchAll(/gtag\s*\(\s*["']config["']\s*,\s*["'](AW-[0-9-]+)["']/gi)].map((match) => match[1].toUpperCase())
    )];
    const hasGa4 = ga4MeasurementIds.length > 0 && (hasGtagLoader || configuredGa4Ids.length > 0 || hasGtmLoader);
    const hasGoogleAdsTag = googleAdsIds.length > 0 && (hasGtagLoader || configuredAdsIds.length > 0 || hasGtmLoader);
    const hasGtm = gtmContainerIds.length > 0 && hasGtmLoader;
    const adsTrackingSignals = [hasGa4, hasGoogleAdsTag, hasGtm].filter(Boolean).length;
    // Only explicit analytics calls or dataLayer.push objects count as event evidence.
    // Marketing copy and arbitrary object literals must never become tracking proof.
    const conversionEventNames: string[] = [];
    const gtagEventPattern = /gtag\s*\(\s*["']event["']\s*,\s*["']([^"']+)["']/gi;
    for (const match of html.matchAll(gtagEventPattern)) {
      if (match[1]) conversionEventNames.push(match[1].toLowerCase());
    }
    const dataLayerPushPattern = /dataLayer\.push\s*\(\s*\{([\s\S]{0,2500}?)\}\s*\)/gi;
    for (const push of html.matchAll(dataLayerPushPattern)) {
      const eventMatch = push[1]?.match(/(?:["']event["']|\bevent\b)\s*:\s*["']([^"']+)["']/i);
      if (eventMatch?.[1]) conversionEventNames.push(eventMatch[1].toLowerCase());
    }
    const uniqueConversionEventNames = [...new Set(conversionEventNames)];
    const hasConversionSignal = uniqueConversionEventNames.some((name: string) =>
      /^(purchase|generate_lead|sign_up|conversion|begin_checkout|add_to_cart)$/.test(name)
    );
    const googleAdsSendToLabels = [...new Set(
      [...html.matchAll(/send_to\s*:\s*["'](AW-\d+\/[^"']+)["']/gi)].map((match) => match[1])
    )];
    const hasExplicitAdsConversionSnippet = googleAdsSendToLabels.length > 0;
    const hasConsentModeSignal = /gtag\s*\(\s*["']consent["']\s*,\s*["'](?:default|update)["']/i.test(html) ||
      /ad_storage|analytics_storage|ad_user_data|ad_personalization/i.test(html);
    const merchantFeedLinks = [...html.matchAll(/<link\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi)]
      .map((match) => match[1])
      .filter((href) => /(?:google[-_ ]?merchant|merchant[-_ ]?center|product[-_ ]?feed|shopping[-_ ]?feed|products?\.(?:xml|rss|atom)|feed\/products?)/i.test(href));
    const merchantFeedTextSignal = /\b(?:google merchant center|merchant center|google shopping|product feed|shopping feed)\b/i.test(text);
    const hasMerchantFeedHint = merchantFeedLinks.length > 0 || merchantFeedTextSignal;
    const merchantProductReadiness = productSchemaObjects.length > 0 && hasCompleteProductOffer;
    // Keep structured and visible commerce evidence separate. A footer link or
    // JSON-LD policy proves availability of information, not that product-page
    // shoppers can actually see it where they make the purchase decision.
    const visibleShippingMatches = text.match(/(?:verzendkosten|verzending|levering|bezorging|ophalen|afhalen|shipping(?:\s+(?:cost|costs|information))?|delivery(?:\s+(?:cost|costs|information))?|versand(?:kosten)?|lieferung|frais de livraison|livraison|spedizione|consegna|gastos de envío|envío)/gi) || [];
    const visibleReturnsMatches = text.match(/(?:retour(?:neren|beleid)?|herroepingsrecht|bedenktijd|14\s*dagen|return(?:s| policy)?|refund(?: policy)?|rückgabe|widerrufsrecht|retour(?:s)?|droit de rétractation|reso|diritto di recesso|devolución|derecho de desistimiento)/gi) || [];
    const hasVisibleShippingSignal = visibleShippingMatches.length > 0;
    const hasVisibleReturnsSignal = visibleReturnsMatches.length > 0;
    const hasShippingSignal = hasStructuredShipping || hasVisibleShippingSignal;
    const hasReturnsSignal = hasStructuredReturns || hasVisibleReturnsSignal;
    const hasReviewPlatformSignal = /trustpilot|kiyoh|google reviews|reviews?\.io/i.test(text);
    const hasCheckoutTrustSignal = /checkout|afrekenen|ideal|iDEAL|visa|mastercard|bancontact|klarna|mollie|pay\s*pal|secure payment|veilig betalen/i.test(text);
    const ecommerceVariantUrlSignal = isProductPage && /[?&](variant|sku|color|colour|size|maat)=/i.test(finalUrl.search);
    const cartHrefSignal = links.some((href) => /(?:\/cart(?:\/|$|[?#])|\/basket(?:\/|$|[?#])|\/winkelwagen(?:\/|$|[?#]))/i.test(href));
    const checkoutHrefSignal = links.some((href) => /(?:\/checkout(?:\/|$|[?#])|\/afrekenen(?:\/|$|[?#])|\/kassa(?:\/|$|[?#]))/i.test(href));
    const addToCartMarkupSignal = hasStrongCommerceAction || /(?:add[-_]?to[-_]?cart|add_to_cart|product-form|name\s*=\s*["']add-to-cart["'])/i.test(html);
    const shippingCostSignal = /(?:verzendkosten|shipping cost|delivery cost|bezorgkosten|versandkosten|frais de livraison|spese di spedizione|gastos de envío)\s*[:€£$]?\s*(?:gratis|free|\d)/i.test(text);
    const paymentMethodSignal = /\b(?:ideal|visa|mastercard|bancontact|klarna|paypal|apple pay|google pay|mollie)\b/i.test(text);
    const checkoutFunnelEvidence = {
      productPage: isProductPage,
      addToCart: addToCartMarkupSignal,
      cartLink: cartHrefSignal,
      checkoutLink: checkoutHrefSignal,
      shippingInformation: hasShippingSignal,
      shippingInformationVisible: hasVisibleShippingSignal,
      shippingInformationStructured: hasStructuredShipping,
      returnsInformationVisible: hasVisibleReturnsSignal,
      returnsInformationStructured: hasStructuredReturns,
      shippingCostVisible: shippingCostSignal,
      paymentMethodsVisible: paymentMethodSignal,
      staticHtmlOnly: !javascriptExecuted,
      javascriptRendered: javascriptExecuted,
      interactiveFlowExecuted: false,
    };
    const webshopClaimMatches = text.match(/(?:snelle levering|14\s*dagen retour|gratis verzending|nederlandse webshop|voor\s*\d+\s*uur\s*besteld)/gi) || [];
    const hasWebshopClaims = webshopClaimMatches.length > 0;
    // EU consumer / Omnibus signals are evidence-only. Static HTML can surface
    // transparency signals but cannot certify legal compliance or historical prices.
    const discountClaimMatches = text.match(/(?:\b(?:sale|korting|discount|rabatt|remise|sconto|descuento)\b|[-−]\s?\d{1,2}\s?%|\d{1,2}\s?%\s*(?:korting|off|discount))/gi) || [];
    const referencePriceMatches = text.match(/(?:van|was|adviesprijs|oude prijs|previous price|was price|statt|prix avant|prezzo precedente|precio anterior)\s*[:]?\s*(?:€|£|\$)\s*\d[\d.,]*|(?:van|was|adviesprijs|oude prijs|previous price|was price|statt|prix avant|prezzo precedente|precio anterior)\s*[:]?\s*\d[\d.,]*\s*(?:EUR|GBP|USD|CHF|CAD|AUD)\b/gi) || [];
    // A generic "sale" word in navigation/banner copy is too weak to judge a product.
    // Require a product page or an explicit percentage/price-reduction expression before
    // raising the EU reference-price signal. This is local parsing only: no extra requests.
    const explicitDiscountClaimMatches = discountClaimMatches.filter((value) =>
      /\d{1,2}\s?%|[-−]\s?\d{1,2}\s?%|\b\d{1,2}\s?%\s*(?:korting|off|discount|rabatt|remise|sconto|descuento)\b/i.test(value)
    );
    const hasDiscountClaim = isProductPage
      ? discountClaimMatches.length > 0
      : explicitDiscountClaimMatches.length > 0;
    const hasReferencePriceSignal = referencePriceMatches.length > 0;
    const reviewTransparencySignal = /(?:geverifieerde aankoop|verified purchase|verified buyer|reviewbeleid|review policy|reviews? worden|beoordelingen worden|wie kan.*review|how.*reviews?)/i.test(text);
    const reviewContentSignal = /\b(?:reviews?|beoordelingen|klantbeoordelingen|avis clients|bewertungen|recensioni|reseñas)\b/i.test(text);
    const scarcityMatches = text.match(/(?:nog\s+(?:maar\s+)?\d+\s+(?:op voorraad|beschikbaar)|only\s+\d+\s+left|last\s+\d+|nur\s+noch\s+\d+|plus que\s+\d+|solo\s+\d+\s+disponibili|solo quedan\s+\d+)/gi) || [];
    const hasScarcityClaim = hasEcommerceSignal && !transportBookingIdentity && scarcityMatches.length > 0;
    const personalizedPricingSignal = /(?:gepersonaliseerde prijs|personalised price|personalized price|personalisierter preis|prix personnalisé|prezzo personalizzato|precio personalizado)/i.test(text);
    const consumerLawSignals = {
      discountClaim: hasDiscountClaim,
      referencePriceVisible: hasReferencePriceSignal,
      discountExamples: (isProductPage ? discountClaimMatches : explicitDiscountClaimMatches).slice(0, 3),
      referencePriceExamples: referencePriceMatches.slice(0, 3),
      returnsVisible: hasReturnsSignal,
      reviewContent: reviewContentSignal,
      reviewTransparency: reviewTransparencySignal,
      scarcityClaim: hasScarcityClaim,
      scarcityExamples: scarcityMatches.slice(0, 3),
      personalizedPricingDisclosure: personalizedPricingSignal,
      businessIdentityVisible: hasVisibleBusinessIdentity,
      businessContactVisible: hasBusinessContactDetails,
      legalConclusion: false,
    };

    const titleWords = title.toLowerCase().split(/[^a-z0-9à-ÿ]+/i).filter(Boolean);
    const titleUniqueWordRatio = titleWords.length ? new Set(titleWords).size / titleWords.length : 1;
    const descriptionWords = description.toLowerCase().split(/[^a-z0-9à-ÿ]+/i).filter(Boolean);
    const descriptionUniqueWordRatio = descriptionWords.length ? new Set(descriptionWords).size / descriptionWords.length : 1;
    const titleQualityIssue = Boolean(title && titleWords.length >= 3 && titleUniqueWordRatio < 0.55);
    const descriptionQualityIssue = Boolean(description && descriptionWords.length >= 8 && descriptionUniqueWordRatio < 0.5);


    // If rendering failed on a JS-driven page, raw HTML absence is not proof of absence.
    const metadataMayBeClientRendered = javascriptCandidate && !javascriptExecuted;
    // One shared rule for text/link evidence. A thin client shell is insufficient
    // evidence for negative content, trust or commercial-link conclusions.
    const thinRawHtmlEvidence = !javascriptExecuted && (
      rawVisibleWords < 60 ||
      (rawVisibleWords < 100 && rawScriptCount >= 4) ||
      /<div\b[^>]*\bid\s*=\s*["'](?:root|app|__next|__nuxt)["'][^>]*>\s*<\/div>/i.test(rawHtml)
    );

    const titleLengthPoints = (length: number) => {
      if (length >= 30 && length <= 60) return 10;
      if (length >= 25 && length <= 65) return 8;
      if (length >= 20 && length <= 70) return 6;
      return 4;
    };

    const descriptionLengthPoints = (length: number) => {
      if (length >= 70 && length <= 200) return 10;
      if ((length >= 50 && length < 70) || (length > 200 && length <= 230)) return 8;
      if ((length >= 30 && length < 50) || (length > 230 && length <= 260)) return 6;
      return 4;
    };

    seoChecks.push(
      !title
        ? metadataMayBeClientRendered
          ? check("unable_to_confirm", "title", "seo", "Meta title", "De meta title kon niet betrouwbaar worden bevestigd omdat deze JavaScript-pagina niet volledig kon worden gerenderd.", "Controleer de title opnieuw met een volledige render voordat je een wijziging maakt.", 0, 10)
          : check("fail", "title", "seo", "Meta title", "Er is geen meta title gevonden.", "Voeg een unieke, beschrijvende title toe.", 0, 10)
        : titleQualityIssue
          ? check("warning", "title", "seo", "Meta title", `De title is ${title.length} tekens, maar bevat relatief veel herhaalde woorden.`, "Herschrijf de title natuurlijker en voorkom keyword stuffing.", 6, 10)
          : title.length >= 30 && title.length <= 60
            ? check("pass", "title", "seo", "Meta title", `De title is ${title.length} tekens en valt binnen de aanbevolen lengte.`, "Maak de title uniek, duidelijk en relevant voor de zoekintentie.", 10, 10)
            : check("warning", "title", "seo", "Meta title", `De title is ${title.length} tekens. Richtwaarde: 30–60 tekens; de punten lopen geleidelijk af naarmate de lengte verder van deze band ligt.`, "Herschrijf de title zodat onderwerp, merk en zoekintentie direct duidelijk zijn.", titleLengthPoints(title.length), 10)
    );
    seoChecks.push(
      !description
        ? metadataMayBeClientRendered
          ? check("unable_to_confirm", "description", "seo", "Meta description", "De meta description kon niet betrouwbaar worden bevestigd omdat deze JavaScript-pagina niet volledig kon worden gerenderd.", "Controleer de description opnieuw met een volledige render voordat je een wijziging maakt.", 0, 10)
          : check("fail", "description", "seo", "Meta description", descriptionState === "empty" ? "De meta description-tag is aanwezig, maar de content is leeg." : "Er is geen meta description-tag gevonden.", "Laat RankFix AI een nieuwe meta description maken op basis van de pagina.", 0, 10)
        : descriptionQualityIssue
          ? check("warning", "description", "seo", "Meta description", `De description is ${description.length} tekens, maar bevat relatief veel herhaalde woorden.`, "Maak de description natuurlijker en voorkom keyword stuffing.", 6, 10)
          : description.length >= 70 && description.length <= 200
            ? check("pass", "description", "seo", "Meta description", description.length >= 120 && description.length <= 160
                ? `De description is ${description.length} tekens en goed gevuld.`
                : `De description is ${description.length} tekens. De klassieke 120–160 tekens is een optimalisatierichtlijn, geen technische SEO-eis; deze aanwezige description wordt daarom niet als fout bestraft.`, "Houd de description concreet, uniek en passend bij de zoekintentie; optimaliseer lengte alleen wanneer dat de zoekpreview en boodschap verbetert.", 10, 10)
            : check("warning", "description", "seo", "Meta description", `De description is ${description.length} tekens en is uitzonderlijk ${description.length < 70 ? "kort" : "lang"}. Dit is optimalisatieadvies, geen op zichzelf bewezen rankingfout; de punten lopen geleidelijk af naarmate de lengte extremer wordt.`, "Controleer of de description de pagina duidelijk samenvat en herschrijf alleen wanneer de zoekpreview of boodschap daar aantoonbaar van profiteert.", descriptionLengthPoints(description.length), 10)
    );
    seoChecks.push(h1s.length === 1
      ? check("pass", "h1", "seo", "H1-heading", "Er is precies één H1-heading gevonden.", "Behoud één duidelijke primaire H1.", 8, 8)
      : h1s.length === 0
        ? metadataMayBeClientRendered
          ? check("unable_to_confirm", "h1", "seo", "H1-heading", "De H1 kon niet betrouwbaar worden bevestigd omdat deze JavaScript-pagina niet volledig kon worden gerenderd.", "Controleer de headingstructuur opnieuw met een volledige render.", 0, 8)
          : check("warning", "h1", "seo", "H1-heading", "Er is geen H1-heading gevonden. Dit is een structuur-/toegankelijkheidsaanbeveling en geen op zichzelf bewezen rankingfout.", "Voeg een duidelijke primaire H1 toe wanneer dat past bij de pagina-inhoud.", 6, 8)
        : check("pass", "h1", "seo", "H1-heading", `Er zijn ${h1s.length} H1-headings gevonden. Meerdere H1-elementen zijn technisch toegestaan; RankFix behandelt dit daarom als structuuradvies en niet als bewezen SEO-probleem.`, "Overweeg één duidelijke primaire H1 en gebruik H2/H3 voor secties wanneer dat de documentstructuur begrijpelijker maakt.", 8, 8)
    );
    const subheadingCount = headings.length;
    const hasH2 = headings.some((h) => h.level === 2);
    const headingStructurePoints = hasH2 ? 7 : subheadingCount >= 3 ? 6 : subheadingCount >= 1 ? 5 : 4;
    seoChecks.push(subheadingCount > 0 && hasH2
      ? check("pass", "headings", "seo", "Heading-structuur", h1s.length > 0
          ? `Er zijn ${subheadingCount} H2–H6 headings gevonden naast de H1.`
          : metadataMayBeClientRendered
            ? `Er zijn ${subheadingCount} H2–H6 headings gevonden. De H1 wordt afzonderlijk gecontroleerd en kon op deze JavaScript-pagina niet betrouwbaar worden bevestigd.`
            : `Er zijn ${subheadingCount} H2–H6 headings gevonden. Er is geen H1 gevonden; de H1 wordt afzonderlijk beoordeeld.`,
        "Gebruik headings om onderwerpen en subonderwerpen logisch te groeperen.", 7, 7)
      : metadataMayBeClientRendered && subheadingCount === 0
        ? check("unable_to_confirm", "headings", "seo", "Heading-structuur", "De headingstructuur kon niet betrouwbaar worden bevestigd omdat deze JavaScript-pagina niet volledig kon worden gerenderd.", "Controleer de headingstructuur opnieuw met een volledige render voordat je headings toevoegt of wijzigt.", 0, 7)
        : check("warning", "headings", "seo", "Heading-structuur", subheadingCount
            ? `Er zijn ${subheadingCount} subheading(s) gevonden, maar geen duidelijke H2-laag. Dit is structuuradvies en geen bewezen rankingfout.`
            : "Er zijn geen H2–H6 subheadings gevonden. Dit is structuuradvies en geen bewezen rankingfout.",
          "Gebruik H2/H3-secties wanneer die de inhoud logisch groeperen; voeg geen headings toe puur voor de score.", headingStructurePoints, 7)
    );
    let canonicalUrl: URL | null = null;
    let canonicalInvalid = false;
    try {
      canonicalUrl = canonical ? new URL(canonical, finalUrl) : null;
      if (canonicalUrl && !/^https?:$/.test(canonicalUrl.protocol)) {
        canonicalInvalid = true;
        canonicalUrl = null;
      }
    } catch {
      canonicalInvalid = Boolean(canonical);
    }

    const normalizeCanonicalTarget = (url: URL) => {
      const normalized = new URL(url.toString());
      normalized.hash = "";
      normalized.pathname = normalized.pathname.replace(/\/+$/, "") || "/";
      ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "gbraid", "wbraid", "fbclid", "msclkid", "gad_source", "gad_campaignid", "gad_adgroupid", "gad_creative", "_gl", "_up", "_gs", "from_srp", "prevent-auto-open-privacy-settings"].forEach((param) => normalized.searchParams.delete(param));
      return normalized.toString();
    };

    const canonicalHost = (host: string) => host.toLowerCase().replace(/^www\./, "");
    const canonicalTarget = canonicalUrl ? normalizeCanonicalTarget(canonicalUrl) : "";
    const currentTarget = normalizeCanonicalTarget(finalUrl);
    const canonicalIsSelf = Boolean(canonicalUrl && canonicalTarget === currentTarget);
    const canonicalListingParams = new Set(["forsaleorrent","moveunavailablelistingstothebottom","orderby","orderdescending","take","page","pagesize","sort","sortby","filter","filters","view","ref","source","campaign"]);
    const currentQueryKeys = [...finalUrl.searchParams.keys()].map((key)=>key.toLowerCase());
    const isNonContentVariantParam = (key:string) => canonicalListingParams.has(key)
      || key.startsWith("utm_")
      || /^(?:gclid|gbraid|wbraid|fbclid|msclkid|gad_|_gl$|_ga$|mc_[ce]id$|pk_(?:campaign|kwd|source|medium)|yclid|dclid|srsltid|ref_|affiliate|aff(?:id)?$)/i.test(key);
    const canonicalDropsKnownListingParams = Boolean(canonicalUrl && canonicalUrl.hostname.toLowerCase().replace(/^www\\./, "") === finalUrl.hostname.toLowerCase().replace(/^www\\./, "") && canonicalUrl.pathname.replace(/\/+$/, "") === finalUrl.pathname.replace(/\/+$/, "") && !canonicalUrl.search && currentQueryKeys.length > 0 && currentQueryKeys.every(isNonContentVariantParam));
    const pageLanguageCode = (lang || "").toLowerCase().split("-")[0];
    const canonicalIsLocalePreferred = Boolean(canonicalUrl && finalUrl.pathname === "/" && pageLanguageCode && canonicalUrl.pathname.replace(/\/+$/, "") === "/" + pageLanguageCode);
    // www/apex redirects are normally the same site and must not become a cross-domain failure.

    const canonicalIsCrossDomain = Boolean(canonicalUrl && canonicalHost(canonicalUrl.hostname) !== canonicalHost(finalUrl.hostname));
    const canonicalDropsQuery = Boolean(canonicalUrl && finalUrl.search && !canonicalUrl.search);
    seoChecks.push(
      canonicalInvalid
        ? check("fail", "canonical", "seo", "Canonical URL", `Er is een canonical gevonden, maar de waarde is geen geldige URL: "${canonical}".`, "Corrigeer de canonical naar één geldige absolute of relatieve voorkeurs-URL.", 0, 7)
        : !canonicalUrl
          ? metadataMayBeClientRendered
            ? check("unable_to_confirm", "canonical", "seo", "Canonical URL", "De canonical kon niet betrouwbaar worden bevestigd omdat deze JavaScript-pagina niet volledig kon worden gerenderd.", "Controleer de canonical opnieuw met een volledige render voordat je een wijziging maakt.", 0, 7)
            : check("warning", "canonical", "seo", "Canonical URL", "Geen canonical URL gevonden in de opgehaalde pagina.", "Voeg een self-referencing canonical toe wanneer passend.", 3, 7)
        : canonicalIsSelf || canonicalIsLocalePreferred || canonicalDropsKnownListingParams
          ? check("pass", "canonical", "seo", "Canonical URL", canonicalIsLocalePreferred ? "De rootpagina verwijst bewust naar de equivalente taalvoorkeurs-URL." : canonicalDropsQuery ? "De canonical wijst naar dezelfde inhoud zonder queryparameters." : "De canonical verwijst naar dezelfde URL als de gescande pagina.", "Behoud een duidelijke canonical die overeenkomt met de voorkeurs- en taalstructuur van de site.", 7, 7)
          : canonicalIsCrossDomain
            ? check("fail", "canonical", "seo", "Canonical URL", "De canonical verwijst naar een ander domein dan de gescande pagina. Dit kan de verkeerde voorkeurs-URL voor zoekmachines aangeven.", "Gebruik voor een normale pagina een self-referencing canonical op het eigen domein, tenzij een externe canonical bewust en inhoudelijk onderbouwd is.", 0, 10)
            : check("warning", "canonical", "seo", "Canonical URL", "De canonical is aanwezig, maar verwijst niet naar de gescande URL.", "Controleer of de canonical bewust naar een andere, inhoudelijk gelijkwaardige voorkeurs-URL verwijst.", 5, 7)
    );
    const viewportBlocksZoom = /(?:^|[,;\s])user-scalable\s*=\s*no(?:$|[,;\s])/i.test(viewportContent) ||
      /(?:^|[,;\s])maximum-scale\s*=\s*(?:0(?:\.\d+)?|1(?:\.0+)?)(?:$|[,;\s])/i.test(viewportContent);
    seoChecks.push(!viewportContent
      ? check("fail", "viewport", "seo", "Mobiele viewport", "Geen viewport meta tag met content gevonden.", "Voeg content=\"width=device-width, initial-scale=1\" toe aan de viewport meta tag.", 0, 5)
      : !viewportIsResponsive
        ? check("warning", "viewport", "seo", "Mobiele viewport", `Een viewport meta tag is aanwezig, maar width=device-width is niet gevonden: "${viewportContent}".`, "Gebruik een responsive viewport met width=device-width.", 2, 5)
        : check("pass", "viewport", "seo", "Mobiele viewport", `De viewport bevat een responsive width=device-width-instelling: "${viewportContent}".`, "Test daarnaast de echte mobiele layout, tapdoelen en Core Web Vitals.", 5, 5)
    );
    seoChecks.push(!lang
      ? check("warning", "lang", "seo", "HTML-taal", "Geen HTML lang-attribuut gevonden.", "Voeg het juiste lang-attribuut toe aan <html>.", 1, 4)
      : langIsValid
        ? check("pass", "lang", "seo", "HTML-taal", `De pagina heeft een syntactisch geldige lang-code: "${lang}".`, "Controleer afzonderlijk of deze code overeenkomt met de werkelijk gebruikte paginataal.", 4, 4)
        : check("warning", "lang", "seo", "HTML-taal", `Het lang-attribuut "${lang}" heeft geen geldige taalcode-opbouw.`, "Gebruik een geldige taalcode, bijvoorbeeld nl, en, de of nl-NL.", 1, 4)
    );
    seoChecks.push(noindexSignal
      ? check("warning", "indexability", "seo", "Indexeerbaarheid", `Een noindex-signaal is gevonden${xRobotsTag ? ` in X-Robots-Tag/meta robots (${[robots, xRobotsTag].filter(Boolean).join(" | ")})` : ` in meta robots (${robots})`}.`, "Controleer of noindex bewust is ingesteld. Verwijder het alleen als deze pagina in zoekmachines moet verschijnen.", 0, 6)
      : robotsPathBlocked
        ? check("warning", "indexability", "seo", "Indexeerbaarheid", `robots.txt blokkeert het gescande pad via: Disallow: ${matchingRobotsRules[0].path}`, "Controleer of deze crawlblokkade bewust is. Pas robots.txt alleen aan wanneer zoekmachines deze pagina moeten kunnen crawlen.", 0, 6)
        : robotsStatus === "UNABLE_TO_CONFIRM"
          ? check("unable_to_confirm", "indexability", "seo", "Indexeerbaarheid", "Geen noindex-signaal gevonden, maar RankFix kon robots.txt niet betrouwbaar controleren.", "Probeer opnieuw om crawlbaarheid en indexeerbaarheid samen te bevestigen.", 0, 6)
          : check("pass", "indexability", "seo", "Indexeerbaarheid", `Geen noindex gevonden en geen robots.txt-regel blokkeert dit pad${robots ? `; meta robots: "${robots}"` : ""}.`, "Externe zoekmachine-indexstatus blijft een aparte controle.", 6, 6)
    );
    const missingAltRatio = imageElementCount ? imagesMissingAlt / imageElementCount : 0;
    const altPoints = imagesMissingAlt === 0
      ? 7
      : missingAltRatio <= 0.10
        ? 6
        : missingAltRatio <= 0.25
          ? 5
          : missingAltRatio <= 0.50
            ? 3
            : 1;
    seoChecks.push(imageElementCount === 0
      ? check("not_applicable", "alt", "seo", "Afbeelding alt-teksten", "Geen <img>-elementen gevonden in de opgehaalde HTML; deze controle telt daarom niet mee.", "Controleer dynamisch geladen afbeeldingen afzonderlijk wanneer die voor de pagina belangrijk zijn.", 0, 7)
      : imagesMissingAlt === 0
      ? check("pass", "alt", "seo", "Afbeelding alt-teksten", `Alle ${imageElementCount} controleerbare <img>-elementen in de raw HTML hebben alt-attributen. JavaScript-geladen afbeeldingen zijn niet meegenomen.`, "Schrijf beschrijvende alt-teksten voor informatieve afbeeldingen.", 7, 7)
      : check("warning", "alt", "seo", "Afbeelding alt-teksten", `${imagesMissingAlt} van ${imageElementCount} controleerbare <img>-elementen in de raw HTML missen alt (${Math.round(missingAltRatio * 100)}%). JavaScript-geladen afbeeldingen zijn niet meegenomen.`, "Voeg beschrijvende alt-teksten toe waar ze betekenis toevoegen.", altPoints, 7)
    );
    const effectiveLocalBusinessPage = !isProductPage && !hasCategorySignal && effectiveLocalSchemaSignal;
    const effectiveArticlePage = hasArticleSignal && !effectiveLocalBusinessPage;
    const contentContext = isHomepage ? "homepage" : isProductPage ? "productpagina" : hasCategorySignal ? "categorie-/lijstpagina" : effectiveLocalBusinessPage ? "lokale bedrijfspagina" : effectiveArticlePage ? "artikelpagina" : "contentpagina";
    const contentMinimumSignal = isHomepage ? 150 : isProductPage ? 80 : hasCategorySignal ? 120 : effectiveLocalBusinessPage ? 150 : effectiveArticlePage ? 300 : 200;
    const contentStrongSignal = isHomepage ? 250 : isProductPage ? 180 : hasCategorySignal ? 220 : effectiveLocalBusinessPage ? 300 : effectiveArticlePage ? 600 : 350;
    seoChecks.push(thinRawHtmlEvidence
      ? check("unable_to_confirm", "content", "seo", "Contentdekking", "De raw HTML is een dunne JavaScript-shell. RankFix kan de zichtbare contentdekking daarom niet betrouwbaar beoordelen zonder geslaagde rendering.", "Voer de controle opnieuw uit met renderbare JavaScript-evidence; behandel een lage raw-HTML woordtelling niet als contentfout.", 0, 7)
      : wordCount >= contentStrongSignal
        ? check("pass", "content", "seo", "Contentdekking", `Ongeveer ${wordCount} woorden gevonden op deze ${contentContext}. Dat is voldoende tekstuele dekking als kwantitatief signaal; relevantie en kwaliteit moeten afzonderlijk worden beoordeeld.`, "Behoud nuttige, unieke content die de zoekintentie en klantvragen beantwoordt.", 7, 7)
        : wordCount >= contentMinimumSignal
          ? check("warning", "content", "seo", "Contentdekking", `Ongeveer ${wordCount} woorden gevonden op deze ${contentContext}. Dat is geen bewijs van slechte content, maar de tekstuele dekking is beperkt voor dit paginatype.`, "Breid alleen uit waar extra context, dienst-/onderwerpinformatie of antwoorden de bezoeker daadwerkelijk helpen.", 5, 7)
          : check("warning", "content", "seo", "Contentdekking", `Ongeveer ${wordCount} woorden gevonden op deze ${contentContext}; RankFix gebruikt hiervoor een contextuele richtwaarde van circa ${contentMinimumSignal}+ woorden als eerste dekkingssignaal.`, "Controleer of essentiële informatie en zoekintentie voldoende worden beantwoord; voeg geen tekst toe puur voor woordenaantal.", 3, 7)
    );
    seoChecks.push(finalUrl.protocol === "https:"
      ? check("pass", "https", "seo", "HTTPS", "De uiteindelijke URL gebruikt HTTPS.", "Behoud HTTPS op alle publieke pagina's en redirects.", 7, 7)
      : check("fail", "https", "seo", "HTTPS", "De uiteindelijke URL gebruikt geen HTTPS.", "Zet de site volledig achter HTTPS.", 0, 7)
    );
    seoChecks.push(response.status === 200
      ? check("pass", "status", "seo", "HTTP-status", "De pagina gaf HTTP 200 terug.", "Behoud HTTP 200 voor normale indexeerbare pagina's.", 6, 6)
      : response.ok
        ? check("warning", "status", "seo", "HTTP-status", `De pagina gaf HTTP ${response.status} terug. Dat is succesvol op HTTP-niveau, maar niet de normale 200-response voor een indexeerbare HTML-pagina.`, "Controleer waarom deze URL geen HTTP 200 teruggeeft.", 3, 6)
        : check("warning", "status", "seo", "HTTP-status", `De pagina gaf HTTP ${response.status} terug.`, "Controleer redirects, 404's en serverfouten.", 2, 6)
    );
    // responseTime is RankFix's own end-to-end fetch duration from its scan environment.
    // It is useful as a server-response signal, but it is not browser TTFB and must never
    // be presented as measured Core Web Vitals (LCP/CLS/INP).
    seoChecks.push(responseTime < 1500
      ? check("pass", "response", "seo", "Server response", `RankFix ontving de eerste volledige HTTP-response in ongeveer ${responseTime} ms vanuit de scanomgeving. Dit is een server-responssignaal, geen gemeten Core Web Vital.`, "Blijf server response volgen; meet LCP, CLS en INP afzonderlijk met browser- of velddata.", 5, 5)
      : responseTime < 3000
        ? check("warning", "response", "seo", "Server response", `RankFix ontving de eerste volledige HTTP-response in ongeveer ${responseTime} ms vanuit de scanomgeving. Dit is geen browser-TTFB en bewijst de oorzaak van de vertraging niet.`, "Onderzoek server, caching, database en SSR als mogelijke oorzaken; bevestig prestaties afzonderlijk met browser- of veldmetingen.", 3, 5)
        : check("warning", "response", "seo", "Server response", `RankFix ontving de eerste volledige HTTP-response in ongeveer ${responseTime} ms vanuit de scanomgeving. Deze ene meting is traag, maar bewijst geen structureel performanceprobleem en is geen Core Web Vitals-meting.`, "Herhaal de meting en onderzoek pas daarna server, caching, database of SSR wanneer de vertraging reproduceerbaar is.", 2, 5)
    );
    const missingOpenGraphFields = [
      !ogTitle ? "og:title" : null,
      !ogDescription ? "og:description" : null,
      !ogImage ? "og:image" : null,
    ].filter(Boolean) as string[];
    const invalidOpenGraphFields = [
      ogImage && !ogImageIsAbsolute ? "og:image (geen absolute http(s)-URL)" : null,
      ogUrl && !ogUrlIsAbsolute ? "og:url (geen absolute http(s)-URL)" : null,
    ].filter(Boolean) as string[];
    seoChecks.push(missingOpenGraphFields.length === 0 && invalidOpenGraphFields.length === 0
      ? check("pass", "social", "seo", "Social metadata", "Open Graph title, description en image zijn aanwezig; URL-velden gebruiken geldige absolute http(s)-URL's.", "Controleer social previews voor belangrijke pagina's.", 4, 4)
      : check("warning", "social", "seo", "Social metadata", `Open Graph vraagt aandacht.${missingOpenGraphFields.length ? " Ontbrekend: " + missingOpenGraphFields.join(", ") + "." : ""}${invalidOpenGraphFields.length ? " Ongeldig: " + invalidOpenGraphFields.join(", ") + "." : ""}`, "Vul ontbrekende velden aan en gebruik voor og:image en og:url absolute http(s)-URL's.", Math.max(1, 4 - Math.min(3, missingOpenGraphFields.length + invalidOpenGraphFields.length)), 4)
    );
    seoChecks.push(robotsStatus === "PASS"
      ? robotsPathBlocked
        ? check("warning", "robots_txt", "seo", "robots.txt", `robots.txt is bereikbaar, maar blokkeert het gescande pad via Disallow: ${matchingRobotsRules[0].path}.`, "Controleer of deze blokkade bewust is.", 1, 4)
        : check("pass", "robots_txt", "seo", "robots.txt", "robots.txt is bereikbaar en bevat geen toepasselijke blokkade voor het gescande pad.", "Houd crawlregels bewust en controleer belangrijke publieke pagina's.", 4, 4)
      : robotsStatus === "FAIL"
        ? check("not_applicable", "robots_txt", "seo", "robots.txt", "robots.txt gaf 404 terug. Het ontbreken van robots.txt blokkeert crawlers op zichzelf niet en kost daarom geen SEO-punten.", "Publiceer robots.txt alleen wanneer je crawlregels of sitemapverwijzingen wilt beheren.", 0, 4)
        : check("unable_to_confirm", "robots_txt", "seo", "robots.txt", "RankFix kon robots.txt tijdens deze scan niet betrouwbaar ophalen.", "Probeer opnieuw wanneer de server bereikbaar is.", 0, 4)
    );
    seoChecks.push(declaredSitemapHttpFailures.length > 0
      ? check("warning", "sitemap", "seo", "Sitemap-signaal", `robots.txt verwijst naar een sitemap die aantoonbaar HTTP ${declaredSitemapHttpFailures[0].status} teruggeeft: ${declaredSitemapHttpFailures[0].url}.${sitemapFound && confirmedSitemapUrl ? ` Een andere geldige sitemap is wel gevonden: ${confirmedSitemapUrl}.` : ""}`, "Herstel of verwijder de kapotte sitemapverwijzing in robots.txt en verwijs naar een bereikbare XML sitemap.", 1, 4)
      : sitemapFound
        ? check("pass", "sitemap", "seo", "Sitemap-signaal", `Een bereikbare XML sitemap is gevonden${confirmedSitemapUrl ? `: ${confirmedSitemapUrl}` : "."}`, "Controleer of de sitemap alleen canonieke, indexeerbare URL's bevat.", 4, 4)
      : sitemapStatus === "FAIL"
        ? check("warning", "sitemap", "seo", "Sitemap-signaal", robotsMentionsSitemap ? `robots.txt verwijst naar een sitemap, maar RankFix kon geen geldige bereikbare XML sitemap bevestigen.${sitemapDiagnostic ? " Technisch: " + sitemapDiagnostic : ""}` : `Geen geldige bereikbare XML sitemap gevonden.${sitemapDiagnostic ? " Technisch: " + sitemapDiagnostic : ""}`, "Controleer de sitemap-URL, HTTP-status en XML content-type.", 1, 4)
        : check("unable_to_confirm", "sitemap", "seo", "Sitemap-signaal", robotsMentionsSitemap ? `robots.txt bevat een sitemapverwijzing, maar RankFix kon de sitemap tijdens deze scan niet betrouwbaar ophalen.${sitemapDiagnostic ? " Technisch: " + sitemapDiagnostic : ""}` : `RankFix kon tijdens deze scan niet betrouwbaar bevestigen of een sitemap beschikbaar is.${sitemapDiagnostic ? " Technisch: " + sitemapDiagnostic : ""}`, "Controleer de sitemap opnieuw wanneer de server bereikbaar is.", 0, 4)
    );

    geoChecks.push(
      effectiveLocalSchemaSignal
        ? hasRelevantLocalSchema
          ? check("pass", "schema", "geo", "Structured data", `${validJsonLd} geldige JSON-LD block(s) met passend lokaal bedrijfstype gevonden voor deze ${schemaContextLabel}.`, `Behoud het meest specifieke passende type: ${recommendedSchema}. Controleer verplichte en relevante velden.`, 12, 12)
          : validJsonLd > 0
            ? check("warning", "schema", "geo", "Structured data", `${validJsonLd} geldige JSON-LD block(s) gevonden, maar geen passend lokaal bedrijfsschema voor deze ${schemaContextLabel}.`, `Gebruik alleen het meest specifieke passende bedrijfsschema wanneer de zichtbare content dit ondersteunt. Richting: ${recommendedSchema}.`, 6, 12)
            : metadataMayBeClientRendered
            ? check("unable_to_confirm", "schema", "geo", "Structured data", `Structured data kon niet betrouwbaar worden bevestigd voor deze ${schemaContextLabel}, omdat de JavaScript-pagina niet volledig kon worden gerenderd.`, "Controleer structured data opnieuw met een volledige render voordat je schema toevoegt of wijzigt.", 0, 12)
            : check("warning", "schema", "geo", "Structured data", `Geen geldige JSON-LD structured data gevonden voor deze ${schemaContextLabel}. Dit is een machineleesbare optimalisatiekans; de zichtbare pagina kan zonder JSON-LD nog steeds inhoudelijk correct zijn.`, `Voeg relevante schema.org JSON-LD toe wanneer de zichtbare content dit ondersteunt. Voor dit paginatype is ${recommendedSchema} de belangrijkste richting.`, 4, 12)
        : validJsonLd > 0
          ? hasRelevantContextSchema
            ? check("pass", "schema", "geo", "Structured data", `${validJsonLd} geldige JSON-LD block(s) met een voor deze ${schemaContextLabel} relevant schema-type gevonden.`, `Controleer ook de inhoudelijke velden en houd structured data gelijk aan zichtbare content. Relevante hoofdkeuze: ${recommendedSchema}.`, 12, 12)
            : hasEntitySchema
              ? check("warning", "schema", "geo", "Structured data", `${validJsonLd} geldige JSON-LD block(s) en herkenbare entity-schema's gevonden, maar geen schema-type dat RankFix overtuigend aan deze ${schemaContextLabel} kan koppelen.`, `Voeg alleen het relevante paginaschema toe wanneer het door de zichtbare content wordt ondersteund. Richting: ${recommendedSchema}.`, 6, 12)
              : check("warning", "schema", "geo", "Structured data", `${validJsonLd} geldige JSON-LD block(s) gevonden, maar geen herkenbaar relevant entity- of paginaschema voor deze ${schemaContextLabel}.`, `Gebruik structured data die aantoonbaar bij het paginatype past. Relevante hoofdkeuze: ${recommendedSchema}.`, 6, 12)
          : metadataMayBeClientRendered
            ? check("unable_to_confirm", "schema", "geo", "Structured data", `Structured data kon niet betrouwbaar worden bevestigd voor deze ${schemaContextLabel}, omdat de JavaScript-pagina niet volledig kon worden gerenderd.`, "Controleer structured data opnieuw met een volledige render voordat je schema toevoegt of wijzigt.", 0, 12)
            : check("warning", "schema", "geo", "Structured data", `Geen geldige JSON-LD structured data gevonden voor deze ${schemaContextLabel}. Dit is een machineleesbare optimalisatiekans; de zichtbare pagina kan zonder JSON-LD nog steeds inhoudelijk correct zijn.`, `Voeg relevante schema.org JSON-LD toe wanneer de zichtbare content dit ondersteunt. Voor dit paginatype is ${recommendedSchema} de belangrijkste richting.`, 4, 12)
    );
    const normalizedTwitterCard = twitterCard.toLowerCase();
    const validTwitterCards = new Set(["summary", "summary_large_image", "app", "player"]);
    seoChecks.push(twitterCard
      ? validTwitterCards.has(normalizedTwitterCard)
        ? check("pass", "twitter_card", "seo", "Twitter Card", `Geldige Twitter/X Card ingesteld: "${twitterCard}".`, "Behoud dit type zolang de social preview past bij de pagina.", 3, 3)
        : check("warning", "twitter_card", "seo", "Twitter Card", `Onbekende twitter:card-waarde gevonden: "${twitterCard}".`, "Gebruik een ondersteund Card-type en controleer de social preview.", 1, 3)
      : twitterCardInvalidValue
        ? check("warning", "twitter_card", "seo", "Twitter Card", `twitter:card is aanwezig, maar bevat geen geldig Card-type: "${twitterCardRaw.slice(0,120)}".`, "Gebruik summary, summary_large_image, app of player als twitter:card-waarde.", 1, 3)
        : check("not_applicable", "twitter_card", "seo", "Twitter Card", "Geen twitter:card gevonden. Dit is een optionele social-previewtag en wordt niet als SEO-fout of rankingprobleem bestraft.", "Voeg alleen Twitter/X Card metadata toe wanneer je een specifieke preview op X wilt beheren.", 0, 3)
    );

    seoChecks.push(!multilingualUrlEvidence
      ? languageSelectorSignal
        ? check("unable_to_confirm", "hreflang", "seo", "Meertalige SEO", "Een taal- of landkeuze is zichtbaar, maar deze paginascan bewijst niet dat equivalente vertaalde URL's bestaan. Hreflang wordt daarom niet als ontbrekende fout beoordeeld.", "Bevestig alternatieve taal-URL's in een sitebrede crawl voordat hreflang verplicht wordt gesteld.", 0, 5)
        : check("not_applicable", "hreflang", "seo", "Meertalige SEO", "Geen bewezen alternatieve taal-URL's gevonden; RankFix telt hreflang daarom niet mee in de score.", "Gebruik hreflang wanneer dezelfde content aantoonbaar in meerdere talen/URL's beschikbaar is.", 0, 5)
      : invalidHreflangEntries.length
          ? check("warning", "hreflang", "seo", "Meertalige SEO", `${hreflangTags.length} hreflang-link(s) gevonden, maar ${invalidHreflangEntries.length} bevat een ongeldige taal-/regiocode of URL.`, "Corrigeer ongeldige hreflang-codes en href-URL's. Controleer daarna wederkerigheid tussen taalversies.", 2, 5)
          : selfHreflangMismatch
            ? check("warning", "hreflang", "seo", "Meertalige SEO", `De huidige URL is als hreflang-doel opgenomen, maar de taalcode sluit niet aan op documenttaal "${documentLanguage}".`, "Laat de self-referencing hreflang-taal overeenkomen met de taal van deze pagina en controleer daarna de alternatieve taalversies.", 2, 5)
          : hreflangHostMismatches.length
            ? check("unable_to_confirm", "hreflang", "seo", "Meertalige SEO", `${hreflangHostMismatches.length} hreflang-doel(en) verwijzen naar een ander hostdomein. Dit kan geldig zijn voor internationale domeinen, maar RankFix kan de relatie vanuit deze ene pagina niet bewijzen.`, "Controleer de externe taalhosts en hun wederkerige hreflang/canonical-relaties in een sitebrede crawl voordat dit als fout wordt beoordeeld.", 0, 5)
          : conflictingHreflangLanguages.length
            ? check("warning", "hreflang", "seo", "Meertalige SEO", `Dezelfde hreflang-code verwijst naar verschillende doel-URL's: ${conflictingHreflangLanguages.map((language) => `${language} => ${[...new Set(hreflangTargetsByLanguage.get(language) || [])].join(" | ")}`).join("; ")}.`, "Gebruik per pagina één eenduidige doel-URL per taal/regiocode en controleer daarna wederkerigheid.", 3, 5)
            : identicalDuplicateHreflangLanguages.length
              ? check("warning", "hreflang", "seo", "Meertalige SEO", `Dezelfde hreflang-code is dubbel opgenomen met dezelfde doel-URL: ${identicalDuplicateHreflangLanguages.map((language) => `${language} => ${(hreflangTargetsByLanguage.get(language) || [])[0]}`).join("; ")}.`, "Verwijder de dubbele hreflang-tag zodat iedere taal-/regiocode één keer voorkomt. Controleer daarna wederkerigheid.", 4, 5)
              : check("unable_to_confirm", "hreflang", "seo", "Meertalige SEO", `${hreflangTags.length} syntactisch geldige hreflang-link(s) gevonden. Vanuit één pagina kan RankFix wederkerigheid en canonicals van alle taalversies nog niet bewijzen.`, "Controleer de gekoppelde taal-URL's in een sitebrede crawl voordat hreflang volledig wordt bevestigd.", 0, 5)
    );

    seoChecks.push(hasDuplicatePathSegments
      ? check("warning", "duplicate_path", "seo", "URL-structuur", `Dubbele padsegmenten gevonden: ${[...new Set(actionableDuplicatePathSegments)].join(", ")}.`, "Maak de URL-structuur logisch en redirect oude dubbele URL's met een permanente 301 naar de definitieve URL.", 2, 5)
      : check("pass", "duplicate_path", "seo", "URL-structuur", "Geen direct dubbele opeenvolgende padsegmenten gevonden.", "Houd URL's kort, logisch en stabiel.", 5, 5)
    );

    seoChecks.push(hasVisibleHtmlEscape
      ? check("warning", "html_escape", "seo", "Tekstweergave", "Mogelijk HTML-escaped tekst zoals &amp; lijkt zichtbaar in de inhoud.", "Controleer rendering en encoding zodat bezoekers gewone leestekens zien.", 2, 4)
      : check("pass", "html_escape", "seo", "Tekstweergave", "Geen duidelijke zichtbare HTML-escape-fout gevonden.", "Behoud correcte HTML-encoding.", 4, 4)
    );

    seoChecks.push(thinRawHtmlEvidence && imageSrcs.length === 0
      ? check("unable_to_confirm", "image_sources", "seo", "Afbeeldingsbronnen", "De raw HTML is een dunne JavaScript-shell en bevat geen betrouwbare afbeeldingsset.", "Controleer afbeeldingsbronnen opnieuw na geslaagde JavaScript-rendering.", 0, 5)
      : hasStockImages
      ? check("unable_to_confirm", "image_sources", "seo", "Afbeeldingsbronnen", `${stockImageUrls.length} afbeelding(en) worden vanaf bekende externe stockhosts geladen. Dat is op zichzelf geen SEO-fout; RankFix kan rechten, caching en CDN-configuratie uit HTML niet bevestigen.`, "Controleer alleen wanneer deze assets belangrijk zijn voor merk, rechten of performance.", 0, 5)
      : hasExternalImageHotlinks
        ? check("pass", "image_sources", "seo", "Afbeeldingsbronnen", `${externalImageUrls.length} afbeelding(en) worden via een externe host/CDN geladen; de bronnen zijn in de opgehaalde HTML bevestigd. Dit is op zichzelf geen probleem.`, "Beoordeel afbeeldingsperformance alleen afzonderlijk wanneer runtime-metingen daar aanleiding toe geven.", 5, 5)
        : check("pass", "image_sources", "seo", "Afbeeldingsbronnen", "Geen externe afbeeldingshosts gevonden in de statische HTML.", "Blijf belangrijke afbeeldingen optimaliseren.", 5, 5)
    );

    seoChecks.push(
      thinRawHtmlEvidence
        ? check("unable_to_confirm","trust_legal_signals","seo","Privacy & vertrouwenssignalen","De raw HTML is een dunne JavaScript-shell. Privacy-, cookie- en contactlinks kunnen client-side worden toegevoegd en zijn daarom niet betrouwbaar als ontbrekend te beoordelen.","Controleer deze signalen opnieuw met geslaagde JavaScript-rendering.",0,5)
        : hasPrivacyLink && hasCookieLink && hasContactLink
        ? check("pass","trust_legal_signals","seo","Privacy & vertrouwenssignalen","Links naar privacy, cookies en contact zijn in de opgehaalde HTML gevonden."+(legalEvidenceSummary ? " Bewijs: "+legalEvidenceSummary+"." : ""),"Houd deze informatie duidelijk vindbaar en actueel. Dit is een technische aanwezigheidstest, geen juridisch oordeel.",5,5)
        : !legalLanguageSupported && Boolean(legalLanguageCode)
          ? check("unable_to_confirm","trust_legal_signals","seo","Privacy & vertrouwenssignalen","De paginataal ("+legalLanguageCode+") valt buiten de geteste juridische woordenlijst en niet alle signalen zijn rechtstreeks bevestigd."+(legalEvidenceSummary ? " Wel gevonden: "+legalEvidenceSummary+"." : ""),"Controleer de footer en cookiebanner handmatig of breid de woordenlijst voor deze taal uit.",0,5)
          : check("warning","trust_legal_signals","seo","Privacy & vertrouwenssignalen","Niet alle basissignalen zijn gevonden: "+[!hasPrivacyLink?"privacy":null,!hasCookieLink?"cookies":null,!hasContactLink?"contact":null].filter(Boolean).join(", ")+". "+(legalEvidenceSummary ? "Wel gevonden: "+legalEvidenceSummary+"." : ""),"Controleer of privacy-, cookie- en contactinformatie duidelijk bereikbaar is. RankFix beoordeelt hiermee geen wettelijke compliance.",Math.max(2, Number(hasPrivacyLink)+Number(hasCookieLink)+Number(hasContactLink)+2),5)
    );
    seoChecks.push(
      thinRawHtmlEvidence && hasEcommerceSignal
        ? check("unable_to_confirm","commercial_terms_signal","seo","Commerciële voorwaarden","De raw HTML is een dunne JavaScript-shell. RankFix kan niet betrouwbaar bewijzen dat voorwaarden of retourinformatie ontbreken.","Controleer commerciële voorwaarden opnieuw met geslaagde JavaScript-rendering.",0,4)
        : hasEcommerceSignal && !hasTermsLink
        ? check("warning","commercial_terms_signal","seo","Commerciële voorwaarden","Op deze commerciële pagina is geen duidelijke link naar voorwaarden gevonden.","Maak voorwaarden en relevante bestel-/retourinformatie duidelijk bereikbaar. Dit is geen juridisch compliance-oordeel.",2,4)
        : hasEcommerceSignal
          ? check("pass","commercial_terms_signal","seo","Commerciële voorwaarden","Een link naar voorwaarden is gevonden.","Houd voorwaarden en bestel-/retourinformatie actueel en goed vindbaar.",4,4)
          : check("not_applicable","commercial_terms_signal","seo","Commerciële voorwaarden","Geen voldoende sterk webshop-signaal gevonden; deze controle is daarom niet van toepassing.","Gebruik deze controle op commerciële pagina's.",0,4)
    );
    seoChecks.push(
      !hasEcommerceSignal
        ? check("not_applicable","merchant_product_readiness","seo","Merchant Center productbasis","Geen voldoende sterk webshop- of productsignaal gevonden; Merchant Center-productcontrole is niet van toepassing.","Gebruik deze controle op echte productpagina's van webshops.",0,6)
        : merchantProductReadiness && isProductPage
          ? check("pass","merchant_product_readiness","seo","Merchant Center productbasis","Op deze bewezen productpagina bevat Product structured data minimaal een productnaam, afbeelding en een aanbod met prijs, valuta en beschikbaarheid.","Houd productdata op de pagina en in eventuele Merchant Center-feeds consistent. RankFix bevestigt hiermee niet dat Google Merchant Center het product heeft goedgekeurd.",6,6)
          : isProductPage
            ? metadataMayBeClientRendered && !productSchemaPresent
              ? check("unable_to_confirm","merchant_product_readiness","seo","Merchant Center productbasis","Deze URL heeft productpagina-signalen, maar de JavaScript-pagina kon niet volledig worden gerenderd. RankFix kan daarom niet bewijzen dat complete Product/Offer-data live ontbreekt.","Controleer de productpagina opnieuw met een volledige render voordat Merchant-productdata als ontbrekend wordt aangemerkt.",0,6)
              : check("warning","merchant_product_readiness","seo","Merchant Center productbasis","Deze productpagina mist aantoonbare complete Product/Offer structured data voor naam, afbeelding, prijs, valuta of beschikbaarheid.","Vul Product/Offer structured data aan en zorg dat zichtbare productgegevens en eventuele feed dezelfde waarden gebruiken.",3,6)
            : check("unable_to_confirm","merchant_product_readiness","seo","Merchant Center productbasis","De site heeft webshop-signalen, maar deze pagina is niet overtuigend als productpagina herkend. Merchant-productdata kan hier niet volledig worden beoordeeld.","Scan een echte productpagina om Merchant Center-productbasis te beoordelen.",0,6)
    );
    seoChecks.push(
      !hasEcommerceSignal
        ? check("not_applicable","merchant_feed_signal","seo","Merchant Center feed-signaal","Geen voldoende sterk webshopsignaal gevonden; feedcontrole is niet van toepassing.","Gebruik deze controle voor webshops.",0,4)
        : hasMerchantFeedHint
          ? check("pass","merchant_feed_signal","seo","Merchant Center feed-signaal","Er is in de statische pagina een expliciet Merchant Center-, Shopping- of productfeed-signaal gevonden.","Controleer in Merchant Center zelf feedstatus, afkeuringen en synchronisatie; RankFix kan dat niet uit alleen de pagina bevestigen.",4,4)
          : check("unable_to_confirm","merchant_feed_signal","seo","Merchant Center feed-signaal","In de statische HTML is geen expliciete productfeed gevonden. Een feed kan alsnog server-side, via een platformapp of rechtstreeks in Merchant Center zijn gekoppeld.","Controleer de feedbron in Google Merchant Center. Afwezigheid in HTML is geen bewijs dat er geen feed bestaat.",0,4)
    );
    seoChecks.push(
      adsTrackingSignals===0
        ? check("not_applicable","consent_mode_readiness","seo","Consent Mode signaal","Geen GA4-, Google Ads- of GTM-signaal gevonden waarop deze Consent Mode-controle kan worden toegepast.","Controleer consentconfiguratie zodra Google-meet- of advertentietags worden gebruikt.",0,5)
        : hasConsentModeSignal
          ? check("pass","consent_mode_readiness","seo","Consent Mode signaal","Een Google Consent Mode-signaal is in de opgehaalde bron gevonden.","Controleer runtime of consent default vóór meettags wordt gezet en of keuzes correct worden bijgewerkt. Dit is een technische signaaltest, geen juridisch compliance-oordeel.",5,5)
          : check("unable_to_confirm","consent_mode_readiness","seo","Consent Mode signaal","Google tracking is gevonden, maar de statische HTML bewijst niet of Consent Mode runtime via GTM of een CMP wordt ingesteld. Afwezigheid van een expliciet consent-signaal in raw HTML is daarom geen bewezen configuratiefout.","Verifieer Consent Mode runtime met GTM Preview/Tag Assistant of in de CMP-configuratie. RankFix beoordeelt hiermee geen wettelijke compliance.",0,5)
    );

    const accessibilityAffectedCount = unlabeledFormControls + emptyButtons;
    const accessibilityScopeCount = formControls.length + buttonTags.length;
    const accessibilityIssueRatio = accessibilityScopeCount ? accessibilityAffectedCount / accessibilityScopeCount : 0;
    const accessibilityPoints = accessibilityIssueCount === 0 ? 5 : accessibilityIssueRatio <= 0.05 ? 4 : accessibilityIssueRatio <= 0.20 ? 3 : accessibilityIssueRatio <= 0.50 ? 2 : 1;
    accessibilityChecks.push(
      accessibilityIssueCount===0
        ? check("pass","accessibility_basics","accessibility","Toegankelijkheid basis","Geen duidelijke basisproblemen gevonden bij formulierlabels of lege knoppen in de statische HTML. Afbeelding-alt wordt afzonderlijk binnen SEO beoordeeld.","Blijf toetsenbordbediening, focus, contrast en dynamische content afzonderlijk testen. Dit is geen volledige WCAG/EAA-audit.",5,5)
        : check("warning","accessibility_basics","accessibility","Toegankelijkheid basis","Basiscontrole vond "+accessibilityIssueCount+" onafhankelijk(e) aandachtspunt(en): "+unlabeledFormControls+" formuliercontrol(s) zonder aantoonbaar label en "+emptyButtons+" lege knop(pen) zonder toegankelijke naam. Dat raakt "+Math.round(accessibilityIssueRatio*100)+"% van de controleerbare formuliercontrols en knoppen.","Corrigeer de aantoonbare HTML-signalen en voer daarna een uitgebreidere toegankelijkheidstest uit. RankFix claimt hiermee geen WCAG/EAA-conformiteit.",accessibilityPoints,5),
      !viewportContent
        ? check("unable_to_confirm","viewport_zoom_blocked","accessibility","Browserzoom","Zonder viewport meta tag kan RankFix de zoominstelling niet afzonderlijk beoordelen.","Voeg eerst een geldige responsive viewport toe en controleer daarna zoomgedrag.",0,3)
        : viewportBlocksZoom
          ? check("warning","viewport_zoom_blocked","accessibility","Browserzoom",`De viewport beperkt browserzoom: "${viewportContent}".`,"Laat gebruikers zoomen; vermijd user-scalable=no en onnodig beperkende maximum-scale.",1,3)
          : check("pass","viewport_zoom_blocked","accessibility","Browserzoom","Geen statische viewport-instelling gevonden die browserzoom blokkeert.","Test zoom en schaalbaarheid ook interactief op mobiele apparaten.",3,3)
    );

    seoChecks.push(hasPlaceholders
      ? check("fail", "business_placeholders", "seo", "Bedrijfsgegevens", `Er staan nog ${placeholderMatches.length} placeholder(s) zoals ${placeholderMatches.slice(0, 4).join(", ")} op de pagina.`, "Vervang placeholders door echte bedrijfs- en contactgegevens voordat de site live gaat.", 0, 6)
      : check("pass", "business_placeholders", "seo", "Bedrijfsgegevens", "Geen bekende bedrijfsgegevens-placeholders gevonden.", "Houd bedrijfs- en contactgegevens actueel en consistent.", 6, 6)
    );

    seoChecks.push(!hasEcommerceSignal
      ? check("not_applicable", "price_format", "seo", "Prijsnotatie", "Geen duidelijke webshop/product-signalen gevonden; prijsnotatie is niet beoordeeld.", "Gebruik deze controle op echte product- en e-commercepagina's.", 0, 5)
      : visiblePriceCount === 0
      ? check("unable_to_confirm", "price_format", "seo", "Prijsnotatie", "RankFix vond geen betrouwbaar zichtbaar prijsbewijs om de notatie te beoordelen.", "Controleer prijsnotatie op een pagina waar prijzen aantoonbaar zichtbaar zijn.", 0, 5)
      : !hasDotDecimalPrices
      ? check("pass", "price_format", "seo", "Prijsnotatie", "De gevonden prijzen bevatten geen inconsistente decimaalnotatie die door deze controle als fout is aangemerkt.", "Gebruik per taal/regio een passende valuta- en getalnotatie.", 5, 5)
      : isHomepage
        ? check("unable_to_confirm", "price_format", "seo", "Prijsnotatie", `${priceFormatMatches.length} eurobedrag(en) met een punt zijn in de statische homepage-tekst gevonden, zoals ${priceFormatMatches[0]}, maar RankFix kan vanuit raw HTML niet bewijzen dat dit de werkelijk zichtbare gelokaliseerde prijsweergave is.`, "Bevestig prijsnotatie op een echte productpagina of met JavaScript-rendering voordat dit als fout wordt beoordeeld.", 0, 5)
        : check("warning", "price_format", "seo", "Prijsnotatie", `${priceFormatMatches.length} prijsnotatie(s) gebruikt een punt als decimaalteken, zoals ${priceFormatMatches[0]}.`, "Gebruik voor Nederlandse content bijvoorbeeld € 129,95 en formatteer prijzen met locale-aware formatting.", 2, 5)
    );

    seoChecks.push(!hasEcommerceSignal
      ? check("not_applicable","checkout_funnel_static","seo","Checkout & funnel","Geen duidelijke webshop-signalen gevonden; checkout/funnel is niet beoordeeld.","Gebruik deze controle op echte webshops.",0,0)
      : isProductPage && !addToCartMarkupSignal
        ? check("unable_to_confirm","checkout_funnel_static","seo","Checkout & funnel","Dit is een productpagina, maar RankFix kon in raw HTML geen duidelijke toevoegen-aan-winkelwagen actie bevestigen. De actie kan client-side via JavaScript worden gerenderd.","Controleer de koopactie later met de browser/headless-audit. Raw HTML alleen is onvoldoende bewijs voor een checkoutfout.",0,0)
        : (cartHrefSignal || checkoutHrefSignal) && addToCartMarkupSignal
          ? check("pass","checkout_funnel_static","seo","Checkout & funnel","Statische funnel-signalen zijn aanwezig: koopactie en een winkelwagen- of checkoutpad zijn gevonden.","Dit bewijst niet dat de interactieve funnel werkt; runtime add-to-cart en checkout worden later met browser/headless getest.",0,0)
          : check("unable_to_confirm","checkout_funnel_static","seo","Checkout & funnel","RankFix vond webshop-signalen, maar kan vanuit deze losse raw-HTML pagina de volledige product → winkelwagen → checkout-flow niet bevestigen.","Gebruik de toekomstige browser/headless-controle om klikken, winkelwagenstatus en checkout runtime te testen.",0,0)
    );
    seoChecks.push(!hasEcommerceSignal
      ? check("not_applicable","checkout_information_signal","seo","Checkout informatie",euConsumerApplicable ? "Geen consumenteninformatie beoordeeld." : "EU-Omnibus & Consumer Rights is voor deze scan niet aantoonbaar van toepassing op deze markt/pagina.","Gebruik deze controle op relevante EU-webshops.",0,0)
      : hasShippingSignal && paymentMethodSignal
        ? check("pass","checkout_information_signal","seo","Checkout informatie","Verzendinformatie en betaalmethode-signalen zijn op deze pagina gevonden.","Controleer verzendkosten, btw en totaalbedrag opnieuw in de daadwerkelijke checkout.",0,0)
        : check("unable_to_confirm","checkout_information_signal","seo","Checkout informatie","Niet alle verzend- en betaalinformatie kon op deze losse pagina worden bevestigd.","Dit is geen foutbewijs: informatie kan pas in winkelwagen of checkout verschijnen. Controleer de volledige funnel.",0,0)
    );

    seoChecks.push(!euConsumerApplicable
      ? check("not_applicable","eu_discount_reference_signal","seo","EU korting & referentieprijs",euConsumerApplicable ? "Geen kortingssignalen beoordeeld." : "EU-Omnibus & Consumer Rights is voor deze scan niet aantoonbaar van toepassing op deze markt/pagina.","Gebruik deze controle op echte webshop- en productpagina's.",0,0)
      : !hasDiscountClaim
        ? check("not_applicable","eu_discount_reference_signal","seo","EU korting & referentieprijs","Geen expliciete kortingsclaim gevonden op deze pagina.","Geen actie nodig voor deze paginascan.",0,0)
        : hasReferencePriceSignal
          ? check("pass","eu_discount_reference_signal","seo","EU korting & referentieprijs","Een kortingsclaim én zichtbare referentieprijs zijn gevonden. RankFix kan vanuit één scan niet bewijzen dat de referentieprijs historisch juist is.","Bewaar prijs-/promotiehistorie en controleer de toepasselijke 30-dagenregel afzonderlijk.",0,0)
          : check("unable_to_confirm","eu_discount_reference_signal","seo","EU korting & referentieprijs","Er is een kortingsclaim gevonden, maar geen duidelijke referentieprijs in de statische paginatekst.","Controleer of de toepasselijke referentieprijs duidelijk wordt getoond. RankFix geeft hier alleen een signaal, geen juridische conformiteitsverklaring.",0,0)
    );
    seoChecks.push(!euConsumerApplicable
      ? check("not_applicable","eu_review_transparency_signal","seo","EU reviewtransparantie",euConsumerApplicable ? "Geen reviewinhoud gevonden." : "EU-Omnibus & Consumer Rights is voor deze scan niet aantoonbaar van toepassing op deze markt/pagina.","Gebruik deze controle op relevante EU-webshops met klantreviews.",0,0)
      : !reviewContentSignal
        ? check("not_applicable","eu_review_transparency_signal","seo","EU reviewtransparantie","Geen klantreview-inhoud op deze pagina gevonden.","Controleer reviewtransparantie op de pagina waar reviews daadwerkelijk worden getoond.",0,0)
        : reviewTransparencySignal
          ? check("pass","eu_review_transparency_signal","seo","EU reviewtransparantie","Reviewinhoud en een zichtbaar transparantiesignaal over reviews zijn gevonden.","Controleer dat de uitleg feitelijk klopt met het gebruikte reviewproces.",0,0)
          : check("unable_to_confirm","eu_review_transparency_signal","seo","EU reviewtransparantie","Reviewinhoud is gevonden, maar uit deze statische pagina blijkt niet duidelijk hoe reviews worden verzameld of geverifieerd.","Maak voor klanten duidelijk hoe reviews worden verzameld/gecontroleerd; dit is een transparantiesignaal, geen juridische conclusie.",0,0)
    );
    seoChecks.push(!euConsumerApplicable || !hasScarcityClaim
      ? check("not_applicable","eu_scarcity_signal","seo","EU schaarsteclaim","Geen expliciete numerieke schaarsteclaim gevonden.","Geen actie nodig voor deze paginascan.",0,0)
      : check("unable_to_confirm","eu_scarcity_signal","seo","EU schaarsteclaim",`Een schaarsteclaim is gevonden, bijvoorbeeld: ${scarcityMatches[0]}. RankFix kan uit raw HTML niet bewijzen of de voorraadclaim realtime en juist is.`,"Verifieer dat de claim aantoonbaar actueel en waar is; gebruik geen kunstmatige schaarste.",0,0)
    );
    seoChecks.push(!euConsumerApplicable
      ? check("not_applicable","eu_consumer_information_signal","seo","EU consumenteninformatie",euConsumerApplicable ? "Geen consumenteninformatie beoordeeld." : "EU-Omnibus & Consumer Rights is voor deze scan niet aantoonbaar van toepassing op deze markt/pagina.","Gebruik deze controle op relevante EU-webshops.",0,0)
      : hasReturnsSignal && hasVisibleBusinessIdentity && hasBusinessContactDetails
        ? check("pass","eu_consumer_information_signal","seo","EU consumenteninformatie","Retour-/herroepingssignalen, bedrijfsidentiteit en contactinformatie zijn op deze pagina aangetroffen.","Dit bewijst geen juridische conformiteit; controleer volledige voorwaarden, kosten en uitzonderingen afzonderlijk.",0,0)
        : check("unable_to_confirm","eu_consumer_information_signal","seo","EU consumenteninformatie","Niet alle retour-, bedrijfsidentiteits- en contactsignalen konden op deze losse pagina worden bevestigd.","Controleer deze informatie sitebreed in voorwaarden, contact, product en checkout. RankFix geeft alleen signalen.",0,0)
    );

    seoChecks.push(!hasEcommerceSignal
      ? check("not_applicable","price_currency_consistency","seo","Prijs & valuta consistentie","Geen duidelijke webshop/product-signalen gevonden; prijs- en valutaconsistentie is niet beoordeeld.","Gebruik deze controle op echte e-commercepagina's.",0,6)
      : currencyConflict
        ? check("warning","price_currency_consistency","seo","Prijs & valuta consistentie",`De zichtbare valuta (${visibleCurrencyCodes.join(", ")}) en Product/Offer structured data (${structuredCurrencyCodes.join(", ")}) spreken elkaar tegen.`,"Laat zichtbare prijs, valuta en Product/Offer-data dezelfde markt/valuta beschrijven. Controleer land-, btw- en promotielogica vóór publicatie.",2,6)
        : mixedVisibleCurrencies
          ? check("unable_to_confirm","price_currency_consistency","seo","Prijs & valuta consistentie",`Meerdere valuta zijn op deze pagina gevonden (${visibleCurrencyCodes.join(", ")}). Dat kan correct zijn door een valutakiezer of internationale marktweergave.`,"Controleer per land/taal of product, winkelwagen en checkout dezelfde geselecteerde valuta blijven gebruiken.",0,6)
          : isProductPage && visiblePriceEvidenceStrength === "explicit_product_markup" && structuredCurrencyCodes.length === 1 && visibleCurrencyCodes.length === 1 && structuredCurrencyCodes[0] === visibleCurrencyCodes[0]
            ? check("pass","price_currency_consistency","seo","Prijs & valuta consistentie",`Expliciet gemarkeerde productprijs en machineleesbare Product/Offer-data gebruiken dezelfde valuta: ${structuredCurrencyCodes[0]}.`,"Controleer dezelfde valuta later ook in winkelwagen en checkout; btw, verzending en promoties kunnen legitieme prijsverschillen veroorzaken.",6,6)
            : check("unable_to_confirm","price_currency_consistency","seo","Prijs & valuta consistentie","RankFix vond onvoldoende onafhankelijk zichtbaar én machineleesbaar valutabewijs om consistentie hard te bevestigen.","Controleer product, winkelwagen en checkout samen voordat prijsverschillen als fout worden beoordeeld.",0,6)
    );

    seoChecks.push(hasEcommerceSignal
      ? hasShippingSignal && hasReturnsSignal && (hasReviewPlatformSignal || hasCheckoutTrustSignal)
        ? check("pass","webshop_trust","seo","Webshop vertrouwen","Verzend-/retourinformatie en minimaal één duidelijk vertrouwenssignaal zijn zichtbaar.","Houd verzendkosten, retourvoorwaarden, betaalmethoden en reviews ook op checkout-niveau duidelijk.",7,7)
        : isHomepage || isProductPage
          ? check("unable_to_confirm","webshop_trust","seo","Webshop vertrouwen",isProductPage ? "Deze productpagina bevat webshop-signalen, maar een losse paginascan bewijst niet waar verzend-, retour- en betaalinformatie sitebreed beschikbaar is." : "Deze homepage bevat webshop-signalen, maar RankFix heeft in deze paginascan niet bewezen waar verzend-, retour- en betaalinformatie sitebreed staat.","Controleer deze signalen in een sitebrede crawl of op product-, service- en checkoutpagina's.",0,7)
          : check("warning","webshop_trust","seo","Webshop vertrouwen","Niet alle belangrijke verzend-, retour- en vertrouwenssignalen zijn zichtbaar op deze commerciële pagina.","Maak relevante verzend-, retour- en betaalinformatie duidelijk waar bezoekers de aankoopbeslissing nemen.",3,7)
      : check("not_applicable","webshop_trust","seo","Webshop vertrouwen","Geen duidelijke webshop-signalen gevonden; deze e-commercecontrole is niet van toepassing.","Gebruik deze controle op product- en categoriepagina's.",0,7));
    seoChecks.push(!isProductPage
      ? check("not_applicable","variant_url","seo","Productvariant-URL","Geen duidelijke productpagina-signalen gevonden; variant-URL-controle is niet van toepassing.","Gebruik deze controle op echte productpagina's.",0,5)
      : ecommerceVariantUrlSignal
        ? canonicalUrl && !canonicalIsCrossDomain && canonicalDropsQuery
          ? check("pass","variant_url","seo","Productvariant-URL","Deze product-URL bevat een variant-/SKU-parameter en de canonical consolideert de variant aantoonbaar naar dezelfde product-URL zonder queryparameters.","Behoud deze consistente variant- en canonicalstrategie en controleer afzonderlijk varianten die zelfstandig zoekwaarde hebben.",5,5)
          : check("unable_to_confirm","variant_url","seo","Productvariant-URL","Deze product-URL bevat een variant-/SKU-parameter, maar een parameter alleen bewijst geen duplicate-content- of indexatieprobleem.","Controleer canonical, indexeerbaarheid en variantgedrag samen voordat je de URL-strategie wijzigt.",0,5)
        : hasVariantSelectorSignal
          ? check("unable_to_confirm","variant_url","seo","Productvariant-URL","Er zijn variantkeuzes op de productpagina gevonden, maar uit de beschikbare pagina-evidence kan RankFix niet bevestigen hoe elke variant-URL en canonical zich gedraagt.","Controleer variant-URL's runtime en indexeer alleen varianten die zelfstandig zoekwaarde hebben.",0,5)
          : check("not_applicable","variant_url","seo","Productvariant-URL","Geen variantparameter of duidelijke variantselector gevonden; er is geen variantprobleem aantoonbaar.","Controleer opnieuw wanneer dit product varianten krijgt.",0,5));
    seoChecks.push(!isProductPage
      ? check("not_applicable","product_price_consistency","seo","Productprijs consistentie","Geen duidelijke productpagina-signalen gevonden; prijsvergelijking is niet van toepassing.","Gebruik deze controle op echte productpagina's.",0,6)
      : !visiblePriceCandidates.length || !structuredPriceCandidates.length
        ? check("unable_to_confirm","product_price_consistency","seo","Productprijs consistentie","RankFix kan niet zowel een betrouwbare zichtbare productprijs als een structured-data prijs aantoonbaar vergelijken.","Zorg dat de zichtbare productprijs en Product/Offer structured data beide beschikbaar en gelijk zijn.",0,6)
        : hasMatchingVisibleStructuredPrice && visiblePriceEvidenceStrength === "explicit_product_markup"
          ? check("pass","product_price_consistency","seo","Productprijs consistentie","Een expliciet gemarkeerde productprijs komt overeen met de Product/Offer structured-data prijs.","Houd zichtbare productprijs en structured data synchroon bij prijswijzigingen.",6,6)
          : hasMatchingVisibleStructuredPrice
            ? check("unable_to_confirm","product_price_consistency","seo","Productprijs consistentie","Een bedrag met een herkende valuta in de paginatekst komt overeen met de structured-data prijs, maar RankFix kan niet betrouwbaar bewijzen dat dit bedrag de primaire productprijs is.","Gebruik duidelijke productprijs-markup zodat de zichtbare prijs betrouwbaar aan het product kan worden gekoppeld.",0,6)
            : visiblePriceEvidenceStrength === "explicit_product_markup"
              ? check("warning","product_price_consistency","seo","Productprijs consistentie",`Expliciet gemarkeerde productprijswaarden (${visiblePriceCandidates.slice(0,4).join(", ")}) komen niet overeen met structured-data prijzen (${structuredPriceCandidates.slice(0,4).join(", ")}).`,"Synchroniseer de zichtbare productprijs met Product/Offer structured data.",2,6)
              : check("unable_to_confirm","product_price_consistency","seo","Productprijs consistentie","Er zijn eurobedragen en structured-data prijzen gevonden, maar de zichtbare bedragen zijn niet betrouwbaar aan de primaire productprijs te koppelen.","Gebruik expliciete productprijs-markup en houd die gelijk aan Product/Offer structured data.",0,6));
    seoChecks.push(!isProductPage
      ? check("not_applicable","product_availability","seo","Productvoorraad","Geen duidelijke productpagina-signalen gevonden; voorraadcontrole is niet van toepassing.","Gebruik deze controle op echte productpagina's.",0,5)
      : availabilityContradiction
        ? check("warning","product_availability","seo","Productvoorraad",`De zichtbare voorraadstatus (${visibleAvailabilityState}) spreekt de structured availability tegen (${structuredAvailabilityValues.slice(0,3).join(", ")}).`,"Synchroniseer de zichtbare voorraadstatus en Product/Offer availability; publiceer geen tegenstrijdige beschikbaarheid.",1,5)
        : structuredAvailabilityValues.length && visibleAvailabilityState
          ? check("pass","product_availability","seo","Productvoorraad",`Zichtbare voorraadstatus (${visibleAvailabilityState}) en structured availability (${structuredAvailabilityValues.slice(0,3).join(", ")}) zijn consistent.`,"Houd zichtbare voorraadstatus en structured availability synchroon.",5,5)
          : structuredAvailabilityValues.length
            ? check("unable_to_confirm","product_availability","seo","Productvoorraad",`Structured availability gevonden: ${structuredAvailabilityValues.slice(0,3).join(", ")}, maar RankFix kon geen eenduidige zichtbare voorraadstatus bevestigen.`,"Toon de voorraadstatus ook duidelijk aan bezoekers en houd die gelijk aan structured data.",0,5)
        : visibleAvailabilityState
          ? check("warning","product_availability","seo","Productvoorraad",`Een eenduidige zichtbare voorraadstatus is gevonden (${visibleAvailabilityState}), maar geen Offer availability in structured data.`,"Voeg de aantoonbare voorraadstatus toe aan Product/Offer structured data.",2,5)
          : check("unable_to_confirm","product_availability","seo","Productvoorraad",visibleAvailabilityAmbiguous ? `Meerdere zichtbare voorraadstatussen zijn in de pagina gevonden (${visibleAvailabilityStates.join(", ")}); RankFix koppelt die daarom niet automatisch aan het hoofdproduct.` : visibleStockSignal ? "Er is algemene voorraadtekst gevonden, maar RankFix kan daaruit geen eenduidige in-stock/out-of-stockstatus bewijzen en vindt ook geen Offer availability." : "Geen betrouwbare zichtbare of structured voorraadstatus gevonden.","Maak voorraadstatus expliciet bij het hoofdproduct en in Offer structured data.",0,5));
        seoChecks.push(!hasEcommerceSignal || !hasWebshopClaims
      ? check("not_applicable","webshop_claims","seo","Webshop-beloftes",!hasEcommerceSignal ? "Geen duidelijke webshop/product-signalen gevonden; claimcontrole is niet van toepassing." : "Geen specifieke verzend-/retourbelofte gevonden om te verifiëren.","Maak commerciële claims controleerbaar wanneer je ze gebruikt.",0,5)
      : hasShippingSignal && hasReturnsSignal
        ? check("pass","webshop_claims","seo","Webshop-beloftes","Belangrijke webshopbeloftes worden ondersteund door zichtbare verzend- en retourinformatie.","Zorg dat beloofde levertijden, retourtermijnen en verzendvoorwaarden juridisch en praktisch kloppen.",5,5)
        : check("warning","webshop_claims","seo","Webshop-beloftes",`De pagina bevat claims zoals ${webshopClaimMatches.slice(0,3).join(", ")}, maar de bijbehorende voorwaarden zijn niet duidelijk gevonden.`,"Maak claims controleerbaar via duidelijke verzend-, retour- en voorwaardenpagina's.",2,5));
    seoChecks.push(hasEcommerceSignal
      ? isHomepage || isProductPage
        ? check("unable_to_confirm","checkout_trust","seo","Checkout- en betaalvertrouwen",hasCheckoutTrustSignal ? `Betaal-/checkoutsignalen zijn zichtbaar op deze ${isProductPage ? "productpagina" : "homepage"}, maar RankFix heeft de echte winkelwagen- en checkoutflow niet uitgevoerd.` : `Deze ${isProductPage ? "productpagina" : "homepage"} bevat webshop-signalen, maar afwezigheid van betaalinformatie op deze pagina bewijst geen checkoutprobleem.`,"Controleer de echte winkelwagen- en checkoutflow voordat deze controle als volledig geslaagd wordt beoordeeld.",0,5)
        : hasCheckoutTrustSignal
          ? check("unable_to_confirm","checkout_trust","seo","Checkout- en betaalvertrouwen","Betaal-/checkoutsignalen zijn zichtbaar op deze pagina, maar een paginascan zonder interactieve checkout bewijst niet dat de checkoutflow functioneert.","Voer een gecontroleerde winkelwagen- en checkoutflow uit voordat deze controle als volledig geslaagd wordt beoordeeld.",0,5)
          : check("warning","checkout_trust","seo","Checkout- en betaalvertrouwen","Geen duidelijke betaal- of checkoutsignalen gevonden op deze commerciële pagina.","Toon betaalmogelijkheden en relevante veiligheids-/vertrouwensinformatie waar de bezoeker een aankoopbeslissing neemt.",2,5)
      : check("not_applicable","checkout_trust","seo","Checkout- en betaalvertrouwen","Geen webshop-signalen gevonden; checkoutcontrole is niet van toepassing.","Gebruik deze controle op echte webshopcontent.",0,5));
    const adsApplicableByCustomer = hasAdsProfile && Boolean(adsProfile.campaignGoal || adsProfile.primaryOffer || adsProfile.targetCountries || adsProfile.adLanguages);
    const adsApplicableByEvidence = adsTrackingSignals > 0 || hasConversionSignal || hasExplicitAdsConversionSnippet;
    const adsApplicable = adsApplicableByCustomer || adsApplicableByEvidence;
    seoChecks.push(
      !adsApplicable
        ? check("not_applicable","ads_readiness","seo","Google Ads readiness","Geen Ads-doel of publieke advertentietracking aangetoond; deze controle telt daarom niet mee in de score.","Vul het Google Ads-profiel in wanneer Ads voor deze website relevant is.",0,6)
        : hasGoogleAdsTag && hasGa4 && (hasConversionSignal || hasExplicitAdsConversionSnippet)
        ? check("unable_to_confirm","ads_readiness","seo","Google Ads readiness",`Google Ads-tag${googleAdsIds.length ? ` (${googleAdsIds.join(", ")})` : ""}, GA4${ga4MeasurementIds.length ? ` (${ga4MeasurementIds.join(", ")})` : ""} en expliciete conversiecode zijn in de publieke bron gevonden. Events: ${uniqueConversionEventNames.slice(0,5).join(", ") || "geen naam gevonden"}; Ads send_to: ${googleAdsSendToLabels.length}; consent-signaal: ${hasConsentModeSignal ? "gevonden" : "niet aangetoond"}. Dit bewijst nog niet dat tags runtime afvuren of conversies door Google worden ontvangen.`,"Verifieer met Tag Assistant/Preview en controleer daarna ontvangen events en consentstatus in GA4/Google Ads.",0,6)
        : adsTrackingSignals > 0 || hasConversionSignal || hasExplicitAdsConversionSnippet
          ? check("unable_to_confirm","ads_readiness","seo","Google Ads readiness",`Trackingcode is gedeeltelijk aangetroffen. Ads-ID's: ${googleAdsIds.length}; GA4-ID's: ${ga4MeasurementIds.length}; GTM-containers: ${gtmContainerIds.length}; expliciete events: ${uniqueConversionEventNames.length}; Ads conversion labels: ${googleAdsSendToLabels.length}; consent-signaal: ${hasConsentModeSignal ? "gevonden" : "niet aangetoond"}.`,"Maak de meetketen compleet en verifieer Google tag, GA4, Ads-conversies en consent runtime.",0,6)
          : check("unable_to_confirm","ads_readiness","seo","Google Ads readiness","Google Ads is volgens de opgegeven scancontext relevant, maar in de publieke HTML zijn geen Google Ads/GA4-signalen bevestigd. Client-side of via GTM geladen tracking kan met deze broncontrole gemist worden.","Controleer de runtime meetketen met Tag Assistant/Preview voordat je concludeert dat tracking ontbreekt.",0,6));
    const organizationWebsiteSignals = Number(organizationSchemaPresent) + Number(websiteSchemaPresent);
    const organizationWebsitePoints = organizationWebsiteSignals === 2 ? 8 : organizationWebsiteSignals === 1 ? 6 : 4;
    geoChecks.push(isHomepage
      ? organizationSchemaPresent && websiteSchemaPresent
        ? check("pass", "organization_website", "geo", "Organization + WebSite", "Organization en WebSite structured data zijn aanwezig op de homepage.", "Houd naam, URL en logo consistent met de zichtbare site-identiteit.", 8, 8)
        : metadataMayBeClientRendered && validJsonLd === 0
          ? check("unable_to_confirm", "organization_website", "geo", "Organization + WebSite", "Organization/WebSite structured data kon niet betrouwbaar worden bevestigd omdat deze JavaScript-pagina niet volledig kon worden gerenderd.", "Controleer de homepage opnieuw met een volledige render voordat je Organization of WebSite schema toevoegt.", 0, 8)
          : check("warning", "organization_website", "geo", "Organization + WebSite", organizationWebsiteSignals === 1 ? "De homepage bevat één van de twee identity-schema's (Organization of WebSite); het aanvullende schema ontbreekt." : "De homepage bevat geen bevestigd Organization- of WebSite-schema. Dit is machineleesbaar identity-advies en geen bewijs dat de zichtbare organisatie-identiteit ontbreekt.", "Voeg alleen passende Organization- en/of WebSite JSON-LD toe met aantoonbare gegevens.", organizationWebsitePoints, 8)
      : check("not_applicable", "organization_website", "geo", "Organization + WebSite", "Homepage-specifieke Organization/WebSite-controle is niet vereist op deze URL.", "Controleer de homepage afzonderlijk voor organisatie- en website-identiteit.", 0, 8)
    );

    const primaryProductEvidence = productOfferEvidence.find((product) => Boolean(product.name)) || productOfferEvidence[0] || null;
    const productOptimizerSourceCount = [
      Boolean(primaryProductEvidence?.name),
      Boolean(description),
      Boolean(title),
      Boolean(primaryProductEvidence?.sku),
      Boolean(primaryProductEvidence?.offers?.some((offer) => offer.price && offer.currency)),
      Boolean(primaryProductEvidence?.offers?.some((offer) => offer.availability)),
    ].filter(Boolean).length;
    console.info("RankFix scan phase", { phase: "product_optimizer_ready", page: finalUrl.toString(), isProductPage, productOptimizerSourceCount, hasPrimaryProduct: Boolean(primaryProductEvidence) });
    geoChecks.push(isProductPage
      ? productOptimizerSourceCount >= 3
        ? check("pass", "product_copy_optimizer", "geo", "AI Product Copy & Metadata", `Deze productpagina heeft ${productOptimizerSourceCount} controleerbare bronvelden voor veilige AI-optimalisatie. RankFix kan hiermee een voorstel maken zonder producteigenschappen te verzinnen.`, "Gebruik Product Optimizer voor een preview van productcopy en metadata. Controleer het voorstel vóór publicatie.", 5, 5)
        : check("unable_to_confirm", "product_copy_optimizer", "geo", "AI Product Copy & Metadata", "Deze productpagina heeft te weinig controleerbare brongegevens om veilig productcopy te genereren.", "Voeg eerst betrouwbare productnaam, beschrijving en Product/Offer-data toe voordat AI-optimalisatie wordt gebruikt.", 0, 5)
      : check("not_applicable", "product_copy_optimizer", "geo", "AI Product Copy & Metadata", "Geen bewezen productdetailpagina; Product Optimizer is hier niet van toepassing.", "Scan een echte productdetailpagina om Product Optimizer te gebruiken.", 0, 5)
    );

    geoChecks.push(isProductPage
      ? productSchemaPresent
        ? hasCompleteProductOffer
          ? check("pass", "product_schema", "geo", "Product structured data", "Product JSON-LD bevat aantoonbaar productnaam, afbeelding en Offer-data met prijs, valuta en beschikbaarheid.", "Houd structured data gelijk aan de zichtbare productinformatie en controleer wijzigingen opnieuw.", 8, 8)
          : check("warning", "product_schema", "geo", "Product structured data", "Product JSON-LD is aanwezig, maar RankFix vindt geen compleet Product/Offer-bewijs met productnaam, afbeelding, prijs, valuta en beschikbaarheid.", "Vul alleen aantoonbare Product/Offer-velden aan en laat structured data overeenkomen met de zichtbare productpagina.", 4, 8)
        : metadataMayBeClientRendered
          ? check("unable_to_confirm", "product_schema", "geo", "Product structured data", "Deze URL heeft productpagina-signalen, maar de JavaScript-pagina kon niet volledig worden gerenderd. Afwezig Product JSON-LD in de beschikbare HTML bewijst daarom niet dat Product structured data live ontbreekt.", "Controleer de productpagina opnieuw met een volledige render voordat structured data wordt toegevoegd.", 0, 8)
          : check("warning", "product_schema", "geo", "Product structured data", "Deze pagina is als productpagina herkend, maar Product JSON-LD ontbreekt.", "Voeg Product structured data toe met alleen gegevens die zichtbaar en aantoonbaar zijn.", 3, 8)
      : check("not_applicable", "product_schema", "geo", "Product structured data", productSchemaPresent
          ? "Product JSON-LD is aangetroffen, maar deze URL is niet als productdetailpagina herkend; een volledig Product/Offer-object is daarom voor deze paginascan niet vereist."
          : "Geen duidelijke productpagina-signalen gevonden; Product schema is hier niet van toepassing.", "Valideer volledige Product/Offer-data op echte productdetailpagina's.", 0, 8)
    );

    geoChecks.push(hasEntitySchema
      ? check("pass", "entity", "geo", "Entity-signalen", `Entity schema gevonden: ${schemaTypes.slice(0, 5).join(", ")}.`, "Maak organisatie, product, persoon of publicatie nog duidelijker met consistente gegevens.", 10, 10)
      : hasVisibleBusinessIdentity && (hasBusinessContactDetails || hasSocialOrReviewSignal)
        ? check("pass", "entity", "geo", "Entity-signalen", "Duidelijke bedrijfsidentiteit en externe/contactsignalen zijn zichtbaar op de pagina.", "Maak de identiteit ook machineleesbaar met passende Organization/LocalBusiness structured data.", 10, 10)
        : hasVisibleBusinessIdentity
          ? check("warning", "entity", "geo", "Entity-signalen", "Een bedrijfsidentiteit is zichtbaar, maar aanvullende contact- of externe profielsignalen zijn beperkt.", "Maak de organisatie-identiteit concreter met contactgegevens, officiële profielen en passende schema.org data.", 6, 10)
          : check("unable_to_confirm", "entity", "geo", "Entity-signalen", "De beschikbare pagina bevat te weinig onafhankelijk bewijs om entity-signalen betrouwbaar te beoordelen.", "Bevestig organisatie- of merknaam, contactcontext en officiële profielen met aanvullende pagina- of sitebrede evidence.", 0, 10)
    );
    const visibleBreadcrumbSignal = !isHomepage && Boolean(
      /<(?:nav|ol|ul)\b[^>]*(?:aria-label\s*=\s*["'][^"']*(?:breadcrumb|broodkruimel|fil d['’]ariane|brotkrumen|migas)[^"']*["']|class\s*=\s*["'][^"']*(?:breadcrumb|breadcrumbs|broodkruimel)[^"']*["'])/i.test(html) ||
      /\b(?:breadcrumb|breadcrumbs|broodkruimel(?:s)?|fil d['’]ariane|brotkrumen|migas de pan)\b/i.test(text)
    );
    geoChecks.push(hasBreadcrumb
      ? check("pass", "breadcrumbs", "geo", "Breadcrumbs", "BreadcrumbList structured data is aanwezig.", "Houd breadcrumbs gelijk aan de zichtbare navigatiestructuur.", 6, 6)
      : isHomepage
        ? check("not_applicable", "breadcrumbs", "geo", "Breadcrumbs", "Op de homepage is BreadcrumbList normaal niet nodig wanneer er geen breadcrumb-hiërarchie is; deze controle telt daarom niet mee.", "Gebruik BreadcrumbList vooral op diepe content-, categorie- en productpagina's.", 0, 6)
        : visibleBreadcrumbSignal
          ? check("warning", "breadcrumbs", "geo", "Breadcrumbs", "Een zichtbare breadcrumb-navigatie is aantoonbaar aanwezig, maar RankFix vindt geen BreadcrumbList structured data die deze hiërarchie machineleesbaar beschrijft.", "Voeg BreadcrumbList alleen toe met dezelfde stappen en URL's als de zichtbare breadcrumb-navigatie.", 3, 6)
          : metadataMayBeClientRendered
            ? check("unable_to_confirm", "breadcrumbs", "geo", "Breadcrumbs", "Geen BreadcrumbList of betrouwbare zichtbare breadcrumb kon worden bevestigd en de JavaScript-pagina kon niet volledig worden gerenderd.", "Controleer de zichtbare navigatiestructuur opnieuw met een volledige render voordat BreadcrumbList als verbeterpunt wordt aangemerkt.", 0, 6)
            : check("not_applicable", "breadcrumbs", "geo", "Breadcrumbs", "Op deze diepere pagina is geen zichtbare breadcrumb-navigatie aangetoond. Ontbrekende BreadcrumbList wordt daarom niet als fout behandeld.", "Voeg BreadcrumbList alleen toe wanneer de pagina ook een echte hiërarchische breadcrumb gebruikt.", 0, 6)
    );
    geoChecks.push(hasFaqContent || hasFaqSchema
      ? check("pass", "faq", "geo", "Vraag & antwoord content", "FAQ/Q&A-signalen zijn op de pagina gevonden.", "Beantwoord echte klantvragen kort, concreet en zonder marketingtaal.", 10, 10)
      : check("not_applicable", "faq", "geo", "Vraag & antwoord content", "Geen duidelijke FAQ/Q&A-sectie gevonden. Een FAQ is niet verplicht voor iedere pagina en wordt daarom niet als GEO-fout bestraft.", "Voeg alleen relevante vragen en directe antwoorden toe wanneer dit de gebruiker inhoudelijk helpt.", 0, 10)
    );
    const ecommerceExpertiseSignal = hasEcommerceSignal && (
      hasOrganizationIdentity ||
      schemaSet.has("brand") ||
      organizationName ||
      hasBusinessContactDetails ||
      hasSocialOrReviewSignal
    );
    const organizationExpertiseSignal = hasOrganizationIdentity && hasServiceExpertiseSignal;
    geoChecks.push(isHomepage
      ? check("not_applicable", "author", "geo", "Expertise-signalen", "Een individuele auteur is niet vereist op een organisatie-, dienst- of merkhomepage. Auteurschap en expertise horen vooral op informatieve artikelen en adviescontent te worden beoordeeld.", "Controleer auteur, expertise, publicatiedatum en broncontext op pagina's waar auteurschap inhoudelijk relevant is.", 0, 8)
      : hasAuthorSignal || (hasLocalBusinessSignal && hasServiceExpertiseSignal) || organizationExpertiseSignal
        ? check("pass", "author", "geo", "Expertise-signalen", hasAuthorSignal ? "Auteur- of expertisesignalen zijn gevonden." : organizationExpertiseSignal ? "Duidelijke organisatie- en expertisesignalen zijn gevonden." : "Duidelijke dienst- en vakgebiedsignalen zijn gevonden voor deze lokale bedrijfspagina.", "Maak auteur, expertise, diensten en bronnen waar relevant nog explicieter.", 8, 8)
        : ecommerceExpertiseSignal
          ? check("pass", "author", "geo", "Expertise-signalen", "Voor deze webshop zijn merk-, organisatie- en productcontext-signalen gevonden; een individuele auteur is niet noodzakelijk voor productcontent.", "Maak merk-, product- en organisatiecontext consistent en voeg auteurs of bronnen toe waar informatieve content dat vereist.", 8, 8)
          : hasArticleSignal
            ? check("warning", "author", "geo", "Expertise-signalen", "Geen duidelijke auteur/expertisesignalen gevonden op deze informatieve contentpagina.", "Voeg auteur, organisatie, expertise en betrouwbare bronnen toe wanneer de inhoud advies of kennis publiceert.", 3, 8)
            : check("not_applicable", "author", "geo", "Expertise-signalen", "Een individuele auteur is niet vereist voor deze dienst-, organisatie- of conversiepagina.", "Maak organisatie en vakgebied duidelijk; voeg auteurschap alleen toe waar informatieve content dat inhoudelijk vereist.", 0, 8)
    );
    geoChecks.push(hasContactChannelSignal || hasAboutSignal || hasSocialOrReviewSignal
      ? check("pass", "trust", "geo", "Trust & context", hasAboutSignal ? "Contact- en organisatiecontext zijn zichtbaar." : "Concrete contact-, locatie- of externe profielsignalen zijn zichtbaar.", "Houd bedrijfsnaam, contactgegevens, locatie, verantwoordelijkheden en officiële profielen consistent.", 8, 8)
      : thinRawHtmlEvidence
        ? check("unable_to_confirm", "trust", "geo", "Trust & context", "De beschikbare raw HTML bevat onvoldoende betrouwbare zichtbare organisatie-/contactcontext en deze JavaScript-pagina kon niet volledig worden beoordeeld.", "Controleer trust- en contactcontext opnieuw met een volledige render voordat dit als tekortkoming wordt aangemerkt.", 0, 8)
        : check("warning", "trust", "geo", "Trust & context", "Contact- of organisatiecontext is beperkt gevonden.", "Maak organisatie, contact, locatie en verantwoordelijkheden duidelijk.", 3, 8)
    );
    // GEO summary readiness must not double-penalize the same missing Open Graph
    // fields already covered by the SEO social-metadata rule. Use independent
    // page-summary evidence here: the normal meta description and meaningful
    // visible page copy. Open Graph remains a social-preview concern above.
    const hasExplicitPageSummary = Boolean(description) && wordCount >= (isProductPage ? 40 : 80);
    geoChecks.push(hasExplicitPageSummary
      ? check("pass", "answer", "geo", "Expliciete paginasamenvatting", "Een meta description en voldoende zichtbare paginatekst geven samen een concrete samenvatting van de pagina.", "Houd de meta description en zichtbare introductie inhoudelijk consistent.", 6, 6)
      : metadataMayBeClientRendered
        ? check("unable_to_confirm", "answer", "geo", "Expliciete paginasamenvatting", "De beschikbare raw HTML bewijst geen complete paginasamenvatting en deze JavaScript-pagina kon niet volledig worden gerenderd.", "Controleer de zichtbare introductie opnieuw met een volledige render voordat dit als GEO-verbeterpunt wordt aangemerkt.", 0, 6)
        : check("warning", "answer", "geo", "Expliciete paginasamenvatting", "RankFix vond onvoldoende combinatie van een beschrijvende meta description en zichtbare paginatekst om een expliciete paginasamenvatting te bevestigen.", "Voeg een concrete meta description en duidelijke zichtbare introductie toe; dit is een readiness-signaal en geen garantie op zichtbaarheid in AI-zoekmachines.", 2, 6)
    );
    // Brand identity is a visible-consistency check. Structured data quality is scored separately above,
    // so missing Organization JSON-LD must not create a second schema penalty here.
    const titleBrandCandidate = (title.split(/[|–—-]/)[0] || "").trim();
    const escapedTitleBrand = titleBrandCandidate.replace(/[.*+?^{}()|[\]\\]/g, "\\$&");
    const visibleTitleBrandSignal = titleBrandCandidate.length >= 3 &&
      new RegExp(`\\b${escapedTitleBrand}\\b`, "i").test(text);
    const visibleBrandNameSignal = Boolean(
      organizationName ||
      firstMatch(html, /<meta[^>]+name\s*=\s*["']application-name["'][^>]+content\s*=\s*["']([^"']+)["']/i) ||
      visibleTitleBrandSignal ||
      /<img[^>]+(?:class|id)\s*=\s*["'][^"']*(?:logo|brand)[^"']*["']/i.test(html) ||
      /<img[^>]+alt\s*=\s*["'][^"']*(?:logo|brand)[^"']*["']/i.test(html)
    );
    const visibleBrandLogoSignal = Boolean(
      /<img[^>]+(?:class|id)\s*=\s*["'][^"']*(?:logo|brand)[^"']*["']/i.test(html) ||
      /<img[^>]+alt\s*=\s*["'][^"']*(?:logo|brand)[^"']*["']/i.test(html) ||
      /<(?:a|div|span)[^>]+(?:class|id)\s*=\s*["'][^"']*(?:logo|brand)[^"']*["'][^>]*>[\s\S]{1,500}?<\/(?:a|div|span)>/i.test(html)
    );
    const visibleBrandSignalChecks = [
      { label: "merknaam/branding", found: visibleBrandNameSignal },
      { label: "logo", found: visibleBrandLogoSignal },
      { label: "bedrijfs-/contactgegevens", found: hasContactChannelSignal },
      { label: "officieel social/review-profiel", found: hasSocialOrReviewSignal },
    ];
    const visibleBrandSignals = visibleBrandSignalChecks.filter((signal) => signal.found).length;
    const foundBrandSignals = visibleBrandSignalChecks.filter((signal) => signal.found).map((signal) => signal.label);
    const missingBrandSignals = visibleBrandSignalChecks.filter((signal) => !signal.found).map((signal) => signal.label);
    const brandSignalDetail = `${visibleBrandSignals}/4 merksignalen gevonden. Gevonden: ${foundBrandSignals.length ? foundBrandSignals.join(", ") : "geen"}. Ontbrekend: ${missingBrandSignals.length ? missingBrandSignals.join(", ") : "geen"}.`;
    const brandRecommendation = missingBrandSignals.length
      ? `Maak de ontbrekende merksignalen duidelijk en consistent zichtbaar: ${missingBrandSignals.join(", ")}. Structured data wordt apart beoordeeld.`
      : "Houd merknaam, logo, contactgegevens en officiële profielen consistent. Structured data wordt apart beoordeeld.";
    const brandIdentityPoints = visibleBrandSignals >= 3 ? 5 : visibleBrandSignals === 2 ? 4 : visibleBrandSignals === 1 ? 3 : 2;
    geoChecks.push(visibleBrandSignals >= 3
      ? check("pass", "identity", "geo", "Brand identity", brandSignalDetail, brandRecommendation, 5, 5)
      : thinRawHtmlEvidence
        ? check("unable_to_confirm", "identity", "geo", "Brand identity", `${brandSignalDetail} De beschikbare raw HTML is te dun om ontbrekende zichtbare merksignalen betrouwbaar als probleem te beoordelen.`, "Controleer de zichtbare merkidentiteit opnieuw met een volledige render.", 0, 5)
        : visibleBrandSignals >= 1
          ? check("warning", "identity", "geo", "Brand identity", brandSignalDetail, brandRecommendation, brandIdentityPoints, 5)
          : metadataMayBeClientRendered
            ? check("unable_to_confirm", "identity", "geo", "Brand identity", `${brandSignalDetail} De JavaScript-pagina kon niet volledig worden gerenderd, dus afwezigheid in raw HTML is onvoldoende bewijs voor een harde merkidentiteitsconclusie.`, "Controleer de zichtbare merkidentiteit opnieuw met een volledige render.", 0, 5)
            : check("warning", "identity", "geo", "Brand identity", brandSignalDetail, brandRecommendation, brandIdentityPoints, 5)
    );

    const ruleMap: Record<string, { rule_id: string; severity: Check["severity"] }> = {
      title: { rule_id: title ? "META_TITLE_GUIDANCE" : "META_TITLE_MISSING", severity: title ? "MEDIUM" : "HIGH" },
      description: { rule_id: description ? "META_DESCRIPTION_GUIDANCE" : "META_DESCRIPTION_MISSING", severity: description ? "LOW" : "HIGH" },
      h1: { rule_id: h1s.length > 1 ? "H1_MULTIPLE" : "H1_MISSING", severity: h1s.length ? "MEDIUM" : "HIGH" },
      alt: { rule_id: "IMAGE_ALT_MISSING", severity: "LOW" },
      social: { rule_id: "SOCIAL_METADATA_INCOMPLETE", severity: "LOW" },
      schema: { rule_id: "STRUCTURED_DATA_MISSING", severity: "MEDIUM" },
      twitter_card: { rule_id: "TWITTER_CARD_MISSING", severity: "LOW" },
      hreflang: { rule_id: "HREFLANG_MISSING", severity: "MEDIUM" },
      duplicate_path: { rule_id: "DUPLICATE_URL_PATH", severity: "MEDIUM" },
      html_escape: { rule_id: "HTML_ESCAPE_VISIBLE", severity: "LOW" },
      image_sources: { rule_id: "EXTERNAL_IMAGE_SOURCE", severity: "LOW" },
      business_placeholders: { rule_id: "BUSINESS_PLACEHOLDER", severity: "HIGH" },
      price_format: { rule_id: "PRICE_FORMAT", severity: "LOW" },
      webshop_trust: { rule_id: "WEBSHOP_TRUST_SIGNALS", severity: "HIGH" },
      variant_url: { rule_id: "PRODUCT_VARIANT_URL", severity: "MEDIUM" },
      webshop_claims: { rule_id: "WEBSHOP_CLAIM_VERIFICATION", severity: "MEDIUM" },
      checkout_trust: { rule_id: "CHECKOUT_TRUST_SIGNALS", severity: "MEDIUM" },
      ads_readiness: { rule_id: "GOOGLE_ADS_READINESS", severity: "MEDIUM" },
      organization_website: { rule_id: "ORGANIZATION_WEBSITE_SCHEMA", severity: "MEDIUM" },
      product_schema: { rule_id: "PRODUCT_SCHEMA_MISSING", severity: "MEDIUM" },
      product_price_consistency: { rule_id: "PRODUCT_PRICE_CONSISTENCY", severity: "HIGH" },
      product_availability: { rule_id: "PRODUCT_AVAILABILITY", severity: "MEDIUM" },
      product_copy_optimizer: { rule_id: "PRODUCT_COPY_OPTIMIZER", severity: "LOW" },
    };
    for (const item of [...seoChecks, ...geoChecks]) {
      const mapped = ruleMap[item.key];
      if (mapped) {
        item.rule_id = mapped.rule_id;
        item.issue_id = mapped.rule_id;
        item.severity = mapped.severity;
        item.fix_category = getFixPolicy(mapped.rule_id).category;
      }
      const evidenceByKey: Record<string, string | number | boolean | null> = {
        // Proven absence is evidence too. Keep an explicit marker so missing title/description
        // can safely pass the AI/GitHub fix evidence gate without weakening that gate.
        title: title || (item.key === "title" ? "metaTitlePresent=false" : null),
        description: description || (item.key === "description" ? "metaDescriptionPresent=false" : null),
        h1: h1s.length,
        headings: headings.length,
        canonical: canonical || (item.key === "canonical" ? "canonicalPresent=false" : null),
        viewport: viewportContent || null,
        lang: lang || null,
        alt: imageElementCount ? imagesMissingAlt : null,
        schema: validJsonLd ? `blocks=${validJsonLd}; types=${[...new Set(schemaTypes)].slice(0,12).join(",")}; contextRelevant=${hasRelevantContextSchema}` : (item.key === "schema" ? "validJsonLdBlocks=0" : null),
        https: finalUrl.protocol === "https:",
        status: response.status,
        response: responseTime,
        sitemap: sitemapFound ? (confirmedSitemapUrl || true) : robotsDeclaredSitemapUrls.length ? `declared=${robotsDeclaredSitemapUrls.join(",")}; status=${sitemapStatus}` : sitemapStatus,
        robots_txt: robotsStatus === "PASS" ? `${robotsUrl.toString()}; pathBlocked=${robotsPathBlocked}${matchingRobotsRules[0] ? `; rule=${matchingRobotsRules[0].kind}:${matchingRobotsRules[0].path}` : ""}` : robotsStatus,
        indexability: noindexSignal ? [robots, xRobotsTag].filter(Boolean).join(" | ") : robotsPathBlocked ? `robots disallow: ${matchingRobotsRules[0].path}` : "no noindex or applicable robots block found",
        hreflang: hreflangEntries.length ? hreflangEntries.map((entry) => `${entry.language}=>${entry.href || "missing"}`).join(" | ") : null,
        twitter_card: twitterCard || null,
        security_headers: presentSecurityHeaders.length ? `present=${presentSecurityHeaders.map(([name])=>name).join(",")}; core=${coreSecurityHeadersPresent}` : "present=none; core=false",
        faq: (hasFaqContent || hasFaqSchema) ? `content=${hasFaqContent}; schema=${hasFaqSchema}` : (item.key === "faq" ? "faqContent=false; faqSchema=false" : null),
        breadcrumbs: (hasBreadcrumb || visibleBreadcrumbSignal) ? `schema=${hasBreadcrumb}; visible=${visibleBreadcrumbSignal}` : null,
        trust_legal_signals: item.key === "trust_legal_signals" ? `privacy=${hasPrivacyLink}; cookies=${hasCookieLink}; contact=${hasContactLink}` : null,
        social: [ogTitle ? "og:title" : "", ogDescription ? "og:description" : "", ogImage ? "og:image" : ""].filter(Boolean).join(", ") || (item.key === "social" ? "Open Graph core fields missing" : null),
        product_schema: isProductPage && hasProductSchema ? JSON.stringify(productOfferSummary.slice(0, 3)) : null,
        webshop_claims: hasWebshopClaims ? webshopClaimMatches.slice(0, 3).join(", ") : null,
        variant_url: ecommerceVariantUrlSignal ? finalUrl.search : null,
        checkout_trust: hasCheckoutTrustSignal ? "checkout/payment signal found in static page content" : null,
        product_price_consistency: isProductPage ? `visible=${visiblePriceCandidates.join(",") || "none"}; visibleEvidence=${visiblePriceEvidenceStrength}; schema=${structuredPriceCandidates.join(",") || "none"}` : null,
        product_availability: isProductPage ? `visibleState=${visibleAvailabilityState || "none"}; schemaStates=${structuredAvailabilityStates.join(",") || "none"}; schema=${structuredAvailabilityValues.join(",") || "none"}; contradiction=${availabilityContradiction}` : null,
        product_copy_optimizer: isProductPage ? `verifiedSourceFields=${productOptimizerSourceCount}; product=${primaryProductEvidence?.name || "unknown"}` : null,
        ads_readiness: (adsTrackingSignals || hasConversionSignal || hasExplicitAdsConversionSnippet) ? `adsIds=${googleAdsIds.join(",") || "none"}; ga4Ids=${ga4MeasurementIds.join(",") || "none"}; events=${uniqueConversionEventNames.join(",") || "none"}; adsLabels=${googleAdsSendToLabels.join(",") || "none"}; consentSignal=${hasConsentModeSignal}` : null,
        broken_links: allUniqueInternalAnchors.length ? `discovered=${allUniqueInternalAnchors.length}; checked=${linkAuditResults.length}; broken=${brokenInternalLinks.length}; sampleLimit=24; truncated=${allUniqueInternalAnchors.length > linkAuditResults.length}` : null,
        internal_redirects: allUniqueInternalAnchors.length ? `discovered=${allUniqueInternalAnchors.length}; checked=${linkAuditResults.length}; redirected=${redirectedInternalLinks.length}; sampleLimit=24; truncated=${allUniqueInternalAnchors.length > linkAuditResults.length}` : null,
        semantic_link_destination: uniqueInternalAnchors.length ? `links=${uniqueInternalAnchors.length}; semanticMismatches=${semanticLinkMismatches.length}; cardMismatches=${productCardMismatches.length}; featuredMismatches=${featuredProductMismatches.length}` : null,
        duplicate_path: `duplicateSegments=${hasDuplicatePathSegments}; found=${[...new Set(actionableDuplicatePathSegments)].join(",") || "none"}`,
        html_escape: `visibleEscape=${hasVisibleHtmlEscape}`,
        image_sources: `images=${imageElementCount}; external=${externalImageUrls.length}; stockHosts=${stockImageUrls.length}`,
        commercial_terms_signal: hasEcommerceSignal ? `termsLink=${hasTermsLink}` : null,
        merchant_product_readiness: hasEcommerceSignal && isProductPage ? `ready=${merchantProductReadiness}; productSchema=${hasProductSchema}; offers=${productOfferSummary.length}` : null,
        accessibility_basics: `imagesMissingAlt=${imagesMissingAlt}; unlabeledControls=${unlabeledFormControls}; emptyButtons=${emptyButtons}; emptyButtonEvidence=${emptyButtonEvidence.join(" | ") || "none"}; source=${javascriptExecuted ? "rendered_html" : "raw_html"}`,
        consent_mode_readiness: adsTrackingSignals > 0 ? `trackingSignals=${adsTrackingSignals}; explicitConsentSignal=${hasConsentModeSignal}; runtimeNotExecuted=true` : null,
        merchant_feed_signal: hasEcommerceSignal ? `feedHint=${hasMerchantFeedHint}; productReadiness=${merchantProductReadiness}; websiteSignalsOnly=true` : null,
        content: `wordCount=${wordCount}; pageType=${contentContext}; minimum=${contentMinimumSignal}; strong=${contentStrongSignal}`,
        business_placeholders: `placeholders=${placeholderMatches.length}; found=${placeholderMatches.slice(0,4).join(",") || "none"}`,
        price_format: hasEcommerceSignal ? `dotDecimalPrices=${priceFormatMatches.length}; sample=${priceFormatMatches[0] || "none"}` : null,
        price_currency_consistency: hasEcommerceSignal ? `visibleCurrencies=${visibleCurrencyCodes.join(",") || "none"}; structuredCurrencies=${structuredCurrencyCodes.join(",") || "none"}; conflict=${currencyConflict}; mixedVisible=${mixedVisibleCurrencies}` : null,
        eu_consumer_information_signal: hasEcommerceSignal ? `returns=${hasReturnsSignal}; businessIdentity=${hasVisibleBusinessIdentity}; businessContact=${hasBusinessContactDetails}; legalConclusion=false` : null,
        eu_discount_reference_signal: hasEcommerceSignal ? `discountClaim=${hasDiscountClaim}; referencePrice=${hasReferencePriceSignal}; historicalPriceNotVerified=true` : null,
        eu_review_transparency_signal: hasEcommerceSignal ? `reviewContent=${reviewContentSignal}; transparencySignal=${reviewTransparencySignal}` : null,
        eu_scarcity_signal: hasEcommerceSignal ? `scarcityClaim=${hasScarcityClaim}; runtimeTruthNotVerified=true` : null,
        checkout_funnel_static: hasEcommerceSignal ? `productPage=${isProductPage}; addToCart=${addToCartMarkupSignal}; cartLink=${cartHrefSignal}; checkoutLink=${checkoutHrefSignal}; staticHtmlOnly=true` : null,
        checkout_information_signal: hasEcommerceSignal ? `shipping=${hasShippingSignal}; shippingCost=${shippingCostSignal}; paymentMethods=${paymentMethodSignal}; staticHtmlOnly=true` : null,
        webshop_trust: hasEcommerceSignal ? `shipping=${hasShippingSignal}; returns=${hasReturnsSignal}; reviewPlatform=${hasReviewPlatformSignal}; checkoutSignal=${hasCheckoutTrustSignal}` : null,
        organization_website: isHomepage ? `organizationSchema=${organizationSchemaPresent}; websiteSchema=${websiteSchemaPresent}; schemaTypes=${schemaTypes.slice(0,12).join(",")}` : null,
        entity: hasEntitySchema ? `schemaTypes=${schemaTypes.slice(0,12).join(",")}` : (hasVisibleBusinessIdentity ? `visibleIdentity=true; contact=${hasBusinessContactDetails}; externalProfile=${hasSocialOrReviewSignal}` : null),
        author: (hasAuthorSignal || ecommerceExpertiseSignal || organizationExpertiseSignal || (hasLocalBusinessSignal && hasServiceExpertiseSignal)) ? `author=${hasAuthorSignal}; ecommerceExpertise=${ecommerceExpertiseSignal}; organizationExpertise=${organizationExpertiseSignal}; localServiceExpertise=${hasLocalBusinessSignal && hasServiceExpertiseSignal}` : null,
        trust: (hasContactChannelSignal || hasAboutSignal || hasSocialOrReviewSignal) ? `contact=${hasContactChannelSignal}; about=${hasAboutSignal}; socialOrReview=${hasSocialOrReviewSignal}` : null,
        answer: `metaDescription=${Boolean(description)}; wordCount=${wordCount}; minimumVisibleWords=${isProductPage ? 40 : 80}; rendered=${javascriptExecuted}`,
        sector_real_estate_listings: sectorProfile.sector==="real_estate" ? "sector=real_estate; listing evidence evaluated" : null,
        sector_real_estate_leads: sectorProfile.sector==="real_estate" ? `sector=real_estate; contact=${hasContactChannelSignal}` : null,
        sector_real_estate_area: sectorProfile.sector==="real_estate" ? `sector=real_estate; areaServed=${schemaObjects.some((item:any)=>Boolean(item?.areaServed))}` : null,
        sector_automotive_services: sectorProfile.sector==="automotive" ? "sector=automotive; workshop evidence evaluated" : null,
        sector_automotive_conversion: sectorProfile.sector==="automotive" ? `sector=automotive; contact=${hasContactChannelSignal}` : null,
        sector_automotive_inventory: sectorProfile.sector==="automotive" ? "sector=automotive; inventory evidence evaluated" : null,
        sector_home_services_offer: sectorProfile.sector==="home_services" ? "sector=home_services; service evidence evaluated" : null,
        sector_home_services_quote: sectorProfile.sector==="home_services" ? `sector=home_services; contact=${hasContactChannelSignal}` : null,
        sector_home_services_area: sectorProfile.sector==="home_services" ? `sector=home_services; areaServed=${schemaObjects.some((item:any)=>Boolean(item?.areaServed))}` : null,
        identity: `brandSignals=${visibleBrandSignals}/4; found=${foundBrandSignals.join(",") || "none"}; missing=${missingBrandSignals.join(",") || "none"}`,
      };
      const heuristicKeys = new Set([
        "content", "headings", "duplicate_path", "html_escape", "image_sources", "webshop_claims",
        "webshop_trust", "price_format", "variant_url", "ads_readiness", "conversion_tracking",
        "organization_identity", "entity_consistency", "author", "faq", "reviews"
      ]);
      const hasMappedEvidence = Object.prototype.hasOwnProperty.call(evidenceByKey, item.key);
      const specialistEvidence = item.evidence?.found;
      const hasSpecialistEvidence = specialistEvidence !== null && specialistEvidence !== undefined && specialistEvidence !== "";
      const foundEvidence = hasMappedEvidence ? evidenceByKey[item.key] : hasSpecialistEvidence ? specialistEvidence : null;
      item.confidence = item.status === "unable_to_confirm"
        ? "low"
        : item.status === "not_applicable"
          ? "medium"
          : heuristicKeys.has(item.key)
            ? "medium"
            : hasMappedEvidence && foundEvidence !== null
              ? "high"
              : "low";
      item.evidence = {
        url: finalUrl.toString(),
        found: foundEvidence,
        details: item.message,
      };
      // A PASS without concrete measured evidence is not a proven PASS.
      // Keep it visible but exclude it from scoring until RankFix can confirm it.
      if (item.status === "pass" && foundEvidence === null) {
        item.status = "unable_to_confirm";
        item.confidence = "low";
      }
      item.issue_status = item.status === "not_applicable"
        ? "NOT_APPLICABLE"
        : item.status === "unable_to_confirm"
          ? "UNABLE_TO_CONFIRM"
          : statusCode(item.status);
    }
    // Customer-facing scanner copy must follow the selected RankFix language.
    // Keep Dutch as the canonical rule text used by the scanner, then translate the
    // final check payload in one place so API responses, saved audits and emails agree.
    if (scanLanguage !== "nl") {
      const scannerLanguageNames: Record<string,string> = { en:"English", de:"German", fr:"French", it:"Italian", es:"Spanish" };
      const translateCheckCopy = async (items: Check[]) => {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey || items.length === 0) return;
        try {
          const payload = items.map((item) => ({ key:item.key, status:item.status, title:item.title, message:item.message, fix:item.fix }));
          const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
            method:"POST",
            headers:{ "Content-Type":"application/json", Authorization:`Bearer ${apiKey}` },
            body:JSON.stringify({
              model:process.env.OPENAI_MODEL || "gpt-5.6-luna",
              temperature:0,
              response_format:{type:"json_object"},
              messages:[
                {role:"system",content:`Translate RankFix website-audit copy into ${scannerLanguageNames[scanLanguage]}. Preserve URLs, numbers, HTML tags, SEO/GEO terminology and factual meaning exactly. Do not add claims or advice. Return JSON only as {"items":[{"key":"...","status":"...","title":"...","message":"...","fix":"..."}]}.`},
                {role:"user",content:JSON.stringify(payload)}
              ]
            })
          });
          if (!aiResponse.ok) return;
          const aiJson:any = await aiResponse.json();
          const parsed = JSON.parse(aiJson?.choices?.[0]?.message?.content || "{}");
          const translated = Array.isArray(parsed?.items) ? parsed.items : [];
          const byKey = new Map(translated.map((item:any) => [String(item?.key || "")+"|"+String(item?.status || "")+"|"+String(item?.title || ""), item]));
          for (const item of items) {
            const translatedItem:any = translated.find((candidate:any)=>String(candidate?.key||"")===item.key && String(candidate?.status||"")===item.status && String(candidate?.title||"")===item.title) || translated.find((candidate:any)=>String(candidate?.key||"")===item.key && String(candidate?.status||"")===item.status);
            if (!translatedItem) continue;
            if (typeof translatedItem.title === "string" && translatedItem.title.trim()) item.title = translatedItem.title.trim();
            if (typeof translatedItem.message === "string" && translatedItem.message.trim()) item.message = translatedItem.message.trim();
            if (typeof translatedItem.fix === "string" && translatedItem.fix.trim()) item.fix = translatedItem.fix.trim();
            item.evidence.details = item.message;
          }
        } catch (error) {
          console.error("Scanner copy translation failed", error instanceof Error ? error.message : "unknown error");
        }
      };
      const allLocalizedChecks=[...seoChecks, ...geoChecks];
      const canonicalCopy=new Map(allLocalizedChecks.map((item)=>[item.key+"|"+item.status+"|"+item.title+"|"+item.message, {title:item.title,message:item.message,fix:item.fix}]));
      await translateCheckCopy(allLocalizedChecks);

      // Deterministic fallback: scanner correctness and language must never depend on
      // the translation provider. If a check stayed canonical Dutch, replace its
      // customer copy with concise local copy while keeping measured evidence intact.
      const fallbackStatusCopy:Record<string,Record<string,{message:string,fix:string}>>={
        en:{pass:{message:"Confirmed by this scan.",fix:"No action required."},warning:{message:"This check needs attention based on the scan evidence.",fix:"Review the evidence and correct the affected item."},fail:{message:"This scan confirmed a problem.",fix:"Correct the affected item and scan again."},not_applicable:{message:"This check is not applicable to this page.",fix:"No action required."},unable_to_confirm:{message:"This scan could not confirm this check reliably.",fix:"Review the evidence or verify it with the relevant connected source."}},
        de:{pass:{message:"Durch diesen Scan bestätigt.",fix:"Keine Aktion erforderlich."},warning:{message:"Diese Prüfung erfordert anhand der Scan-Nachweise Aufmerksamkeit.",fix:"Prüfe die Nachweise und korrigiere den betroffenen Punkt."},fail:{message:"Dieser Scan hat ein Problem bestätigt.",fix:"Korrigiere den betroffenen Punkt und scanne erneut."},not_applicable:{message:"Diese Prüfung ist für diese Seite nicht anwendbar.",fix:"Keine Aktion erforderlich."},unable_to_confirm:{message:"Dieser Scan konnte diese Prüfung nicht zuverlässig bestätigen.",fix:"Prüfe die Nachweise oder bestätige sie über die passende verbundene Quelle."}},
        fr:{pass:{message:"Confirmé par cette analyse.",fix:"Aucune action requise."},warning:{message:"Ce contrôle nécessite une attention selon les preuves de l’analyse.",fix:"Vérifiez les preuves et corrigez l’élément concerné."},fail:{message:"Cette analyse a confirmé un problème.",fix:"Corrigez l’élément concerné puis relancez l’analyse."},not_applicable:{message:"Ce contrôle ne s’applique pas à cette page.",fix:"Aucune action requise."},unable_to_confirm:{message:"Cette analyse n’a pas pu confirmer ce contrôle de manière fiable.",fix:"Vérifiez les preuves ou confirmez-les via la source connectée appropriée."}},
        it:{pass:{message:"Confermato da questa scansione.",fix:"Nessuna azione richiesta."},warning:{message:"Questo controllo richiede attenzione in base alle prove della scansione.",fix:"Controlla le prove e correggi l’elemento interessato."},fail:{message:"Questa scansione ha confermato un problema.",fix:"Correggi l’elemento interessato ed esegui una nuova scansione."},not_applicable:{message:"Questo controllo non è applicabile a questa pagina.",fix:"Nessuna azione richiesta."},unable_to_confirm:{message:"Questa scansione non ha potuto confermare il controllo in modo affidabile.",fix:"Controlla le prove o verificale tramite la fonte collegata appropriata."}},
        es:{pass:{message:"Confirmado por este análisis.",fix:"No se requiere ninguna acción."},warning:{message:"Esta comprobación requiere atención según las pruebas del análisis.",fix:"Revisa las pruebas y corrige el elemento afectado."},fail:{message:"Este análisis confirmó un problema.",fix:"Corrige el elemento afectado y vuelve a analizar."},not_applicable:{message:"Esta comprobación no se aplica a esta página.",fix:"No se requiere ninguna acción."},unable_to_confirm:{message:"Este análisis no pudo confirmar esta comprobación de forma fiable.",fix:"Revisa las pruebas o verifícalas mediante la fuente conectada correspondiente."}}
      };
      const fallbackTitles:Record<string,Record<string,string>>={
        en:{title:"Meta title",description:"Meta description",h1:"H1 heading",headings:"Heading structure",canonical:"Canonical URL",viewport:"Mobile viewport",lang:"HTML language",indexability:"Indexability",alt:"Image alt text",https:"HTTPS",status:"HTTP status",social:"Social metadata",robots_txt:"robots.txt",sitemap:"Sitemap",broken_links:"Broken links",internal_redirects:"Internal redirects",schema:"Structured data",product_schema:"Product structured data",accessibility_basics:"Accessibility basics",consent_mode_readiness:"Consent Mode signal",ads_readiness:"Google Ads readiness"},
        de:{title:"Meta-Titel",description:"Meta-Beschreibung",h1:"H1-Überschrift",headings:"Überschriftenstruktur",canonical:"Canonical-URL",viewport:"Mobile Ansicht",lang:"HTML-Sprache",indexability:"Indexierbarkeit",alt:"Bild-Alt-Texte",https:"HTTPS",status:"HTTP-Status",social:"Social-Metadaten",robots_txt:"robots.txt",sitemap:"Sitemap",broken_links:"Defekte Links",internal_redirects:"Interne Weiterleitungen",schema:"Strukturierte Daten",product_schema:"Produkt-Strukturdaten",accessibility_basics:"Grundlagen Barrierefreiheit",consent_mode_readiness:"Consent-Mode-Signal",ads_readiness:"Google Ads Bereitschaft"},
        fr:{title:"Titre meta",description:"Meta description",h1:"Titre H1",headings:"Structure des titres",canonical:"URL canonique",viewport:"Viewport mobile",lang:"Langue HTML",indexability:"Indexabilité",alt:"Textes alt des images",https:"HTTPS",status:"Statut HTTP",social:"Métadonnées sociales",robots_txt:"robots.txt",sitemap:"Sitemap",broken_links:"Liens cassés",internal_redirects:"Redirections internes",schema:"Données structurées",product_schema:"Données structurées Product",accessibility_basics:"Bases de l’accessibilité",consent_mode_readiness:"Signal Consent Mode",ads_readiness:"Préparation Google Ads"},
        it:{title:"Meta title",description:"Meta description",h1:"Titolo H1",headings:"Struttura dei titoli",canonical:"URL canonical",viewport:"Viewport mobile",lang:"Lingua HTML",indexability:"Indicizzabilità",alt:"Testi alt immagini",https:"HTTPS",status:"Stato HTTP",social:"Metadati social",robots_txt:"robots.txt",sitemap:"Sitemap",broken_links:"Link non funzionanti",internal_redirects:"Reindirizzamenti interni",schema:"Dati strutturati",product_schema:"Dati strutturati Product",accessibility_basics:"Basi accessibilità",consent_mode_readiness:"Segnale Consent Mode",ads_readiness:"Preparazione Google Ads"},
        es:{title:"Meta title",description:"Meta description",h1:"Encabezado H1",headings:"Estructura de encabezados",canonical:"URL canónica",viewport:"Viewport móvil",lang:"Idioma HTML",indexability:"Indexabilidad",alt:"Textos alt de imágenes",https:"HTTPS",status:"Estado HTTP",social:"Metadatos sociales",robots_txt:"robots.txt",sitemap:"Sitemap",broken_links:"Enlaces rotos",internal_redirects:"Redirecciones internas",schema:"Datos estructurados",product_schema:"Datos estructurados Product",accessibility_basics:"Bases de accesibilidad",consent_mode_readiness:"Señal Consent Mode",ads_readiness:"Preparación para Google Ads"}
      };
      for(const item of allLocalizedChecks){
        const originalKey=[...canonicalCopy.keys()].find((key)=>key.startsWith(item.key+"|"+item.status+"|") && key.endsWith("|"+item.message));
        const canonical=originalKey ? canonicalCopy.get(originalKey) : undefined;
        if(!canonical) continue;
        if(item.message===canonical.message && item.fix===canonical.fix){
          const fallback=fallbackStatusCopy[scanLanguage]?.[item.status];
          if(fallback){
            item.title=fallbackTitles[scanLanguage]?.[item.key] || item.key.replace(/_/g," ");
            item.message=fallback.message;
            item.fix=fallback.fix;
            item.evidence.details=item.message;
          }
        }
      }
    }

    // Keep high-value warnings concrete even when the optional AI translation layer
    // is unavailable. These messages are derived from scan evidence, not generated guesses.
    const concreteWarningCopy: Record<string, { canonicalMissing:string; canonicalOther:string; canonicalInvalid:string; trust:(missing:string)=>string; canonicalFix:string; trustFix:string }> = {
      nl:{canonicalMissing:"Geen canonical URL gevonden.",canonicalOther:"De canonical verwijst niet naar de gescande URL.",canonicalInvalid:"De gevonden canonical is geen geldige URL.",trust:(m)=>"Niet alle basissignalen zijn gevonden: "+m+".",canonicalFix:"Controleer of de canonical bewust naar de juiste voorkeurs-URL verwijst; voeg anders een passende self-referencing canonical toe.",trustFix:"Maak privacy-, cookie- en contactinformatie duidelijk bereikbaar. Dit is een technische aanwezigheidstest, geen juridisch oordeel."},
      en:{canonicalMissing:"No canonical URL was found.",canonicalOther:"The canonical does not point to the scanned URL.",canonicalInvalid:"The canonical found is not a valid URL.",trust:(m)=>"Not all basic trust signals were found: "+m+".",canonicalFix:"Check whether the canonical intentionally points to the correct preferred URL; otherwise add an appropriate self-referencing canonical.",trustFix:"Make privacy, cookie and contact information clearly accessible. This is a technical presence check, not a legal compliance judgment."},
      de:{canonicalMissing:"Keine Canonical-URL gefunden.",canonicalOther:"Die Canonical-URL verweist nicht auf die gescannte URL.",canonicalInvalid:"Die gefundene Canonical-Angabe ist keine gültige URL.",trust:(m)=>"Nicht alle grundlegenden Vertrauenssignale wurden gefunden: "+m+".",canonicalFix:"Prüfe, ob die Canonical-URL bewusst auf die richtige bevorzugte URL verweist; füge sonst eine passende selbstreferenzierende Canonical-URL hinzu.",trustFix:"Mache Datenschutz-, Cookie- und Kontaktinformationen klar erreichbar. Dies ist eine technische Präsenzprüfung, keine rechtliche Bewertung."},
      fr:{canonicalMissing:"Aucune URL canonique n’a été trouvée.",canonicalOther:"L’URL canonique ne pointe pas vers l’URL analysée.",canonicalInvalid:"La valeur canonique trouvée n’est pas une URL valide.",trust:(m)=>"Tous les signaux de confiance de base n’ont pas été trouvés : "+m+".",canonicalFix:"Vérifiez si l’URL canonique pointe volontairement vers la bonne URL préférée ; sinon, ajoutez une URL canonique auto-référente adaptée.",trustFix:"Rendez les informations de confidentialité, de cookies et de contact clairement accessibles. Il s’agit d’un contrôle technique de présence, pas d’un avis juridique."},
      it:{canonicalMissing:"Non è stato trovato alcun URL canonico.",canonicalOther:"L’URL canonico non punta all’URL analizzato.",canonicalInvalid:"Il valore canonico trovato non è un URL valido.",trust:(m)=>"Non sono stati trovati tutti i segnali di fiducia di base: "+m+".",canonicalFix:"Controlla se l’URL canonico punta intenzionalmente all’URL preferito corretto; altrimenti aggiungi un canonical autoreferenziale appropriato.",trustFix:"Rendi chiaramente accessibili le informazioni su privacy, cookie e contatti. È un controllo tecnico di presenza, non una valutazione legale."},
      es:{canonicalMissing:"No se encontró ninguna URL canónica.",canonicalOther:"La URL canónica no apunta a la URL analizada.",canonicalInvalid:"El valor canónico encontrado no es una URL válida.",trust:(m)=>"No se encontraron todas las señales básicas de confianza: "+m+".",canonicalFix:"Comprueba si la URL canónica apunta intencionadamente a la URL preferida correcta; si no, añade una canonical autorreferente adecuada.",trustFix:"Haz claramente accesible la información de privacidad, cookies y contacto. Es una comprobación técnica de presencia, no una evaluación legal."}
    };
    const concreteCopy=concreteWarningCopy[scanLanguage]||concreteWarningCopy.en;
    const localizedMissingLabels: Record<string,Record<string,string>>={
      nl:{privacy:"privacy",cookies:"cookies",contact:"contact"},en:{privacy:"privacy",cookies:"cookies",contact:"contact"},de:{privacy:"Datenschutz",cookies:"Cookies",contact:"Kontakt"},fr:{privacy:"confidentialité",cookies:"cookies",contact:"contact"},it:{privacy:"privacy",cookies:"cookie",contact:"contatti"},es:{privacy:"privacidad",cookies:"cookies",contact:"contacto"}
    };
    for(const item of seoChecks){
      if(item.status!=="warning"&&item.status!=="fail") continue;
      if(item.key==="canonical"){
        item.title=({nl:"Canonical URL",en:"Canonical URL",de:"Canonical-URL",fr:"URL canonique",it:"URL canonico",es:"URL canónica"} as Record<string,string>)[scanLanguage]||"Canonical URL";
        item.message=canonicalInvalid?concreteCopy.canonicalInvalid:!canonicalUrl?concreteCopy.canonicalMissing:concreteCopy.canonicalOther;
        item.fix=concreteCopy.canonicalFix;
        item.evidence.details=item.message;
      }
      if(item.key==="trust_legal_signals"){
        const labels=localizedMissingLabels[scanLanguage]||localizedMissingLabels.en;
        const missing=[!hasPrivacyLink?labels.privacy:null,!hasCookieLink?labels.cookies:null,!hasContactLink?labels.contact:null].filter(Boolean).join(", ");
        item.title=({nl:"Privacy & vertrouwenssignalen",en:"Privacy & trust signals",de:"Datenschutz- & Vertrauenssignale",fr:"Signaux de confidentialité et de confiance",it:"Segnali di privacy e fiducia",es:"Señales de privacidad y confianza"} as Record<string,string>)[scanLanguage]||"Privacy & trust signals";
        item.message=concreteCopy.trust(missing);
        item.fix=concreteCopy.trustFix;
        item.evidence.details=item.message;
      }
    }

    // Applicability firewall: specialist commerce rules may never reduce the score
    // of a site that has not been proven to be a webshop. This is deliberately
    // evidence-based and runs before scoring.
    const commerceOnlyKeys = new Set([
      "commercial_terms_signal","merchant_product_readiness","merchant_feed_signal","price_format",
      "product_schema","product_optimizer","product_price_consistency","product_availability_consistency",
      "variant_url","webshop_claims","webshop_trust","checkout_funnel_static",
      "eu_discount_signal","eu_reference_price_signal","eu_review_signal","eu_scarcity_signal",
      "eu_consumer_information_signal","pricing_currency_consistency"
    ]);
    // Module Activation Engine: Scanbewijs is authoritative for applicability.
    // Legacy commerce detection remains an input, but cannot deactivate controls when
    // independent Commerce Evidence has already confirmed the capability.
    const commerceModuleActive = sectorProfile.applicableModules.includes("ecommerce") || masterEvidence.commerce.confirmed;
    if (!commerceModuleActive) {
      for (const item of [...seoChecks, ...geoChecks]) {
        if (!commerceOnlyKeys.has(item.key)) continue;
        item.status = "not_applicable";
        item.issue_status = "NOT_APPLICABLE";
        item.points = 0;
        item.confidence = "high";
        item.message = "Scanbewijs heeft onvoldoende webshopbewijs; deze branchespecifieke controle is niet van toepassing op deze scan.";
        item.fix = "Geen actie nodig. RankFix activeert deze controle zodra e-commerce met voldoende bewijs is bevestigd.";
        item.evidence = { url: finalUrl.toString(), found: false, details: item.message };
      }
    }

    const seoTotal = seoChecks.reduce((sum, c) => sum + (c.issue_status === "NOT_APPLICABLE" || c.issue_status === "UNABLE_TO_CONFIRM" ? 0 : c.points), 0);
    const seoMax = seoChecks.reduce((sum, c) => sum + (c.issue_status === "NOT_APPLICABLE" || c.issue_status === "UNABLE_TO_CONFIRM" ? 0 : c.maxPoints), 0);
    const geoTotal = geoChecks.reduce((sum, c) => sum + (c.issue_status === "NOT_APPLICABLE" || c.issue_status === "UNABLE_TO_CONFIRM" ? 0 : c.points), 0);
    const geoMax = geoChecks.reduce((sum, c) => sum + (c.issue_status === "NOT_APPLICABLE" || c.issue_status === "UNABLE_TO_CONFIRM" ? 0 : c.maxPoints), 0);
    const seoScore = seoMax ? Math.round((seoTotal / seoMax) * 100) : 0;
    const geoScore = geoMax ? Math.round((geoTotal / geoMax) * 100) : 0;
    const overallScore = Math.round(seoScore * 0.6 + geoScore * 0.4);
    // Evidence applicability guard: absence of a capability is not proof of a defect.
    // Sector controls that need a proven function remain unscored when that function
    // could not be confirmed from the available evidence.
    const capabilityControlGroups: Array<{capabilities:string[]; keys:Set<string>}> = [
      {capabilities:["vehicles"],keys:new Set(["vehicle_inventory","vehicle_details","test_drive"])},
      {capabilities:["properties"],keys:new Set(["property_inventory","property_details","viewing"])},
      {capabilities:["jobs"],keys:new Set(["job_inventory","job_details","application"])},
      {capabilities:["rooms","booking"],keys:new Set(["room_inventory","availability","hotel_booking"])},
      {capabilities:["menu","reservation"],keys:new Set(["restaurant_menu","table_reservation"])},
    ];
    const masterCapabilities = new Set(masterEvidence.capabilities);
    for (const group of capabilityControlGroups) {
      if (group.capabilities.some(capability=>masterCapabilities.has(capability))) continue;
      for (const item of [...seoChecks,...geoChecks]) {
        if (!group.keys.has(item.key)) continue;
        item.status = "unable_to_confirm";
        item.issue_status = "UNABLE_TO_CONFIRM";
        item.points = 0;
        item.confidence = "low";
        item.message = "Deze functie kon in de beschikbare Evidence Layers niet betrouwbaar worden bevestigd.";
        item.fix = "Geen bewezen defect. Controleer opnieuw met aanvullende pagina- of browser-evidence.";
        item.evidence = {url:finalUrl.toString(),found:null,details:item.message};
      }
    }

    const selectedSeoChecks = mode === "geo" ? [] : seoChecks;
    const selectedGeoChecks = mode === "seo" ? [] : geoChecks;
    let selectedSeoScore = scoreApplicableChecks(selectedSeoChecks);
    let selectedGeoScore = scoreApplicableChecks(selectedGeoChecks);
    let selectedOverallScore = mode === "seo" ? selectedSeoScore : mode === "geo" ? selectedGeoScore : Math.round(selectedSeoScore * 0.6 + selectedGeoScore * 0.4);
    selectedOverallScore = applyEvidenceBasedScoreCap(selectedOverallScore, [...selectedSeoChecks, ...selectedGeoChecks]);
    const checks = [...selectedSeoChecks, ...selectedGeoChecks];
    let seoCoverage = weightedCoverage(selectedSeoChecks);
    let geoCoverage = weightedCoverage(selectedGeoChecks);
    let overallCoverage = weightedCoverage(checks);
    const seoScoreRange = scoreRange(selectedSeoChecks);
    const geoScoreRange = scoreRange(selectedGeoChecks);
    const overallScoreRange = scoreRange(checks);
    const scoreModel = {
      version: SCORE_MODEL_VERSION,
      formula: mode === "both" ? "0.6 × SEO + 0.4 × GEO" : mode === "seo" ? "SEO" : "GEO",
      weights: mode === "both" ? { seo: 0.6, geo: 0.4, security: 0 } : mode === "seo" ? { seo: 1, geo: 0, security: 0 } : { seo: 0, geo: 1, security: 0 },
      securitySeparate: true,
      coverageBasis: "assessed_weight / applicable_weight",
      range: overallScoreRange,
      seoRange: seoScoreRange,
      geoRange: geoScoreRange,
      provisional: overallCoverage.coveragePercent < 90,
      note: "Niet te bevestigen verlaagt de score niet, maar blijft toepasselijk gewicht in de dekking. N.v.t. is uitgesloten. Het bereik toont de conservatieve en optimistische grens voor nog onbevestigd bewijs.",
    };
    const scanSummary = summarizeAuditChecks(checks);
    const propertyListingPage = sectorProfile.sector === "real_estate" && (/\/(?:woningaanbod|residential-listings)\/(?:koop|huur|sale|rent)\//i.test(pathname) || /\b(?:te koop|te huur|for sale|for rent)\b/i.test(title));
    // Generic resolved-URL page intent: service/detail paths are evidence even when
    // the original input was a short/share URL. This runs on finalUrl only.
    const servicePathSignal = /\/(?:dienst|diensten|service|services|oplossing|oplossingen|solution|solutions|expertise|behandeling|behandelingen|treatment|practice|werkplaats)(?:\/|$)/i.test(pathname);
    const serviceContentSignal = /\b(?:onze diensten|our services|dienstverlening|service|services|expertise|oplossingen|solutions)\b/i.test([title, description, h1s.join(" ")].join(" "));
    const resolvedServicePage = !isHomepage && !isProductPage && !hasCategorySignal && (servicePathSignal || serviceContentSignal);
    // Page Type Engine: distinguish the intent of a service-area, case study,
    // registration or service-category URL from a generic service detail.
    // Path-only evidence remains medium confidence; no form/booking is invented.
    const serviceAreaPath = /\/(?:service-area|servicegebied|werkgebied|transport|destinations?|bestemmingen|regios?|regions?)\/[^/]+\/?$/i.test(pathname);
    const caseStudyPath = /\/(?:cases?|case-studies|klantverhalen|success-stories|projecten|projects)\/[^/]+\/?$/i.test(pathname);
    const registrationPath = /\/(?:inschrijven(?:-als-patient)?|registreren|registration|register|sign-up|signup|aanmelden)\/?$/i.test(pathname);
    const serviceCategoryPath = /\/(?:behandelingen|treatments|diensten|services|oplossingen|solutions)\/?$/i.test(pathname);
    const specializedPageType = !isHomepage && !isProductPage && !propertyListingPage && !hasCategorySignal
      ? serviceAreaPath ? "service_area" : caseStudyPath ? "case_study" : registrationPath ? "registration" : serviceCategoryPath ? "service_category" : null
      : null;
    const pageTypeEvidence = {
      type: isHomepage ? "homepage" : propertyListingPage ? "property_listing" : isProductPage ? "product" : hasCategorySignal ? "category" : specializedPageType || ((effectiveLocalBusinessPage || resolvedServicePage) ? "service" : effectiveArticlePage ? "article" : "unknown"),
      confidence: isHomepage ? "high" : propertyListingPage ? "high" : isProductPage && (hasProductSchema || hasSkuSignal) ? "high" : isProductPage ? "medium" : hasCategorySignal && (hasItemListSignal || repeatedProductCardSignal) ? "high" : resolvedServicePage && servicePathSignal ? "high" : effectiveLocalBusinessPage || resolvedServicePage || hasCategorySignal || effectiveArticlePage ? "medium" : "low",
      evidence: [isHomepage ? `localized/root path: ${pathname}` : "", propertyListingPage ? "Scanbewijs: vastgoedobject/listing" : "", servicePathSignal ? `resolved service path: ${pathname}` : "", resolvedServicePage && serviceContentSignal ? "service intent in resolved page metadata/headings" : "", hasProductSchema ? "Product schema present" : "", hasStoreSchema ? "Store schema present" : "", hasItemListSignal ? "ItemList schema present" : "", genericCategoryPathSignal ? `generic commerce category path: ${pathname}` : "", repeatedProductCardSignal ? "repeated product-card commerce signals" : "", commercialNavigationEvidence ? "commercial navigation + shop/support links" : "", hasSkuSignal ? "SKU signal present" : "", hasStrongCommerceAction ? "commerce action present" : "", articleSuppressedByCommerce ? "article signal suppressed by stronger product evidence" : ""].filter(Boolean),
    };
    const pageTypeContradictions = [
      pageTypeEvidence.type === "article" && isProductPage ? "article_vs_product" : null,
      pageTypeEvidence.type === "article" && hasProductSchema ? "article_vs_product_schema" : null,
      pageTypeEvidence.type === "product" && transportBookingIdentityEarly ? "product_vs_transport_booking" : null,
    ].filter(Boolean) as string[];
    if (pageTypeContradictions.length) {
      console.warn("RankFix page type contradiction", { page: finalUrl.toString(), contradictions: pageTypeContradictions, evidence: pageTypeEvidence.evidence });
    }
    const pageTypeInvariant = { valid: pageTypeContradictions.length === 0, contradictions: pageTypeContradictions };
    // Keep the website profile aligned with the same evidence used by webshop-only audit checks.
    // Generic words such as "checkout", "price" or SaaS pricing must not classify a site as a webshop.
    console.info("RankFix scan phase", { phase: "checks_built", page: finalUrl.toString(), seoChecks: selectedSeoChecks.length, geoChecks: selectedGeoChecks.length });
    const technologyProfile = detectTechnologyProfile(html, response.headers, hasEcommerceSignal);
    console.info("RankFix scan phase", { phase: "technology_profile_built", page: finalUrl.toString(), siteType: technologyProfile.siteType, framework: technologyProfile.framework });
    // Late Master cross-check: technologyProfile only exists at this point.
    // A mismatch is recorded as evidence tension, never converted directly into a failure.
    if (technologyProfile.siteType==="Webshop" && !masterEvidence.commerce.confirmed) {
      masterEvidence.conflicts.push("Technologieprofiel ziet webshop-signalen, maar Commerce Evidence heeft nog onvoldoende onafhankelijke bevestiging.");
    }
    if (masterEvidence.commerce.confirmed && technologyProfile.siteType!=="Webshop") {
      masterEvidence.conflicts.push("Commerce Evidence bevestigt webshopfuncties terwijl het technologieprofiel de site nog niet als webshop classificeert.");
    }
    if (masterEvidence.businessModels.length>1) {
      masterEvidence.policy += " Hybride businessmodellen worden naast elkaar bewaard; een secundaire functie wordt niet door de hoofdsector overschreven.";
    }
    // A homepage is only classified as a landing page when several independent
    // conversion/content signals agree. The root URL alone is never enough.
    if (!technologyProfile.isCommerce && isHomepage) {
      const landingSignals = [
        h1s.length === 1,
        /\b(get started|start now|start gratis|gratis audit|audit starten|scan starten|try free|probeer|begin nu)\b/i.test(text),
        /\b(features?|functies|voordelen|benefits|pricing|prijzen|abonnement)\b/i.test(text),
        /\b(contact|demo|aanmelden|sign up|register|registreren)\b/i.test(text),
      ];
      const landingSignalCount = landingSignals.filter(Boolean).length;
      if (landingSignalCount >= 3) {
        technologyProfile.evidence = [...technologyProfile.evidence, `Commerciële landingpage-signalen ${landingSignalCount}/4 (paginatype, niet websitetype)`].slice(0, 8);
      }
    }
    // sectorProfile was determined before scoring so applicability and scoring stay aligned.
    const rawRenderingNotes: Record<string,string> = {
      nl: javascriptCandidate ? "JavaScript-framework gedetecteerd, maar browser-rendering kon niet betrouwbaar worden voltooid. Dynamische formulieren, metadata en interactieve onderdelen kunnen daarom ontbreken; deze controles blijven Niet te bevestigen." : "RankFix beoordeelde de HTTP HTML-response; client-side JavaScript was voor deze pagina niet nodig of werd niet uitgevoerd.",
      en: javascriptCandidate ? "A JavaScript framework was detected, but browser rendering could not be completed reliably. Dynamic forms, metadata and interactive elements may therefore be missing; affected checks remain Unable to confirm." : "RankFix evaluated the HTTP HTML response; client-side JavaScript was not required for this page or was not executed.",
      de:"RankFix hat die HTTP-HTML-Antwort ausgewertet; clientseitiges JavaScript wurde in diesem Scan nicht ausgeführt.",
      fr:"RankFix a évalué la réponse HTML HTTP ; le JavaScript côté client n’a pas été exécuté pendant cette analyse.",
      it:"RankFix ha valutato la risposta HTML HTTP; il JavaScript lato client non è stato eseguito durante questa scansione.",
      es:"RankFix evaluó la respuesta HTML HTTP; el JavaScript del lado del cliente no se ejecutó durante este análisis."
    };
    const jsRenderingNotes: Record<string,string> = {
      nl:"RankFix heeft deze JavaScript-site in een begrensde browser gerenderd. Interactieve login-, winkelwagen- en betaalflows zijn niet uitgevoerd.",
      en:"RankFix rendered this JavaScript site in a bounded browser. Interactive login, cart and payment flows were not executed.",
      de:"RankFix hat diese JavaScript-Seite in einem begrenzten Browser gerendert. Login-, Warenkorb- und Zahlungsabläufe wurden nicht ausgeführt.",
      fr:"RankFix a rendu ce site JavaScript dans un navigateur limité. Les parcours de connexion, panier et paiement n’ont pas été exécutés.",
      it:"RankFix ha renderizzato questo sito JavaScript in un browser limitato. I flussi di accesso, carrello e pagamento non sono stati eseguiti.",
      es:"RankFix renderizó este sitio JavaScript en un navegador limitado. No se ejecutaron los flujos de inicio de sesión, carrito ni pago."
    };
    const rendering = {
      mode: javascriptExecuted ? "javascript_rendered" as const : "raw_html" as const,
      javascriptExecuted,
      note: javascriptExecuted ? (jsRenderingNotes[scanLanguage] || jsRenderingNotes.en) : (rawRenderingNotes[scanLanguage] || rawRenderingNotes.en),
      elapsedMs: renderElapsedMs,
      fallbackReason: javascriptCandidate && !javascriptExecuted ? (renderFallbackReason || "JAVASCRIPT_RENDER_UNAVAILABLE") : null,
      warning: javascriptCandidate && !javascriptExecuted,
      evidenceSource: javascriptExecuted ? "rendered_html" as const : "raw_html" as const,
    };

    // Multi-page evidence audit: select a bounded same-host sample and fetch it
    // without changing the score of the page the customer explicitly scanned.
    const normalizeHost = (value: string) => value.toLowerCase().replace(/^www\./, "");
    type MultiPageCandidate = { url: string; type: "homepage" | "category" | "product" | "form" | "legal" | "service" | "listing" | "support" | "other"; evidence: string[] };
    type MultiPageAudit = MultiPageCandidate & { status: "audited" | "unable_to_confirm"; httpStatus: number | null; title: string | null; description: string | null; h1Count: number | null; canonical: string | null; score: number | null; structureKey?: string; evidenceSource?: "raw_html" | "rendered_html"; identityText?: string; schemaTypes?: string[]; formEvidence?: { formCount:number; passwordForm:boolean; insecureFormActions:number }; commerceEvidence?: { productSchema: boolean; itemListSchema: boolean; storeSchema: boolean; strongCommerceAction: boolean; repeatedProductLinks: boolean; priceSignals: number; confirmedRetailPage: boolean; product?: { name: string | null; image: string | null; sku: string | null; price: string | null; currency: string | null; availability: string | null } | null }; evidenceChecks: { key: string; status: "PASS" | "WARNING" | "UNABLE_TO_CONFIRM"; details: string }[] };
    const siteHost = normalizeHost(finalUrl.hostname);
    const classifyMultiPageCandidate = (urlValue: string): MultiPageCandidate | null => {
      try {
        const candidate = new URL(urlValue, finalUrl); candidate.hash = "";
        if (!/^https?:$/.test(candidate.protocol) || normalizeHost(candidate.hostname) !== siteHost) return null;
        const normalized = normalizeScanUrl(candidate.toString());
        if (normalized === normalizeScanUrl(finalUrl.toString())) return null;
        const path = safeDecodeURIComponent(candidate.pathname).toLowerCase();
        if (/\.(?:jpg|jpeg|png|gif|webp|svg|pdf|zip|xml|json|css|js|ico|woff2?)(?:$|\?)/i.test(path)) return null;
        const pathSegments = path.split("/").filter(Boolean);
        const legalUtilitySegment = /^(?:privacy|privacy-policy|privacybeleid|privacyverklaring|datenschutz|datenschutzhinweise|datenschutzerklaerung|terms|terms-and-conditions|terms-of-use|voorwaarden|algemene-voorwaarden|cookie|cookies|cookie-policy|cookiebeleid|disclaimer|legal|impressum)$/i;
        if (/(?:^|\/)(?:myaccount|my-account|account|mijn-account|login|account-login|signin|sign-in|register|wishlist|verlanglijst|favorites?|favourites?|favorieten|cart|basket|winkelwagen|checkout|afrekenen|kassa|search|zoeken)(?:\/|$)/i.test(path)) return null;
        if (candidate.search && /(?:^|[?&])(?:q|query|search|sort|filter|page|session|token)=/i.test(candidate.search)) return null;
        const evidence: string[] = [];
        const productPath = /\/(?:product|products|product-page|p|artikel|item|vehicle|voertuig|woning|property|properties|occasion|occasions)\//i.test(path);
        const categoryPath = /\/(?:category|categories|categorie|categorieen|cat|collection|collections|shop|store|winkel|catalog|catalogue|outlet|sale|aanbod|voorraad|huizen|woningen|cars|autos)(?:\/|$)/i.test(path);
        const legalPath = pathSegments.some((segment) => legalUtilitySegment.test(segment));
        const formPath = /(?:^|\/)(?:contact|contact-us|contacteer|kontakt|offerte|quote|request-quote|afspraak|appointment|booking|book|reserve|reservation|reserveren)(?:\/|$)/i.test(path);
        const supportPath = /(?:^|\/)(?:faq|veelgestelde-vragen|help|support|customer-service|klantenservice|retour|retouren|returns?|refunds?|shipping|levering|bezorging)(?:\/|$)/i.test(path);
        const servicePath = /(?:^|\/)(?:dienst|diensten|service|services|oplossing|oplossingen|solution|solutions|expertise|behandeling|behandelingen|treatment|practice|werkplaats)(?:\/|$)/i.test(path)
          || (/transport|logist/i.test(String(sectorProfile.label||"")) && /(?:^|\/)transport(?:\/|$)/i.test(path));
        const listingPath = sectorProfile.sector === "real_estate" && /(?:^|\/)(?:woningaanbod|residential-listings|property-listings|properties|aanbod)(?:\/|$)/i.test(path);
        if (productPath) evidence.push("product-like path");
        if (categoryPath) evidence.push("category-like path");
        if (formPath) evidence.push("form/conversion-like path");
        if (legalPath) evidence.push("legal/policy-like path");
        if (supportPath) evidence.push("support/faq-like path");
        if (servicePath) evidence.push("service-like path");
        if (listingPath) evidence.push("listing-like path");
        const type: MultiPageCandidate["type"] = formPath ? "form" : legalPath ? "legal" : supportPath ? "support" : listingPath ? "listing" : productPath ? "product" : servicePath ? "service" : categoryPath ? "category" : "other";
        return { url: candidate.toString(), type, evidence };
      } catch { return null; }
    };
    const anchorContextByUrl = new Map(allUniqueInternalAnchors.map((item)=>[normalizeScanUrl(item.url), item.context || ""] as const));
    const discoveredMultiPage = [...new Map(allUniqueInternalAnchors.flatMap((item) => {
      const candidate = classifyMultiPageCandidate(item.url);
      if (!candidate) return [];
      const context = (item.context || "").trim();
      if (context) candidate.evidence.push(`link-context: ${context.slice(0,120)}`);
      return [[normalizeScanUrl(candidate.url), candidate] as const];
    })).values()];
    // Evidence-first representative selection. URL shape is only a weak fallback;
    // structural link context from the scanned page is the primary signal. This keeps
    // narrative/news/history pages from outranking pages that expose services,
    // inventory, products, booking or other uncertainty-reducing capabilities.
    const preferredLocale = (lang.match(/^([a-z]{2,3})/i)?.[1] || pathSegmentsForType.find((segment)=>localeSegmentPattern.test(segment))?.split("-")[0] || "").toLowerCase();
    const multiPageRelevance = (item: MultiPageCandidate) => {
      const path = new URL(item.url).pathname.toLowerCase();
      const context = (anchorContextByUrl.get(normalizeScanUrl(item.url)) || "").toLowerCase();
      const firstPathSegment = path.split("/").filter(Boolean)[0] || "";
      const candidateLocale = localeSegmentPattern.test(firstPathSegment) ? firstPathSegment.split("-")[0].toLowerCase() : "";
      const isLegal = /(?:^|\/)(?:privacy|privacy-policy|privacybeleid|privacyverklaring|datenschutz|datenschutzhinweise|datenschutzerklaerung|terms|terms-and-conditions|terms-of-use|voorwaarden|algemene-voorwaarden|cookie|cookies|cookie-policy|cookiebeleid|disclaimer|legal|impressum)(?:\/|$)/i.test(path);
      const utilityContext = /\b(privacy|cookie|voorwaarden|terms|login|account|vacature|career|jobs|nieuws|news|blog|geschiedenis|history|impressie|gallery|over ons|about us)\b/i.test(context);
      const capabilityContext = /\b(product|producten|shop|winkel|aanbod|voorraad|woning|woningen|occasion|service|diensten|dienstverlening|transport|logistiek|freight|warehouse|opslag|behandeling|treatment|afspraak|booking|reserver|offerte|quote|kamer|rooms?)\b/i.test(context);
      const contextWords = context.split(/\s+/).filter(Boolean).length;
      let score = item.type === "product" ? 34 : item.type === "form" ? 32 : item.type === "service" ? 30 : item.type === "listing" ? 30 : item.type === "category" ? 28 : item.type === "support" ? 16 : item.type === "legal" || isLegal ? 18 : 8;
      if (preferredLocale && candidateLocale === preferredLocale) score += 12;
      else if (preferredLocale && candidateLocale && candidateLocale !== preferredLocale) score -= 24;
      else if (preferredLocale && !candidateLocale) score += 2;
      if (capabilityContext) score += 24;
      if (contextWords >= 2) score += 4;
      if (utilityContext && !capabilityContext) score -= 30;
      // Path semantics are deliberately weak evidence only; they can break ties but
      // cannot by themselves dominate structural link context.
      if (/(?:dienst|service|product|shop|store|catalog|aanbod|voorraad|woning|property|occasion|transport|logist|warehouse|behandel|treatment|booking|reserve)/i.test(path)) score += 6;
      if (/(?:nieuws|news|blog|geschiedenis|history|impressie|gallery|over-ons|about-us)/i.test(path)) score -= 12;
      if (/^\/(?:[a-z]{2}(?:-[a-z]{2})?)\/?$/i.test(path)) score -= 10;
      return score;
    };
    const rankedMultiPage = discoveredMultiPage.filter((item) => multiPageRelevance(item) > -100).sort((a,b) => multiPageRelevance(b) - multiPageRelevance(a));
    const pickMultiPage = (type: MultiPageCandidate["type"], limit: number) => rankedMultiPage.filter((item) => item.type === type).slice(0, limit);
    // Scan Motor 3.0 phase 1: broaden evidence coverage without turning the scan
    // into an unbounded crawler. Cap the selection at thirty distinct URLs;
    // the worker pool remains bounded to protect scan performance.
    const representativePageLimit = 30;
    // Keep representative sampling inside the locale/subdirectory the customer
    // actually scanned. Falling back to origin "/" can switch country/language
    // (for example /nl/nl/ -> global root) and contaminate sector/content evidence.
    const localePathMatch = finalUrl.pathname.match(/^\/(?:[a-z]{2}(?:-[a-z]{2})?)(?:\/(?:[a-z]{2}(?:-[a-z]{2})?))?\//i);
    const representativeHomeUrl = localePathMatch
      ? new URL(localePathMatch[0], finalUrl.origin).toString()
      : new URL("/", finalUrl).toString();
    const multiPagePages: MultiPageCandidate[] = (masterEvidence.commerce.confirmed || technologyProfile.isCommerce || hasEcommerceSignal)
      ? [
          { url: representativeHomeUrl, type: "homepage", evidence: [localePathMatch ? "locale root" : "site root"] },
          ...pickMultiPage("category", 4), ...pickMultiPage("product", 4),
          ...pickMultiPage("form", 3), ...pickMultiPage("legal", 2), ...pickMultiPage("support", 2),
          ...pickMultiPage("service", 3), ...pickMultiPage("listing", 2), ...pickMultiPage("other", 2),
        ]
      : [
          { url: representativeHomeUrl, type: "homepage", evidence: [localePathMatch ? "locale root" : "site root"] },
          ...pickMultiPage("form", 4), ...pickMultiPage("service", 5), ...pickMultiPage("listing", 4), ...pickMultiPage("legal", 2), ...pickMultiPage("support", 2), ...pickMultiPage("category", 2), ...pickMultiPage("product", 2), ...pickMultiPage("other", 2),
        ];
    // Always include the exact page the customer scanned as the first sample.
    // This prevents a product scan from being represented only by a sibling product
    // and makes failed cross-page sampling transparent without changing the main-page score.
    const scannedPageSample: MultiPageCandidate = {
      url: finalUrl.toString(),
      type: isProductPage ? "product" : propertyListingPage ? "listing" : resolvedServicePage ? "service" : hasCategorySignal ? "category" : isHomepage ? "homepage" : "other",
      evidence: ["scanned page"],
    };
    const templateShapeKey = (rawUrl:string) => {
      const u = new URL(rawUrl);
      const parts = u.pathname.replace(/\/+$/,"").split("/").filter(Boolean);
      // Query strings/fragments never define a template. Dynamic-looking path
      // segments are generalized so sibling detail URLs share one structural key.
      // Literal section names are retained only as weak navigation context.
      return parts.map((part,index)=>{
        const decoded = safeDecodeURIComponent(part).toLowerCase();
        if (/^\d/.test(decoded) || /\d{3,}/.test(decoded) || /^[a-f0-9]{8,}$/i.test(decoded) || /^[a-z0-9]+(?:-[a-z0-9]+){2,}$/i.test(decoded)) return ":detail";
        return index === 0 ? decoded : decoded.replace(/\d+/g,":n");
      }).join("/") || "/";
    };
    // Prefer template diversity. Query-string variants and near-identical listing
    // pages should not consume the limited representative sample twice.
    const uniqueMultiPagePages: MultiPageCandidate[] = [];
    const seenTemplates = new Set<string>();
    // FAQ/help-center pages can dominate a crawl and crowd out product,
    // category, service and legal evidence. Preserve a small FAQ sample.
    const isFaqSample = (url: string) => /\/(?:faq|faqs|veelgestelde-vragen|help-center|helpcentrum|hilfe|ayuda|assistance)(?:\/|$)/i.test(new URL(url).pathname);
    const faqSampleLimit = 3;
    let faqSamples = 0;
    for (const item of [scannedPageSample, ...multiPagePages]) {
      const normalized = normalizeScanUrl(item.url);
      const key = `${item.type}:${templateShapeKey(normalized)}`;
      if (uniqueMultiPagePages.some((existing)=>normalizeScanUrl(existing.url)===normalized)) continue;
      if (seenTemplates.has(key)) continue;
      if (isFaqSample(normalized) && faqSamples >= faqSampleLimit) continue;
      if (isFaqSample(normalized)) faqSamples++;
      seenTemplates.add(key);
      uniqueMultiPagePages.push(item);
      if (uniqueMultiPagePages.length >= representativePageLimit) break;
    }
    // A site can have many important pages sharing one URL template.
    // First choose structurally diverse pages, then fill remaining slots with
    // distinct high-relevance URLs up to the cap. Small sites stay small.
    if (uniqueMultiPagePages.length < representativePageLimit) {
      const seenUrls = new Set(uniqueMultiPagePages.map((item)=>normalizeScanUrl(item.url)));
      for (const item of rankedMultiPage) {
        const normalized = normalizeScanUrl(item.url);
        if (seenUrls.has(normalized)) continue;
        if (isFaqSample(normalized) && faqSamples >= faqSampleLimit) continue;
        if (isFaqSample(normalized)) faqSamples++;
        seenUrls.add(normalized);
        uniqueMultiPagePages.push(item);
        if (uniqueMultiPagePages.length >= representativePageLimit) break;
      }
    }
    const auditMultiPage = async (page: MultiPageCandidate): Promise<MultiPageAudit> => {
      try {
        const fetched = await safePublicFetch(page.url, { timeoutMs: 8000, maxRedirects: 3, userAgent: "RankFixBot/2.1 (+https://rankfix-app.onrender.com)", accept: "text/html,application/xhtml+xml" });
        const r = fetched.response;
        const finalCandidate = new URL(fetched.finalUrl.toString());
        const finalCandidateHost = normalizeHost(finalCandidate.hostname);
        const sameRegistrableSite = finalCandidateHost === siteHost
          || finalCandidateHost.endsWith(`.${siteHost}`)
          || siteHost.endsWith(`.${finalCandidateHost}`);
        if (!sameRegistrableSite) throw new Error("CROSS_HOST_REDIRECT");
        const contentType = r.headers.get("content-type") || "";
        let pageHtml: string | null = null;
        let representativeEvidenceSource: "raw_html" | "rendered_html" = "raw_html";
        // Motor v2.1: representative pages get the same single bounded recovery
        // opportunity as the primary page. A failed render remains UNABLE, never PASS.
        if (!r.ok && (r.status === 202 || r.status === 403 || r.status === 405)) {
          try {
            const recoveredPage = await renderPublicPage(finalCandidate.toString(), 10000);
            if (recoveredPage.html && recoveredPage.html.length >= 20) { pageHtml = recoveredPage.html; representativeEvidenceSource = "rendered_html"; }
          } catch {}
        }
        if (!pageHtml && (!r.ok || (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")))) {
          return { ...page, status:"unable_to_confirm", httpStatus:r.status, title:null, description:null, h1Count:null, canonical:null, score:null, evidenceChecks:[{key:"http",status:"UNABLE_TO_CONFIRM",details:`HTTP ${r.status}; pagina kon niet betrouwbaar als HTML worden beoordeeld na begrensde recovery.`}] };
        }
        pageHtml = pageHtml || await readResponseTextLimited(r, 2_000_000);
        // Representative pages need the same JS evidence opportunity as the primary
        // page. Otherwise a Nuxt/Next contact or booking page can look form-less in
        // raw HTML and incorrectly keep site-level capabilities unconfirmed.
        const representativeRawHtml = pageHtml;
        const representativeVisibleWords = stripHtml(representativeRawHtml).split(/\s+/).filter(Boolean).length;
        const representativeScriptCount = (representativeRawHtml.match(/<script\b/gi) || []).length;
        const representativeJsFramework = /(?:__NEXT_DATA__|\/_next\/|__NUXT__|\/_nuxt\/|data-reactroot|data-react-helmet|shopify|webpackJsonp|__APOLLO_STATE__)/i.test(representativeRawHtml);
        const representativeThinShell = representativeVisibleWords < 80 && representativeScriptCount >= 4;
        if (representativeJsFramework || representativeThinShell) {
          try {
            const renderedPage = await renderPublicPage(finalCandidate.toString(), 10000);
            if (renderedPage.html && renderedPage.html.length >= 20) {
              pageHtml = renderedPage.html;
              representativeEvidenceSource = "rendered_html";
              page.evidence.push("javascript-rendered representative page");
            }
          } catch {
            page.evidence.push("javascript rendering unavailable; raw HTML retained");
          }
        }
        const pageQualityTitle = firstMatch(pageHtml, /<title[^>]*>([\s\S]*?)<\/title>/i);
        const pageDescriptionTag = pageHtml.match(/<meta\b[^>]*(?:name|property)\s*=\s*["']description["'][^>]*>/i)?.[0] ||
          pageHtml.match(/<meta\b[^>]*content\s*=\s*["'][^"']*["'][^>]*(?:name|property)\s*=\s*["']description["'][^>]*>/i)?.[0] || "";
        const pageDescriptionContent = pageDescriptionTag.match(/\bcontent\s*=\s*(["'])([\s\S]*?)\1/i);
        const pageQualityDescription = pageDescriptionContent ? stripHtml(pageDescriptionContent[2]).trim() : "";
        const pageQualityText = stripHtml(pageHtml).slice(0, 12000);
        const pageQualityWords = pageQualityText.split(/\s+/).filter(Boolean).length;
        // Structural fingerprint: language-independent DOM evidence used to detect
        // near-duplicate representative templates after fetch. It deliberately
        // ignores URL words and visible copy.
        const countTag = (tag:string) => (pageHtml!.match(new RegExp("<"+tag+"\\\\b","gi"))||[]).length;
        const pageStructureKey = [
          "h"+Math.min(4,countTag("h1")+countTag("h2")+countTag("h3")),
          "a"+Math.min(9,Math.floor(countTag("a")/10)),
          "img"+Math.min(9,Math.floor(countTag("img")/5)),
          "form"+Math.min(3,countTag("form")),
          "article"+Math.min(5,countTag("article")),
          "table"+Math.min(3,countTag("table")),
          "li"+Math.min(9,Math.floor(countTag("li")/10)),
          "schema"+Math.min(5,(pageHtml!.match(/"@type"\\s*:/gi)||[]).length),
        ].join("|");
        const pageChallenge = /\b(radware page|checking your browser|just a moment|verify (?:you are|that you are) human|request unsuccessful|incapsula|imperva|challenge-platform|je bent bijna op de pagina die je zoekt|you(?:'|’)re almost at the page you(?:'|’)re looking for)\b/i.test([pageQualityTitle,pageQualityText].join(" "));
        if (pageChallenge) {
          return { ...page, url:finalCandidate.toString(), status:"unable_to_confirm", httpStatus:r.status, title:pageQualityTitle||null, description:pageQualityDescription||null, h1Count:null, canonical:null, score:null, evidenceChecks:[{key:"quality",status:"UNABLE_TO_CONFIRM",details:"HTTP-response lijkt een bot-/securitychallenge in plaats van de bedoelde pagina; deze sample wordt niet gescoord."}] };
        }
        if ((r.status !== 200 && pageQualityWords < 40 && !pageQualityTitle && !pageQualityDescription) ||
            (pageQualityWords < 15 && !pageQualityTitle && !pageQualityDescription)) {
          return { ...page, url:finalCandidate.toString(), status:"unable_to_confirm", httpStatus:r.status, title:null, description:null, h1Count:null, canonical:null, score:null, evidenceChecks:[{key:"quality",status:"UNABLE_TO_CONFIRM",details:`HTTP ${r.status}; response bevat onvoldoende betrouwbare pagina-inhoud voor scoring.`}] };
        }
        const pageTitle = pageQualityTitle;
        const pageDescription = pageQualityDescription;
        const pageH1s = [...pageHtml.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)].map((m)=>stripHtml(m[1])).filter(Boolean);
        const pageCanonical = firstMatch(pageHtml, /<link[^>]+rel\s*=\s*["'][^"']*canonical[^"']*["'][^>]+href\s*=\s*["']([^"']+)["'][^>]*>/i) || firstMatch(pageHtml, /<link[^>]+href\s*=\s*["']([^"']+)["'][^>]+rel\s*=\s*["'][^"']*canonical[^"']*["'][^>]*>/i);
        const pageForms = [...pageHtml.matchAll(new RegExp("<form\\b[\\s\\S]*?</form>", "gi"))].map((m)=>m[0]);
        const pagePasswordForm = pageForms.some((form)=>new RegExp("<input[^>]+type\\s*=\\s*[\"\']password[\"\']", "i").test(form));
        const pageInsecureFormActions = pageForms.filter((form)=>new RegExp("action\\s*=\\s*[\"\']http://", "i").test(form)).length;
        const pageSchemaTypes = [...pageHtml.matchAll(/"@type"\s*:\s*"([^"]+)"/gi)].map((m)=>String(m[1]||"").toLowerCase());
        const pageProductSchema = pageSchemaTypes.some((type)=>type==="product" || type.endsWith("product"));
        const pageItemListSchema = pageSchemaTypes.some((type)=>type==="itemlist");
        const pageStoreSchema = pageSchemaTypes.some((type)=>/^(?:store|onlinestore|departmentstore|wholesalestore)$/.test(type));
        const pageStrongCommerceAction = /\b(?:add to cart|add to basket|buy now|shop now|toevoegen aan winkelwagen|in winkelwagen|acquista ora|aggiungi al carrello|comprar ahora|adicionar ao carrinho|ajouter au panier|in den warenkorb)\b/i.test(pageQualityText);
        const pageProductLinks = [...pageHtml.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["']/gi)]
          .map((m)=>safeDecodeURIComponent(m[1]||""))
          .filter((href)=>/(?:^|\/)(?:product|products|product-page|p)(?:\/|$)|\/(?:dp|artikel|prodotto|produto)\//i.test(href));
        const pagePriceSignals = (pageQualityText.match(/(?:€|EUR\b|\bEUR\s*)\s*\d{1,5}(?:[.,]\d{2})?|\d{1,5}(?:[.,]\d{2})?\s*(?:€|EUR\b)/gi)||[]).length;
        const pageProductJson = (() => {
          for (const raw of [...pageHtml.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map((m)=>m[1])) {
            try {
              const parsed = JSON.parse(raw);
              const queue:any[] = Array.isArray(parsed) ? [...parsed] : [parsed];
              while (queue.length) {
                const value = queue.shift();
                if (!value || typeof value !== "object") continue;
                const types = Array.isArray(value["@type"]) ? value["@type"] : [value["@type"]];
                if (types.some((t:any)=>String(t||"").toLowerCase()==="product")) return value;
                for (const nested of Object.values(value)) {
                  if (Array.isArray(nested)) queue.push(...nested);
                  else if (nested && typeof nested==="object") queue.push(nested);
                }
              }
            } catch {}
          }
          return null;
        })();
        const pageOffer:any = pageProductJson ? (Array.isArray(pageProductJson.offers) ? pageProductJson.offers[0] : pageProductJson.offers) : null;
        const pageImageValue = pageProductJson?.image;
        const pageProductEvidence = pageProductJson ? {
          name: typeof pageProductJson.name==="string" ? pageProductJson.name.trim() || null : null,
          image: typeof pageImageValue==="string" ? pageImageValue : Array.isArray(pageImageValue) && typeof pageImageValue[0]==="string" ? pageImageValue[0] : null,
          sku: typeof pageProductJson.sku==="string" ? pageProductJson.sku : null,
          price: pageOffer?.price != null ? String(pageOffer.price) : null,
          currency: typeof pageOffer?.priceCurrency==="string" ? pageOffer.priceCurrency : null,
          availability: typeof pageOffer?.availability==="string" ? pageOffer.availability : null,
        } : null;
        const pageCommerceEvidence = {
          productSchema: pageProductSchema,
          itemListSchema: pageItemListSchema,
          storeSchema: pageStoreSchema,
          strongCommerceAction: pageStrongCommerceAction,
          repeatedProductLinks: new Set(pageProductLinks).size >= 3,
          priceSignals: pagePriceSignals,
          product: pageProductEvidence,
          confirmedRetailPage: pageProductSchema || (pageStrongCommerceAction && pagePriceSignals >= 1) || (pageItemListSchema && new Set(pageProductLinks).size >= 3) || (pageStoreSchema && pagePriceSignals >= 2),
        };
        const evidenceChecks: MultiPageAudit["evidenceChecks"] = [
          {key:"http",status:"PASS",details:`HTTP ${r.status}`},
          {key:"title",status:!pageTitle?"WARNING":pageTitle.length>=30&&pageTitle.length<=60?"PASS":"WARNING",details:!pageTitle?"Geen title gevonden in raw HTML.":pageTitle.length>=30&&pageTitle.length<=60?`Title gevonden (${pageTitle.length} tekens); binnen richtwaarde 30–60.`:`Title gevonden (${pageTitle.length} tekens); buiten richtwaarde 30–60.`},
          {key:"description",status:!pageDescription?"WARNING":pageDescription.length>=70&&pageDescription.length<=200?"PASS":"WARNING",details:!pageDescription?(pageDescriptionTag?"Meta description-tag aanwezig maar content is leeg.":"Geen meta description-tag gevonden in raw HTML."):pageDescription.length>=70&&pageDescription.length<=200?`Meta description gevonden (${pageDescription.length} tekens); bruikbare lengte.`:`Meta description gevonden (${pageDescription.length} tekens); uitzonderlijk ${pageDescription.length<70?"kort":"lang"}.`},
          {key:"h1",status:pageH1s.length>0?"PASS":"WARNING",details:pageH1s.length>1?`${pageH1s.length} H1-headings gevonden; meerdere H1-elementen gelden hier als structuuradvies en niet als bewezen fout.`:`${pageH1s.length} H1-heading(s) gevonden.`},
          {key:"canonical",status:pageCanonical
            ? (()=>{ try { const resolved=new URL(pageCanonical,finalCandidate); if(!/^https?:$/.test(resolved.protocol)) return "WARNING"; return normalizeScanUrl(resolved.toString())===normalizeScanUrl(finalCandidate.toString())?"PASS":"WARNING"; } catch { return "WARNING"; } })()
            : "WARNING",
            details:pageCanonical
              ? (()=>{ try { const resolved=new URL(pageCanonical,finalCandidate); if(!/^https?:$/.test(resolved.protocol)) return `Canonical gebruikt een ongeldig protocol of schema: ${pageCanonical}.`; const samePage=normalizeScanUrl(resolved.toString())===normalizeScanUrl(finalCandidate.toString()); return samePage?`Self-canonical/equivalente voorkeurs-URL bevestigd: ${resolved.toString()}`:`Canonical wijst naar ${resolved.toString()}; controleer of deze afwijking bewust is.`; } catch { return "Canonical is aanwezig maar kon niet betrouwbaar als URL worden geïnterpreteerd."; } })()
              : "Geen canonical-linkelement gevonden in de gecontroleerde raw HTML. Dit is hetzelfde afwezigheidssignaal als in de hoofdscan; controleer alleen apart wanneer de site canonical-tags uitsluitend via JavaScript toevoegt."},
        ];
        const confirmed = evidenceChecks.filter((x)=>x.status!=="UNABLE_TO_CONFIRM");
        const evidenceCredit = (item: MultiPageAudit["evidenceChecks"][number]) => {
          if (item.status === "PASS") return 1;
          if (item.status !== "WARNING") return 0;
          if (item.key === "title") return pageTitle ? 0.7 : 0.25;
          if (item.key === "description") return pageDescription ? 0.65 : 0.25;
          if (item.key === "h1") return 0.6;
          if (item.key === "canonical") return pageCanonical ? 0.7 : 0.35;
          return 0.5;
        };
        const earned = confirmed.reduce((sum,item)=>sum+evidenceCredit(item),0);
        return { ...page, url:finalCandidate.toString(), status:"audited", httpStatus:r.status, title:pageTitle||null, description:pageDescription||null, h1Count:pageH1s.length, canonical:pageCanonical||null, structureKey:pageStructureKey, evidenceSource:representativeEvidenceSource, score:confirmed.length?Math.round((earned/confirmed.length)*100):null, identityText:[pageTitle,pageDescription,pageH1s.join(" "),pageQualityText.slice(0,3000)].filter(Boolean).join(" "), schemaTypes:[...new Set(pageSchemaTypes)], formEvidence:{formCount:pageForms.length,passwordForm:pagePasswordForm,insecureFormActions:pageInsecureFormActions}, commerceEvidence:pageCommerceEvidence, evidenceChecks };
      } catch (multiPageError) {
        const rawReason = multiPageError instanceof Error ? multiPageError.message : "FETCH_FAILED";
        const reason = /timeout|abort/i.test(rawReason)
          ? "timeout"
          : /CROSS_HOST_REDIRECT/i.test(rawReason)
            ? "redirect naar ander domein"
            : /redirect/i.test(rawReason)
              ? "redirectfout"
              : /403/i.test(rawReason)
                ? "HTTP 403 / blokkade"
                : /5\\d\\d/.test(rawReason)
                  ? "serverfout"
                  : "ophalen mislukt";
        return { ...page, status:"unable_to_confirm", httpStatus:null, title:null, description:null, h1Count:null, canonical:null, score:null, evidenceChecks:[{key:"fetch",status:"UNABLE_TO_CONFIRM",details:`Pagina kon binnen de begrensde multi-page scan niet betrouwbaar worden opgehaald (reden: ${reason}).`}] };
      }
    };
    // Keep multi-page scans predictable on small production instances. Up to 20
    // representative pages are selected, but only four network/browser audits run
    // concurrently. This prevents a JavaScript-heavy site from spawning 20
    // simultaneous Puppeteer recoveries and exhausting memory/CPU.
    const representativeAuditConcurrency = 4;
    const multiPageAudits: MultiPageAudit[] = new Array(uniqueMultiPagePages.length);
    let nextRepresentativePageIndex = 0;
    const representativeWorkers = Array.from(
      { length: Math.min(representativeAuditConcurrency, uniqueMultiPagePages.length) },
      async () => {
        while (true) {
          const index = nextRepresentativePageIndex++;
          if (index >= uniqueMultiPagePages.length) return;
          multiPageAudits[index] = await auditMultiPage(uniqueMultiPagePages[index]);
        }
      },
    );
    await Promise.all(representativeWorkers);
    // Redirects can make two distinct candidates resolve to the same final URL.
    // Deduplicate after fetching as well as before selection, so the customer
    // never sees the same successfully audited page counted twice.
    const reportedMultiPageAudits: MultiPageAudit[] = [];
    const seenFinalAuditUrls = new Set<string>();
    for (const item of multiPageAudits) {
      if (item.status === "audited") {
        const finalKey = normalizeScanUrl(item.url);
        if (seenFinalAuditUrls.has(finalKey)) continue;
        seenFinalAuditUrls.add(finalKey);
      }
      reportedMultiPageAudits.push(item);
    }
    // Keep the scanned page, then prefer structurally different DOM templates.
    // This second-stage dedupe is universal: no sector or path vocabulary is used.
    const auditedRawPages = reportedMultiPageAudits.filter((item)=>item.status==="audited");
    const auditedMultiPages: MultiPageAudit[] = [];
    const seenStructures = new Set<string>();
    for (const item of auditedRawPages) {
      const key = `${item.type}:${item.structureKey || templateShapeKey(item.url)}`;
      if (seenStructures.has(key) && normalizeScanUrl(item.url)!==normalizeScanUrl(finalUrl.toString())) continue;
      seenStructures.add(key);
      auditedMultiPages.push(item);
    }
    const confirmedRetailSamples = auditedMultiPages.filter((item)=>item.commerceEvidence?.confirmedRetailPage);
    // Motor v2.1: representative pages are site-level evidence partners. They may
    // confirm capabilities/identity, but they never turn an unverified page-specific
    // defect into a failure.
    const multiPageIdentityText = auditedMultiPages.map((item)=>`${item.url} ${item.identityText||item.title||""}`).join(" ").toLowerCase();
    const multiPageCapabilities = {
      transport: /\b(transport|logistics?|logistiek|freight|vracht|forwarding|expeditie|wegtransport|road transport|warehousing|opslag|distribution|distributie|courier|koerier)\b/i.test(multiPageIdentityText),
      hospitality: /\b(hotel|hotels|room|rooms|kamer|kamers|overnachten|booking|boeken|reserveren|restaurant)\b/i.test(multiPageIdentityText),
      treatment: /\b(behandeling|behandelingen|treatment|specialisatie|tandarts|dentist|spoed|afspraak)\b/i.test(multiPageIdentityText),
      // Keep vehicle sales/inventory separate from garage/service capability.
      // A tyre or workshop site is automotive, but that alone is not evidence that it sells vehicles.
      vehicleSales: /\b(occasion|occasions|vehicle inventory|voertuigvoorraad|autovoorraad|proefrit|test drive|auto kopen|cars for sale)\b/i.test(multiPageIdentityText)
        || auditedMultiPages.some((item)=>/\/(?:voorraad|occasions?|vehicles?|autos?|cars)(?:\/|$)/i.test(new URL(item.url).pathname) && !/\b(werkplaats|service|banden|tyres?|uitlijnen|apk|onderhoud|repair)\b/i.test(`${item.url} ${item.title||""}`)),
      automotiveService: /\b(werkplaats|garage|banden|tyres?|uitlijnen|apk|onderhoud|autoservice|car service|repair)\b/i.test(multiPageIdentityText),
      properties: /\b(woning|woningen|huis|huizen|property|properties|makelaar|aanbod|koop|huur)\b/i.test(multiPageIdentityText),
      professional: /\b(expert|experts|expertise|practice|rechtsgebied|people|professionals?|advocaat|advocaten|lawyer|law firm)\b/i.test(multiPageIdentityText),
      productSample: auditedMultiPages.some((item)=>item.type==="product"),
      categorySample: auditedMultiPages.some((item)=>item.type==="category"),
    };
    const addMasterCapability = (capability:string) => {
      if (!masterEvidence.capabilities.includes(capability)) masterEvidence.capabilities.push(capability);
    };
    if (multiPageCapabilities.productSample) for (const c of ["products","pricing"]) addMasterCapability(c);
    if (multiPageCapabilities.transport) for (const c of ["services","service_area","quote_request","contact"]) addMasterCapability(c);
    if (multiPageCapabilities.vehicleSales) addMasterCapability("vehicles");
    if (multiPageCapabilities.automotiveService) addMasterCapability("services");
    if (multiPageCapabilities.properties) addMasterCapability("properties");
    if (multiPageCapabilities.treatment) addMasterCapability("services");
    // Incidental restaurant, room or booking words in a retail catalogue do not
    // establish accommodation inventory or a functioning booking capability.
    // Preserve independently evidenced booking/rooms signals without synthesizing
    // them from text across unrelated pages.
    if (multiPageCapabilities.hospitality && (sectorProfile.sector === "hospitality" || shortStayIdentity)) {
      if (scanEvidence.inventory.rooms.value) addMasterCapability("rooms");
      if (scanEvidence.appointments.booking.value) addMasterCapability("booking");
    }
    if (auditedMultiPages.length && !masterEvidence.coverage.evidenceSources.includes("multi_page")) masterEvidence.coverage.evidenceSources.push("multi_page");
    // Evidence Engine v2 foundation: expose explicit capability states with proof.
    // This runs after representative evidence collection so later checks can consume
    // one central truth instead of interpreting missing page-local evidence as false.
    const representativeFormPages = auditedMultiPages.filter((item)=>item.type==="form");
    const bookingFormPages = representativeFormPages.filter((item)=>/(?:^|\/)(?:afspraak|appointment|booking|book|reserve|reservation|reserveren)(?:\/|$)/i.test(new URL(item.url).pathname));
    const capabilityProofs: Record<string,string[]> = {
      sells_products_online: [
        ...confirmedRetailSamples.map((item)=>item.url),
        ...(masterEvidence.commerce.confirmed ? [finalUrl.toString()] : []),
      ],
      lists_inventory: [
        ...(multiPageCapabilities.properties ? auditedMultiPages.filter((item)=>/\\b(woning|woningen|property|properties|aanbod|koop|huur)\\b/i.test(item.identityText||"")).map((item)=>item.url) : []),
        ...(multiPageCapabilities.vehicleSales ? auditedMultiPages.filter((item)=>/\\b(occasion|occasions|vehicle inventory|voertuigvoorraad|autovoorraad|cars for sale)\\b/i.test(item.identityText||"")).map((item)=>item.url) : []),
      ],
      offers_bookable_services: bookingFormPages.map((item)=>item.url),
      collects_leads: representativeFormPages.map((item)=>item.url),
      serves_local_customers: masterEvidence.capabilities.includes("local") ? [finalUrl.toString()] : [],
    };
    const capabilityCoverage = auditedMultiPages.length;
    const weakCapabilityHints: Record<string,string[]> = {
      sells_products_online: masterEvidence.capabilities.includes("products") && !capabilityProofs.sells_products_online.length ? ["Product-/catalogussignaal gevonden zonder bevestigde retailketen"] : [],
      lists_inventory: (masterEvidence.capabilities.includes("properties") || masterEvidence.capabilities.includes("vehicles")) && !capabilityProofs.lists_inventory.length ? ["Inventory-signaal gevonden zonder representatieve listingpagina"] : [],
      offers_bookable_services: (masterEvidence.capabilities.includes("booking") || masterEvidence.capabilities.includes("appointment") || masterEvidence.capabilities.includes("reservation")) && !capabilityProofs.offers_bookable_services.length ? ["Boekings-/afspraaksignaal gevonden zonder representatief boekingsformulier"] : [],
      collects_leads: (masterEvidence.capabilities.includes("contact") || masterEvidence.capabilities.includes("quote_request")) && !capabilityProofs.collects_leads.length ? ["Contact-/offertesignaal gevonden zonder representatief leadformulier"] : [],
      serves_local_customers: masterEvidence.capabilities.includes("local") && !capabilityProofs.serves_local_customers.length ? ["Lokaal signaal gevonden zonder voldoende onafhankelijke lokale evidence"] : [],
    };
    const capabilityStates: EvidenceCapability[] = Object.entries(capabilityProofs).map(([id,proof])=>buildCapabilityState(
      id, proof, capabilityCoverage, 0.95, {weakProof:weakCapabilityHints[id]||[]}
    ));
    (masterEvidence as typeof masterEvidence & { capabilityStates?: EvidenceCapability[] }).capabilityStates = capabilityStates;

    const sitewideCommerceEvidence = {
      confirmed: confirmedRetailSamples.length > 0,
      sampleCount: confirmedRetailSamples.length,
      urls: confirmedRetailSamples.map((item)=>item.url).slice(0,3),
      evidence: confirmedRetailSamples.map((item)=>({
        url:item.url,
        type:item.type,
        productSchema:Boolean(item.commerceEvidence?.productSchema),
        itemListSchema:Boolean(item.commerceEvidence?.itemListSchema),
        storeSchema:Boolean(item.commerceEvidence?.storeSchema),
        strongCommerceAction:Boolean(item.commerceEvidence?.strongCommerceAction),
        repeatedProductLinks:Boolean(item.commerceEvidence?.repeatedProductLinks),
        priceSignals:item.commerceEvidence?.priceSignals||0,
      })).slice(0,3),
    };
    // Multi-page evidence may strengthen the site profile, but never silently
    // activates page-specific webshop checks for the page the customer scanned.
    if (!transportBookingIdentity && sitewideCommerceEvidence.confirmed && !technologyProfile.isCommerce) {
      technologyProfile.isCommerce = true;
      technologyProfile.siteType = "Webshop";
      technologyProfile.commercePlatform = technologyProfile.commercePlatform === "Niet bevestigd" ? "Webshop bevestigd via site-sample" : technologyProfile.commercePlatform;
      technologyProfile.confidence = Math.max(technologyProfile.confidence, 82);
      technologyProfile.evidence = [...technologyProfile.evidence, `Site-sample bevestigt retail commerce op ${sitewideCommerceEvidence.sampleCount} pagina('s)`].slice(0,8);
    }
    // Final Master reconciliation: representative same-site pages may add site-level
    // capabilities after the current page was analysed. Feed that evidence back into
    // the Master without changing the already-scored current-page checks.
    if (sitewideCommerceEvidence.confirmed) {
      masterEvidence.commerce.confirmed = true;
      masterEvidence.commerce.strength = Math.max(masterEvidence.commerce.strength, 3);
      for (const capability of ["ecommerce","products","pricing"]) {
        if (!masterEvidence.capabilities.includes(capability)) masterEvidence.capabilities.push(capability);
      }
      for (const module of ["ecommerce","product","pricing_currency","merchant"]) {
        if (!masterEvidence.activeModules.includes(module)) masterEvidence.activeModules.push(module);
        if (!sectorProfile.applicableModules.includes(module)) sectorProfile.applicableModules.push(module);
      }
      for (const capability of ["ecommerce","products","pricing","merchant","consumer_rights"]) {
        if (!masterEvidence.capabilities.includes(capability)) masterEvidence.capabilities.push(capability);
      }
      if (!masterEvidence.businessModels.includes("commerce")) masterEvidence.businessModels.push("commerce");
      if (!masterEvidence.coverage.evidenceSources.includes("multi_page")) masterEvidence.coverage.evidenceSources.push("multi_page");
      masterEvidence.policy += " Representatieve same-site pagina's mogen sitebrede capabilities bevestigen, maar wijzigen niet achteraf de score van de expliciet gescande pagina.";
    }
    // Resolve the final site-level commerce decision once, after current-page,
    // technology and multi-page evidence have all had a chance to contribute.
    // Commerce can be secondary to a proven service identity. Cart/checkout
    // navigation or a shop shell alone is not hard retail evidence.
    const representativeRetailProduct = auditedMultiPages.some((item)=>item.type==="product" && Boolean(item.commerceEvidence?.product));
    // Hard commerce requires confirmed evidence. A product-looking URL is only
    // a medium-confidence hint and must never activate retail modules by itself.
    const confirmedCurrentProduct = scanEvidence.commerce.productPage.value &&
      scanEvidence.commerce.productPage.confidence === "high";
    const confirmedAddToCart = scanEvidence.commerce.addToCart.value &&
      scanEvidence.commerce.addToCart.confidence === "high";
    const corroboratedProductAndPrice = scanEvidence.commerce.products.value &&
      scanEvidence.commerce.products.confidence === "high" &&
      scanEvidence.commerce.prices.value.count > 0 &&
      scanEvidence.commerce.prices.confidence !== "low";
    const hardCommerceEvidence = sitewideCommerceEvidence.confirmed || representativeRetailProduct || Boolean(
      confirmedCurrentProduct ||
      confirmedAddToCart ||
      corroboratedProductAndPrice
    );
    const technologyOnlyCommerce = technologyProfile.isCommerce && !hardCommerceEvidence;
    const secondaryCommerceOnly = Boolean(primaryNonCommerceIdentity && !hardCommerceEvidence);
    const finalCommerceDecision = {
      confirmed: hardCommerceEvidence || (technologyOnlyCommerce && !primaryNonCommerceIdentity),
      currentPageEvidence: hardCommerceEvidence && masterEvidence.commerce.confirmed,
      technologyProfile: technologyProfile.isCommerce,
      technologyOnly: technologyOnlyCommerce,
      secondaryCommerceOnly,
      multiPageEvidence: sitewideCommerceEvidence.confirmed,
    };
    if (!finalCommerceDecision.confirmed && primaryNonCommerceIdentity) {
      masterEvidence.commerce.confirmed = false;
      masterEvidence.businessModels = masterEvidence.businessModels.filter((model)=>model!=="commerce");
      technologyProfile.isCommerce = false;
      technologyProfile.siteType = technologyProfile.siteType === "Webshop" ? "Website" : technologyProfile.siteType;
      technologyProfile.evidence = [...technologyProfile.evidence, "Secundaire commerce-navigatie gevonden; geen harde product-/retailketen bevestigd."].slice(0,8);
      for (const capability of ["ecommerce","merchant","consumer_rights"]) {
        masterEvidence.capabilities = masterEvidence.capabilities.filter((item)=>item!==capability);
      }
    }
    // Evidence Engine v2: reconcile primary identity after representative evidence.
    const reconciledIdentitySource = [sectorIdentitySource, multiPageIdentityText].filter(Boolean).join(" ");
    const reconciledSectorCandidates = sectorSignals.map((item) => {
      const primaryIdentityHit = item.patterns[0]?.test(reconciledIdentitySource) ? 2 : 0;
      const activityHit = item.patterns[1]?.test(reconciledIdentitySource) ? 1 : 0;
      const schemaBoost = schemaSectorBoost[item.sector] || 0;
      return { sector:item.sector, label:item.label, score:primaryIdentityHit + activityHit + schemaBoost, modules:item.modules };
    }).filter((item)=>item.score>0).sort((a,b)=>b.score-a.score || (sectorPriority[b.sector]||0)-(sectorPriority[a.sector]||0));
    const reconciledTop = reconciledSectorCandidates[0];
    const reconciledRunnerUp = reconciledSectorCandidates[1];
    const reconciledIdentityStrong = Boolean(reconciledTop && reconciledTop.score >= 3 && (!reconciledRunnerUp || reconciledTop.score > reconciledRunnerUp.score));
    if (!finalCommerceDecision.confirmed && reconciledIdentityStrong && reconciledTop && sectorProfile.sector !== reconciledTop.sector) {
      sectorProfile.sector = reconciledTop.sector;
      sectorProfile.key = reconciledTop.sector;
      sectorProfile.label = reconciledTop.label;
      sectorProfile.confidence = "high";
      sectorProfile.confidenceScore = Math.min(96, 86 + reconciledTop.score * 2);
      sectorProfile.evidence = ["Scanbewijs: primaire activiteit bevestigd over representatieve pagina's"];
      sectorProfile.applicableModules = [...new Set(["core_seo","geo","technical",...reconciledTop.modules])];
      masterEvidence.activeModules = sectorProfile.applicableModules;
    }

    if (!finalCommerceDecision.confirmed && multiPageCapabilities.transport && sectorProfile.key==="unknown") {
      sectorProfile.sector = "transport_travel";
      sectorProfile.key = "transport_travel";
      sectorProfile.label = "Transport & Logistiek";
      sectorProfile.confidence = "high";
      sectorProfile.confidenceScore = Math.max(88, sectorProfile.confidenceScore);
      sectorProfile.evidence = [...sectorProfile.evidence, "Representatieve sitepagina's bevestigen transport/logistieke hoofdactiviteit"].slice(0,6);
      sectorProfile.applicableModules = [...new Set([...sectorProfile.applicableModules, "transport_travel", "lead_conversion", "local"])];
      for (const module of ["transport_travel","lead_conversion","local"]) if (!masterEvidence.activeModules.includes(module)) masterEvidence.activeModules.push(module);
    }
    // Motor v2.1: module applicability follows the final Master commerce decision,
    // not an early incidental capability. Page-specific checks still require proof.
    const commerceModules = new Set(["ecommerce","product","pricing_currency","merchant","checkout"]);
    const allCommerceModules = new Set([...commerceModules, "eu_consumer"]);
    if (finalCommerceDecision.confirmed) {
      for (const module of commerceModules) {
        if (!sectorProfile.applicableModules.includes(module)) sectorProfile.applicableModules.push(module);
        if (!masterEvidence.activeModules.includes(module)) masterEvidence.activeModules.push(module);
      }
      // EU consumer-readiness is jurisdiction-sensitive. Commerce identity alone
      // must never activate EU checks for clearly non-EU storefronts.
      if (euConsumerApplicable) {
        if (!sectorProfile.applicableModules.includes("eu_consumer")) sectorProfile.applicableModules.push("eu_consumer");
        if (!masterEvidence.activeModules.includes("eu_consumer")) masterEvidence.activeModules.push("eu_consumer");
      } else {
        sectorProfile.applicableModules = sectorProfile.applicableModules.filter((module)=>module!=="eu_consumer");
        masterEvidence.activeModules = masterEvidence.activeModules.filter((module)=>module!=="eu_consumer");
      }
    } else {
      sectorProfile.applicableModules = sectorProfile.applicableModules.filter((module)=>!allCommerceModules.has(module));
      masterEvidence.activeModules = masterEvidence.activeModules.filter((module)=>!allCommerceModules.has(module));
    }
    // Re-run only clearly contradicted/underspecified primary identity decisions
    // with representative evidence. Secondary topics can never override a strong
    // primary sector. This fixes recruitment text on hotel sites without hardcoding brands.
    if (!finalCommerceDecision.confirmed && multiPageCapabilities.hospitality && (sectorProfile.key==="recruitment" || sectorProfile.key==="unknown")) {
      sectorProfile.sector = "hospitality";
      sectorProfile.key = "hospitality";
      sectorProfile.label = "Hotels & hospitality";
      sectorProfile.confidence = "high";
      sectorProfile.confidenceScore = Math.max(88, sectorProfile.confidenceScore);
      sectorProfile.evidence = [...sectorProfile.evidence, "Representatieve sitepagina bevestigt hotel/hospitality-identiteit"].slice(0,6);
      sectorProfile.applicableModules = [...new Set([...sectorProfile.applicableModules.filter((m)=>m!=="recruitment"), "hospitality"])];
    }
    // Preserve broad engine families internally, but show a more useful specific
    // label when the catalog and representative evidence independently agree.
    if (!finalCommerceDecision.confirmed && catalogTop?.key==="dentist" && multiPageCapabilities.treatment) {
      sectorProfile.key = "dentist";
      sectorProfile.label = "Tandarts / Dentist";
      sectorProfile.confidence = "high";
      sectorProfile.confidenceScore = Math.max(92, sectorProfile.confidenceScore);
    }
    if (!finalCommerceDecision.confirmed && catalogTop?.key==="legal" && multiPageCapabilities.professional) {
      sectorProfile.key = "legal";
      sectorProfile.label = "Juridisch / Advocatuur";
      sectorProfile.confidence = "high";
      sectorProfile.confidenceScore = Math.max(90, sectorProfile.confidenceScore);
    }

    // Commerce is a primary site identity. Once Scanbewijs confirms a webshop,
    // incidental content-sector words must not leave the report labelled as an
    // unrelated sector. Preserve the previous candidate as diagnostic evidence.
    if (finalCommerceDecision.confirmed && sectorProfile.key!=="ecommerce" && (!primaryNonCommerceIdentity || (verifiedStorefront && incidentalSectorConflict && !shortStayIdentity))) {
      const previousSector = sectorProfile.label;
      sectorProfile.sector = "ecommerce";
      sectorProfile.key = "ecommerce";
      sectorProfile.label = "Webshop / e-commerce";
      sectorProfile.confidence = "high";
      sectorProfile.confidenceScore = Math.max(sectorProfile.confidenceScore, sitewideCommerceEvidence.confirmed ? 92 : 88);
      sectorProfile.evidence = [...sectorProfile.evidence, `Scanbewijs bevestigt commerce; eerdere sectorhint: ${previousSector}`].slice(0,6);
    }

    // Final Master reconciliation: late technology/multi-page evidence may improve
    // the site-level decision after the initial Master object was created. Keep
    // one authoritative website type, sector and page type for every consumer.
    const sectorDisplayPolicy = sectorProfile.confidenceScore >= 80 ? "confirmed" : sectorProfile.confidenceScore >= 60 ? "probable" : "unconfirmed";
    masterEvidence.primarySector = {
      key: sectorProfile.key,
      label: sectorProfile.label,
      confidence: sectorProfile.confidence,
      confidenceScore: sectorProfile.confidenceScore,
      displayPolicy: sectorDisplayPolicy,
    };
    masterEvidence.coverage.confirmedCapabilities = masterEvidence.capabilities.length;
    const websiteType = finalCommerceDecision.confirmed
      ? "Webshop"
      : sectorProfile.key === "recruitment" && masterEvidence.businessModels.includes("recruitment")
        ? "Recruitmentwebsite"
        : masterEvidence.businessModels.some(model => model === "appointments" || model === "reservations" || model === "bookings")
          ? "Boekings-/afsprakenwebsite"
          : technologyProfile.siteType === "Landingpage"
            ? "Website"
            : technologyProfile.siteType;
    // Late representative evidence is reconciled before the final score. Checks remain
    // page-specific unless their rule is explicitly a site/capability check.
    if (sectorProfile.sector === "automotive") {
      const serviceCheck = seoChecks.find((item)=>item.key==="sector_automotive_services");
      if (serviceCheck && multiPageCapabilities.automotiveService) {
        Object.assign(serviceCheck, check("pass","sector_automotive_services","seo","Garage diensten","Representatieve same-site pagina's bevestigen garage-/werkplaatsdiensten.","Houd de belangrijkste garage- en werkplaatsdiensten duidelijk vindbaar.",4,4));
      }
      const inventoryCheck = seoChecks.find((item)=>item.key==="sector_automotive_inventory");
      if (inventoryCheck && multiPageCapabilities.vehicleSales) {
        Object.assign(inventoryCheck, check("pass","sector_automotive_inventory","seo","Voertuigaanbod","Representatieve same-site pagina's bevestigen voertuig-/occasionaanbod.","Houd voertuigaanbod en detailpagina's duidelijk vindbaar.",4,4));
      }
    }
    // Organization + WebSite is a site-level identity control. When the customer
    // scans a subpage, use the already-audited homepage sample instead of N.v.t.
    // Site-level capabilities: positive representative evidence may upgrade an
    // earlier N/A/UNABLE result; absence never creates a failure.
    if (multiPageCapabilities.treatment && sectorProfile.sector === "health_wellness") {
      const treatmentCheck = seoChecks.find((item)=>item.key==="sector_health_services");
      if (treatmentCheck) Object.assign(treatmentCheck, check("pass","sector_health_services","seo","Behandelingen & diensten","Representatieve same-site pagina's bevestigen behandelingen of therapeutische diensten.","Houd behandelingen en diensten feitelijk en duidelijk vindbaar.",4,4));
    }
    const representativeProduct = auditedMultiPages.find((item)=>item.type==="product" && item.commerceEvidence?.product)?.commerceEvidence?.product;
    if (finalCommerceDecision.confirmed && representativeProduct) {
      const productEvidenceCount = [representativeProduct.name,representativeProduct.image,representativeProduct.sku,representativeProduct.price&&representativeProduct.currency,representativeProduct.availability].filter(Boolean).length;
      const productSchemaCheck = seoChecks.find((item)=>item.key==="product_schema");
      if (productSchemaCheck && auditedMultiPages.some((item)=>item.type==="product" && item.commerceEvidence?.productSchema)) Object.assign(productSchemaCheck, check("pass","product_schema","seo","Product structured data","Een representatieve productpagina bevat bevestigde Product structured data.","Houd Product structured data gelijk aan de zichtbare productinformatie.",6,6));
      const optimizerCheck = seoChecks.find((item)=>item.key==="product_optimizer");
      if (optimizerCheck && productEvidenceCount>=3) Object.assign(optimizerCheck, check("pass","product_optimizer","seo","AI Product Copy & Metadata","Een representatieve productpagina levert voldoende productbewijs voor productoptimalisatie.","Gebruik alleen aantoonbare productgegevens voor optimalisaties.",5,5));
      const availabilityCheck = seoChecks.find((item)=>item.key==="product_availability_consistency");
      if (availabilityCheck && representativeProduct.availability) Object.assign(availabilityCheck, check("pass","product_availability_consistency","seo","Productvoorraad",`Een representatieve productpagina bevat een expliciet beschikbaarheidssignaal: ${representativeProduct.availability}.`,"Houd zichtbare voorraad en structured data consistent.",4,4));
      const merchantCheck = seoChecks.find((item)=>item.key==="merchant_product_readiness");
      if (merchantCheck && productEvidenceCount>=4) Object.assign(merchantCheck, check("pass","merchant_product_readiness","seo","Merchant Center productbasis","Een representatieve productpagina bevestigt naam, afbeelding en meerdere machineleesbare product-/aanbodvelden.","Houd productpagina en eventuele Merchant-feed consistent; RankFix bevestigt hiermee geen Merchant Center-goedkeuring.",6,6));
    }
    // Capability-to-check propagation: representative pages are first-class site
    // evidence. Specialist checks consume the same Scanbewijs instead of staying
    // UNABLE merely because the scanned page itself did not contain the signal.
    const promoteCheckFromRepresentativeEvidence = (key:string, proven:boolean, message:string, evidenceUrl:string | null) => {
      if (!proven) return;
      const item = [...seoChecks,...geoChecks].find((candidate)=>candidate.key===key);
      if (!item || item.status==="pass") return;
      Object.assign(item, check("pass",key,item.category,item.title,message,item.fix,item.maxPoints,item.maxPoints));
      item.evidence = { url:evidenceUrl || finalUrl.toString(), found:true, details:message };
    };
    const firstRepresentativeUrl = (predicate:(item:MultiPageAudit)=>boolean) => auditedMultiPages.find(predicate)?.url || null;
    promoteCheckFromRepresentativeEvidence(
      "sector_real_estate_listings",
      multiPageCapabilities.properties,
      "Representatieve pagina-evidence bevestigt vastgoed-/woningaanbod op de website.",
      firstRepresentativeUrl((item)=>/\\b(woning|woningen|property|properties|aanbod|koop|huur)\\b/i.test(item.identityText||""))
    );
    promoteCheckFromRepresentativeEvidence(
      "sector_automotive_inventory",
      multiPageCapabilities.vehicleSales,
      "Representatieve pagina-evidence bevestigt voertuig-/occasionaanbod op de website.",
      firstRepresentativeUrl((item)=>/\\b(occasion|occasions|vehicle inventory|voertuigvoorraad|autovoorraad|cars for sale)\\b/i.test(item.identityText||""))
    );
    promoteCheckFromRepresentativeEvidence(
      "sector_automotive_services",
      multiPageCapabilities.automotiveService,
      "Representatieve pagina-evidence bevestigt garage-/werkplaatsdiensten op de website.",
      firstRepresentativeUrl((item)=>/\\b(werkplaats|garage|banden|tyres?|apk|onderhoud|autoservice|repair)\\b/i.test(item.identityText||""))
    );
    promoteCheckFromRepresentativeEvidence(
      "sector_health_services",
      multiPageCapabilities.treatment,
      "Representatieve pagina-evidence bevestigt behandelingen of zorgdiensten op de website.",
      firstRepresentativeUrl((item)=>/\\b(behandeling|behandelingen|treatment|specialisatie|tandarts|dentist)\\b/i.test(item.identityText||""))
    );

    const securityFormCheck = securityChecks.find((item)=>item.key==="security_forms");
    const representativeFormEvidence = representativeFormPages.filter((item)=>(item.formEvidence?.formCount||0)>0);
    const scannedFormIntent = /(?:^|\/)(?:contact|contact-us|contacteer|kontakt|offerte|quote|request-quote|afspraak|appointment|booking|book|reserve|reservation|reserveren)(?:\/|$)/i.test(finalUrl.pathname);
    if (securityFormCheck && representativeFormEvidence.length>0) {
      const totalForms = representativeFormEvidence.reduce((sum,item)=>sum+(item.formEvidence?.formCount||0),0);
      const insecureForms = representativeFormEvidence.reduce((sum,item)=>sum+(item.formEvidence?.insecureFormActions||0),0);
      const allHttps = representativeFormEvidence.every((item)=>{ try { return new URL(item.url).protocol==="https:"; } catch { return false; } });
      const evidenceUrls = representativeFormEvidence.map((item)=>item.url).slice(0,4).join(", ");
      Object.assign(securityFormCheck, insecureForms>0
        ? securityCheck("fail","security_forms","Formuliertransport",`${insecureForms} relevant formulier op de geselecteerde contact-/aanvraagpagina stuurt expliciet naar een HTTP-endpoint. Bewijs: ${evidenceUrls}.`,"Gebruik uitsluitend HTTPS voor formulieracties en gevoelige gegevens.",5,5)
        : allHttps
          ? securityCheck("pass","security_forms","Formuliertransport",`${totalForms} relevant HTML-formulier bevestigd op de geselecteerde contact-/aanvraagpagina zonder expliciete onveilige HTTP-action. Bewijs: ${evidenceUrls}.`,"Controleer server-side validatie, CSRF-bescherming en autorisatie aanvullend; die zijn niet uit statische HTML te bewijzen.",5,5)
          : securityCheck("warning","security_forms","Formuliertransport",`Relevant formulier gevonden op een contact-/aanvraagpagina die niet volledig via HTTPS loopt. Bewijs: ${evidenceUrls}.`,"Bescherm formulieren met HTTPS; beoordeel server-side validatie en CSRF apart.",2,5));
      securityFormCheck.reasonCode = "weak_evidence";
    } else if (securityFormCheck && representativeFormPages.length>0) {
      const evidenceUrls = representativeFormPages.map((item)=>item.url).slice(0,4).join(", ");
      Object.assign(securityFormCheck, securityCheck("unable_to_confirm","security_forms","Formuliertransport",`RankFix selecteerde een relevante contact-/aanvraagpagina, maar vond daar in de gecontroleerde HTML geen betrouwbaar formulier. Bewijs: ${evidenceUrls}.`,"Controleer het daadwerkelijke formulier inclusief HTTPS, server-side validatie en CSRF-bescherming.",0,5));
      securityFormCheck.reasonCode = "insufficient_pages";
    } else if (securityFormCheck && !scannedFormIntent) {
      Object.assign(securityFormCheck, securityCheck("not_applicable","security_forms","Formuliertransport","Geen representatieve contact-, aanvraag- of afspraakpagina met betrouwbaar formulierbewijs geselecteerd. Globale zoek-, login- en footerformulieren tellen niet als bewijs voor deze controle.","Geen actie nodig op basis van deze statische steekproef.",0,5));
    } else if (securityFormCheck && forms.length===0) {
      const explicitCapability = (id:string) => capabilityStates.find((item)=>item.id===id && item.state==="detected");
      // A specific customer-facing flow name is allowed only when the capability
      // itself has explicit proof. Legacy sector inference may not label a flow.
      const formFlow = explicitCapability("offers_bookable_services")
        ? {kind:"appointment" as const,label:"afspraak-/reserveringsflow"}
        : explicitCapability("collects_leads")
          ? {kind:"contact" as const,label:"contact-/aanvraagflow"}
          : finalCommerceDecision.confirmed
            ? {kind:"checkout" as const,label:"checkout-/afrekenflow"}
            : masterEvidence.capabilities.some((c)=>["appointment","reservation","booking","quote_request","contact"].includes(c))
              ? {kind:"contact" as const,label:"formulier-/contactflow"}
              : null;
      if (formFlow) {
        const sampledPaths = auditedMultiPages.map((item)=>{ try { return new URL(item.url).pathname || "/"; } catch { return item.url; } }).join(", ");
        Object.assign(securityFormCheck, securityCheck("unable_to_confirm","security_forms","Formuliertransport",`RankFix bevestigde een ${formFlow.label}, maar vond geen HTML-formulier in de ${auditedMultiPages.length || 1} representatief geanalyseerde pagina('s) (${sampledPaths || new URL(finalUrl).pathname}). De formuliertransportbeveiliging is daarom niet te bevestigen.`,`Controleer de daadwerkelijke ${formFlow.label}, inclusief HTTPS, server-side validatie en CSRF-bescherming.`,0,5));
        securityFormCheck.formKind = formFlow.kind;
        securityFormCheck.reasonCode = "insufficient_pages";
      }
    }

    const orgWebsiteCheck = geoChecks.find((item)=>item.key==="organization_website");
    const homepageSample = auditedMultiPages.find((item)=>item.type==="homepage");
    if (!isHomepage && orgWebsiteCheck && homepageSample) {
      const homepageTypes = new Set((homepageSample.schemaTypes||[]).map((value)=>value.toLowerCase()));
      const hasOrg = homepageTypes.has("organization");
      const hasWebSite = homepageTypes.has("website");
      const signals = Number(hasOrg)+Number(hasWebSite);
      const replacement = hasOrg && hasWebSite
        ? check("pass","organization_website","geo","Organization + WebSite","Organization en WebSite structured data zijn bevestigd op de representatieve homepage.","Houd naam, URL en logo consistent met de zichtbare site-identiteit.",8,8)
        : check("warning","organization_website","geo","Organization + WebSite",signals===1?"De representatieve homepage bevat één van Organization of WebSite; het aanvullende identity-schema ontbreekt.":"De representatieve homepage bevat geen bevestigd Organization- of WebSite-schema.","Voeg alleen passende Organization- en/of WebSite JSON-LD toe met aantoonbare gegevens.",signals===1?6:4,8);
      Object.assign(orgWebsiteCheck,replacement);
    }

    // Evidence Engine final applicability gate.
    // All collection/classification decisions above are now complete. From this point
    // onwards, specialist checks must follow the final Scanbewijs decision rather
    // than an earlier page-level hint. This prevents stale commerce checks on service
    // sites and lets representative product evidence activate product checks.
    const finalCommerceOnlyKeys = new Set([
      "commercial_terms_signal","merchant_product_readiness","merchant_feed_signal","price_format",
      "price_currency_consistency","pricing_currency_consistency",
      "product_schema","product_optimizer","product_copy_optimizer","product_price_consistency",
      "product_availability","product_availability_consistency","variant_url",
      "webshop_claims","webshop_trust","checkout_funnel_static","checkout_information_signal","checkout_trust",
      "eu_discount_signal","eu_discount_reference_signal","eu_reference_price_signal",
      "eu_review_signal","eu_review_transparency_signal","eu_scarcity_signal",
      "eu_consumer_information_signal"
    ]);
    const finalEuCommerceKeys = new Set([
      "eu_discount_signal","eu_discount_reference_signal","eu_reference_price_signal",
      "eu_review_signal","eu_review_transparency_signal","eu_scarcity_signal",
      "eu_consumer_information_signal"
    ]);
    const setFinalNotApplicable = (item:Check, reason:string) => {
      item.status = "not_applicable";
      item.issue_status = "NOT_APPLICABLE";
      item.points = 0;
      item.confidence = "high";
      item.message = reason;
      item.fix = "Geen actie nodig. RankFix activeert deze controle alleen wanneer de vereiste functie met voldoende bewijs is bevestigd.";
      item.reasonCode = "cap_absent";
      item.evidence = {url:finalUrl.toString(),found:false,details:item.message};
    };
    if (!finalCommerceDecision.confirmed) {
      for (const item of [...seoChecks,...geoChecks]) {
        if (finalCommerceOnlyKeys.has(item.key)) {
          setFinalNotApplicable(item,"Definitieve Scanbewijs bevestigt geen webshop-/retailketen; deze commercecontrole is niet van toepassing.");
        }
      }
    } else if (!euConsumerApplicable) {
      for (const item of [...seoChecks,...geoChecks]) {
        if (finalEuCommerceKeys.has(item.key)) {
          setFinalNotApplicable(item,"Commerce is bevestigd, maar EU-consumentenapplicability is voor deze storefront niet betrouwbaar bevestigd.");
        }
      }
    }

    const representativeProductPage = auditedMultiPages.find((item)=>item.type==="product" && item.commerceEvidence?.product);
    if (finalCommerceDecision.confirmed && representativeProductPage?.commerceEvidence?.product) {
      const product = representativeProductPage.commerceEvidence.product;
      const sourceCount = [product.name,product.image,product.sku,product.price&&product.currency,product.availability].filter(Boolean).length;
      // Diagnostics are consumers of Scanbewijs too. A representative product
      // sample must not coexist with productPage:false in the final report.
      checkoutFunnelEvidence.productPage = true;
      if (representativeProductPage.commerceEvidence.strongCommerceAction) checkoutFunnelEvidence.addToCart = true;

      for (const item of [...seoChecks,...geoChecks]) {
        if (item.key==="product_schema" && representativeProductPage.commerceEvidence.productSchema) {
          Object.assign(item, check("pass","product_schema",item.category==="geo"?"geo":"seo","Product structured data","Een representatieve productpagina bevat bevestigde Product structured data.","Houd Product structured data gelijk aan de zichtbare productinformatie.",item.maxPoints,item.maxPoints));
        }
        if ((item.key==="product_optimizer" || item.key==="product_copy_optimizer") && sourceCount>=3) {
          Object.assign(item, check("pass",item.key,item.category==="geo"?"geo":"seo","AI Product Copy & Metadata",`Een representatieve productpagina levert ${sourceCount} controleerbare productvelden voor veilige optimalisatie.`,"Gebruik alleen aantoonbare productgegevens voor optimalisaties.",item.maxPoints,item.maxPoints));
        }
        if ((item.key==="product_availability" || item.key==="product_availability_consistency") && product.availability) {
          Object.assign(item, check("pass",item.key,item.category==="geo"?"geo":"seo","Productvoorraad",`Een representatieve productpagina bevat een expliciet structured availability-signaal: ${product.availability}.`,"Houd zichtbare voorraad en Product/Offer structured data consistent.",item.maxPoints,item.maxPoints));
        }
        if (item.key==="merchant_product_readiness" && sourceCount>=4) {
          Object.assign(item, check("pass","merchant_product_readiness",item.category==="geo"?"geo":"seo","Merchant Center productbasis","Representatieve product-evidence bevestigt naam, afbeelding en meerdere machineleesbare Product/Offer-velden.","Houd productpagina en eventuele Merchant-feed consistent; RankFix bevestigt hiermee geen Merchant Center-goedkeuring.",item.maxPoints,item.maxPoints));
        }
      }
    }

    // Final score is calculated only after representative evidence reconciliation.
    selectedSeoScore = scoreApplicableChecks(selectedSeoChecks);
    selectedGeoScore = scoreApplicableChecks(selectedGeoChecks);
    selectedOverallScore = mode === "seo" ? selectedSeoScore : mode === "geo" ? selectedGeoScore : Math.round(selectedSeoScore * 0.6 + selectedGeoScore * 0.4);
    selectedOverallScore = applyEvidenceBasedScoreCap(selectedOverallScore, checks);
    seoCoverage = weightedCoverage(selectedSeoChecks);
    geoCoverage = weightedCoverage(selectedGeoChecks);
    overallCoverage = weightedCoverage(checks);
    scoreModel.range = scoreRange(checks);
    scoreModel.seoRange = scoreRange(selectedSeoChecks);
    scoreModel.geoRange = scoreRange(selectedGeoChecks);
    scoreModel.provisional = overallCoverage.coveragePercent < 90;

    const classification = {
      websiteType,
      sector: {
        key: sectorProfile.key,
        label: sectorProfile.label,
        confidence: sectorProfile.confidence,
        confidenceScore: sectorProfile.confidenceScore,
        displayPolicy: sectorDisplayPolicy,
      },
      pageType: {
        type: pageTypeEvidence.type,
        confidence: pageTypeEvidence.confidence,
        commercialLandingPage: isHomepage && technologyProfile.evidence.some(item => /landingpage-signalen/i.test(item)),
      },
      policy: "Website type, sector en paginatype zijn afzonderlijke beslissingen. Een commerciële landingpage is nooit automatisch het type van de volledige website.",
    };
    (masterEvidence as typeof masterEvidence & {finalDecisions?:unknown;classification?:unknown}).finalDecisions = {commerce:finalCommerceDecision};
    (masterEvidence as typeof masterEvidence & {classification?:unknown}).classification = classification;

    // Sitewide aggregation is descriptive evidence, not a second scoring model.
    // For each representative control we expose the worst *proven* result and the
    // exact affected URLs. UNABLE samples remain uncertainty and never become FAIL.
    const sitewideCheckAggregation = ["title","description","h1","canonical"].map((key) => {
      const observations = auditedRawPages.flatMap((page) => {
        const finding = page.evidenceChecks.find((item)=>item.key===key);
        return finding ? [{url:page.url,status:finding.status,details:finding.details}] : [];
      });
      const proven = observations.filter((item)=>item.status!=="UNABLE_TO_CONFIRM");
      const warnings = proven.filter((item)=>item.status==="WARNING");
      const passes = proven.filter((item)=>item.status==="PASS");
      return {
        key,
        status: warnings.length ? "WARNING" as const : passes.length ? "PASS" as const : "UNABLE_TO_CONFIRM" as const,
        checkedPages: observations.length,
        provenPages: proven.length,
        affectedUrls: warnings.map((item)=>item.url).slice(0,4),
        evidence: (warnings.length ? warnings : passes).slice(0,4),
        reason: !proven.length ? "Geen representatieve pagina leverde voldoende bewijs voor deze sitebrede samenvatting." : null,
      };
    });

    const multiPage = {
      enabled:true, mode:"REPRESENTATIVE_AUDIT" as const, currentPageScoredSeparately:true, maxPages:representativePageLimit,
      discoveredInternalUrls:discoveredMultiPage.length, selectedPages:uniqueMultiPagePages, pageAudits:reportedMultiPageAudits,
      siteSampleScore: auditedRawPages.length ? Math.round(auditedRawPages.reduce((sum,item)=>sum+(item.score||0),0)/auditedRawPages.length) : null,
      siteSampleCoverage: {
        selected: multiPageAudits.length,
        checked: auditedRawPages.length,
        unableToConfirm: multiPageAudits.length-auditedRawPages.length,
        coveragePercent: multiPageAudits.length ? Math.round((auditedRawPages.length/multiPageAudits.length)*100) : 0,
        provisional: multiPageAudits.length > 0 && auditedRawPages.length < multiPageAudits.length,
      },
      siteSampleLabel: auditedRawPages.length
        ? (auditedRawPages.length < multiPageAudits.length ? "Voorlopige site-samplescore" : "Site-samplescore")
        : "Site-sample niet te bevestigen",
      sitewideCommerceEvidence,
      sitewideCheckAggregation,
      capabilities: {
        hospitality: multiPageCapabilities.hospitality,
        treatment: multiPageCapabilities.treatment,
        vehicleSales: multiPageCapabilities.vehicleSales,
        automotiveService: multiPageCapabilities.automotiveService,
        properties: multiPageCapabilities.properties,
        professional: multiPageCapabilities.professional,
        productSample: multiPageCapabilities.productSample,
        categorySample: multiPageCapabilities.categorySample,
      },
      counts:{ homepage:uniqueMultiPagePages.filter((x)=>x.type==="homepage").length, category:uniqueMultiPagePages.filter((x)=>x.type==="category").length, product:uniqueMultiPagePages.filter((x)=>x.type==="product").length, form:uniqueMultiPagePages.filter((x)=>x.type==="form").length, legal:uniqueMultiPagePages.filter((x)=>x.type==="legal").length, service:uniqueMultiPagePages.filter((x)=>x.type==="service").length, listing:uniqueMultiPagePages.filter((x)=>x.type==="listing").length, support:uniqueMultiPagePages.filter((x)=>x.type==="support").length, other:uniqueMultiPagePages.filter((x)=>x.type==="other").length, audited:auditedRawPages.length, unableToConfirm:multiPageAudits.length-auditedRawPages.length },
      note:"Representative same-host pages are fetched with bounded checks. Their sample score is separate from the explicitly scanned page score; site-level evidence may strengthen identity/capabilities, but page-specific failures still require direct proof.",
    };

    let user = null;
    let savedScanId: string | null = null;
    let pendingFixes = new Map<string, { status: string }>();
    try { user = await getCurrentUser(); } catch {}
    if (dashboardScan && !user) return NextResponse.json({ error: scanError.session }, { status: 401 });
    if (user) {
      try {
        await ensureDatabase();
        const normalizedScanUrl = normalizeScanUrl(finalUrl.toString());
        const pending = await getDb().query(
          "SELECT issue_id, status FROM pending_fixes WHERE user_id=$1 AND scanned_url=$2 AND status IN ('AWAITING_MERGE','AWAITING_VERIFICATION','STILL_PRESENT','PREPARED') AND expires_at>NOW()",
          [user.id, normalizedScanUrl]
        );
        pendingFixes = new Map(pending.rows.map((row: any) => [String(row.issue_id), { status: String(row.status) }]));

        const websiteHost = finalUrl.hostname.toLowerCase().replace(/^www\\./, "");
        const rememberedFixes = await getDb().query(
          "SELECT rule_id,file_path,repository,pr_number,fix_summary,evidence,last_confirmed_at,recurrence_count,recurrence_open,last_recurred_at FROM fix_memory WHERE user_id=$1 AND website_host=$2 AND scanned_url=$3",
          [user.id, websiteHost, normalizedScanUrl]
        );
        const rememberedByRule = new Map(rememberedFixes.rows.map((row:any)=>[String(row.rule_id),row]));

        for (const item of checks) {
          const issueId = String(item.issue_id || item.rule_id || item.key);
          const pendingFix = pendingFixes.get(issueId);
          if (pendingFix) {
            // A normal audit must never confirm a prepared fix as DONE.
            // Confirmation belongs to the dedicated live recheck flow.
            item.fix_status = pendingFix.status === "AWAITING_MERGE" ? "AWAITING_MERGE" : pendingFix.status === "STILL_PRESENT" ? "STILL_PRESENT" : "WAITING";
          }
          const remembered = rememberedByRule.get(issueId);
          const currentStatus = String(item.issue_status || item.status || "").trim().toUpperCase();
          const currentConfidence = String(item.confidence || "").trim().toLowerCase();
          const currentEvidence = item.evidence;
          const hasCurrentEvidence = !!currentEvidence && currentEvidence.found !== null && currentEvidence.found !== undefined && currentEvidence.found !== "";
          // Reuse memory only as diagnostic context. Never auto-apply old code:
          // the current page must independently prove that the same rule has
          // returned before RankFix exposes the prior verified repair.
          if (remembered && (currentStatus === "FAIL" || currentStatus === "WARNING") && currentConfidence !== "low" && hasCurrentEvidence) {
            // Count a recurrence once per episode. Repeated scans while the same
            // recurrence is still open must not inflate the customer's history.
            let recurrenceCount = Number(remembered.recurrence_count || 0);
            if (remembered.recurrence_open !== true) {
              const opened = await getDb().query(
                "UPDATE fix_memory SET recurrence_count=recurrence_count+1, recurrence_open=TRUE, last_recurred_at=NOW(), updated_at=NOW() WHERE user_id=$1 AND website_host=$2 AND scanned_url=$3 AND rule_id=$4 AND recurrence_open=FALSE RETURNING recurrence_count,last_recurred_at",
                [user.id, websiteHost, normalizedScanUrl, issueId]
              );
              if (opened.rows[0]) {
                recurrenceCount = Number(opened.rows[0].recurrence_count || recurrenceCount + 1);
                remembered.recurrence_open = true;
                remembered.last_recurred_at = opened.rows[0].last_recurred_at;
                remembered.recurrence_count = recurrenceCount;
              }
            }
            item.recurring_issue = {
              recognized: true,
              lastConfirmedAt: remembered.last_confirmed_at,
              previousFilePath: remembered.file_path || null,
              previousRepository: remembered.repository || null,
              previousPrNumber: remembered.pr_number || null,
              previousFixSummary: remembered.fix_summary || null,
              previousEvidence: remembered.evidence || null,
              recurrenceCount,
              requiresFreshVerification: true
            };
          }
        }
        const previousScan = await getDb().query(
          "SELECT id,result FROM scans WHERE user_id=$1 AND lower(regexp_replace(split_part(split_part(final_url, '://', 2), '/', 1), '^www\\.', ''))=$2 ORDER BY created_at DESC LIMIT 1",
          [user.id, websiteHost]
        );
        console.info("RankFix scan phase", { phase: "history_write_start", page: finalUrl.toString(), isProductPage, productOptimizerSourceCount });
        const insertedScan = await getDb().query(
          "INSERT INTO scans (user_id, scanned_url, final_url, overall_score, seo_score, geo_score, result, crawler_version, rules_version, fix_policy_version, ai_policy_version) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id",
          [user.id, target.toString(), finalUrl.toString(), selectedOverallScore, selectedSeoScore, selectedGeoScore, JSON.stringify({
            scannedUrl: target.toString(), finalUrl: finalUrl.toString(), responseTime, httpStatus: response.status,
            language: scanLanguage,
            mode, overallScore: selectedOverallScore, grade: grade(selectedOverallScore), coverage: overallCoverage, scoreModel, summary: scanSummary, rendering, recovery, classification, pageTypeEvidence, pageTypeInvariant, technologyProfile, sectorProfile, security: securityEngine, accessibility: accessibilityEngine, multiPage,
            adsKeywordIntelligence: { ...adsKeywordIntelligence, customerProfile: hasAdsProfile ? adsProfile : null },
            seo: { score: selectedSeoScore, grade: grade(selectedSeoScore), coverage: seoCoverage, checks: selectedSeoChecks },
            geo: { score: selectedGeoScore, grade: grade(selectedGeoScore), coverage: geoCoverage, checks: selectedGeoChecks },
            metrics: { siteType: classification.websiteType === "Webshop" ? "ECOMMERCE" : "WEBSITE", websiteType: classification.websiteType, sector: classification.sector, pageTypeClassification: classification.pageType, title, titleLength: title.length, description, descriptionLength: description.length, descriptionState, h1Count: h1s.length, h1s,
              imageCount, imageElementCount, imagesMissingAlt, wordCount, headingsCount: headings.length, linksCount: links.length, pageType: schemaContextLabel, recommendedSchema, localBusinessDetails,
              internalLinks, canonical: canonical || null, lang: lang || null, robots: robots || null,
              openGraph: { title: ogTitle || null, description: ogDescription || null, image: ogImage || null }, imageAltCandidates,
              productOptimizer: isProductPage
                ? { eligible: productOptimizerSourceCount >= 3, sourceCount: productOptimizerSourceCount, product: primaryProductEvidence ? { name: primaryProductEvidence.name || null, image: primaryProductEvidence.imageUrl || null, sku: primaryProductEvidence.sku || null, offers: primaryProductEvidence.offers.slice(0,3) } : null, provenance: "current_page" }
                : (() => {
                    const sample = auditedMultiPages.find((item)=>item.type==="product");
                    const product = sample?.commerceEvidence?.product || null;
                    const sourceCount = product ? [
                      Boolean(product.name), Boolean(product.image), Boolean(product.sku),
                      Boolean(product.price && product.currency), Boolean(product.availability),
                    ].filter(Boolean).length : 0;
                    if (sample) return {
                      eligible: sourceCount >= 3,
                      sourceCount,
                      product,
                      provenance: "representative_product_sample",
                      status: sourceCount >= 3 ? "sample_evidence_extracted" : "sample_found_insufficient_product_evidence",
                      sampleUrl: sample.url,
                    };
                    const blockedSample = multiPageAudits.find((item)=>item.type==="product" && item.status==="unable_to_confirm");
                    return blockedSample
                      ? { eligible:false, sourceCount:0, product:null, provenance:"representative_product_sample", status:"product_sample_found_but_unverifiable", sampleUrl:blockedSample.url }
                      : { eligible:false, sourceCount:0, product:null, provenance:"no_product_sample" };
                  })(),
              pricingCurrency: pricingCurrencyEvidence,
              euConsumerSignals: consumerLawSignals,
              checkoutFunnel: checkoutFunnelEvidence,
              twitterCard: twitterCard || null, schemaTypes: [...new Set(schemaTypes)].slice(0,12),
              jsonLdBlocks: validJsonLd, sitemapFound, robotsMentionsSitemap, robotsStatus, sitemapUrl: confirmedSitemapUrl || robotsDeclaredSitemapUrls[0] || null }
          }), CRAWLER_VERSION, RULES_VERSION, FIX_POLICY_VERSION, AI_POLICY_VERSION]
        );
        savedScanId = insertedScan.rows[0]?.id ? String(insertedScan.rows[0].id) : null;
        console.info("RankFix scan phase", { phase: "history_write_done", page: finalUrl.toString(), savedScanId: Boolean(savedScanId) });

        // Dedicated live verification: a prepared fix is confirmed only when the
        // freshly fetched live page reports the exact same rule as PASS.
        // WARNING, FAIL, N/A and unable-to-confirm deliberately keep it waiting.
        if (dashboardScan && savedScanId && pendingFixes.size > 0) {
          const verificationCandidates = new Set(
            [...pendingFixes.entries()]
              .filter(([, pending]) => pending.status === "AWAITING_VERIFICATION" || pending.status === "STILL_PRESENT")
              .map(([issueId]) => issueId)
          );
          const seenVerificationRules = new Set<string>();
          for (const item of checks) {
            const issueId = String(item.issue_id || item.rule_id || item.key);
            if (!verificationCandidates.has(issueId)) continue;
            seenVerificationRules.add(issueId);
            const liveStatus = String(item.issue_status || item.status || "").trim().toUpperCase();
            const liveConfidence = String(item.confidence || "").trim().toLowerCase();
            const liveEvidence = item.evidence;
            const hasLiveEvidence = !!liveEvidence && liveEvidence.found !== null && liveEvidence.found !== undefined && liveEvidence.found !== "";
            const pendingFix=pendingFixes.get(issueId);
            if(!pendingFix || (pendingFix.status!=="AWAITING_VERIFICATION" && pendingFix.status!=="STILL_PRESENT")) continue;
            // A merged PR is not proof that production changed. Verification must
            // come from a fresh live scan with positive evidence for the exact rule.
            // Medium confidence may be useful for diagnosis, but is not strong
            // enough to permanently mark an automated code fix as resolved.
            const verified=liveStatus==="PASS" && liveConfidence==="high" && hasLiveEvidence;
            const nextStatus=verified?"VERIFIED_RESOLVED":"STILL_PRESENT";
            const confirmed = await getDb().query(
              "UPDATE pending_fixes SET status=$4, verified_at=CASE WHEN $4='VERIFIED_RESOLVED' THEN NOW() ELSE verified_at END, verification_scan_id=$5, updated_at=NOW() WHERE user_id=$1 AND scanned_url=$2 AND issue_id=$3 AND status IN ('AWAITING_VERIFICATION','STILL_PRESENT') AND expires_at>NOW() RETURNING id",
              [user.id, normalizedScanUrl, issueId, nextStatus, savedScanId]
            );
            if (!confirmed.rowCount) continue;

            item.fix_status = verified ? "DONE" : "STILL_PRESENT";
            if(!verified) continue;
            await getDb().query(
              "INSERT INTO website_health_events (user_id,website_host,scanned_url,scan_id,event_type,rule_id,previous_status,current_status,severity,details) VALUES ($1,$2,$3,$4,'FIX_CONFIRMED',$5,'AWAITING_VERIFICATION','PASS',$6,$7)",
              [user.id, websiteHost, finalUrl.toString(), savedScanId, issueId, item.severity || null, JSON.stringify({title:item.title,message:item.message,verification:"fresh_live_scan",confidence:liveConfidence,evidence:liveEvidence?.details||null})]
            );
            const verifiedFix = await getDb().query(
              "SELECT repository,file_path,pr_number FROM pending_fixes WHERE user_id=$1 AND scanned_url=$2 AND issue_id=$3 ORDER BY updated_at DESC LIMIT 1",
              [user.id, normalizedScanUrl, issueId]
            );
            const verifiedFixRow = verifiedFix.rows[0] || {};
            await getDb().query(
              `INSERT INTO fix_memory (user_id,website_host,rule_id,scanned_url,repository,file_path,pr_number,verification_scan_id,fix_summary,evidence,last_confirmed_at,updated_at)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,NOW(),NOW())
               ON CONFLICT (user_id,website_host,scanned_url,rule_id) DO UPDATE SET
                 scanned_url=EXCLUDED.scanned_url,
                 repository=COALESCE(EXCLUDED.repository,fix_memory.repository),
                 file_path=COALESCE(EXCLUDED.file_path,fix_memory.file_path),
                 pr_number=COALESCE(EXCLUDED.pr_number,fix_memory.pr_number),
                 verification_scan_id=EXCLUDED.verification_scan_id,
                 fix_summary=EXCLUDED.fix_summary,
                 evidence=EXCLUDED.evidence,
                 last_confirmed_at=NOW(),
                 -- Confirmation proves the repair; it is not itself a recurrence.
                 -- Recurrence is recognized only when a later live scan proves
                 -- the same rule has become an active issue again.
                 recurrence_count=fix_memory.recurrence_count,
                 recurrence_open=FALSE,
                 updated_at=NOW()`,
              [user.id,websiteHost,issueId,normalizedScanUrl,verifiedFixRow.repository||null,verifiedFixRow.file_path||null,verifiedFixRow.pr_number||null,savedScanId,String(item.fix||item.message||item.title||""),JSON.stringify({status:"PASS",confidence:liveConfidence,details:liveEvidence?.details||null})]
            );
          }
          // If the exact rule is absent from the fresh scan, absence is not proof.
          // Keep the fix awaiting verification rather than incorrectly treating a
          // renamed, non-applicable or skipped check as resolved.
          for (const issueId of verificationCandidates) {
            if (seenVerificationRules.has(issueId)) continue;
            await getDb().query(
              "UPDATE pending_fixes SET status='AWAITING_VERIFICATION', verification_scan_id=$4, updated_at=NOW() WHERE user_id=$1 AND scanned_url=$2 AND issue_id=$3 AND status IN ('AWAITING_VERIFICATION','STILL_PRESENT') AND expires_at>NOW()",
              [user.id, normalizedScanUrl, issueId, savedScanId]
            );
          }
        }

        // Fix verification mutates the live check objects after the initial scan
        // insert. Persist the verified state as well so history and the response
        // cannot disagree about DONE versus WAITING.
        if (dashboardScan && savedScanId) {
          await getDb().query(
            "UPDATE scans SET result=jsonb_set(jsonb_set(result,'{seo,checks}',$1::jsonb,true),'{geo,checks}',$2::jsonb,true) WHERE id=$3 AND user_id=$4",
            [JSON.stringify(selectedSeoChecks), JSON.stringify(selectedGeoChecks), savedScanId, user.id]
          );
        }

        if (dashboardScan) {
          await getDb().query(
            "INSERT INTO usage_events (user_id,website_host,event_type,ip_hash) VALUES ($1,$2,'SCAN',$3)",
            [user.id, websiteHost, usageIpHash]
          );
        }
        try {
          const scanId = savedScanId;
          await getDb().query(
            "INSERT INTO website_health_events (user_id,website_host,scanned_url,scan_id,event_type,details) VALUES ($1,$2,$3,$4,'SCAN',$5)",
            [user.id,websiteHost,finalUrl.toString(),scanId,JSON.stringify({overallScore:selectedOverallScore,seoScore:selectedSeoScore,geoScore:selectedGeoScore})]
          );
          const previousChecks = [
            ...(previousScan.rows[0]?.result?.seo?.checks || []),
            ...(previousScan.rows[0]?.result?.geo?.checks || [])
          ];
          const normalizeHealthStatus=(value:unknown)=>{
            const status=String(value||"").trim().toUpperCase();
            if(status==="PASS"||status==="FAIL"||status==="WARNING") return status;
            return null;
          };
          const statusRank:Record<string,number>={FAIL:0,WARNING:1,PASS:2};
          const previousByRule = new Map(previousChecks.map((x:any)=>[String(x.issue_id||x.rule_id||x.key),normalizeHealthStatus(x.issue_status||x.status)]));
          for (const item of checks) {
            const ruleId=String(item.issue_id||item.rule_id||item.key);
            const before=previousByRule.get(ruleId);
            const now=normalizeHealthStatus(item.issue_status||item.status);
            // N/A, INFO and unable-to-confirm are neutral: never infer a
            // regression or improvement from an unconfirmed comparison.
            if(!before||!now||before===now) continue;
            const improved=statusRank[now]>statusRank[before];
            const regressed=statusRank[now]<statusRank[before];
            if(!improved&&!regressed) continue;
            await getDb().query(
              "INSERT INTO website_health_events (user_id,website_host,scanned_url,scan_id,event_type,rule_id,previous_status,current_status,severity,details) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
              [user.id,websiteHost,finalUrl.toString(),scanId,improved?"IMPROVEMENT":"REGRESSION",ruleId,before,now,item.severity||null,JSON.stringify({title:item.title,message:item.message})]
            );
          }
        } catch (monitorError) {
          console.error("RankFix health monitoring write failed:", monitorError);
        }
      } catch (saveError) {
        console.error("RankFix scan history write failed:", {
          message: saveError instanceof Error ? saveError.message : "unknown error",
          name: saveError instanceof Error ? saveError.name : "unknown",
          stack: saveError instanceof Error ? saveError.stack : undefined,
          page: finalUrl.toString(),
          dashboardScan,
          savedScanId: Boolean(savedScanId),
        });
        // If the primary scan row was already inserted, the audit report is
        // usable even when a later monitoring/verification write fails.
        // Do not turn a completed scan into a false "scan failed" response.
        if (dashboardScan && !savedScanId) {
          return NextResponse.json({ error: scanError.history, code: "SCAN_HISTORY_SAVE_FAILED", retryable: true, charged: false }, { status: 500 });
        }
      }
    }


    const scanScope = {
      page: finalUrl.toString(),
      mode: "PAGE_SAMPLE" as const,
      javascriptExecuted,
      internalLinks: {
        anchorsFound: anchorTags.length,
        uniqueInternal: allUniqueInternalAnchors.length,
        checked: linkAuditResults.length,
        limit: 24,
        truncated: allUniqueInternalAnchors.length > linkAuditResults.length,
      },
      accessibility: "STATIC_HTML_SIGNALS" as const,
      consentMode: "STATIC_HTML_SIGNAL" as const,
      merchant: "WEBSITE_SIGNALS_ONLY" as const,
      multiPage,
    };

    console.info("RankFix scan phase", { phase: "response_ready", page: finalUrl.toString(), isProductPage, productOptimizerSourceCount, savedScanId: Boolean(savedScanId) });
    return NextResponse.json({
      success: true,
      scanId: savedScanId,
      mode,
      scannedUrl: target.toString(),
      finalUrl: finalUrl.toString(),
      scannedAt: new Date().toISOString(),
      responseTime,
      httpStatus: response.status,
      overallScore: selectedOverallScore,
      grade: grade(selectedOverallScore),
      coverage: overallCoverage,
      scoreModel,
      summary: scanSummary,
      rendering,
      recovery,
      scope: scanScope,
      multiPage,
      classification,
      pageTypeEvidence,
      pageTypeInvariant,
      technologyProfile,
      sectorProfile,
      evidenceLayer,
      security: securityEngine,
      accessibility: accessibilityEngine,
      adsKeywordIntelligence: { ...adsKeywordIntelligence, customerProfile: hasAdsProfile ? adsProfile : null },
      seo: { score: selectedSeoScore, grade: grade(selectedSeoScore), coverage: seoCoverage, checks: selectedSeoChecks },
      geo: { score: selectedGeoScore, grade: grade(selectedGeoScore), coverage: geoCoverage, checks: selectedGeoChecks },
      metrics: {
        siteType: classification.websiteType === "Webshop" ? "ECOMMERCE" : "WEBSITE",
        websiteType: classification.websiteType,
        sector: classification.sector,
        pageTypeClassification: classification.pageType,
        title,
        titleLength: title.length,
        description,
        descriptionLength: description.length,
        descriptionState,
        h1Count: h1s.length,
        h1s,
        imageCount,
        imageElementCount,
        imagesMissingAlt,
        wordCount,
        headingsCount: headings.length,
        linksCount: links.length,
        internalLinks,
        canonical: canonical || null,
        lang: lang || null,
        robots: robots || null,
        openGraph: { title: ogTitle || null, description: ogDescription || null, image: ogImage || null },
        imageAltCandidates,
        productOptimizer: isProductPage
                ? { eligible: productOptimizerSourceCount >= 3, sourceCount: productOptimizerSourceCount, product: primaryProductEvidence ? { name: primaryProductEvidence.name || null, image: primaryProductEvidence.imageUrl || null, sku: primaryProductEvidence.sku || null, offers: primaryProductEvidence.offers.slice(0,3) } : null, provenance: "current_page" }
                : (() => {
                    const sample = auditedMultiPages.find((item)=>item.type==="product");
                    const product = sample?.commerceEvidence?.product || null;
                    const sourceCount = product ? [
                      Boolean(product.name), Boolean(product.image), Boolean(product.sku),
                      Boolean(product.price && product.currency), Boolean(product.availability),
                    ].filter(Boolean).length : 0;
                    if (sample) return {
                      eligible: sourceCount >= 3,
                      sourceCount,
                      product,
                      provenance: "representative_product_sample",
                      status: sourceCount >= 3 ? "sample_evidence_extracted" : "sample_found_insufficient_product_evidence",
                      sampleUrl: sample.url,
                    };
                    const blockedSample = multiPageAudits.find((item)=>item.type==="product" && item.status==="unable_to_confirm");
                    return blockedSample
                      ? { eligible:false, sourceCount:0, product:null, provenance:"representative_product_sample", status:"product_sample_found_but_unverifiable", sampleUrl:blockedSample.url }
                      : { eligible:false, sourceCount:0, product:null, provenance:"no_product_sample" };
                  })(),
        pricingCurrency: pricingCurrencyEvidence,
        euConsumerSignals: consumerLawSignals,
        checkoutFunnel: checkoutFunnelEvidence,
        twitterCard: twitterCard || null,
        schemaTypes: [...new Set(schemaTypes)].slice(0, 12),
        jsonLdBlocks: validJsonLd,
        sitemapFound,
        robotsMentionsSitemap,
      },
      checks,
      pendingFixes: checks.filter((item) => item.fix_status === "WAITING").map((item) => item.issue_id || item.rule_id || item.key),
    });
  } catch (error) {
    const technicalCode = error instanceof URIError ? "SCAN_URL_DECODE_ERROR" : error instanceof Error && /timeout|abort/i.test(error.message) ? "SCAN_TIMEOUT" : "SCAN_INTERNAL_ERROR";
    console.error("RankFix scan failed:", { code: technicalCode, message: error instanceof Error ? error.message : "unknown error", name: error instanceof Error ? error.name : "unknown", stack: error instanceof Error ? error.stack : undefined });
    const fallbackErrors: Record<string,string> = {nl:"De SEO/GEO-scan kon niet worden voltooid. RankFix heeft de technische fout vastgelegd; probeer de pagina opnieuw.",en:"The SEO/GEO scan could not be completed. RankFix recorded the technical error; try the page again.",de:"Der SEO/GEO-Scan konnte nicht abgeschlossen werden. RankFix hat den technischen Fehler erfasst; versuche die Seite erneut.",fr:"L’analyse SEO/GEO n’a pas pu être terminée. RankFix a enregistré l’erreur technique ; réessayez la page.",it:"La scansione SEO/GEO non è stata completata. RankFix ha registrato l’errore tecnico; riprova la pagina.",es:"No se pudo completar el análisis SEO/GEO. RankFix registró el error técnico; vuelve a intentar la página."};
    return NextResponse.json({ error: fallbackErrors[fallbackLanguage] || fallbackErrors.en, code: technicalCode, retryable: true, charged: false }, { status: 500 });
  }
}