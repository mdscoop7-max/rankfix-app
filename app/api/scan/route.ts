import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { ensureDatabase } from "@/lib/db-init";
import { sendScanReportEmail } from "@/lib/email";
import { CRAWLER_VERSION, RULES_VERSION, FIX_POLICY_VERSION, AI_POLICY_VERSION, statusCode } from "@/lib/seo-rules";
import { getFixPolicy } from "@/lib/fix-policy";
import { extractImageMetrics } from "@/lib/image-metrics";
import { readResponseTextLimited, safePublicFetch, validatePublicHttpUrl } from "@/lib/safe-fetch";
import { buildAdsKeywordIntelligence } from "@/lib/ads-keyword-intelligence";
import { applyEvidenceBasedScoreCap, scoreApplicableChecks, summarizeAuditChecks } from "@/lib/audit-score";
import { normalizePlan, planLimits } from "@/lib/plans";
import { consumeRateLimit, requestIp } from "@/lib/rate-limit";
import { renderPublicPage } from "@/lib/headless-render";

type Status = "pass" | "warning" | "fail" | "not_applicable" | "unable_to_confirm";

type AuditMode = "seo" | "geo" | "both";

type Check = {
  key: string;
  category: "seo" | "geo";
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
  // Build the regex with escaped backslashes so JS does not turn \\s/\\b into string escapes.
  const safeAttr = attr.replace(/[.*+?^$()|[\\]\\\\]/g, "\\$&");
  const match = tag.match(new RegExp(
    "(?:^|\\\\s)" + safeAttr + "\\\\s*=\\\\s*(?:[\\\"\']([^\\\"\']*)[\\\"\']|([^\\\\s>]+))",
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
    confidence: status === "unable_to_confirm" ? "low" : status === "not_applicable" ? "medium" : "high", evidence: { url: "", found: null, details: message },
    fix_category: getFixPolicy(key).category,
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
    ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "fbclid", "msclkid"]
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
  const headerText = [...headers.entries()].map(([key, value]) => `${key}:${value}`).join("\n").toLowerCase();
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
  if (wixSignals && /(?:wixstatic\.com|wix-code|x-wix-)/i.test(source + "\n" + headerText)) { cms = "Wix"; strongest = Math.max(strongest, 2); }
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
      const host = target.hostname.toLowerCase().replace(/^www\./, "");
      // Reject obvious non-host input early instead of turning it into a confusing fetch error.
      if (!host.includes(".") && !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) throw new Error("URL_HOST_INVALID");
    } catch {
      return NextResponse.json({ error: scanError.unsafe }, { status: 400 });
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
      if (!existingHosts.includes(usageWebsiteHost) && existingHosts.length >= limits.websites) {
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
      // TrendMix is our internal test shop: allow unlimited dashboard scans while RankFix is being validated.
      const unlimitedTestHost = usageWebsiteHost === "trendmix.onrender.com" || usageWebsiteHost === "trendmix-jet.vercel.app";
      if (!unlimitedTestHost && used >= limits.scans) {
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
    try {
      let activeTarget = target;
      const fetchTarget = () => safePublicFetch(activeTarget, { timeoutMs: 12000, maxRedirects: 4, userAgent: "RankFixBot/2.1 (+https://rankfix-app.onrender.com)", accept: "text/html,application/xhtml+xml,text/plain,application/xml" });
      try {
        ({ response } = await fetchTarget());
      } catch (httpsError) {
        // For a scheme-less domain RankFix first tries HTTPS. Some legacy sites still only
        // answer on HTTP, so retry HTTP once. Never downgrade an explicitly supplied HTTPS URL.
        if (!/^https?:\/\//i.test(rawUrl) && target.protocol === "https:") {
          activeTarget = validatePublicHttpUrl(`http://${target.host}${target.pathname}${target.search}`);
          ({ response } = await fetchTarget());
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
        ({ response } = await fetchTarget());
      }
    } catch {
      return NextResponse.json(
        { error: scanError.fetch },
        { status: 502 }
      );
    }

    const responseTime = Date.now() - started;
    const finalUrl = new URL(response.url || target.toString());

    if (response.status === 429) {
      return NextResponse.json(
        { error: scanError.rate, retryable: true, charged: false },
        { status: 429 }
      );
    }

    if (!response.ok && response.status !== 404) {
      const httpMessages: Record<string,string> = {
        nl:`De website gaf HTTP ${response.status} terug en kan niet goed worden geanalyseerd.`,
        en:`The website returned HTTP ${response.status} and cannot be analysed reliably.`,
        de:`Die Website hat HTTP ${response.status} zurückgegeben und kann nicht zuverlässig analysiert werden.`,
        fr:`Le site a renvoyé HTTP ${response.status} et ne peut pas être analysé de manière fiable.`,
        it:`Il sito ha restituito HTTP ${response.status} e non può essere analizzato in modo affidabile.`,
        es:`El sitio devolvió HTTP ${response.status} y no se puede analizar de forma fiable.`
      };
      return NextResponse.json({ error: httpMessages[scanLanguage] }, { status: 422 });
    }

    // Modern commerce/product pages can contain large SSR payloads and JSON-LD. Keep a strict cap, but allow enough room to audit them safely.
    let html = await readResponseTextLimited(response, 8_000_000);
    if (!html || html.length < 20) {
      return NextResponse.json({ error: scanError.html }, { status: 422 });
    }

    const rawHtml = html;
    const javascriptCandidate = /(?:__NEXT_DATA__|\/_next\/|__NUXT__|\/_nuxt\/|data-reactroot|data-react-helmet)/i.test(rawHtml);
    let javascriptExecuted = false;
    let renderElapsedMs: number | null = null;
    let renderFallbackReason: string | null = null;
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

    const title = firstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
    const description =
      firstMatch(html, /<meta[^>]+(?:name|property)\s*=\s*["']description["'][^>]+content\s*=\s*["']([\s\S]*?)["'][^>]*>/i) ||
      firstMatch(html, /<meta[^>]+content\s*=\s*["']([\s\S]*?)["'][^>]+(?:name|property)\s*=\s*["']description["'][^>]*>/i);
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
    const twitterCard = getMeta("twitter:card");

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
    const isProductPage = !isHomepage && hasProductSignal;
    const hasArticleSignal = !isHomepage && (schemaSet.has("article") || schemaSet.has("newsarticle") || /<article\b/i.test(html));
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
    const storefrontMarkupSignal = pricedProductCardCount >= 2 && visiblePriceCount >= 2 && (cartFormSignal || hasStrongCommerceAction) && commerceNavigationSignal;
    const homepageStorefrontSignal = isHomepage && hasCommerceHrefSignal && commerceNavigationSignal && visiblePriceCount >= 3;
    // Site-level commerce evidence must not depend on a homepage rendering prices or
    // add-to-cart controls. Large storefronts often keep those client-side while the
    // raw HTML still exposes Store schema and commercial navigation/support routes.
    const hasStoreSchema = schemaSet.has("store") || schemaSet.has("onlinestore");
    const commerceSupportHrefCount = links.filter((href) =>
      /(?:verzend|shipping|delivery|bezorg|retour|return|refund|betaal|payment|bestel|order|winkelwagen|cart|checkout|klantenservice|customer-service)/i.test(href)
    ).length;
    const shopCatalogHrefCount = links.filter((href) =>
      /(?:\/shop(?:\/|$)|\/store(?:\/|$)|\/product(?:en|s)?(?:\/|$)|\/collection(?:s)?(?:\/|$)|\/categor(?:y|ie|ies|ien)(?:\/|$))/i.test(href)
    ).length;
    const commercialNavigationEvidence = commerceNavigationSignal && (shopCatalogHrefCount >= 2 || commerceSupportHrefCount >= 2);
    const siteLevelCommerceSignal = hasStoreSchema || homepageStorefrontSignal || commercialNavigationEvidence;
    const hasEcommerceSignal = hasConfirmedCommercePlatform || hasProductSignal || hasCategorySignal || repeatedProductLinkSignal || storefrontMarkupSignal || siteLevelCommerceSignal || (commerceNavigationSignal && hasStrongCommerceAction && (hasExplicitPriceSignal || visiblePriceCount >= 2)) || (hasCommerceHrefSignal && hasStrongCommerceAction && visiblePriceCount >= 2);
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
    const specificLocalSchema = hasLocalBusinessSignal
      ? identityLocalSchema || localSchemaCandidates.find((candidate) => candidate.pattern.test(localClassificationText))?.type || "LocalBusiness"
      : null;
    const hasRelevantLocalSchema = schemaSet.has("localbusiness") || (specificLocalSchema ? schemaSet.has(specificLocalSchema.toLowerCase()) : false);
    const recommendedSchema = hasLocalBusinessSignal ? specificLocalSchema || "LocalBusiness" : isHomepage ? "Organization + WebSite" : isProductPage ? "Product" : hasCategorySignal ? "ItemList / CollectionPage" : hasArticleSignal ? "Article" : "WebPage";
    const schemaContextLabel = hasLocalBusinessSignal ? "lokale bedrijfs-/dienstpagina" : isHomepage ? "homepage" : isProductPage ? "productpagina" : hasCategorySignal ? "lijst-/categoriepagina" : hasArticleSignal ? "artikel-/nieuwspagina" : "contentpagina";
    const hasRelevantContextSchema = hasLocalBusinessSignal
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
    const localBusinessDetails = hasLocalBusinessSignal ? {
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
        robotsDeclaredSitemapUrls = [...new Set(declared.flatMap((value) => {
          try { return [new URL(value, finalUrl).toString()]; } catch { return []; }
        }))].slice(0, 20);
      } else if (r.status === 404) robotsStatus = "FAIL";
    } catch { robotsStatus = "UNABLE_TO_CONFIRM"; }
    const robotsPath = finalUrl.pathname || "/";
    const robotsGroups = robotsTxt
      .split(/\r?\n/)
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
    const sitemapCandidates = [...candidateMap.values()].slice(0, 20);
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
          const structurallyValid = hasSitemapRoot && validLocValues.length > 0;
          if (structurallyValid) {
            sitemapFound = true;
            sitemapStatus = "PASS";
            confirmedSitemapUrl = candidate.url;
            sitemapDiagnostic = `${candidate.url} bevat een geldige ${sitemapKind || "sitemap"} met ${validLocValues.length} geldige URL-verwijzing(en) in de gecontroleerde response.`;
            // Keep scanning when robots.txt already declared a broken sitemap so
            // the report can mention both the broken declaration and valid fallback.
            if (declaredSitemapHttpFailures.length === 0) break;
          } else if (candidate.source === "robots" || candidate.source === "html") {
            sitemapStatus = "FAIL";
            sitemapDiagnostic = hasSitemapRoot
              ? `${candidate.url} gaf HTTP ${r.status}; content-type: ${contentType}; sitemap-root gevonden maar geen geldige absolute URL in <loc>.`
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
    const uniqueInternalAnchors = allUniqueInternalAnchors.slice(0, 24);
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
    const brokenInternalLinks = linkAuditResults.filter((item) => item.error || item.status === null || item.status === 404 || item.status === 410 || (item.status >= 500));
    const redirectedInternalLinks = linkAuditResults.filter((item) => item.redirected && !item.error);
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
    type SectorKey = "ecommerce"|"real_estate"|"automotive"|"home_services"|"professional_services"|"hospitality"|"health_wellness"|"saas_b2b"|"general_business"|"unknown";
    const sectorSignals: Array<{sector:SectorKey; label:string; patterns:RegExp[]; modules:string[]}> = [
      {sector:"real_estate",label:"Makelaar / vastgoed",patterns:[/\\b(makelaar|vastgoed|woning(?:en)?|huizen|koopwoning|huurwoning|real estate|property|immobilier|inmobiliaria)\\b/i,/\\b(te koop|te huur|for sale|for rent)\\b/i],modules:["core_seo","geo","local","lead_conversion","real_estate"]},
      {sector:"automotive",label:"Garage / automotive",patterns:[/\\b(garage|autobedrijf|autodealer|occasions?|auto onderhoud|car dealer|vehicle|automotive)\\b/i,/\\b(apk|proefrit|werkplaats)\\b/i],modules:["core_seo","geo","local","lead_conversion","automotive"]},
      {sector:"home_services",label:"Lokale diensten / vakbedrijf",patterns:[/\\b(loodgieter|aannemer|installateur|elektricien|schilder|dakdekker|klusbedrijf|plumber|electrician|contractor)\\b/i,/\\b(offerte|werkgebied|servicegebied)\\b/i],modules:["core_seo","geo","local","lead_conversion","home_services"]},
      {sector:"professional_services",label:"Zakelijke dienstverlening",patterns:[/\\b(advocaat|accountant|boekhouder|consultant|notaris|law firm|legal services|accounting|consultancy)\\b/i,/\\b(diensten|expertise|advies|consult)\\b/i],modules:["core_seo","geo","local","lead_conversion","professional_services"]},
      {sector:"hospitality",label:"Horeca",patterns:[/\\b(restaurant|cafe|café|hotel|brasserie|bistro|menu|reserveren|reservation)\\b/i,/\\b(openingstijden|opening hours)\\b/i],modules:["core_seo","geo","local","lead_conversion","hospitality"]},
      {sector:"health_wellness",label:"Zorg & wellness",patterns:[/\\b(kliniek|clinic|fysiotherap|tandarts|dentist|therap|wellness|salon|beauty treatment)\\b/i,/\\b(afspraak|appointment|behandeling)\\b/i],modules:["core_seo","geo","local","lead_conversion","health_wellness"]},
      {sector:"saas_b2b",label:"SaaS / B2B",patterns:[/\\b(saas|software platform|software-as-a-service|api platform|business software)\\b/i,/\\b(demo|features|integrations|integraties)\\b/i],modules:["core_seo","geo","lead_conversion","saas_b2b"]},
    ];
    const sectorSource = [title, description, h1s.join(" "), text.slice(0,120000), schemaTypes.join(" ")].join(" ");
    const sectorCandidates = sectorSignals.map(item=>({sector:item.sector,label:item.label,hits:item.patterns.filter(pattern=>pattern.test(sectorSource)).length,modules:item.modules})).filter(item=>item.hits>0).sort((a,b)=>b.hits-a.hits);
    const sectorProfile = hasEcommerceSignal
      ? {sector:"ecommerce" as SectorKey,label:"Webshop / e-commerce",confidence:"high" as const,confidenceScore:95,evidence:["Bevestigde commerce-signalen"],applicableModules:["core_seo","geo","ecommerce","product","pricing_currency","merchant","checkout","eu_consumer"]}
      : sectorCandidates[0] && sectorCandidates[0].hits>=2 && (!sectorCandidates[1] || sectorCandidates[0].hits>sectorCandidates[1].hits)
        ? {sector:sectorCandidates[0].sector,label:sectorCandidates[0].label,confidence:"medium" as const,confidenceScore:75,evidence:[`${sectorCandidates[0].hits} onafhankelijke sectorsignalen in raw HTML`],applicableModules:sectorCandidates[0].modules}
        : {sector:"unknown" as SectorKey,label:"Sector niet bevestigd",confidence:"low" as const,confidenceScore:sectorCandidates[0]?.hits ? 35 : 0,evidence:sectorCandidates.slice(0,2).map(x=>`${x.label}: ${x.hits} signaal/signalen`),applicableModules:["core_seo","geo","technical"]};

    const seoChecks: Check[] = [];
    const geoChecks: Check[] = [];

    // First specialist sector checks. Positive raw-HTML evidence can pass; absence is
    // "unable to confirm" rather than a penalty because JavaScript is not executed.
    const sectorCheck = (key:string,titleText:string,found:boolean,foundMessage:string,missingMessage:string,fixText:string) =>
      found
        ? check("pass",key,"seo",titleText,foundMessage,fixText,4,4)
        : check("unable_to_confirm",key,"seo",titleText,missingMessage,fixText,0,4);
    if (sectorProfile.sector === "real_estate") {
      const listingSignal = /\\b(te koop|te huur|koopwoning|huurwoning|woningaanbod|objecten|properties|for sale|for rent)\\b/i.test(text) || schemaSet.has("realestatelisting");
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
      seoChecks.push(
        sectorCheck("sector_automotive_services","Garage diensten",workshopSignal,"Garage-/werkplaatsdiensten zijn in de pagina bevestigd.","Garage-/werkplaatsdiensten konden in de raw HTML niet betrouwbaar worden bevestigd.","Maak de belangrijkste garage- en werkplaatsdiensten duidelijk vindbaar."),
        sectorCheck("sector_automotive_conversion","Afspraak / proefrit",appointmentSignal,"Een afspraak-, proefrit- of contactsignaal is bevestigd.","Een duidelijke afspraak- of proefritactie kon niet betrouwbaar worden bevestigd.","Maak de belangrijkste vervolgstap voor klanten duidelijk zichtbaar."),
        sectorCheck("sector_automotive_inventory","Voertuigaanbod",inventorySignal,"Voertuig-/occasionaanbod is in de pagina bevestigd.","RankFix kon voertuigaanbod niet betrouwbaar bevestigen; dit kan ook niet van toepassing zijn.","Toon voertuigaanbod duidelijk wanneer de onderneming auto's verkoopt; anders is geen actie nodig.")
      );
    } else if (sectorProfile.sector === "home_services") {
      const serviceSignal = /\\b(loodgieter|elektricien|installateur|aannemer|dakdekker|schilder|renovatie|reparatie|installatie|onderhoud)\\b/i.test(text);
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

    seoChecks.push(
      uniqueInternalAnchors.length === 0
        ? check("not_applicable", "broken_links", "seo", "Broken links", "Geen controleerbare interne links gevonden op deze pagina.", "Controleer links opnieuw wanneer de pagina interne navigatie bevat.", 0, 5)
        : brokenInternalLinks.length === 0
          ? check("pass", "broken_links", "seo", "Broken links", `${linkAuditResults.length} interne link(s) steekproefsgewijs gecontroleerd; geen 404, 410, 5xx of fetchfout gevonden.`, "Blijf interne links controleren bij wijzigingen en verwijderde pagina's.", 5, 5)
          : check("warning", "broken_links", "seo", "Broken links", `${brokenInternalLinks.length} van ${linkAuditResults.length} gecontroleerde interne link(s) is niet betrouwbaar bereikbaar. Voorbeeld: ${brokenInternalLinks[0]?.url} → ${brokenInternalLinks[0]?.status ?? "fetchfout"}.`, "Herstel de bestemming, verwijder de link of redirect een oude URL naar de juiste relevante pagina.", 2, 5)
    );
    seoChecks.push(
      uniqueInternalAnchors.length === 0
        ? check("not_applicable", "internal_redirects", "seo", "Interne redirects", "Geen controleerbare interne links gevonden op deze pagina.", "Gebruik directe interne links zodra er navigatie aanwezig is.", 0, 4)
        : redirectedInternalLinks.length === 0
          ? check("pass", "internal_redirects", "seo", "Interne redirects", `${linkAuditResults.length} interne link(s) gecontroleerd; geen doorgestuurde bestemmingen gevonden.`, "Link intern bij voorkeur direct naar de definitieve URL.", 4, 4)
          : check("warning", "internal_redirects", "seo", "Interne redirects", `${redirectedInternalLinks.length} interne link(s) komt via een redirect op een andere URL uit. Voorbeeld: ${redirectedInternalLinks[0]?.url} → ${redirectedInternalLinks[0]?.finalUrl}.`, "Werk interne links bij naar de definitieve URL om onnodige redirects te vermijden.", 2, 4)
    );
    seoChecks.push(
      uniqueInternalAnchors.length === 0
        ? check("not_applicable", "semantic_link_destination", "seo", "Verkeerde linkbestemming", "Geen controleerbare interne links gevonden.", "Controleer productkaarten zodra ze op de pagina aanwezig zijn.", 0, 5)
        : semanticLinkMismatches.length === 0 && productCardMismatches.length === 0 && featuredProductMismatches.length === 0
          ? check("pass", "semantic_link_destination", "seo", "Verkeerde linkbestemming", "Geen sterke semantische mismatch gevonden tussen benoemde productlinks en hun product-URL. Prijs-only links worden bewust niet als bewijs gebruikt.", "Houd titel, afbeelding en productbestemming binnen productkaarten consistent.", 5, 5)
          : check("warning", "semantic_link_destination", "seo", "Verkeerde linkbestemming", featuredProductMismatches.length > 0 ? `Mogelijke verkeerde linkbestemming in een uitgelicht product: "${featuredProductMismatches[0].label}" verwijst naar ${featuredProductMismatches[0].namedUrl}, terwijl de prijs naar ${featuredProductMismatches[0].priceUrl} verwijst. Beide links werken technisch, maar wijzen naar verschillende bestemmingen.` : productCardMismatches.length > 0 ? `Binnen één productkaart verwijzen onderdelen naar verschillende productbestemmingen: ${productCardMismatches[0].urls.join(" ↔ ")}. De links werken technisch, maar lijken niet bij hetzelfde product te horen.` : `Mogelijke verkeerde productbestemming gevonden: "${semanticLinkMismatches[0]?.context}" verwijst naar ${semanticLinkMismatches[0]?.finalUrl || semanticLinkMismatches[0]?.url}. De URL werkt technisch, maar de productnaam en bestemming delen geen duidelijke producttermen.`, "Controleer handmatig of titel/afbeelding/prijs binnen dezelfde productkaart naar hetzelfde product verwijzen. Markeer dit pas als definitieve fout na bevestiging.", 2, 5)
    );

    // Extended audit signals: trust, ecommerce quality, URL hygiene, social metadata and multilingual SEO.
    const placeholderMatches = text.match(/\[(?:kvk|btw|adres|e-?mail|email|telefoon|phone|address|postcode|plaats|company|naam)\]/gi) || [];
    const hasPlaceholders = placeholderMatches.length > 0;
    const hasPrivacyLink = links.some((href) => /privacy|privacybeleid|privacy-policy|datenschutz|confidentialite|privacidad/i.test(href));
    const hasCookieLink = links.some((href) => /cookie|cookies|cookiebeleid|cookie-policy/i.test(href));
    const hasTermsLink = links.some((href) => /voorwaarden|terms|conditions|agb|cgv|condiciones|termini/i.test(href));
    const hasContactLink = links.some((href) => /contact|kontakt|contatti|contacto|klantenservice|customer-service|customer_service|support|help(?:desk|center|centre)?/i.test(href));
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
    const emptyButtons=buttonTags.filter((match)=>!stripHtml(match[2]||"")&&!/\baria-label(?:ledby)?\s*=\s*["'][^"']+["']/i.test(match[1]||"")&&!/\btitle\s*=\s*["'][^"']+["']/i.test(match[1]||"")).length;
    const accessibilityIssueCount=imagesMissingAlt+unlabeledFormControls+emptyButtons;
    const dutchEuroDecimalPattern = /€\s?\d{1,3}(?:[.,]\d{3})*[.]\d{2}\b/g;
    const priceFormatMatches = text.match(dutchEuroDecimalPattern) || [];
    const hasDotDecimalPrices = priceFormatMatches.length > 0;
    const parseVisiblePrice = (value: string) => {
      const compact = value.replace(/\s/g, "");
      const normalized = compact.includes(",")
        ? compact.replace(/\./g, "").replace(",", ".")
        : compact;
      const numeric = Number(normalized);
      return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
    };
    const explicitProductPriceCandidates = [...new Set(
      [...html.matchAll(/<(?:meta|span|div|p)[^>]*(?:itemprop\s*=\s*["']price["']|property\s*=\s*["']product:price:amount["']|class\s*=\s*["'][^"']*(?:product[-_ ]?price|price)[^"']*["'])[^>]*?(?:content\s*=\s*["']([^"']+)["']|>([^<]{0,80}))/gi)]
        .flatMap((match) => {
          const raw = String(match[1] || match[2] || "");
          const price = raw.match(/(\d{1,6}(?:[.,]\d{2})?)/)?.[1];
          const parsed = price ? parseVisiblePrice(price) : null;
          return parsed === null ? [] : [parsed];
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
    const visibleCurrencyCodes = [...new Set([
      ...(text.match(/\b(?:EUR|GBP|USD)\b/gi) || []).map((value) => value.toUpperCase()),
      ...(text.includes("€") ? ["EUR"] : []),
      ...(text.includes("£") ? ["GBP"] : []),
      ...(text.includes("$") ? ["USD"] : []),
    ])];
    const structuredCurrencyCodes = [...new Set(productOfferEvidence.flatMap((product) => product.offers.map((offer) => offer.currency).filter((currency) => /^[A-Z]{3}$/.test(currency))))];
    // A currency mismatch is actionable only when the visible price is tied to
    // explicit product markup. Currency symbols elsewhere on the page may belong
    // to selectors, shipping examples or other products and are not contradiction proof.
    const currencyConflict = isProductPage && visiblePriceEvidenceStrength === "explicit_product_markup" && structuredCurrencyCodes.length === 1 && visibleCurrencyCodes.length === 1 && structuredCurrencyCodes[0] !== visibleCurrencyCodes[0];
    const mixedVisibleCurrencies = hasEcommerceSignal && visibleCurrencyCodes.length > 1;
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
        .filter((value) => Number.isFinite(value))
    )].slice(0, 20);
    const canCompareVisibleAndStructuredPrice = hasProductSignal && visiblePriceCandidates.length > 0 && structuredPriceCandidates.length > 0;
    const hasMatchingVisibleStructuredPrice = canCompareVisibleAndStructuredPrice && structuredPriceCandidates.some((schemaPrice) =>
      visiblePriceCandidates.some((visiblePrice) => Math.abs(visiblePrice - schemaPrice) < 0.005)
    );
    const visibleStockSignal = /\b(op voorraad|voorraad|in stock|out of stock|uitverkocht|sold out|pre-?order|backorder|niet op voorraad|auf lager|nicht auf lager|ausverkauft|vorbestellung|en stock|rupture de stock|épuisé|epuise|précommande|precommande|disponibile|disponibilità|disponibilita|esaurito|non disponibile|preordine|en stock|agotado|sin stock|no disponible|preventa)\b/i.test(text);
    const visibleAvailabilityState =
      /\b(niet op voorraad|out of stock|uitverkocht|sold out|nicht auf lager|ausverkauft|rupture de stock|épuisé|epuise|esaurito|non disponibile|agotado|sin stock|no disponible)\b/i.test(text) ? "out_of_stock" :
      /\b(pre-?order|vorbestellung|précommande|precommande|preordine|preventa)\b/i.test(text) ? "preorder" :
      /\b(backorder|lieferrückstand|lieferrueckstand|commande en attente|ordine arretrato|pedido pendiente)\b/i.test(text) ? "backorder" :
      /\b(op voorraad|in stock|auf lager|en stock|disponibile|disponibilità|disponibilita)\b/i.test(text) ? "in_stock" : null;
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
    const hasShippingSignal = hasStructuredShipping || /verzendkosten|verzending|levering|shipping|delivery|bezorging|ophalen|afhalen/i.test(text);
    const hasReturnsSignal = hasStructuredReturns || /retour|herroepingsrecht|14\s*dagen|bedenktijd|return policy|refund/i.test(text);
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
    const referencePriceMatches = text.match(/(?:van|was|adviesprijs|oude prijs|previous price|was price|statt|prix avant|prezzo precedente|precio anterior)\s*[:€£$]?\s*\d[\d.,]*/gi) || [];
    const hasDiscountClaim = discountClaimMatches.length > 0;
    const hasReferencePriceSignal = referencePriceMatches.length > 0;
    const reviewTransparencySignal = /(?:geverifieerde aankoop|verified purchase|verified buyer|reviewbeleid|review policy|reviews? worden|beoordelingen worden|wie kan.*review|how.*reviews?)/i.test(text);
    const reviewContentSignal = /\b(?:reviews?|beoordelingen|klantbeoordelingen|avis clients|bewertungen|recensioni|reseñas)\b/i.test(text);
    const scarcityMatches = text.match(/(?:nog\s+(?:maar\s+)?\d+\s+(?:op voorraad|beschikbaar)|only\s+\d+\s+left|last\s+\d+|nur\s+noch\s+\d+|plus que\s+\d+|solo\s+\d+\s+disponibili|solo quedan\s+\d+)/gi) || [];
    const hasScarcityClaim = scarcityMatches.length > 0;
    const personalizedPricingSignal = /(?:gepersonaliseerde prijs|personalised price|personalized price|personalisierter preis|prix personnalisé|prezzo personalizzato|precio personalizado)/i.test(text);
    const consumerLawSignals = {
      discountClaim: hasDiscountClaim,
      referencePriceVisible: hasReferencePriceSignal,
      discountExamples: discountClaimMatches.slice(0, 3),
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

    seoChecks.push(
      !title
        ? metadataMayBeClientRendered
          ? check("unable_to_confirm", "title", "seo", "Meta title", "De meta title kon niet betrouwbaar worden bevestigd omdat deze JavaScript-pagina niet volledig kon worden gerenderd.", "Controleer de title opnieuw met een volledige render voordat je een wijziging maakt.", 0, 10)
          : check("fail", "title", "seo", "Meta title", "Er is geen meta title gevonden.", "Voeg een unieke, beschrijvende title toe.", 0, 10)
        : titleQualityIssue
          ? check("warning", "title", "seo", "Meta title", `De title is ${title.length} tekens, maar bevat relatief veel herhaalde woorden.`, "Herschrijf de title natuurlijker en voorkom keyword stuffing.", 6, 10)
          : title.length >= 30 && title.length <= 60
            ? check("pass", "title", "seo", "Meta title", `De title is ${title.length} tekens en valt binnen de aanbevolen lengte.`, "Maak de title uniek, duidelijk en relevant voor de zoekintentie.", 10, 10)
            : check("warning", "title", "seo", "Meta title", `De title is ${title.length} tekens. Richtwaarde: 30–60 tekens.`, "Herschrijf de title zodat onderwerp, merk en zoekintentie direct duidelijk zijn.", 6, 10)
    );
    seoChecks.push(
      !description
        ? metadataMayBeClientRendered
          ? check("unable_to_confirm", "description", "seo", "Meta description", "De meta description kon niet betrouwbaar worden bevestigd omdat deze JavaScript-pagina niet volledig kon worden gerenderd.", "Controleer de description opnieuw met een volledige render voordat je een wijziging maakt.", 0, 10)
          : check("fail", "description", "seo", "Meta description", "Er is geen meta description gevonden.", "Laat RankFix AI een nieuwe meta description maken op basis van de pagina.", 0, 10)
        : descriptionQualityIssue
          ? check("warning", "description", "seo", "Meta description", `De description is ${description.length} tekens, maar bevat relatief veel herhaalde woorden.`, "Maak de description natuurlijker en voorkom keyword stuffing.", 6, 10)
          : description.length >= 70 && description.length <= 200
            ? check("pass", "description", "seo", "Meta description", description.length >= 120 && description.length <= 160
                ? `De description is ${description.length} tekens en goed gevuld.`
                : `De description is ${description.length} tekens. De klassieke 120–160 tekens is een optimalisatierichtlijn, geen technische SEO-eis; deze aanwezige description wordt daarom niet als fout bestraft.`, "Houd de description concreet, uniek en passend bij de zoekintentie; optimaliseer lengte alleen wanneer dat de zoekpreview en boodschap verbetert.", 10, 10)
            : check("warning", "description", "seo", "Meta description", `De description is ${description.length} tekens en is uitzonderlijk ${description.length < 70 ? "kort" : "lang"}. Dit is optimalisatieadvies, geen op zichzelf bewezen rankingfout.`, "Controleer of de description de pagina duidelijk samenvat en herschrijf alleen wanneer de zoekpreview of boodschap daar aantoonbaar van profiteert.", 8, 10)
    );
    seoChecks.push(h1s.length === 1
      ? check("pass", "h1", "seo", "H1-heading", "Er is precies één H1-heading gevonden.", "Behoud één duidelijke primaire H1.", 8, 8)
      : h1s.length === 0
        ? metadataMayBeClientRendered
          ? check("unable_to_confirm", "h1", "seo", "H1-heading", "De H1 kon niet betrouwbaar worden bevestigd omdat deze JavaScript-pagina niet volledig kon worden gerenderd.", "Controleer de headingstructuur opnieuw met een volledige render.", 0, 8)
          : check("warning", "h1", "seo", "H1-heading", "Er is geen H1-heading gevonden. Dit is een structuur-/toegankelijkheidsaanbeveling en geen op zichzelf bewezen rankingfout.", "Voeg een duidelijke primaire H1 toe wanneer dat past bij de pagina-inhoud.", 6, 8)
        : check("pass", "h1", "seo", "H1-heading", `Er zijn ${h1s.length} H1-headings gevonden. Meerdere H1-elementen zijn technisch toegestaan; RankFix behandelt dit daarom als structuuradvies en niet als bewezen SEO-probleem.`, "Overweeg één duidelijke primaire H1 en gebruik H2/H3 voor secties wanneer dat de documentstructuur begrijpelijker maakt.", 8, 8)
    );
    seoChecks.push(headings.length && headings.some((h) => h.level === 2)
      ? check("pass", "headings", "seo", "Heading-structuur", h1s.length > 0
          ? `Er zijn ${headings.length} H2–H6 headings gevonden naast de H1.`
          : metadataMayBeClientRendered
            ? `Er zijn ${headings.length} H2–H6 headings gevonden. De H1 wordt afzonderlijk gecontroleerd en kon op deze JavaScript-pagina niet betrouwbaar worden bevestigd.`
            : `Er zijn ${headings.length} H2–H6 headings gevonden. Er is geen H1 gevonden; de H1 wordt afzonderlijk beoordeeld.`,
        "Gebruik headings om onderwerpen en subonderwerpen logisch te groeperen.", 7, 7)
      : metadataMayBeClientRendered && headings.length === 0
        ? check("unable_to_confirm", "headings", "seo", "Heading-structuur", "De headingstructuur kon niet betrouwbaar worden bevestigd omdat deze JavaScript-pagina niet volledig kon worden gerenderd.", "Controleer de headingstructuur opnieuw met een volledige render voordat je headings toevoegt of wijzigt.", 0, 7)
        : check("warning", "headings", "seo", "Heading-structuur", "De pagina heeft weinig duidelijke subheadings.", "Voeg H2/H3-secties toe rond belangrijke onderwerpen en vragen.", 3, 7)
    );
    let canonicalUrl: URL | null = null;
    let canonicalInvalid = false;
    try {
      canonicalUrl = canonical ? new URL(canonical, finalUrl) : null;
    } catch {
      canonicalInvalid = Boolean(canonical);
    }

    const normalizeCanonicalTarget = (url: URL) => {
      const normalized = new URL(url.toString());
      normalized.hash = "";
      normalized.pathname = normalized.pathname.replace(/\/+$/, "") || "/";
      ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "fbclid", "msclkid"].forEach((param) => normalized.searchParams.delete(param));
      return normalized.toString();
    };

    const canonicalTarget = canonicalUrl ? normalizeCanonicalTarget(canonicalUrl) : "";
    const currentTarget = normalizeCanonicalTarget(finalUrl);
    const canonicalIsSelf = Boolean(canonicalUrl && canonicalTarget === currentTarget);
    // www/apex redirects are normally the same site and must not become a cross-domain failure.
    const canonicalHost = (host: string) => host.toLowerCase().replace(/^www\./, "");
    const canonicalIsCrossDomain = Boolean(canonicalUrl && canonicalHost(canonicalUrl.hostname) !== canonicalHost(finalUrl.hostname));
    const canonicalDropsQuery = Boolean(canonicalUrl && finalUrl.search && !canonicalUrl.search);
    seoChecks.push(
      canonicalInvalid
        ? check("fail", "canonical", "seo", "Canonical URL", `Er is een canonical gevonden, maar de waarde is geen geldige URL: "${canonical}".`, "Corrigeer de canonical naar één geldige absolute of relatieve voorkeurs-URL.", 0, 7)
        : !canonicalUrl
          ? metadataMayBeClientRendered
            ? check("unable_to_confirm", "canonical", "seo", "Canonical URL", "De canonical kon niet betrouwbaar worden bevestigd omdat deze JavaScript-pagina niet volledig kon worden gerenderd.", "Controleer de canonical opnieuw met een volledige render voordat je een wijziging maakt.", 0, 7)
            : check("warning", "canonical", "seo", "Canonical URL", "Geen canonical URL gevonden in de opgehaalde pagina.", "Voeg een self-referencing canonical toe wanneer passend.", 3, 7)
        : canonicalIsSelf
          ? check("pass", "canonical", "seo", "Canonical URL", canonicalDropsQuery ? "De canonical wijst naar dezelfde inhoud zonder queryparameters." : "De canonical verwijst naar dezelfde URL als de gescande pagina.", "Behoud een duidelijke self-referencing canonical en laat trackingparameters buiten de voorkeurs-URL.", 7, 7)
          : canonicalIsCrossDomain
            ? check("fail", "canonical", "seo", "Canonical URL", "De canonical verwijst naar een ander domein dan de gescande pagina. Dit kan de verkeerde voorkeurs-URL voor zoekmachines aangeven.", "Gebruik voor een normale pagina een self-referencing canonical op het eigen domein, tenzij een externe canonical bewust en inhoudelijk onderbouwd is.", 0, 10)
            : check("warning", "canonical", "seo", "Canonical URL", "De canonical is aanwezig, maar verwijst niet naar de gescande URL.", "Controleer of de canonical bewust naar een andere, inhoudelijk gelijkwaardige voorkeurs-URL verwijst.", 5, 7)
    );
    seoChecks.push(!viewportContent
      ? check("fail", "viewport", "seo", "Mobiele viewport", "Geen viewport meta tag met content gevonden.", "Voeg content=\"width=device-width, initial-scale=1\" toe aan de viewport meta tag.", 0, 5)
      : viewportIsResponsive
        ? check("pass", "viewport", "seo", "Mobiele viewport", `De viewport bevat een responsive width=device-width-instelling: "${viewportContent}".`, "Test daarnaast de echte mobiele layout en Core Web Vitals.", 5, 5)
        : check("warning", "viewport", "seo", "Mobiele viewport", `Een viewport meta tag is aanwezig, maar width=device-width is niet gevonden: "${viewportContent}".`, "Gebruik een responsive viewport met width=device-width.", 2, 5)
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
    seoChecks.push(imageElementCount === 0
      ? check("not_applicable", "alt", "seo", "Afbeelding alt-teksten", "Geen <img>-elementen gevonden in de opgehaalde HTML; deze controle telt daarom niet mee.", "Controleer dynamisch geladen afbeeldingen afzonderlijk wanneer die voor de pagina belangrijk zijn.", 0, 7)
      : imagesMissingAlt === 0
      ? check("pass", "alt", "seo", "Afbeelding alt-teksten", `Alle ${imageElementCount} controleerbare <img>-elementen in de raw HTML hebben alt-attributen. JavaScript-geladen afbeeldingen zijn niet meegenomen.`, "Schrijf beschrijvende alt-teksten voor informatieve afbeeldingen.", 7, 7)
      : check("warning", "alt", "seo", "Afbeelding alt-teksten", `${imagesMissingAlt} van ${imageElementCount} controleerbare <img>-elementen in de raw HTML missen alt. JavaScript-geladen afbeeldingen zijn niet meegenomen.`, "Voeg beschrijvende alt-teksten toe waar ze betekenis toevoegen.", 3, 7)
    );
    const effectiveLocalBusinessPage = !isProductPage && !hasCategorySignal && hasLocalBusinessSignal;
    const effectiveArticlePage = hasArticleSignal && !effectiveLocalBusinessPage;
    const contentContext = isHomepage ? "homepage" : isProductPage ? "productpagina" : hasCategorySignal ? "categorie-/lijstpagina" : effectiveLocalBusinessPage ? "lokale bedrijfspagina" : effectiveArticlePage ? "artikelpagina" : "contentpagina";
    const contentMinimumSignal = isHomepage ? 150 : isProductPage ? 80 : hasCategorySignal ? 120 : effectiveLocalBusinessPage ? 150 : effectiveArticlePage ? 300 : 200;
    const contentStrongSignal = isHomepage ? 250 : isProductPage ? 180 : hasCategorySignal ? 220 : effectiveLocalBusinessPage ? 300 : effectiveArticlePage ? 600 : 350;
    seoChecks.push(wordCount >= contentStrongSignal
      ? check("pass", "content", "seo", "Contentdekking", `Ongeveer ${wordCount} woorden gevonden op deze ${contentContext}. Dat is voldoende tekstuele dekking als kwantitatief signaal; relevantie en kwaliteit moeten afzonderlijk worden beoordeeld.`, "Behoud nuttige, unieke content die de zoekintentie en klantvragen beantwoordt.", 7, 7)
      : wordCount >= contentMinimumSignal
        ? check("warning", "content", "seo", "Contentdekking", `Ongeveer ${wordCount} woorden gevonden op deze ${contentContext}. Dat is geen bewijs van slechte content, maar de tekstuele dekking is beperkt voor dit paginatype.`, "Breid alleen uit waar extra productinformatie, categoriecontext of antwoorden de bezoeker daadwerkelijk helpen.", 5, 7)
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
    seoChecks.push(responseTime < 1500
      ? check("pass", "response", "seo", "Server response", `De eerste response kwam in ongeveer ${responseTime} ms.`, "Blijf server response en Core Web Vitals monitoren.", 5, 5)
      : responseTime < 3000
        ? check("warning", "response", "seo", "Server response", `De eerste response duurde ongeveer ${responseTime} ms.`, "Onderzoek hosting, caching, database en server-side rendering.", 3, 5)
        : check("fail", "response", "seo", "Server response", `De eerste response duurde ongeveer ${responseTime} ms.`, "Verbeter hosting, caching en server response voordat je verder optimaliseert.", 0, 5)
    );
    const missingOpenGraphFields = [
      !ogTitle ? "og:title" : null,
      !ogDescription ? "og:description" : null,
      !ogImage ? "og:image" : null,
    ].filter(Boolean) as string[];
    seoChecks.push(missingOpenGraphFields.length === 0
      ? check("pass", "social", "seo", "Social metadata", "Open Graph title, description en image zijn aanwezig.", "Controleer social previews voor belangrijke pagina's.", 4, 4)
      : check("warning", "social", "seo", "Social metadata", `Open Graph is onvolledig. Ontbrekend: ${missingOpenGraphFields.join(", ")}.`, `Voeg alleen de ontbrekende Open Graph-velden toe: ${missingOpenGraphFields.join(", ")}.`, 2, 4)
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
      hasLocalBusinessSignal
        ? hasRelevantLocalSchema
          ? check("pass", "schema", "geo", "Structured data", `${validJsonLd} geldige JSON-LD block(s) met passend lokaal bedrijfstype gevonden voor deze ${schemaContextLabel}.`, `Behoud het meest specifieke passende type: ${recommendedSchema}. Controleer verplichte en relevante velden.`, 12, 12)
          : validJsonLd > 0
            ? check("warning", "schema", "geo", "Structured data", `${validJsonLd} geldige JSON-LD block(s) gevonden, maar geen passend LocalBusiness-subtype.`, `Gebruik voor deze lokale pagina het meest specifieke passende type: ${recommendedSchema}, met alleen gegevens die zichtbaar en aantoonbaar zijn.`, 6, 12)
            : metadataMayBeClientRendered
            ? check("unable_to_confirm", "schema", "geo", "Structured data", `Structured data kon niet betrouwbaar worden bevestigd voor deze ${schemaContextLabel}, omdat de JavaScript-pagina niet volledig kon worden gerenderd.`, "Controleer structured data opnieuw met een volledige render voordat je schema toevoegt of wijzigt.", 0, 12)
            : check("fail", "schema", "geo", "Structured data", `Geen geldige JSON-LD structured data gevonden voor deze ${schemaContextLabel}.`, `Voeg relevante schema.org JSON-LD toe. Voor dit paginatype is ${recommendedSchema} de belangrijkste richting; gebruik alleen typen die echt bij de zichtbare content passen.`, 0, 12)
        : validJsonLd > 0
          ? hasRelevantContextSchema
            ? check("pass", "schema", "geo", "Structured data", `${validJsonLd} geldige JSON-LD block(s) met een voor deze ${schemaContextLabel} relevant schema-type gevonden.`, `Controleer ook de inhoudelijke velden en houd structured data gelijk aan zichtbare content. Relevante hoofdkeuze: ${recommendedSchema}.`, 12, 12)
            : hasEntitySchema
              ? check("warning", "schema", "geo", "Structured data", `${validJsonLd} geldige JSON-LD block(s) en herkenbare entity-schema's gevonden, maar geen schema-type dat RankFix overtuigend aan deze ${schemaContextLabel} kan koppelen.`, `Voeg alleen het relevante paginaschema toe wanneer het door de zichtbare content wordt ondersteund. Richting: ${recommendedSchema}.`, 6, 12)
              : check("warning", "schema", "geo", "Structured data", `${validJsonLd} geldige JSON-LD block(s) gevonden, maar geen herkenbaar relevant entity- of paginaschema voor deze ${schemaContextLabel}.`, `Gebruik structured data die aantoonbaar bij het paginatype past. Relevante hoofdkeuze: ${recommendedSchema}.`, 6, 12)
          : metadataMayBeClientRendered
            ? check("unable_to_confirm", "schema", "geo", "Structured data", `Structured data kon niet betrouwbaar worden bevestigd voor deze ${schemaContextLabel}, omdat de JavaScript-pagina niet volledig kon worden gerenderd.`, "Controleer structured data opnieuw met een volledige render voordat je schema toevoegt of wijzigt.", 0, 12)
            : check("fail", "schema", "geo", "Structured data", `Geen geldige JSON-LD structured data gevonden voor deze ${schemaContextLabel}.`, `Voeg relevante schema.org JSON-LD toe. Voor dit paginatype is ${recommendedSchema} de belangrijkste richting; gebruik alleen typen die echt bij de zichtbare content passen.`, 0, 12)
    );
    const normalizedTwitterCard = twitterCard.toLowerCase();
    const validTwitterCards = new Set(["summary", "summary_large_image", "app", "player"]);
    seoChecks.push(twitterCard
      ? validTwitterCards.has(normalizedTwitterCard)
        ? check("pass", "twitter_card", "seo", "Twitter Card", `Geldige Twitter/X Card ingesteld: "${twitterCard}".`, "Behoud dit type zolang de social preview past bij de pagina.", 3, 3)
        : check("warning", "twitter_card", "seo", "Twitter Card", `Onbekende twitter:card-waarde gevonden: "${twitterCard}".`, "Gebruik een ondersteund Card-type en controleer de social preview.", 1, 3)
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

    seoChecks.push(hasStockImages
      ? check("unable_to_confirm", "image_sources", "seo", "Afbeeldingsbronnen", `${stockImageUrls.length} afbeelding(en) worden vanaf bekende externe stockhosts geladen. Dat is op zichzelf geen SEO-fout; RankFix kan rechten, caching en CDN-configuratie uit HTML niet bevestigen.`, "Controleer alleen wanneer deze assets belangrijk zijn voor merk, rechten of performance.", 0, 5)
      : hasExternalImageHotlinks
        ? check("not_applicable", "image_sources", "seo", "Afbeeldingsbronnen", `${externalImageUrls.length} afbeelding(en) worden vanaf een ander hostnaam geladen. Een CDN of image-service is normaal en vormt zonder prestatie- of bereikbaarheidsbewijs geen probleem.`, "Beoordeel afbeeldingsperformance afzonderlijk met runtime-metingen.", 0, 5)
        : check("pass", "image_sources", "seo", "Afbeeldingsbronnen", "Geen externe afbeeldingshosts gevonden in de statische HTML.", "Blijf belangrijke afbeeldingen optimaliseren.", 5, 5)
    );

    seoChecks.push(
      hasPrivacyLink && hasCookieLink && hasContactLink
        ? check("pass","trust_legal_signals","seo","Privacy & vertrouwenssignalen","Links naar privacy, cookies en contact zijn in de opgehaalde HTML gevonden.","Houd deze informatie duidelijk vindbaar en actueel. Dit is een technische aanwezigheidstest, geen juridisch oordeel.",5,5)
        : check("warning","trust_legal_signals","seo","Privacy & vertrouwenssignalen","Niet alle basissignalen zijn gevonden: "+[!hasPrivacyLink?"privacy":null,!hasCookieLink?"cookies":null,!hasContactLink?"contact":null].filter(Boolean).join(", ")+".","Controleer of privacy-, cookie- en contactinformatie duidelijk bereikbaar is. RankFix beoordeelt hiermee geen wettelijke compliance.",2,5)
    );
    seoChecks.push(
      hasEcommerceSignal && !hasTermsLink
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

    seoChecks.push(
      accessibilityIssueCount===0
        ? check("pass","accessibility_basics","seo","Toegankelijkheid basis","Geen duidelijke basisproblemen gevonden bij afbeelding-alt, formulierlabels of lege knoppen in de statische HTML.","Blijf toetsenbordbediening, focus, contrast en dynamische content afzonderlijk testen. Dit is geen volledige toegankelijkheidsaudit.",5,5)
        : check("warning","accessibility_basics","seo","Toegankelijkheid basis","Basiscontrole vond "+accessibilityIssueCount+" aandachtspunt(en): "+imagesMissingAlt+" afbeelding(en) zonder alt-attribuut, "+unlabeledFormControls+" formuliercontrol(s) zonder aantoonbaar label en "+emptyButtons+" lege knop(pen) zonder toegankelijke naam.","Corrigeer de aantoonbare HTML-signalen en voer daarna een uitgebreidere toegankelijkheidstest uit. RankFix claimt hiermee geen wettelijke conformiteit.",2,5)
    );

    seoChecks.push(hasPlaceholders
      ? check("fail", "business_placeholders", "seo", "Bedrijfsgegevens", `Er staan nog ${placeholderMatches.length} placeholder(s) zoals ${placeholderMatches.slice(0, 4).join(", ")} op de pagina.`, "Vervang placeholders door echte bedrijfs- en contactgegevens voordat de site live gaat.", 0, 6)
      : check("pass", "business_placeholders", "seo", "Bedrijfsgegevens", "Geen bekende bedrijfsgegevens-placeholders gevonden.", "Houd bedrijfs- en contactgegevens actueel en consistent.", 6, 6)
    );

    seoChecks.push(!hasEcommerceSignal
      ? check("not_applicable", "price_format", "seo", "Prijsnotatie", "Geen duidelijke webshop/product-signalen gevonden; prijsnotatie is niet beoordeeld.", "Gebruik deze controle op echte product- en e-commercepagina's.", 0, 5)
      : !hasDotDecimalPrices
      ? check("pass", "price_format", "seo", "Prijsnotatie", "De gevonden europrijzen bevatten geen inconsistente decimaalnotatie die door deze controle als fout is aangemerkt.", "Gebruik per taal/regio een passende valuta- en getalnotatie.", 5, 5)
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
      ? check("not_applicable","checkout_information_signal","seo","Checkout informatie","Geen duidelijke webshop-signalen gevonden.","Gebruik deze controle op echte webshops.",0,0)
      : hasShippingSignal && paymentMethodSignal
        ? check("pass","checkout_information_signal","seo","Checkout informatie","Verzendinformatie en betaalmethode-signalen zijn op deze pagina gevonden.","Controleer verzendkosten, btw en totaalbedrag opnieuw in de daadwerkelijke checkout.",0,0)
        : check("unable_to_confirm","checkout_information_signal","seo","Checkout informatie","Niet alle verzend- en betaalinformatie kon op deze losse pagina worden bevestigd.","Dit is geen foutbewijs: informatie kan pas in winkelwagen of checkout verschijnen. Controleer de volledige funnel.",0,0)
    );

    seoChecks.push(!hasEcommerceSignal
      ? check("not_applicable","eu_discount_reference_signal","seo","EU korting & referentieprijs","Geen duidelijke webshop-signalen gevonden; kortingssignalen zijn niet beoordeeld.","Gebruik deze controle op echte webshop- en productpagina's.",0,0)
      : !hasDiscountClaim
        ? check("not_applicable","eu_discount_reference_signal","seo","EU korting & referentieprijs","Geen expliciete kortingsclaim gevonden op deze pagina.","Geen actie nodig voor deze paginascan.",0,0)
        : hasReferencePriceSignal
          ? check("pass","eu_discount_reference_signal","seo","EU korting & referentieprijs","Een kortingsclaim én zichtbare referentieprijs zijn gevonden. RankFix kan vanuit één scan niet bewijzen dat de referentieprijs historisch juist is.","Bewaar prijs-/promotiehistorie en controleer de toepasselijke 30-dagenregel afzonderlijk.",0,0)
          : check("unable_to_confirm","eu_discount_reference_signal","seo","EU korting & referentieprijs","Er is een kortingsclaim gevonden, maar geen duidelijke referentieprijs in de statische paginatekst.","Controleer of de toepasselijke referentieprijs duidelijk wordt getoond. RankFix geeft hier alleen een signaal, geen juridische conformiteitsverklaring.",0,0)
    );
    seoChecks.push(!hasEcommerceSignal
      ? check("not_applicable","eu_review_transparency_signal","seo","EU reviewtransparantie","Geen duidelijke webshop-signalen gevonden.","Gebruik deze controle op webshops met klantreviews.",0,0)
      : !reviewContentSignal
        ? check("not_applicable","eu_review_transparency_signal","seo","EU reviewtransparantie","Geen klantreview-inhoud op deze pagina gevonden.","Controleer reviewtransparantie op de pagina waar reviews daadwerkelijk worden getoond.",0,0)
        : reviewTransparencySignal
          ? check("pass","eu_review_transparency_signal","seo","EU reviewtransparantie","Reviewinhoud en een zichtbaar transparantiesignaal over reviews zijn gevonden.","Controleer dat de uitleg feitelijk klopt met het gebruikte reviewproces.",0,0)
          : check("unable_to_confirm","eu_review_transparency_signal","seo","EU reviewtransparantie","Reviewinhoud is gevonden, maar uit deze statische pagina blijkt niet duidelijk hoe reviews worden verzameld of geverifieerd.","Maak voor klanten duidelijk hoe reviews worden verzameld/gecontroleerd; dit is een transparantiesignaal, geen juridische conclusie.",0,0)
    );
    seoChecks.push(!hasEcommerceSignal || !hasScarcityClaim
      ? check("not_applicable","eu_scarcity_signal","seo","EU schaarsteclaim","Geen expliciete numerieke schaarsteclaim gevonden.","Geen actie nodig voor deze paginascan.",0,0)
      : check("unable_to_confirm","eu_scarcity_signal","seo","EU schaarsteclaim",`Een schaarsteclaim is gevonden, bijvoorbeeld: ${scarcityMatches[0]}. RankFix kan uit raw HTML niet bewijzen of de voorraadclaim realtime en juist is.`,"Verifieer dat de claim aantoonbaar actueel en waar is; gebruik geen kunstmatige schaarste.",0,0)
    );
    seoChecks.push(!hasEcommerceSignal
      ? check("not_applicable","eu_consumer_information_signal","seo","EU consumenteninformatie","Geen duidelijke webshop-signalen gevonden.","Gebruik deze controle op echte webshops.",0,0)
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
          : check("unable_to_confirm","product_availability","seo","Productvoorraad",visibleStockSignal ? "Er is algemene voorraadtekst gevonden, maar RankFix kan daaruit geen eenduidige in-stock/out-of-stockstatus bewijzen en vindt ook geen Offer availability." : "Geen betrouwbare zichtbare of structured voorraadstatus gevonden.","Maak voorraadstatus expliciet op productpagina en in Offer structured data.",0,5));
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
    geoChecks.push(isHomepage
      ? organizationSchemaPresent && websiteSchemaPresent
        ? check("pass", "organization_website", "geo", "Organization + WebSite", "Organization en WebSite structured data zijn aanwezig op de homepage.", "Houd naam, URL en logo consistent met de zichtbare site-identiteit.", 8, 8)
        : check("warning", "organization_website", "geo", "Organization + WebSite", "De homepage mist Organization en/of WebSite structured data.", "Voeg passende Organization- en WebSite JSON-LD toe zonder gegevens te verzinnen.", 3, 8)
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
          : check("warning", "entity", "geo", "Entity-signalen", "Er is weinig expliciete zichtbare entity-informatie gevonden.", "Maak organisatie- of merknaam, contactcontext en officiële profielen zichtbaar en consistent. Machineleesbare structured data wordt apart beoordeeld.", 4, 10)
    );
    geoChecks.push(isHomepage
      ? check("not_applicable", "breadcrumbs", "geo", "Breadcrumbs", "Op de homepage is BreadcrumbList normaal niet nodig; deze controle telt daarom niet mee.", "Gebruik BreadcrumbList vooral op diepe content-, categorie- en productpagina's.", 0, 6)
      : hasBreadcrumb
        ? check("pass", "breadcrumbs", "geo", "Breadcrumbs", "BreadcrumbList structured data is aanwezig.", "Houd breadcrumbs gelijk aan de zichtbare navigatiestructuur.", 6, 6)
        : check("unable_to_confirm", "breadcrumbs", "geo", "Breadcrumbs", "Geen BreadcrumbList schema gevonden op deze diepere pagina. Vanuit raw HTML alleen is niet bewezen dat de pagina een hiërarchische breadcrumb nodig heeft of dat client-side breadcrumbs ontbreken.", "Controleer de zichtbare navigatiestructuur of een sitebrede/browser-scan voordat BreadcrumbList als verbeterpunt wordt aangemerkt.", 0, 6)
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
    geoChecks.push(hasAuthorSignal || (hasLocalBusinessSignal && hasServiceExpertiseSignal) || organizationExpertiseSignal
      ? check("pass", "author", "geo", "Expertise-signalen", hasAuthorSignal ? "Auteur- of expertisesignalen zijn gevonden." : organizationExpertiseSignal ? "Duidelijke organisatie- en expertisesignalen zijn gevonden." : "Duidelijke dienst- en vakgebiedsignalen zijn gevonden voor deze lokale bedrijfspagina.", "Maak auteur, expertise, diensten en bronnen waar relevant nog explicieter.", 8, 8)
      : ecommerceExpertiseSignal
        ? check("pass", "author", "geo", "Expertise-signalen", "Voor deze webshop zijn merk-, organisatie- en productcontext-signalen gevonden; een individuele auteur is niet noodzakelijk voor productcontent.", "Maak merk-, product- en organisatiecontext consistent en voeg auteurs of bronnen toe waar informatieve content dat vereist.", 8, 8)
        : check("warning", "author", "geo", "Expertise-signalen", "Geen duidelijke auteur/expertisesignalen gevonden.", "Voeg auteur, organisatie, expertise en betrouwbare bronnen toe aan informatieve content.", 3, 8)
    );
    geoChecks.push(hasContactChannelSignal || hasAboutSignal || hasSocialOrReviewSignal
      ? check("pass", "trust", "geo", "Trust & context", hasAboutSignal ? "Contact- en organisatiecontext zijn zichtbaar." : "Concrete contact-, locatie- of externe profielsignalen zijn zichtbaar.", "Houd bedrijfsnaam, contactgegevens, locatie, verantwoordelijkheden en officiële profielen consistent.", 8, 8)
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
    geoChecks.push(visibleBrandSignals >= 3
      ? check("pass", "identity", "geo", "Brand identity", brandSignalDetail, brandRecommendation, 5, 5)
      : visibleBrandSignals >= 1
        ? check("warning", "identity", "geo", "Brand identity", brandSignalDetail, brandRecommendation, 3, 5)
        : check("warning", "identity", "geo", "Brand identity", brandSignalDetail, brandRecommendation, 2, 5)
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
        accessibility_basics: `imagesMissingAlt=${imagesMissingAlt}; unlabeledControls=${unlabeledFormControls}; emptyButtons=${emptyButtons}; staticHtmlOnly=true`,
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
      const foundEvidence = hasMappedEvidence ? evidenceByKey[item.key] : null;
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
      if (item.status === "pass" && (!hasMappedEvidence || foundEvidence === null)) {
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
    if (!hasEcommerceSignal) {
      for (const item of [...seoChecks, ...geoChecks]) {
        if (!commerceOnlyKeys.has(item.key)) continue;
        item.status = "not_applicable";
        item.issue_status = "NOT_APPLICABLE";
        item.points = 0;
        item.confidence = "high";
        item.message = "Geen voldoende sterk webshop-signaal gevonden; deze branchespecifieke controle is niet van toepassing op deze website.";
        item.fix = "Geen actie nodig. RankFix activeert deze controle alleen wanneer e-commerce voldoende is bewezen.";
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
    const selectedSeoChecks = mode === "geo" ? [] : seoChecks;
    const selectedGeoChecks = mode === "seo" ? [] : geoChecks;
    const selectedSeoScore = scoreApplicableChecks(selectedSeoChecks);
    const selectedGeoScore = scoreApplicableChecks(selectedGeoChecks);
    let selectedOverallScore = mode === "seo" ? selectedSeoScore : mode === "geo" ? selectedGeoScore : Math.round(selectedSeoScore * 0.6 + selectedGeoScore * 0.4);
    selectedOverallScore = applyEvidenceBasedScoreCap(selectedOverallScore, [...selectedSeoChecks, ...selectedGeoChecks]);
    const checks = [...selectedSeoChecks, ...selectedGeoChecks];
    const coverageFor = (items: Check[]) => {
      const relevant = items.filter((item) => item.issue_status !== "NOT_APPLICABLE");
      const confirmed = relevant.filter((item) => item.issue_status !== "UNABLE_TO_CONFIRM");
      const highConfidence = confirmed.filter((item) => item.confidence === "high");
      return {
        relevant: relevant.length,
        confirmed: confirmed.length,
        unableToConfirm: relevant.length - confirmed.length,
        coveragePercent: relevant.length ? Math.round((confirmed.length / relevant.length) * 100) : 0,
        highConfidencePercent: confirmed.length ? Math.round((highConfidence.length / confirmed.length) * 100) : 0,
      };
    };
    const seoCoverage = coverageFor(selectedSeoChecks);
    const geoCoverage = coverageFor(selectedGeoChecks);
    const overallCoverage = coverageFor(checks);
    const scanSummary = summarizeAuditChecks(checks);
    const pageTypeEvidence = {
      type: isHomepage ? "homepage" : isProductPage ? "product" : hasCategorySignal ? "category" : effectiveLocalBusinessPage ? "service" : effectiveArticlePage ? "article" : "unknown",
      confidence: isHomepage ? "high" : isProductPage && (hasProductSchema || hasSkuSignal) ? "high" : isProductPage ? "medium" : hasCategorySignal && (hasItemListSignal || repeatedProductCardSignal) ? "high" : effectiveLocalBusinessPage || hasCategorySignal || effectiveArticlePage ? "medium" : "low",
      evidence: [isHomepage ? `localized/root path: ${pathname}` : "", hasProductSchema ? "Product schema present" : "", hasStoreSchema ? "Store schema present" : "", hasItemListSignal ? "ItemList schema present" : "", genericCategoryPathSignal ? `generic commerce category path: ${pathname}` : "", repeatedProductCardSignal ? "repeated product-card commerce signals" : "", commercialNavigationEvidence ? "commercial navigation + shop/support links" : "", hasSkuSignal ? "SKU signal present" : "", hasStrongCommerceAction ? "commerce action present" : ""].filter(Boolean),
    };
    // Keep the website profile aligned with the same evidence used by webshop-only audit checks.
    // Generic words such as "checkout", "price" or SaaS pricing must not classify a site as a webshop.
    console.info("RankFix scan phase", { phase: "checks_built", page: finalUrl.toString(), seoChecks: selectedSeoChecks.length, geoChecks: selectedGeoChecks.length });
    const technologyProfile = detectTechnologyProfile(html, response.headers, hasEcommerceSignal);
    console.info("RankFix scan phase", { phase: "technology_profile_built", page: finalUrl.toString(), siteType: technologyProfile.siteType, framework: technologyProfile.framework });
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
        technologyProfile.siteType = "Landingpage";
        technologyProfile.evidence = [...technologyProfile.evidence, `Landingpage-signalen ${landingSignalCount}/4`].slice(0, 8);
      }
    }
    // sectorProfile was determined before scoring so applicability and scoring stay aligned.
    const rawRenderingNotes: Record<string,string> = {
      nl:"RankFix beoordeelde de HTTP HTML-response; client-side JavaScript is in deze scan niet uitgevoerd.",
      en:"RankFix evaluated the HTTP HTML response; client-side JavaScript was not executed in this scan.",
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
      fallbackReason: javascriptCandidate && !javascriptExecuted ? renderFallbackReason : null,
    };

    // Multi-page evidence audit: select a bounded same-host sample and fetch it
    // without changing the score of the page the customer explicitly scanned.
    const normalizeHost = (value: string) => value.toLowerCase().replace(/^www\./, "");
    type MultiPageCandidate = { url: string; type: "homepage" | "category" | "product" | "other"; evidence: string[] };
    type MultiPageAudit = MultiPageCandidate & { status: "audited" | "unable_to_confirm"; httpStatus: number | null; title: string | null; description: string | null; h1Count: number | null; canonical: string | null; score: number | null; evidenceChecks: { key: string; status: "PASS" | "WARNING" | "UNABLE_TO_CONFIRM"; details: string }[] };
    const siteHost = normalizeHost(finalUrl.hostname);
    const classifyMultiPageCandidate = (urlValue: string): MultiPageCandidate | null => {
      try {
        const candidate = new URL(urlValue, finalUrl); candidate.hash = "";
        if (!/^https?:$/.test(candidate.protocol) || normalizeHost(candidate.hostname) !== siteHost) return null;
        const normalized = normalizeScanUrl(candidate.toString());
        if (normalized === normalizeScanUrl(finalUrl.toString())) return null;
        const path = safeDecodeURIComponent(candidate.pathname).toLowerCase();
        if (/\.(?:jpg|jpeg|png|gif|webp|svg|pdf|zip|xml|json|css|js|ico|woff2?)(?:$|\?)/i.test(path)) return null;
        const evidence: string[] = [];
        const productPath = /\/(?:product|products|product-page|p)\//i.test(path);
        const categoryPath = /\/(?:category|categories|categorie|categorieen|collection|collections|shop|store|winkel|catalog|catalogue)(?:\/|$)/i.test(path);
        if (productPath) evidence.push("product-like path");
        if (categoryPath) evidence.push("category-like path");
        return { url: candidate.toString(), type: productPath ? "product" : categoryPath ? "category" : "other", evidence };
      } catch { return null; }
    };
    const discoveredMultiPage = [...new Map(allUniqueInternalAnchors.flatMap((item) => {
      const candidate = classifyMultiPageCandidate(item.url);
      return candidate ? [[normalizeScanUrl(candidate.url), candidate] as const] : [];
    })).values()];
    const pickMultiPage = (type: MultiPageCandidate["type"], limit: number) => discoveredMultiPage.filter((item) => item.type === type).slice(0, limit);
    const multiPagePages: MultiPageCandidate[] = [
      { url: new URL("/", finalUrl).toString(), type: "homepage", evidence: ["site root"] },
      ...pickMultiPage("category", 2), ...pickMultiPage("product", 2), ...pickMultiPage("other", 1),
    ];
    const uniqueMultiPagePages = [...new Map(multiPagePages.map((item) => [normalizeScanUrl(item.url), item] as const)).values()].slice(0, 6);
    const auditMultiPage = async (page: MultiPageCandidate): Promise<MultiPageAudit> => {
      try {
        const fetched = await safePublicFetch(page.url, { timeoutMs: 8000, maxRedirects: 3, userAgent: "RankFixBot/2.1 (+https://rankfix-app.onrender.com)", accept: "text/html,application/xhtml+xml" });
        const r = fetched.response;
        const finalCandidate = new URL(fetched.finalUrl.toString());
        if (normalizeHost(finalCandidate.hostname) !== siteHost) throw new Error("CROSS_HOST_REDIRECT");
        const contentType = r.headers.get("content-type") || "";
        if (!r.ok || (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml"))) {
          return { ...page, status:"unable_to_confirm", httpStatus:r.status, title:null, description:null, h1Count:null, canonical:null, score:null, evidenceChecks:[{key:"http",status:"UNABLE_TO_CONFIRM",details:`HTTP ${r.status}; pagina kon niet betrouwbaar als HTML worden beoordeeld.`}] };
        }
        const pageHtml = await readResponseTextLimited(r, 2_000_000);
        const pageTitle = firstMatch(pageHtml, /<title[^>]*>([\s\S]*?)<\/title>/i);
        const pageDescription = firstMatch(pageHtml, /<meta[^>]+(?:name|property)\s*=\s*["']description["'][^>]+content\s*=\s*["']([\s\S]*?)["'][^>]*>/i) || firstMatch(pageHtml, /<meta[^>]+content\s*=\s*["']([\s\S]*?)["'][^>]+(?:name|property)\s*=\s*["']description["'][^>]*>/i);
        const pageH1s = [...pageHtml.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)].map((m)=>stripHtml(m[1])).filter(Boolean);
        const pageCanonical = firstMatch(pageHtml, /<link[^>]+rel\s*=\s*["'][^"']*canonical[^"']*["'][^>]+href\s*=\s*["']([^"']+)["'][^>]*>/i) || firstMatch(pageHtml, /<link[^>]+href\s*=\s*["']([^"']+)["'][^>]+rel\s*=\s*["'][^"']*canonical[^"']*["'][^>]*>/i);
        const evidenceChecks: MultiPageAudit["evidenceChecks"] = [
          {key:"http",status:"PASS",details:`HTTP ${r.status}`},
          {key:"title",status:pageTitle?"PASS":"WARNING",details:pageTitle?`Title gevonden (${pageTitle.length} tekens).`:"Geen title gevonden in raw HTML."},
          {key:"description",status:pageDescription?"PASS":"WARNING",details:pageDescription?`Meta description gevonden (${pageDescription.length} tekens).`:"Geen meta description gevonden in raw HTML."},
          {key:"h1",status:pageH1s.length>0?"PASS":"WARNING",details:pageH1s.length>1?`${pageH1s.length} H1-headings gevonden; meerdere H1-elementen gelden hier als structuuradvies en niet als bewezen fout.`:`${pageH1s.length} H1-heading(s) gevonden.`},
          {key:"canonical",status:pageCanonical
            ? (()=>{ try { const resolved=new URL(pageCanonical,finalCandidate); const sameHost=resolved.hostname.toLowerCase().replace(/^www\./,"")===finalCandidate.hostname.toLowerCase().replace(/^www\./,""); const samePage=resolved.pathname.replace(/\/+$/,"")===finalCandidate.pathname.replace(/\/+$/,"") && resolved.search===finalCandidate.search; return sameHost&&samePage?"PASS":"WARNING"; } catch { return "WARNING"; } })()
            : "UNABLE_TO_CONFIRM",
            details:pageCanonical
              ? (()=>{ try { const resolved=new URL(pageCanonical,finalCandidate); const sameHost=resolved.hostname.toLowerCase().replace(/^www\./,"")===finalCandidate.hostname.toLowerCase().replace(/^www\./,""); const samePage=resolved.pathname.replace(/\/+$/,"")===finalCandidate.pathname.replace(/\/+$/,"") && resolved.search===finalCandidate.search; return sameHost&&samePage?`Self-canonical bevestigd: ${resolved.toString()}`:`Canonical wijst naar ${resolved.toString()}; controleer of deze afwijking bewust is.`; } catch { return "Canonical is aanwezig maar kon niet betrouwbaar als URL worden geïnterpreteerd."; } })()
              : "Geen canonical gevonden in de begrensde raw-HTML fetch; afwezigheid wordt hier niet als bewezen fout gescoord."},
        ];
        const confirmed = evidenceChecks.filter((x)=>x.status!=="UNABLE_TO_CONFIRM");
        const passed = confirmed.filter((x)=>x.status==="PASS").length;
        return { ...page, url:finalCandidate.toString(), status:"audited", httpStatus:r.status, title:pageTitle||null, description:pageDescription||null, h1Count:pageH1s.length, canonical:pageCanonical||null, score:confirmed.length?Math.round((passed/confirmed.length)*100):null, evidenceChecks };
      } catch {
        return { ...page, status:"unable_to_confirm", httpStatus:null, title:null, description:null, h1Count:null, canonical:null, score:null, evidenceChecks:[{key:"fetch",status:"UNABLE_TO_CONFIRM",details:"Pagina kon binnen de begrensde multi-page scan niet betrouwbaar worden opgehaald."}] };
      }
    };
    const multiPageAudits = await Promise.all(uniqueMultiPagePages.map(auditMultiPage));
    const auditedMultiPages = multiPageAudits.filter((item)=>item.status==="audited");
    const multiPage = {
      enabled:true, mode:"REPRESENTATIVE_AUDIT" as const, currentPageScoredSeparately:true, maxPages:6,
      discoveredInternalUrls:discoveredMultiPage.length, selectedPages:uniqueMultiPagePages, pageAudits:multiPageAudits,
      siteSampleScore: auditedMultiPages.length ? Math.round(auditedMultiPages.reduce((sum,item)=>sum+(item.score||0),0)/auditedMultiPages.length) : null,
      counts:{ homepage:uniqueMultiPagePages.filter((x)=>x.type==="homepage").length, category:uniqueMultiPagePages.filter((x)=>x.type==="category").length, product:uniqueMultiPagePages.filter((x)=>x.type==="product").length, other:uniqueMultiPagePages.filter((x)=>x.type==="other").length, audited:auditedMultiPages.length, unableToConfirm:multiPageAudits.length-auditedMultiPages.length },
      note:"Representative same-host pages are fetched with bounded raw-HTML checks. Their sample score is separate from the explicitly scanned page score.",
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
            mode, overallScore: selectedOverallScore, grade: grade(selectedOverallScore), coverage: overallCoverage, summary: scanSummary, rendering, pageTypeEvidence, technologyProfile, sectorProfile, multiPage,
            adsKeywordIntelligence: { ...adsKeywordIntelligence, customerProfile: hasAdsProfile ? adsProfile : null },
            seo: { score: selectedSeoScore, grade: grade(selectedSeoScore), coverage: seoCoverage, checks: selectedSeoChecks },
            geo: { score: selectedGeoScore, grade: grade(selectedGeoScore), coverage: geoCoverage, checks: selectedGeoChecks },
            metrics: { siteType: (hasProductSchema || /add-to-cart|shopping cart|winkelwagen|checkout|sku|price|availability/i.test(text)) ? "ECOMMERCE" : "WEBSITE", title, titleLength: title.length, description, descriptionLength: description.length, h1Count: h1s.length, h1s,
              imageCount, imageElementCount, imagesMissingAlt, wordCount, headingsCount: headings.length, linksCount: links.length, pageType: schemaContextLabel, recommendedSchema, localBusinessDetails,
              internalLinks, canonical: canonical || null, lang: lang || null, robots: robots || null,
              openGraph: { title: ogTitle || null, description: ogDescription || null, image: ogImage || null }, imageAltCandidates,
              productOptimizer: isProductPage ? { eligible: productOptimizerSourceCount >= 3, sourceCount: productOptimizerSourceCount, product: primaryProductEvidence ? { name: primaryProductEvidence.name || null, image: primaryProductEvidence.imageUrl || null, sku: primaryProductEvidence.sku || null, offers: primaryProductEvidence.offers.slice(0,3) } : null } : { eligible: false, sourceCount: 0, product: null },
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

    if (user?.email) {
      try {
        await sendScanReportEmail({
          to: user.email,
          name: user.name,
          language: scanLanguage,
          scanId: savedScanId,
          scannedUrl: target.toString(),
          finalUrl: finalUrl.toString(),
          scannedAt: new Date().toISOString(),
          mode,
          overallScore: selectedOverallScore,
          overallGrade: grade(selectedOverallScore),
          seoScore: selectedSeoScore,
          seoGrade: grade(selectedSeoScore),
          geoScore: selectedGeoScore,
          geoGrade: grade(selectedGeoScore),
          responseTime,
          httpStatus: response.status,
          checks,
        });
      } catch (error) {
        console.error("RankFix scan report email failed:", error);
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
      summary: scanSummary,
      rendering,
      scope: scanScope,
      multiPage,
      pageTypeEvidence,
      technologyProfile,
      adsKeywordIntelligence: { ...adsKeywordIntelligence, customerProfile: hasAdsProfile ? adsProfile : null },
      seo: { score: selectedSeoScore, grade: grade(selectedSeoScore), coverage: seoCoverage, checks: selectedSeoChecks },
      geo: { score: selectedGeoScore, grade: grade(selectedGeoScore), coverage: geoCoverage, checks: selectedGeoChecks },
      metrics: {
        title,
        titleLength: title.length,
        description,
        descriptionLength: description.length,
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
        productOptimizer: isProductPage ? { eligible: productOptimizerSourceCount >= 3, sourceCount: productOptimizerSourceCount, product: primaryProductEvidence ? { name: primaryProductEvidence.name || null, image: primaryProductEvidence.imageUrl || null, sku: primaryProductEvidence.sku || null, offers: primaryProductEvidence.offers.slice(0,3) } : null } : { eligible: false, sourceCount: 0, product: null },
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