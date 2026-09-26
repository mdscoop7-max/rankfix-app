import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { ensureDatabase } from "@/lib/db-init";
import { sendScanReportEmail } from "@/lib/email";
import { CRAWLER_VERSION, RULES_VERSION, FIX_POLICY_VERSION, AI_POLICY_VERSION, statusCode } from "@/lib/seo-rules";
import { getFixPolicy } from "@/lib/fix-policy";
import { extractImageMetrics } from "@/lib/image-metrics";
import { safePublicFetch, validatePublicHttpUrl } from "@/lib/safe-fetch";

type Status = "pass" | "warning" | "fail" | "not_applicable" | "unable_to_confirm";

type AuditMode = "seo" | "geo" | "both";

type Check = {
  key: string;
  category: "seo" | "geo";
  title: string;
  fix_status?: "WAITING" | "DONE";
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
  const match = tag.match(new RegExp(attr + "\\s*=\\s*[\"']([^\"']*)[\"']", "i"));
  return match?.[1] || "";
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
    return url.toString();
  } catch {
    return value.trim().replace(/\/+$/, "");
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const rawUrl = typeof body?.url === "string" ? body.url.trim() : "";
    const mode: AuditMode = body?.mode === "seo" || body?.mode === "geo" || body?.mode === "both" ? body.mode : "both";

    if (!rawUrl) {
      return NextResponse.json({ error: "Vul een website URL in." }, { status: 400 });
    }

    let target: URL;
    try {
      target = validatePublicHttpUrl(/^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`);
    } catch {
      return NextResponse.json({ error: "Deze URL kan niet veilig worden gescand." }, { status: 400 });
    }

    const started = Date.now();
    let response: Response;
    try {
      ({ response } = await safePublicFetch(target, { timeoutMs: 12000, maxRedirects: 4, userAgent: "RankFixBot/2.1 (+https://rankfix-app.onrender.com)", accept: "text/html,application/xhtml+xml,text/plain,application/xml" }));
    } catch {
      return NextResponse.json(
        { error: "De website kon niet worden opgehaald. Controleer de URL en probeer opnieuw." },
        { status: 502 }
      );
    }

    const responseTime = Date.now() - started;
    const finalUrl = new URL(response.url || target.toString());

    if (!response.ok && response.status !== 404) {
      return NextResponse.json(
        { error: `De website gaf HTTP ${response.status} terug en kan niet goed worden geanalyseerd.` },
        { status: 422 }
      );
    }

    const html = await response.text();
    if (!html || html.length < 20) {
      return NextResponse.json({ error: "De website gaf geen bruikbare HTML terug." }, { status: 422 });
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
        const altMatch = tag.match(/\balt\s*=\s*(?:["']([^"']*)["']|([^\s>]+))/i);
        return !(altMatch && (altMatch[1] ?? altMatch[2] ?? "").trim());
      })
      .slice(0, 10)
      .map((m) => {
        const tag = m[0];
        const attr = (name: string) => {
          const match = tag.match(new RegExp(
            `\\b${name}\\s*=\\s*(?:["']([^"']+)["']|([^\\s>]+))`,
            "i"
          ));
          return decode(match?.[1] || match?.[2] || "");
        };
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

    const jsonLdBlocks = allMatches(html, /<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
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
      return {
        name: typeof product?.name === "string" ? product.name.trim() : "",
        hasImage: Boolean(product?.image),
        sku: typeof product?.sku === "string" ? product.sku.trim() : "",
        offers: normalizedOffers,
      };
    });
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
    const hasContactSignal = /\b(contact|contacteer|e-mail|email|telefoon|phone|adres|address)\b/i.test(text);
    const hasAboutSignal = /\b(over ons|about us|over bedrijf|about)\b/i.test(text);
    const organizationName = firstMatch(html, /<meta[^>]+(?:property|name)\s*=\s*["'](?:og:site_name|application-name)["'][^>]+content\s*=\s*["']([^"']+)["']/i);
    const sameAsCount = (html.match(/"sameAs"\s*:/gi) || []).length;
    const pathname = finalUrl.pathname.replace(/\/+$/, "") || "/";
    const isHomepage = pathname === "/";
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
    const hasServiceExpertiseSignal = /\b(diensten|services|service|specialist|specialisten|expert|expertise|behandeling|behandelingen|hair|haar|knippen|kleur|color|styling|restaurant|keuken|cuisine|tandarts|elektricien|loodgieter|aannemer|dakdekker)\b/i.test(text);
    const hasProductSignal = hasProductSchema || /\b(add to cart|add-to-cart|winkelwagen|shopping cart|sku|price|availability|in stock)\b/i.test(text);
    const hasArticleSignal = schemaSet.has("article") || schemaSet.has("newsarticle") || /<article\b/i.test(html);
    const hasItemListSignal = schemaSet.has("itemlist");
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
    const recommendedSchema = hasLocalBusinessSignal ? specificLocalSchema || "LocalBusiness" : hasProductSignal ? "Product" : hasArticleSignal ? "Article" : hasItemListSignal ? "ItemList" : isHomepage ? "Organization + WebSite" : "WebPage";
    const schemaContextLabel = hasLocalBusinessSignal ? "lokale bedrijfs-/dienstpagina" : hasProductSignal ? "product-/e-commercepagina" : hasArticleSignal ? "artikel-/nieuwspagina" : hasItemListSignal ? "lijst-/categoriepagina" : isHomepage ? "homepage" : "contentpagina";
    const businessName = organizationName || (title.split(/[|–—-]/)[0] || "").trim();
    const phoneMatch = text.match(/(?:\\+31\\s?6|0)[\\d\\s().-]{8,}/);
    const emailMatch = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}/i);
    const addressMatch = text.match(/\\b([^,]{3,60}\\s+\\d+[A-Za-z]?)\\s+(\\d{4}\\s?[A-Z]{2})\\s+([A-Za-zÀ-ÿ' -]{2,40})\\b/);
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
    let robotsDeclaredSitemapUrl: string | null = null;
    let confirmedSitemapUrl: string | null = null;
    try {
      const r = (await safePublicFetch(robotsUrl, { timeoutMs: 5000, maxRedirects: 2, userAgent: "RankFixBot/2.1 (+https://rankfix-app.onrender.com)", accept: "text/plain,application/xml,text/xml" })).response;
      if (r.ok) {
        robotsTxt = await r.text();
        robotsStatus = "PASS";
        const declared = robotsTxt.match(/^\s*Sitemap\s*:\s*(\S+)/im)?.[1];
        if (declared) robotsDeclaredSitemapUrl = new URL(declared, finalUrl).toString();
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
    const matchingRobotsRules = applicableRobotsGroups
      .flatMap((group) => group.rules)
      .filter((rule) => rule.path && robotsPath.startsWith(rule.path.replace(/\*.*$/, "")))
      .sort((a, b) => b.path.length - a.path.length);
    const robotsPathBlocked = robotsStatus === "PASS" && matchingRobotsRules.length > 0 && matchingRobotsRules[0].kind === "disallow";
    const sitemapCandidates = [...new Set([robotsDeclaredSitemapUrl, sitemapUrl.toString()].filter(Boolean) as string[])];
    let sitemapFetchFailed = false;
    for (const candidate of sitemapCandidates) {
      try {
        const r = (await safePublicFetch(new URL(candidate), { timeoutMs: 5000, maxRedirects: 2, userAgent: "RankFixBot/2.1 (+https://rankfix-app.onrender.com)", accept: "text/plain,application/xml,text/xml" })).response;
        sitemapFetchCompleted = true;
        if (r.ok && /xml|text\/xml/i.test(r.headers.get("content-type") || "")) {
          sitemapFound = true;
          sitemapStatus = "PASS";
          confirmedSitemapUrl = candidate;
          break;
        }
        if (r.status === 404) sitemapStatus = "FAIL";
      } catch { sitemapFetchFailed = true; }
    }
    if (!sitemapFound && sitemapFetchCompleted && !sitemapFetchFailed && sitemapStatus === "UNABLE_TO_CONFIRM") sitemapStatus = "FAIL";
    if (!sitemapFound && sitemapFetchFailed) sitemapStatus = "UNABLE_TO_CONFIRM";
    const robotsMentionsSitemap = Boolean(robotsDeclaredSitemapUrl);

    const seoChecks: Check[] = [];
    const geoChecks: Check[] = [];

    // Extended audit signals: trust, ecommerce quality, URL hygiene, social metadata and multilingual SEO.
    const placeholderMatches = text.match(/\[(?:kvk|btw|adres|e-?mail|email|telefoon|phone|address|postcode|plaats|company|naam)\]/gi) || [];
    const hasPlaceholders = placeholderMatches.length > 0;
    const dutchEuroDecimalPattern = /€\s?\d{1,3}(?:[.,]\d{3})*[.]\d{2}\b/g;
    const priceFormatMatches = text.match(dutchEuroDecimalPattern) || [];
    const hasDotDecimalPrices = priceFormatMatches.length > 0;
    const visiblePriceCandidates = [...new Set(
      [...text.matchAll(/(?:€\s*|EUR\s*)(\d{1,6}(?:[.,]\d{2})?)/gi)]
        .map((match) => Number(String(match[1]).replace(/\./g, "").replace(",", ".")))
        .filter((value) => Number.isFinite(value))
    )].slice(0, 20);
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
    const visibleStockSignal = /\b(op voorraad|voorraad|in stock|out of stock|uitverkocht|sold out|pre-?order|backorder|niet op voorraad)\b/i.test(text);
    const structuredAvailabilityValues = [...new Set(productOfferEvidence.flatMap((product) => product.offers.map((offer) => offer.availability).filter(Boolean)))];
    const hasVariantSelectorSignal = hasProductSignal && /<(?:select|button)[^>]*(?:name|id|class)\s*=\s*["'][^"']*(?:variant|size|maat|color|colour|kleur)[^"']*["']/i.test(html);
    const pathSegments = finalUrl.pathname.split("/").filter(Boolean).map((segment) => decodeURIComponent(segment).toLowerCase().trim());
    const duplicatePathSegments = pathSegments.filter((segment, index) => index > 0 && segment === pathSegments[index - 1]);
    const hasDuplicatePathSegments = duplicatePathSegments.length > 0;
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
    const hasVisibleHtmlEscape = /&amp;/.test(text);
    const hreflangTags = [...html.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]).filter((tag) => /\brel\s*=\s*["']alternate["']/i.test(tag) && /\bhreflang\s*=/i.test(tag));
    const hreflangValues = hreflangTags.map((tag) => attrFromTag(tag, "hreflang").toLowerCase()).filter(Boolean);
    const hasHreflang = hreflangValues.length > 0;
    const languageSelectorSignal = /(?:language|taal|sprache|idioma|lingua|français|deutsch|italiano|español|english|nederlands)\b/i.test(text) && /(?:select|dropdown|menu|switch|\bEN\b|\bNL\b|\bDE\b|\bFR\b|\bES\b|\bIT\b)/i.test(text);
    const organizationSchemaPresent = schemaSet.has("organization");
    const websiteSchemaPresent = schemaSet.has("website");
    const productSchemaPresent = schemaSet.has("product");
    const adsTrackingSignals = [
      /googletagmanager\.com\/gtm\.js/i.test(html),
      /gtag\s*\(|googletag\s*\(/i.test(html),
      /google[-_ ]?analytics|\bG-[A-Z0-9]{6,}\b/i.test(html),
      /google_adservices|googleads\.g\.doubleclick|\bAW-[0-9-]+\b/i.test(html),
    ].filter(Boolean).length;
    const ga4MeasurementIds = [...new Set(html.match(/\bG-[A-Z0-9]{6,}\b/gi) || [])];
    const googleAdsIds = [...new Set(html.match(/\bAW-[0-9-]+\b/gi) || [])];
    const hasGa4 = ga4MeasurementIds.length > 0 || /google[-_ ]?analytics/i.test(html);
    const hasGoogleAdsTag = googleAdsIds.length > 0 || /google_adservices|googleads\.g\.doubleclick/i.test(html);
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
    const hasShippingSignal = hasStructuredShipping || /verzendkosten|verzending|levering|shipping|delivery|bezorging|ophalen|afhalen/i.test(text);
    const hasReturnsSignal = hasStructuredReturns || /retour|herroepingsrecht|14\s*dagen|bedenktijd|return policy|refund/i.test(text);
    const hasReviewPlatformSignal = /trustpilot|kiyoh|google reviews|reviews?\.io/i.test(text);
    const hasCheckoutTrustSignal = /checkout|afrekenen|ideal|iDEAL|visa|mastercard|bancontact|klarna|mollie|pay\s*pal|secure payment|veilig betalen/i.test(text);
    const ecommerceVariantUrlSignal = hasProductSignal && /[?&](variant|sku|color|colour|size|maat)=/i.test(finalUrl.search);
    const webshopClaimMatches = text.match(/(?:snelle levering|14\s*dagen retour|gratis verzending|nederlandse webshop|voor\s*\d+\s*uur\s*besteld)/gi) || [];
    const hasWebshopClaims = webshopClaimMatches.length > 0;

    const titleWords = title.toLowerCase().split(/[^a-z0-9à-ÿ]+/i).filter(Boolean);
    const titleUniqueWordRatio = titleWords.length ? new Set(titleWords).size / titleWords.length : 1;
    const descriptionWords = description.toLowerCase().split(/[^a-z0-9à-ÿ]+/i).filter(Boolean);
    const descriptionUniqueWordRatio = descriptionWords.length ? new Set(descriptionWords).size / descriptionWords.length : 1;
    const titleQualityIssue = Boolean(title && titleWords.length >= 3 && titleUniqueWordRatio < 0.55);
    const descriptionQualityIssue = Boolean(description && descriptionWords.length >= 8 && descriptionUniqueWordRatio < 0.5);


    seoChecks.push(
      !title
        ? check("fail", "title", "seo", "Meta title", "Er is geen meta title gevonden.", "Voeg een unieke, beschrijvende title toe.", 0, 10)
        : titleQualityIssue
          ? check("warning", "title", "seo", "Meta title", `De title is ${title.length} tekens, maar bevat relatief veel herhaalde woorden.`, "Herschrijf de title natuurlijker en voorkom keyword stuffing.", 6, 10)
          : title.length >= 30 && title.length <= 60
            ? check("pass", "title", "seo", "Meta title", `De title is ${title.length} tekens en valt binnen de aanbevolen lengte.`, "Maak de title uniek, duidelijk en relevant voor de zoekintentie.", 10, 10)
            : check("warning", "title", "seo", "Meta title", `De title is ${title.length} tekens. Richtwaarde: 30–60 tekens.`, "Herschrijf de title zodat onderwerp, merk en zoekintentie direct duidelijk zijn.", 6, 10)
    );
    seoChecks.push(
      !description
        ? check("fail", "description", "seo", "Meta description", "Er is geen meta description gevonden.", "Laat RankFix AI een nieuwe meta description maken op basis van de pagina.", 0, 10)
        : descriptionQualityIssue
          ? check("warning", "description", "seo", "Meta description", `De description is ${description.length} tekens, maar bevat relatief veel herhaalde woorden.`, "Maak de description natuurlijker en voorkom keyword stuffing.", 6, 10)
          : description.length >= 120 && description.length <= 160
            ? check("pass", "description", "seo", "Meta description", `De description is ${description.length} tekens en goed gevuld.`, "Houd de belofte concreet en voeg een duidelijke call-to-action toe.", 10, 10)
            : check("warning", "description", "seo", "Meta description", `De description is ${description.length} tekens. Richtwaarde: 120–160 tekens.`, "Maak de description concreet, uniek en passend bij de zoekintentie.", 6, 10)
    );
    seoChecks.push(h1s.length === 1
      ? check("pass", "h1", "seo", "H1-heading", "Er is precies één H1-heading gevonden.", "Behoud één duidelijke primaire H1.", 8, 8)
      : h1s.length === 0
        ? check("fail", "h1", "seo", "H1-heading", "Er is geen H1-heading gevonden.", "Voeg één H1 toe die het hoofdonderwerp van de pagina beschrijft.", 0, 8)
        : check("warning", "h1", "seo", "H1-heading", `Er zijn ${h1s.length} H1-headings gevonden.`, "Maak de hoofdstructuur duidelijk met één primaire H1.", 4, 8)
    );
    seoChecks.push(headings.length && headings.some((h) => h.level === 2)
      ? check("pass", "headings", "seo", "Heading-structuur", `Er zijn ${headings.length} H2–H6 headings gevonden naast de H1.`, "Gebruik headings om onderwerpen en subonderwerpen logisch te groeperen.", 7, 7)
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
      return normalized.toString();
    };

    const canonicalTarget = canonicalUrl ? normalizeCanonicalTarget(canonicalUrl) : "";
    const currentTarget = normalizeCanonicalTarget(finalUrl);
    const canonicalIsSelf = Boolean(canonicalUrl && canonicalTarget === currentTarget);
    const canonicalIsCrossDomain = Boolean(canonicalUrl && canonicalUrl.hostname !== finalUrl.hostname);
    const criticalCanonicalIssue = canonicalIsCrossDomain;
    const canonicalDropsQuery = Boolean(canonicalUrl && finalUrl.search && !canonicalUrl.search);

    seoChecks.push(
      canonicalInvalid
        ? check("fail", "canonical", "seo", "Canonical URL", `Er is een canonical gevonden, maar de waarde is geen geldige URL: "${canonical}".`, "Corrigeer de canonical naar één geldige absolute of relatieve voorkeurs-URL.", 0, 7)
        : !canonicalUrl
          ? check("warning", "canonical", "seo", "Canonical URL", "Geen canonical URL gevonden.", "Voeg een self-referencing canonical toe wanneer passend.", 3, 7)
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
      ? check("pass", "alt", "seo", "Afbeelding alt-teksten", `Alle ${imageElementCount} gevonden afbeeldingselementen hebben alt-attributen.`, "Schrijf beschrijvende alt-teksten voor informatieve afbeeldingen.", 7, 7)
      : check("warning", "alt", "seo", "Afbeelding alt-teksten", `${imagesMissingAlt} van ${imageElementCount} gevonden afbeeldingselementen missen alt.`, "Voeg beschrijvende alt-teksten toe waar ze betekenis toevoegen.", 3, 7)
    );
    const contentContext = hasProductSignal ? "productpagina" : hasItemListSignal ? "categorie-/lijstpagina" : hasArticleSignal ? "artikelpagina" : isHomepage ? "homepage" : "contentpagina";
    const contentMinimumSignal = hasProductSignal ? 80 : hasItemListSignal ? 120 : isHomepage ? 150 : hasArticleSignal ? 300 : 200;
    const contentStrongSignal = hasProductSignal ? 180 : hasItemListSignal ? 220 : isHomepage ? 250 : hasArticleSignal ? 600 : 350;
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
    seoChecks.push(ogTitle && ogDescription && ogImage
      ? check("pass", "social", "seo", "Social metadata", "Open Graph title, description en image zijn aanwezig.", "Controleer social previews voor belangrijke pagina's.", 4, 4)
      : check("warning", "social", "seo", "Social metadata", "Niet alle belangrijke Open Graph velden zijn gevonden.", "Voeg og:title, og:description en og:image toe.", 2, 4)
    );
    seoChecks.push(robotsStatus === "PASS"
      ? robotsPathBlocked
        ? check("warning", "robots_txt", "seo", "robots.txt", `robots.txt is bereikbaar, maar blokkeert het gescande pad via Disallow: ${matchingRobotsRules[0].path}.`, "Controleer of deze blokkade bewust is.", 1, 4)
        : check("pass", "robots_txt", "seo", "robots.txt", "robots.txt is bereikbaar en bevat geen toepasselijke blokkade voor het gescande pad.", "Houd crawlregels bewust en controleer belangrijke publieke pagina's.", 4, 4)
      : robotsStatus === "FAIL"
        ? check("not_applicable", "robots_txt", "seo", "robots.txt", "robots.txt gaf 404 terug. Het ontbreken van robots.txt blokkeert crawlers op zichzelf niet en kost daarom geen SEO-punten.", "Publiceer robots.txt alleen wanneer je crawlregels of sitemapverwijzingen wilt beheren.", 0, 4)
        : check("unable_to_confirm", "robots_txt", "seo", "robots.txt", "RankFix kon robots.txt tijdens deze scan niet betrouwbaar ophalen.", "Probeer opnieuw wanneer de server bereikbaar is.", 0, 4)
    );
    seoChecks.push(sitemapFound
      ? check("pass", "sitemap", "seo", "Sitemap-signaal", `Een bereikbare XML sitemap is gevonden${confirmedSitemapUrl ? `: ${confirmedSitemapUrl}` : "."}`, "Controleer of de sitemap alleen canonieke, indexeerbare URL's bevat.", 4, 4)
      : sitemapStatus === "FAIL"
        ? check("warning", "sitemap", "seo", "Sitemap-signaal", robotsMentionsSitemap ? "robots.txt verwijst naar een sitemap, maar RankFix kon geen geldige bereikbare XML sitemap bevestigen." : "Geen geldige bereikbare XML sitemap gevonden.", "Controleer de sitemap-URL, HTTP-status en XML content-type.", 1, 4)
        : check("unable_to_confirm", "sitemap", "seo", "Sitemap-signaal", robotsMentionsSitemap ? "robots.txt bevat een sitemapverwijzing, maar RankFix kon de sitemap tijdens deze scan niet betrouwbaar ophalen." : "RankFix kon tijdens deze scan niet betrouwbaar bevestigen of een sitemap beschikbaar is.", "Controleer de sitemap opnieuw wanneer de server bereikbaar is.", 0, 4)
    );

    geoChecks.push(
      hasLocalBusinessSignal
        ? hasRelevantLocalSchema
          ? check("pass", "schema", "geo", "Structured data", `${validJsonLd} geldige JSON-LD block(s) met passend lokaal bedrijfstype gevonden voor deze ${schemaContextLabel}.`, `Behoud het meest specifieke passende type: ${recommendedSchema}. Controleer verplichte en relevante velden.`, 12, 12)
          : validJsonLd > 0
            ? check("warning", "schema", "geo", "Structured data", `${validJsonLd} geldige JSON-LD block(s) gevonden, maar geen passend LocalBusiness-subtype.`, `Gebruik voor deze lokale pagina het meest specifieke passende type: ${recommendedSchema}, met alleen gegevens die zichtbaar en aantoonbaar zijn.`, 6, 12)
            : check("fail", "schema", "geo", "Structured data", `Geen geldige JSON-LD structured data gevonden voor deze ${schemaContextLabel}.`, `Voeg relevante schema.org JSON-LD toe. Voor dit paginatype is ${recommendedSchema} de belangrijkste richting; gebruik alleen typen die echt bij de zichtbare content passen.`, 0, 12)
        : validJsonLd > 0
          ? hasEntitySchema
            ? check("pass", "schema", "geo", "Structured data", `${validJsonLd} geldige JSON-LD block(s) met een herkenbaar inhoudelijk schema-type gevonden voor deze ${schemaContextLabel}.`, `Controleer of het schema inhoudelijk overeenkomt met de pagina. Relevante hoofdkeuze: ${recommendedSchema}.`, 12, 12)
            : check("warning", "schema", "geo", "Structured data", `${validJsonLd} geldige JSON-LD block(s) gevonden, maar geen herkenbaar Organization, WebSite, Person, Product of Article-type dat deze pagina inhoudelijk beschrijft.`, `Gebruik structured data die aantoonbaar bij het paginatype past. Relevante hoofdkeuze: ${recommendedSchema}.`, 6, 12)
          : check("fail", "schema", "geo", "Structured data", `Geen geldige JSON-LD structured data gevonden voor deze ${schemaContextLabel}.`, `Voeg relevante schema.org JSON-LD toe. Voor dit paginatype is ${recommendedSchema} de belangrijkste richting; gebruik alleen typen die echt bij de zichtbare content passen.`, 0, 12)
    );
    seoChecks.push(twitterCard === "summary_large_image"
      ? check("pass", "twitter_card", "seo", "Twitter Card", "summary_large_image is ingesteld voor rijke social previews.", "Gebruik summary_large_image wanneer een grote social afbeelding beschikbaar is.", 3, 3)
      : twitterCard
        ? check("warning", "twitter_card", "seo", "Twitter Card", `Twitter Card is ingesteld als "${twitterCard}".`, "Gebruik summary_large_image met een passende og:image voor rijke previews.", 2, 3)
        : check("warning", "twitter_card", "seo", "Twitter Card", "Geen twitter:card gevonden.", "Voeg twitter:card=summary_large_image toe voor gedeelde links.", 1, 3)
    );

    seoChecks.push(!languageSelectorSignal
      ? check("not_applicable", "hreflang", "seo", "Meertalige SEO", "Geen duidelijke meertalige pagina-indicatie gevonden; RankFix telt hreflang daarom niet mee in de score.", "Gebruik hreflang wanneer dezelfde content in meerdere talen/URL's beschikbaar is.", 0, 5)
      : hasHreflang
      ? check("pass", "hreflang", "seo", "Meertalige SEO", `${hreflangTags.length} hreflang-link(s) gevonden.`, "Controleer ook wederkerigheid, taal-/regiocodes en x-default waar passend.", 5, 5)
      : check("warning", "hreflang", "seo", "Meertalige SEO", "De pagina lijkt meerdere talen aan te bieden, maar er zijn geen hreflang-verwijzingen gevonden.", "Voeg voor elke taalversie en eventueel x-default correcte hreflang-links toe.", 2, 5)
    );

    seoChecks.push(hasDuplicatePathSegments
      ? check("warning", "duplicate_path", "seo", "URL-structuur", `Dubbele padsegmenten gevonden: ${[...new Set(duplicatePathSegments)].join(", ")}.`, "Maak de URL-structuur logisch en redirect oude dubbele URL's met een permanente 301 naar de definitieve URL.", 2, 5)
      : check("pass", "duplicate_path", "seo", "URL-structuur", "Geen direct dubbele opeenvolgende padsegmenten gevonden.", "Houd URL's kort, logisch en stabiel.", 5, 5)
    );

    seoChecks.push(hasVisibleHtmlEscape
      ? check("warning", "html_escape", "seo", "Tekstweergave", "Mogelijk HTML-escaped tekst zoals &amp; lijkt zichtbaar in de inhoud.", "Controleer rendering en encoding zodat bezoekers gewone leestekens zien.", 2, 4)
      : check("pass", "html_escape", "seo", "Tekstweergave", "Geen duidelijke zichtbare HTML-escape-fout gevonden.", "Behoud correcte HTML-encoding.", 4, 4)
    );

    seoChecks.push(hasExternalImageHotlinks
      ? hasStockImages
        ? check("warning", "image_sources", "seo", "Afbeeldingsbronnen", `${stockImageUrls.length} afbeelding(en) lijken rechtstreeks van externe stocksites te worden geladen.`, "Gebruik waar mogelijk eigen product-/merkafbeeldingen en host publieke assets op het eigen domein.", 2, 5)
        : check("warning", "image_sources", "seo", "Afbeeldingsbronnen", `${externalImageUrls.length} afbeelding(en) worden extern geladen.`, "Controleer rechten, beschikbaarheid en prestaties; host belangrijke eigen assets bij voorkeur zelf.", 3, 5)
      : check("pass", "image_sources", "seo", "Afbeeldingsbronnen", "Geen externe afbeeldings-hotlinks gevonden.", "Gebruik eigen, geoptimaliseerde afbeeldingen voor belangrijke content.", 5, 5)
    );

    seoChecks.push(hasPlaceholders
      ? check("fail", "business_placeholders", "seo", "Bedrijfsgegevens", `Er staan nog ${placeholderMatches.length} placeholder(s) zoals ${placeholderMatches.slice(0, 4).join(", ")} op de pagina.`, "Vervang placeholders door echte bedrijfs- en contactgegevens voordat de site live gaat.", 0, 6)
      : check("pass", "business_placeholders", "seo", "Bedrijfsgegevens", "Geen bekende bedrijfsgegevens-placeholders gevonden.", "Houd bedrijfs- en contactgegevens actueel en consistent.", 6, 6)
    );

    seoChecks.push(!hasProductSignal
      ? check("not_applicable", "price_format", "seo", "Prijsnotatie", "Geen duidelijke webshop/product-signalen gevonden; prijsnotatie is niet beoordeeld.", "Gebruik deze controle op echte product- en e-commercepagina's.", 0, 5)
      : !hasDotDecimalPrices
      ? check("pass", "price_format", "seo", "Prijsnotatie", "Geen duidelijke Nederlandse europrijs met punt als decimaalteken gevonden.", "Gebruik per taal/regio een passende valuta- en getalnotatie.", 5, 5)
      : check("warning", "price_format", "seo", "Prijsnotatie", `${priceFormatMatches.length} prijsnotatie(s) gebruikt een punt als decimaalteken, zoals ${priceFormatMatches[0]}.`, "Gebruik voor Nederlandse content bijvoorbeeld € 129,95 en formatteer prijzen met locale-aware formatting.", 2, 5)
    );

    seoChecks.push(hasProductSignal
      ? hasShippingSignal && hasReturnsSignal && (hasReviewPlatformSignal || hasCheckoutTrustSignal)
        ? check("pass","webshop_trust","seo","Webshop vertrouwen","Verzend-/retourinformatie en minimaal één duidelijk vertrouwenssignaal zijn zichtbaar.","Houd verzendkosten, retourvoorwaarden, betaalmethoden en reviews ook op checkout-niveau duidelijk.",7,7)
        : check("warning","webshop_trust","seo","Webshop vertrouwen","Niet alle belangrijke verzend-, retour- en vertrouwenssignalen zijn zichtbaar op deze pagina.","Maak verzendkosten, retourvoorwaarden, betaalmogelijkheden en review-/vertrouwenssignalen duidelijk voordat bezoekers afrekenen.",3,7)
      : check("not_applicable","webshop_trust","seo","Webshop vertrouwen","Geen duidelijke webshop-signalen gevonden; deze e-commercecontrole is niet van toepassing.","Gebruik deze controle op product- en categoriepagina's.",0,7));
    seoChecks.push(!hasProductSignal
      ? check("not_applicable","variant_url","seo","Productvariant-URL","Geen duidelijke productpagina-signalen gevonden; variant-URL-controle is niet van toepassing.","Gebruik deze controle op echte productpagina's.",0,5)
      : ecommerceVariantUrlSignal
        ? check("warning","variant_url","seo","Productvariant-URL","Deze product-URL bevat een variant-/SKU-parameter. Dat kan duplicate URL's en indexatieproblemen veroorzaken.","Gebruik bij varianten een duidelijke canonical, stabiele URL-strategie en indexeer alleen pagina's die zelfstandig waarde hebben.",2,5)
        : hasVariantSelectorSignal
          ? check("unable_to_confirm","variant_url","seo","Productvariant-URL","Er zijn variantkeuzes op de productpagina gevonden, maar uit statische HTML kan RankFix niet bevestigen hoe elke variant-URL en canonical zich gedraagt.","Controleer variant-URL's runtime en indexeer alleen varianten die zelfstandig zoekwaarde hebben.",0,5)
          : check("not_applicable","variant_url","seo","Productvariant-URL","Geen variantparameter of duidelijke variantselector gevonden; er is geen variantprobleem aantoonbaar.","Controleer opnieuw wanneer dit product varianten krijgt.",0,5));
    seoChecks.push(!hasProductSignal
      ? check("not_applicable","product_price_consistency","seo","Productprijs consistentie","Geen duidelijke productpagina-signalen gevonden; prijsvergelijking is niet van toepassing.","Gebruik deze controle op echte productpagina's.",0,6)
      : !visiblePriceCandidates.length || !structuredPriceCandidates.length
        ? check("unable_to_confirm","product_price_consistency","seo","Productprijs consistentie","RankFix kan niet zowel een zichtbare EUR-prijs als een structured-data prijs aantoonbaar vergelijken.","Zorg dat de zichtbare productprijs en Product/Offer structured data beide beschikbaar en gelijk zijn.",0,6)
        : hasMatchingVisibleStructuredPrice
          ? check("pass","product_price_consistency","seo","Productprijs consistentie","Minimaal één zichtbare productprijs komt exact overeen met een Product/Offer structured-data prijs.","Houd zichtbare prijs en structured data synchroon bij prijswijzigingen.",6,6)
          : check("warning","product_price_consistency","seo","Productprijs consistentie",`Zichtbare prijswaarden (${visiblePriceCandidates.slice(0,4).join(", ")}) komen niet overeen met gevonden structured-data prijzen (${structuredPriceCandidates.slice(0,4).join(", ")}).`,"Controleer welke prijs bij dit product hoort en synchroniseer de zichtbare prijs met Product/Offer structured data.",2,6));
    seoChecks.push(!hasProductSignal
      ? check("not_applicable","product_availability","seo","Productvoorraad","Geen duidelijke productpagina-signalen gevonden; voorraadcontrole is niet van toepassing.","Gebruik deze controle op echte productpagina's.",0,5)
      : structuredAvailabilityValues.length
        ? check("pass","product_availability","seo","Productvoorraad",`Structured availability gevonden: ${structuredAvailabilityValues.slice(0,3).join(", ")}.`,visibleStockSignal ? "Houd zichtbare voorraadstatus en structured availability synchroon." : "Toon de voorraadstatus ook duidelijk aan bezoekers.",5,5)
        : visibleStockSignal
          ? check("warning","product_availability","seo","Productvoorraad","Een zichtbare voorraadstatus is gevonden, maar geen Offer availability in structured data.","Voeg de aantoonbare voorraadstatus toe aan Product/Offer structured data.",2,5)
          : check("unable_to_confirm","product_availability","seo","Productvoorraad","Geen betrouwbare zichtbare of structured voorraadstatus gevonden.","Maak voorraadstatus expliciet op productpagina en in Offer structured data.",0,5));
        seoChecks.push(!hasProductSignal || !hasWebshopClaims
      ? check("not_applicable","webshop_claims","seo","Webshop-beloftes",!hasProductSignal ? "Geen duidelijke webshop/product-signalen gevonden; claimcontrole is niet van toepassing." : "Geen specifieke verzend-/retourbelofte gevonden om te verifiëren.","Maak commerciële claims controleerbaar wanneer je ze gebruikt.",0,5)
      : hasShippingSignal && hasReturnsSignal
        ? check("pass","webshop_claims","seo","Webshop-beloftes","Belangrijke webshopbeloftes worden ondersteund door zichtbare verzend- en retourinformatie.","Zorg dat beloofde levertijden, retourtermijnen en verzendvoorwaarden juridisch en praktisch kloppen.",5,5)
        : check("warning","webshop_claims","seo","Webshop-beloftes",`De pagina bevat claims zoals ${webshopClaimMatches.slice(0,3).join(", ")}, maar de bijbehorende voorwaarden zijn niet duidelijk gevonden.`,"Maak claims controleerbaar via duidelijke verzend-, retour- en voorwaardenpagina's.",2,5));
    seoChecks.push(hasProductSignal
      ? check(hasCheckoutTrustSignal?"pass":"warning","checkout_trust","seo","Checkout- en betaalvertrouwen",hasCheckoutTrustSignal?"Betaal-/checkoutsignalen zijn zichtbaar.":"Geen duidelijke betaal- of checkoutsignalen gevonden op deze pagina.","Toon betaalmogelijkheden en relevante veiligheids-/vertrouwensinformatie waar de bezoeker een aankoopbeslissing neemt.",hasCheckoutTrustSignal?5:2,5)
      : check("not_applicable","checkout_trust","seo","Checkout- en betaalvertrouwen","Geen webshop-signalen gevonden; checkoutcontrole is niet van toepassing.","Gebruik deze controle op echte webshopcontent.",0,5));
    seoChecks.push(
      hasGoogleAdsTag && hasGa4 && (hasConversionSignal || hasExplicitAdsConversionSnippet)
        ? check("unable_to_confirm","ads_readiness","seo","Google Ads readiness",`Google Ads-tag${googleAdsIds.length ? ` (${googleAdsIds.join(", ")})` : ""}, GA4${ga4MeasurementIds.length ? ` (${ga4MeasurementIds.join(", ")})` : ""} en expliciete conversiecode zijn in de publieke bron gevonden. Events: ${uniqueConversionEventNames.slice(0,5).join(", ") || "geen naam gevonden"}; Ads send_to: ${googleAdsSendToLabels.length}; consent-signaal: ${hasConsentModeSignal ? "gevonden" : "niet aangetoond"}. Dit bewijst nog niet dat tags runtime afvuren of conversies door Google worden ontvangen.`,"Verifieer met Tag Assistant/Preview en controleer daarna ontvangen events en consentstatus in GA4/Google Ads.",0,6)
        : adsTrackingSignals > 0 || hasConversionSignal || hasExplicitAdsConversionSnippet
          ? check("unable_to_confirm","ads_readiness","seo","Google Ads readiness",`Trackingcode is gedeeltelijk aangetroffen. Ads-ID's: ${googleAdsIds.length}; GA4-ID's: ${ga4MeasurementIds.length}; expliciete events: ${uniqueConversionEventNames.length}; Ads conversion labels: ${googleAdsSendToLabels.length}; consent-signaal: ${hasConsentModeSignal ? "gevonden" : "niet aangetoond"}.`,"Maak de meetketen compleet en verifieer Google tag, GA4, Ads-conversies en consent runtime.",0,6)
          : check("not_applicable","ads_readiness","seo","Google Ads readiness","Geen publieke Google Ads/GA4-signalen gevonden. Dat bewijst niet dat tracking ontbreekt of dat deze site Google Ads gebruikt.","Beoordeel Ads readiness alleen wanneer advertentietracking voor deze site daadwerkelijk van toepassing is.",0,6));
    geoChecks.push(isHomepage
      ? organizationSchemaPresent && websiteSchemaPresent
        ? check("pass", "organization_website", "geo", "Organization + WebSite", "Organization en WebSite structured data zijn aanwezig op de homepage.", "Houd naam, URL en logo consistent met de zichtbare site-identiteit.", 8, 8)
        : check("warning", "organization_website", "geo", "Organization + WebSite", "De homepage mist Organization en/of WebSite structured data.", "Voeg passende Organization- en WebSite JSON-LD toe zonder gegevens te verzinnen.", 3, 8)
      : check("not_applicable", "organization_website", "geo", "Organization + WebSite", "Homepage-specifieke Organization/WebSite-controle is niet vereist op deze URL.", "Controleer de homepage afzonderlijk voor organisatie- en website-identiteit.", 0, 8)
    );

    geoChecks.push(hasProductSignal
      ? productSchemaPresent
        ? hasCompleteProductOffer
          ? check("pass", "product_schema", "geo", "Product structured data", "Product JSON-LD bevat aantoonbaar productnaam, afbeelding en Offer-data met prijs, valuta en beschikbaarheid.", "Houd structured data gelijk aan de zichtbare productinformatie en controleer wijzigingen opnieuw.", 8, 8)
          : check("warning", "product_schema", "geo", "Product structured data", "Product JSON-LD is aanwezig, maar RankFix vindt geen compleet Product/Offer-bewijs met productnaam, afbeelding, prijs, valuta en beschikbaarheid.", "Vul alleen aantoonbare Product/Offer-velden aan en laat structured data overeenkomen met de zichtbare productpagina.", 4, 8)
        : check("warning", "product_schema", "geo", "Product structured data", "De pagina lijkt product-/e-commercecontent te bevatten, maar Product JSON-LD ontbreekt.", "Voeg Product structured data toe met alleen gegevens die zichtbaar en aantoonbaar zijn.", 3, 8)
      : check("not_applicable", "product_schema", "geo", "Product structured data", "Geen duidelijke productpagina-signalen gevonden; Product schema is hier niet van toepassing.", "Gebruik Product schema op echte productpagina's.", 0, 8)
    );

    geoChecks.push(hasEntitySchema
      ? check("pass", "entity", "geo", "Entity-signalen", `Entity schema gevonden: ${schemaTypes.slice(0, 5).join(", ")}.`, "Maak organisatie, product, persoon of publicatie nog duidelijker met consistente gegevens.", 10, 10)
      : hasVisibleBusinessIdentity && (hasBusinessContactDetails || hasSocialOrReviewSignal)
        ? check("pass", "entity", "geo", "Entity-signalen", "Duidelijke bedrijfsidentiteit en externe/contactsignalen zijn zichtbaar op de pagina.", "Maak de identiteit ook machineleesbaar met passende Organization/LocalBusiness structured data.", 8, 10)
        : hasVisibleBusinessIdentity
          ? check("warning", "entity", "geo", "Entity-signalen", "Een bedrijfsidentiteit is zichtbaar, maar aanvullende contact- of externe profielsignalen zijn beperkt.", "Maak de organisatie-identiteit concreter met contactgegevens, officiële profielen en passende schema.org data.", 6, 10)
          : check("warning", "entity", "geo", "Entity-signalen", "Er is weinig expliciete entity-informatie gevonden.", "Definieer de organisatie/brand en relevante entiteiten met schema.org.", 4, 10)
    );
    geoChecks.push(isHomepage
      ? check("not_applicable", "breadcrumbs", "geo", "Breadcrumbs", "Op de homepage is BreadcrumbList normaal niet nodig; deze controle telt daarom niet mee.", "Gebruik BreadcrumbList vooral op diepe content-, categorie- en productpagina's.", 0, 6)
      : hasBreadcrumb
        ? check("pass", "breadcrumbs", "geo", "Breadcrumbs", "BreadcrumbList structured data is aanwezig.", "Houd breadcrumbs gelijk aan de zichtbare navigatiestructuur.", 6, 6)
        : check("warning", "breadcrumbs", "geo", "Breadcrumbs", "Geen BreadcrumbList schema gevonden op deze diepere pagina.", "Voeg BreadcrumbList toe wanneer de pagina onderdeel is van een duidelijke hiërarchische navigatie.", 2, 6)
    );
    geoChecks.push(hasFaqContent || hasFaqSchema
      ? check("pass", "faq", "geo", "Vraag & antwoord content", "FAQ/Q&A-signalen zijn op de pagina gevonden.", "Beantwoord echte klantvragen kort, concreet en zonder marketingtaal.", 10, 10)
      : check("warning", "faq", "geo", "Vraag & antwoord content", "Geen duidelijke FAQ/Q&A-sectie gevonden.", "Voeg relevante vragen en directe antwoorden toe waar dat de gebruiker helpt.", 4, 10)
    );
    const ecommerceExpertiseSignal = hasProductSignal && (
      hasOrganizationIdentity ||
      schemaSet.has("brand") ||
      organizationName ||
      hasBusinessContactDetails ||
      hasSocialOrReviewSignal
    );
    geoChecks.push(hasAuthorSignal || (hasLocalBusinessSignal && hasServiceExpertiseSignal)
      ? check("pass", "author", "geo", "Expertise-signalen", hasAuthorSignal ? "Auteur- of expertisesignalen zijn gevonden." : "Duidelijke dienst- en vakgebiedsignalen zijn gevonden voor deze lokale bedrijfspagina.", "Maak auteur, expertise, diensten en bronnen waar relevant nog explicieter.", 8, 8)
      : ecommerceExpertiseSignal
        ? check("pass", "author", "geo", "Expertise-signalen", "Voor deze webshop zijn merk-, organisatie- en productcontext-signalen gevonden; een individuele auteur is niet noodzakelijk voor productcontent.", "Maak merk-, product- en organisatiecontext consistent en voeg auteurs of bronnen toe waar informatieve content dat vereist.", 8, 8)
        : check("warning", "author", "geo", "Expertise-signalen", "Geen duidelijke auteur/expertisesignalen gevonden.", "Voeg auteur, organisatie, expertise en betrouwbare bronnen toe aan informatieve content.", 3, 8)
    );
    geoChecks.push((hasContactSignal && hasBusinessContactDetails) || hasAboutSignal || hasSocialOrReviewSignal
      ? check("pass", "trust", "geo", "Trust & context", hasAboutSignal ? "Contact- en organisatiecontext zijn zichtbaar." : "Concrete contact-, locatie- of externe profielsignalen zijn zichtbaar.", "Houd bedrijfsnaam, contactgegevens, locatie, verantwoordelijkheden en officiële profielen consistent.", 8, 8)
      : check("warning", "trust", "geo", "Trust & context", "Contact- of organisatiecontext is beperkt gevonden.", "Maak organisatie, contact, locatie en verantwoordelijkheden duidelijk.", 3, 8)
    );
    geoChecks.push(ogTitle && ogDescription
      ? check("pass", "answer", "geo", "Expliciete paginasamenvatting", "Open Graph title en description geven een expliciete machineleesbare samenvatting van de pagina.", "Houd title, description en zichtbare introductie inhoudelijk consistent.", 6, 6)
      : check("warning", "answer", "geo", "Expliciete paginasamenvatting", "Een complete Open Graph-samenvatting is niet gevonden.", "Voeg een duidelijke zichtbare introductie en consistente metadata toe; dit is een readiness-signaal en geen garantie op zichtbaarheid in AI-zoekmachines.", 2, 6)
    );
    const brandIdentitySignals = [
      organizationSchemaName || organizationName,
      organizationSchemaUrl,
      organizationSchemaLogo,
      organizationSchemaSameAs > 0 || sameAsCount > 0,
      organizationSchemaContact > 0,
    ].filter(Boolean).length;
    geoChecks.push(brandIdentitySignals >= 3
      ? check("pass", "identity", "geo", "Brand identity", "De organisatie-identiteit is machineleesbaar en bevat meerdere consistente merksignalen.", "Houd naam, URL, logo, officiële profielen en contactcontext consistent.", 5, 5)
      : brandIdentitySignals >= 1
        ? check("warning", "identity", "geo", "Brand identity", "Er is Organization-context gevonden, maar de machineleesbare merkidentiteit kan vollediger.", "Vul relevante Organization-velden aan, zoals naam, URL, logo en officiële profielen, zonder gegevens te verzinnen.", 3, 5)
        : check("warning", "identity", "geo", "Brand identity", "Weinig expliciete brand identity-signalen gevonden.", "Voeg Organization-data en officiële profielen toe waar relevant.", 2, 5)
    );

    if (criticalCanonicalIssue) {
      const canonicalCheck = seoChecks.find((item) => item.key === "canonical");
      if (canonicalCheck && canonicalCheck.status !== "pass") canonicalCheck.severity = "CRITICAL";
    }

    const ruleMap: Record<string, { rule_id: string; severity: Check["severity"] }> = {
      title: { rule_id: title ? "META_TITLE_GUIDANCE" : "META_TITLE_MISSING", severity: title ? "MEDIUM" : "HIGH" },
      description: { rule_id: description ? "META_DESCRIPTION_GUIDANCE" : "META_DESCRIPTION_MISSING", severity: description ? "MEDIUM" : "HIGH" },
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
        title,
        description,
        h1: h1s.length,
        headings: headings.length,
        canonical: canonical || null,
        viewport: viewportContent || null,
        lang: lang || null,
        alt: imageElementCount ? imagesMissingAlt : null,
        schema: validJsonLd,
        https: finalUrl.protocol === "https:",
        status: response.status,
        response: responseTime,
        sitemap: sitemapFound ? (confirmedSitemapUrl || true) : robotsDeclaredSitemapUrl ? `declared=${robotsDeclaredSitemapUrl}; status=${sitemapStatus}` : sitemapStatus,
        robots_txt: robotsStatus === "PASS" ? `${robotsUrl.toString()}; pathBlocked=${robotsPathBlocked}${matchingRobotsRules[0] ? `; rule=${matchingRobotsRules[0].kind}:${matchingRobotsRules[0].path}` : ""}` : robotsStatus,
        indexability: noindexSignal ? [robots, xRobotsTag].filter(Boolean).join(" | ") : robotsPathBlocked ? `robots disallow: ${matchingRobotsRules[0].path}` : "no noindex or applicable robots block found",
        hreflang: hreflangValues.length ? hreflangValues.join(", ") : null,
        social: [ogTitle ? "og:title" : "", ogDescription ? "og:description" : "", ogImage ? "og:image" : ""].filter(Boolean).join(", ") || null,
        product_schema: hasProductSchema ? JSON.stringify(productOfferSummary.slice(0, 3)) : null,
        webshop_trust: hasProductSignal ? `shipping=${hasShippingSignal}; returns=${hasReturnsSignal}; reviewPlatform=${hasReviewPlatformSignal}; checkoutSignal=${hasCheckoutTrustSignal}` : null,
        webshop_claims: hasWebshopClaims ? webshopClaimMatches.slice(0, 3).join(", ") : null,
        variant_url: ecommerceVariantUrlSignal ? finalUrl.search : null,
        checkout_trust: hasCheckoutTrustSignal ? "checkout/payment signal found in static page content" : null,
        product_price_consistency: hasProductSignal ? `visible=${visiblePriceCandidates.join(",") || "none"}; schema=${structuredPriceCandidates.join(",") || "none"}` : null,
        product_availability: hasProductSignal ? `visibleStockSignal=${visibleStockSignal}; schema=${structuredAvailabilityValues.join(",") || "none"}` : null,
        ads_readiness: (adsTrackingSignals || hasConversionSignal || hasExplicitAdsConversionSnippet) ? `adsIds=${googleAdsIds.join(",") || "none"}; ga4Ids=${ga4MeasurementIds.join(",") || "none"}; events=${uniqueConversionEventNames.join(",") || "none"}; adsLabels=${googleAdsSendToLabels.join(",") || "none"}; consentSignal=${hasConsentModeSignal}` : null,
      };
      const heuristicKeys = new Set([
        "content", "headings", "duplicate_path", "html_escape", "image_sources", "webshop_claims",
        "webshop_trust", "price_format", "variant_url", "ads_readiness", "conversion_tracking",
        "organization_identity", "entity_consistency", "author", "faq", "reviews"
      ]);
      item.confidence = item.status === "unable_to_confirm"
        ? "low"
        : heuristicKeys.has(item.key)
          ? "medium"
          : item.status === "not_applicable"
            ? "medium"
            : "high";
      item.evidence = {
        url: finalUrl.toString(),
        found: Object.prototype.hasOwnProperty.call(evidenceByKey, item.key) ? evidenceByKey[item.key] : null,
        details: item.message,
      };
      item.issue_status = item.status === "not_applicable"
        ? "NOT_APPLICABLE"
        : item.status === "unable_to_confirm"
          ? "UNABLE_TO_CONFIRM"
          : statusCode(item.status);
    }
    const seoTotal = seoChecks.reduce((sum, c) => sum + (c.issue_status === "NOT_APPLICABLE" || c.issue_status === "UNABLE_TO_CONFIRM" ? 0 : c.points), 0);
    const seoMax = seoChecks.reduce((sum, c) => sum + (c.issue_status === "NOT_APPLICABLE" || c.issue_status === "UNABLE_TO_CONFIRM" ? 0 : c.maxPoints), 0);
    const geoTotal = geoChecks.reduce((sum, c) => sum + (c.issue_status === "NOT_APPLICABLE" || c.issue_status === "UNABLE_TO_CONFIRM" ? 0 : c.points), 0);
    const geoMax = geoChecks.reduce((sum, c) => sum + (c.issue_status === "NOT_APPLICABLE" || c.issue_status === "UNABLE_TO_CONFIRM" ? 0 : c.maxPoints), 0);
    const seoScore = Math.round((seoTotal / seoMax) * 100);
    const geoScore = Math.round((geoTotal / geoMax) * 100);
    const overallScore = Math.round(seoScore * 0.6 + geoScore * 0.4);
    const selectedSeoChecks = mode === "geo" ? [] : seoChecks;
    const selectedGeoChecks = mode === "seo" ? [] : geoChecks;
    const scoreSelected=(items:Check[])=>{const applicable=items.filter(c=>c.issue_status!=="NOT_APPLICABLE"&&c.issue_status!=="UNABLE_TO_CONFIRM");const max=applicable.reduce((sum,c)=>sum+c.maxPoints,0);return max?Math.round(applicable.reduce((sum,c)=>sum+c.points,0)/max*100):0;};
    const selectedSeoScore = scoreSelected(selectedSeoChecks);
    const selectedGeoScore = scoreSelected(selectedGeoChecks);
    let selectedOverallScore = mode === "seo" ? selectedSeoScore : mode === "geo" ? selectedGeoScore : Math.round(selectedSeoScore * 0.6 + selectedGeoScore * 0.4);
    const selectedHasCriticalIssue = [...selectedSeoChecks, ...selectedGeoChecks].some((item) => item.status !== "pass" && item.severity === "CRITICAL");
    const selectedHasHighIssue = [...selectedSeoChecks, ...selectedGeoChecks].some((item) => item.status === "fail" && item.severity === "HIGH");
    if (selectedHasCriticalIssue) selectedOverallScore = Math.min(selectedOverallScore, 70);
    else if (selectedHasHighIssue) selectedOverallScore = Math.min(selectedOverallScore, 88);
    const checks = [...selectedSeoChecks, ...selectedGeoChecks];
    const coverageFor = (items: Check[]) => {
      const relevant = items.filter((item) => item.issue_status !== "NOT_APPLICABLE");
      const confirmed = relevant.filter((item) => item.issue_status !== "UNABLE_TO_CONFIRM");
      const highConfidence = confirmed.filter((item) => item.confidence === "high");
      return {
        relevant: relevant.length,
        confirmed: confirmed.length,
        unableToConfirm: relevant.length - confirmed.length,
        coveragePercent: relevant.length ? Math.round((confirmed.length / relevant.length) * 100) : 100,
        highConfidencePercent: confirmed.length ? Math.round((highConfidence.length / confirmed.length) * 100) : 100,
      };
    };
    const seoCoverage = coverageFor(selectedSeoChecks);
    const geoCoverage = coverageFor(selectedGeoChecks);
    const overallCoverage = coverageFor(checks);

    let user = null;
    let pendingFixes = new Map<string, { status: string }>();
    try { user = await getCurrentUser(); } catch {}
    if (user) {
      try {
        await ensureDatabase();
        const normalizedScanUrl = normalizeScanUrl(finalUrl.toString());
        const pending = await getDb().query(
          "SELECT issue_id, status FROM pending_fixes WHERE user_id=$1 AND scanned_url=$2 AND status='PREPARED' AND expires_at>NOW()",
          [user.id, normalizedScanUrl]
        );
        pendingFixes = new Map(pending.rows.map((row: any) => [String(row.issue_id), { status: String(row.status) }]));

        for (const item of checks) {
          const issueId = String(item.issue_id || item.rule_id || item.key);
          const pendingFix = pendingFixes.get(issueId);
          if (!pendingFix) continue;
          // A normal audit must never confirm a prepared fix as DONE.
          // Confirmation belongs to the dedicated live recheck flow.
          item.fix_status = "WAITING";
        }

        const websiteHost = finalUrl.hostname.toLowerCase().replace(/^www\\./, "");
        const previousScan = await getDb().query(
          "SELECT id,result FROM scans WHERE user_id=$1 AND lower(regexp_replace(split_part(split_part(final_url, '://', 2), '/', 1), '^www\\.', ''))=$2 ORDER BY created_at DESC LIMIT 1",
          [user.id, websiteHost]
        );
        const insertedScan = await getDb().query(
          "INSERT INTO scans (user_id, scanned_url, final_url, overall_score, seo_score, geo_score, result, crawler_version, rules_version, fix_policy_version, ai_policy_version) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id",
          [user.id, target.toString(), finalUrl.toString(), selectedOverallScore, selectedSeoScore, selectedGeoScore, JSON.stringify({
            scannedUrl: target.toString(), finalUrl: finalUrl.toString(), responseTime, httpStatus: response.status,
            mode, overallScore: selectedOverallScore, grade: grade(selectedOverallScore), coverage: overallCoverage,
            seo: { score: selectedSeoScore, grade: grade(selectedSeoScore), coverage: seoCoverage, checks: selectedSeoChecks },
            geo: { score: selectedGeoScore, grade: grade(selectedGeoScore), coverage: geoCoverage, checks: selectedGeoChecks },
            metrics: { siteType: (hasProductSchema || /add-to-cart|shopping cart|winkelwagen|checkout|sku|price|availability/i.test(text)) ? "ECOMMERCE" : "WEBSITE", title, titleLength: title.length, description, descriptionLength: description.length, h1Count: h1s.length, h1s,
              imageCount, imageElementCount, imagesMissingAlt, wordCount, headingsCount: headings.length, linksCount: links.length, pageType: schemaContextLabel, recommendedSchema, localBusinessDetails,
              internalLinks, canonical: canonical || null, lang: lang || null, robots: robots || null,
              openGraph: { title: ogTitle || null, description: ogDescription || null, image: ogImage || null }, imageAltCandidates,
              twitterCard: twitterCard || null, schemaTypes: [...new Set(schemaTypes)].slice(0,12),
              jsonLdBlocks: validJsonLd, sitemapFound, robotsMentionsSitemap, robotsStatus, sitemapUrl: confirmedSitemapUrl || robotsDeclaredSitemapUrl }
          })]
        );
        try {
          const scanId = insertedScan.rows[0]?.id || null;
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
      } catch {}
    }

    if (user?.email) {
      try {
        await sendScanReportEmail({
          to: user.email,
          name: user.name,
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

    return NextResponse.json({
      success: true,
      scannedUrl: target.toString(),
      finalUrl: finalUrl.toString(),
      scannedAt: new Date().toISOString(),
      responseTime,
      httpStatus: response.status,
      overallScore: selectedOverallScore,
      grade: grade(selectedOverallScore),
      coverage: overallCoverage,
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
        twitterCard: twitterCard || null,
        schemaTypes: [...new Set(schemaTypes)].slice(0, 12),
        jsonLdBlocks: validJsonLd,
        sitemapFound,
        robotsMentionsSitemap,
      },
      checks,
      pendingFixes: checks.filter((item) => item.fix_status === "WAITING").map((item) => item.issue_id || item.rule_id || item.key),
    });
  } catch {
    return NextResponse.json({ error: "Er ging iets mis tijdens de SEO/GEO-scan." }, { status: 500 });
  }
}
