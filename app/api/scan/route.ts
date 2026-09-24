import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { ensureDatabase } from "@/lib/db-init";
import { sendScanReportEmail } from "@/lib/email";
import { CRAWLER_VERSION, RULES_VERSION, FIX_POLICY_VERSION, AI_POLICY_VERSION, statusCode } from "@/lib/seo-rules";
import { getFixPolicy } from "@/lib/fix-policy";
import { extractImageMetrics } from "@/lib/image-metrics";

type Status = "pass" | "warning" | "fail";

type AuditMode = "seo" | "geo" | "both";

type Check = {
  key: string;
  category: "seo" | "geo";
  title: string;
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

function isPrivateHost(hostname: string) {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!h || h === "localhost" || h.endsWith(".localhost") || h === "::1") return true;
  if (h === "0.0.0.0" || h === "127.0.0.1" || h === "169.254.169.254") return true;
  if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h)) return true;
  const m = h.match(/^172\.(\d+)\./);
  if (m && Number(m[1]) >= 16 && Number(m[1]) <= 31) return true;
  if (/^(fc|fd)[0-9a-f]{2}:/i.test(h) || /^fe8[0-9a-f]:/i.test(h)) return true;
  return false;
}

function validateUrl(value: string) {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("unsupported");
  if (url.username || url.password || isPrivateHost(url.hostname)) throw new Error("blocked");
  if (url.port && !["80", "443"].includes(url.port)) throw new Error("port");
  return url;
}

async function safeFetch(url: URL, timeoutMs = 10000, maxRedirects = 4) {
  let current = new URL(url.toString());

  for (let i = 0; i <= maxRedirects; i++) {
    validateUrl(current.toString());
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetch(current.toString(), {
        signal: controller.signal,
        redirect: "manual",
        headers: {
          "User-Agent": "RankFixBot/1.0 (+https://rankfix.app)",
          Accept: "text/html,application/xhtml+xml,text/plain,application/xml",
        },
        cache: "no-store",
      });
    } finally {
      clearTimeout(timeout);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return response;
      current = new URL(location, current);
      continue;
    }

    return response;
  }

  throw new Error("redirects");
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
    issue_id: key, rule_id: key, issue_status: statusCode(status),
    severity: status === "fail" ? "HIGH" : status === "warning" ? "MEDIUM" : "INFO",
    confidence: "high", evidence: { url: "", found: null, details: message },
    fix_category: getFixPolicy(key).category,
  };
}

function grade(score: number) {
  return score >= 90 ? "A" : score >= 75 ? "B" : score >= 60 ? "C" : score >= 45 ? "D" : "E";
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
      target = validateUrl(/^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`);
    } catch {
      return NextResponse.json({ error: "Deze URL kan niet veilig worden gescand." }, { status: 400 });
    }

    const started = Date.now();
    let response: Response;
    try {
      response = await safeFetch(target, 12000);
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
    const viewport = /<meta[^>]+name\s*=\s*["']viewport["']/i.test(html);
    const robots = firstMatch(html, /<meta[^>]+name\s*=\s*["']robots["'][^>]+content\s*=\s*["']([^"']+)["']/i);
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
    let validJsonLd = 0;
    for (const raw of jsonLdBlocks) {
      try {
        const parsed = JSON.parse(raw);
        validJsonLd++;
        const items = Array.isArray(parsed) ? parsed : parsed?.["@graph"] || [parsed];
        for (const item of items) {
          if (item?.["@type"]) {
            const types = Array.isArray(item["@type"]) ? item["@type"] : [item["@type"]];
            schemaTypes.push(...types.map(String));
          }
        }
      } catch {}
    }
    const schemaSet = new Set(schemaTypes.map((v) => v.toLowerCase()));
    const hasEntitySchema = ["organization", "localbusiness", "person", "product", "article", "website"].some((t) => schemaSet.has(t));
    const schemaObjects: any[] = [];
    for (const raw of jsonLdBlocks) {
      try {
        const parsed = JSON.parse(raw);
        const items = Array.isArray(parsed) ? parsed : parsed?.["@graph"] || [parsed];
        schemaObjects.push(...items.filter(Boolean));
      } catch {}
    }
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
    let discoveredSitemapUrl: string | null = null;
    try {
      const r = await safeFetch(robotsUrl, 5000, 2);
      if (r.ok) {
        robotsTxt = await r.text();
        robotsStatus = "PASS";
        const declared = robotsTxt.match(/^\s*Sitemap\s*:\s*(\S+)/im)?.[1];
        if (declared) discoveredSitemapUrl = new URL(declared, finalUrl).toString();
      } else if (r.status === 404) robotsStatus = "FAIL";
    } catch { robotsStatus = "UNABLE_TO_CONFIRM"; }
    const sitemapCandidates = [discoveredSitemapUrl, sitemapUrl.toString()].filter(Boolean) as string[];
    for (const candidate of sitemapCandidates) {
      try {
        const r = await safeFetch(new URL(candidate), 5000, 2);
        if (r.ok && /xml|text\/xml/i.test(r.headers.get("content-type") || "")) {
          sitemapFound = true;
          discoveredSitemapUrl = candidate;
          break;
        }
      } catch {}
    }
    const robotsMentionsSitemap = Boolean(discoveredSitemapUrl);

    const seoChecks: Check[] = [];
    const geoChecks: Check[] = [];

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
    try {
      canonicalUrl = canonical ? new URL(canonical, finalUrl) : null;
    } catch {}

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
    const canonicalDropsQuery = Boolean(canonicalUrl && finalUrl.search && !canonicalUrl.search);

    seoChecks.push(
      !canonicalUrl
        ? check("warning", "canonical", "seo", "Canonical URL", "Geen canonical URL gevonden.", "Voeg een self-referencing canonical toe wanneer passend.", 3, 7)
        : canonicalIsSelf
          ? check("pass", "canonical", "seo", "Canonical URL", canonicalDropsQuery ? "De canonical wijst naar dezelfde inhoud zonder queryparameters." : "De canonical verwijst naar dezelfde URL als de gescande pagina.", "Behoud een duidelijke self-referencing canonical en laat trackingparameters buiten de voorkeurs-URL.", 7, 7)
          : canonicalIsCrossDomain
            ? check("warning", "canonical", "seo", "Canonical URL", "De canonical verwijst naar een ander domein dan de gescande pagina.", "Controleer of deze externe canonical bewust is. Voor een normale pagina hoort de canonical doorgaans naar de voorkeurs-URL van dezelfde site te wijzen.", 3, 7)
            : check("warning", "canonical", "seo", "Canonical URL", "De canonical is aanwezig, maar verwijst niet naar de gescande URL.", "Controleer of de canonical bewust naar een andere, inhoudelijk gelijkwaardige voorkeurs-URL verwijst.", 5, 7)
    );
    seoChecks.push(viewport
      ? check("pass", "viewport", "seo", "Mobiele viewport", "Een viewport meta tag is aanwezig.", "Test daarnaast de echte mobiele layout en Core Web Vitals.", 5, 5)
      : check("fail", "viewport", "seo", "Mobiele viewport", "Geen viewport meta tag gevonden.", "Voeg een responsive viewport meta tag toe.", 0, 5)
    );
    seoChecks.push(lang
      ? check("pass", "lang", "seo", "HTML-taal", `De pagina heeft lang="${lang}".`, "Gebruik de juiste taalcode voor de primaire paginataal.", 4, 4)
      : check("warning", "lang", "seo", "HTML-taal", "Geen HTML lang-attribuut gevonden.", "Voeg het juiste lang-attribuut toe aan <html>.", 1, 4)
    );
    seoChecks.push(imageElementCount === 0 || imagesMissingAlt === 0
      ? check("pass", "alt", "seo", "Afbeelding alt-teksten", imageElementCount ? `Alle ${imageElementCount} gevonden afbeeldingselementen hebben alt-attributen.` : "Geen afbeeldingen gevonden.", "Schrijf beschrijvende alt-teksten voor informatieve afbeeldingen.", 7, 7)
      : check("warning", "alt", "seo", "Afbeelding alt-teksten", `${imagesMissingAlt} van ${imageElementCount} gevonden afbeeldingselementen missen alt.`, "Voeg beschrijvende alt-teksten toe waar ze betekenis toevoegen.", 3, 7)
    );
    seoChecks.push(wordCount >= 300
      ? check("pass", "content", "seo", "Contentdiepte", `Ongeveer ${wordCount} woorden gevonden.`, "Verbeter vooral relevantie en volledigheid, niet alleen woordenaantal.", 7, 7)
      : check("warning", "content", "seo", "Contentdiepte", `Ongeveer ${wordCount} woorden gevonden.`, "Beantwoord de belangrijkste vragen van de bezoeker uitgebreider.", 3, 7)
    );
    seoChecks.push(finalUrl.protocol === "https:"
      ? check("pass", "https", "seo", "HTTPS", "De uiteindelijke URL gebruikt HTTPS.", "Behoud HTTPS op alle publieke pagina's en redirects.", 7, 7)
      : check("fail", "https", "seo", "HTTPS", "De uiteindelijke URL gebruikt geen HTTPS.", "Zet de site volledig achter HTTPS.", 0, 7)
    );
    seoChecks.push(response.ok
      ? check("pass", "status", "seo", "HTTP-status", `De pagina gaf HTTP ${response.status} terug.`, "Gebruik 200 voor normale indexeerbare pagina's.", 6, 6)
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
    seoChecks.push(sitemapFound || robotsMentionsSitemap
      ? check("pass", "sitemap", "seo", "Sitemap-signaal", "Er is een sitemap.xml gevonden of robots.txt verwijst naar een sitemap.", "Controleer of de sitemap alleen canonieke, indexeerbare URL's bevat.", 4, 4)
      : check("warning", "sitemap", "seo", "Sitemap-signaal", "Geen sitemap.xml of sitemap-verwijzing gevonden.", "Publiceer een XML sitemap en vermeld die in robots.txt.", 1, 4)
    );

    geoChecks.push(
      hasLocalBusinessSignal
        ? hasRelevantLocalSchema
          ? check("pass", "schema", "geo", "Structured data", `${validJsonLd} geldige JSON-LD block(s) met passend lokaal bedrijfstype gevonden voor deze ${schemaContextLabel}.`, `Behoud het meest specifieke passende type: ${recommendedSchema}. Controleer verplichte en relevante velden.`, 12, 12)
          : validJsonLd > 0
            ? check("warning", "schema", "geo", "Structured data", `${validJsonLd} geldige JSON-LD block(s) gevonden, maar geen passend LocalBusiness-subtype.`, `Gebruik voor deze lokale pagina het meest specifieke passende type: ${recommendedSchema}, met alleen gegevens die zichtbaar en aantoonbaar zijn.`, 6, 12)
            : check("fail", "schema", "geo", "Structured data", `Geen geldige JSON-LD structured data gevonden voor deze ${schemaContextLabel}.`, `Voeg relevante schema.org JSON-LD toe. Voor dit paginatype is ${recommendedSchema} de belangrijkste richting; gebruik alleen typen die echt bij de zichtbare content passen.`, 0, 12)
        : validJsonLd > 0
          ? check("pass", "schema", "geo", "Structured data", `${validJsonLd} geldige JSON-LD block(s) gevonden voor deze ${schemaContextLabel}.`, `Controleer of de schema-opbouw past bij dit paginatype. Relevante hoofdkeuze: ${recommendedSchema}.`, 12, 12)
          : check("fail", "schema", "geo", "Structured data", `Geen geldige JSON-LD structured data gevonden voor deze ${schemaContextLabel}.`, `Voeg relevante schema.org JSON-LD toe. Voor dit paginatype is ${recommendedSchema} de belangrijkste richting; gebruik alleen typen die echt bij de zichtbare content passen.`, 0, 12)
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
      ? check("pass", "breadcrumbs", "geo", "Breadcrumbs", "Op de homepage is BreadcrumbList niet noodzakelijk.", "Gebruik BreadcrumbList vooral op diepe content-, categorie- en productpagina's.", 6, 6)
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
      ? check("pass", "answer", "geo", "Machine-leesbare samenvatting", "De pagina heeft duidelijke social metadata die de kern samenvat.", "Zorg dat title, description en zichtbare intro dezelfde kernboodschap vertellen.", 6, 6)
      : check("warning", "answer", "geo", "Machine-leesbare samenvatting", "De kern van de pagina is niet overal expliciet samengevat.", "Schrijf een heldere introductie en complete meta description.", 2, 6)
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

    const ruleMap: Record<string, { rule_id: string; severity: Check["severity"] }> = {
      title: { rule_id: title ? "META_TITLE_GUIDANCE" : "META_TITLE_MISSING", severity: title ? "MEDIUM" : "HIGH" },
      description: { rule_id: description ? "META_DESCRIPTION_GUIDANCE" : "META_DESCRIPTION_MISSING", severity: description ? "MEDIUM" : "HIGH" },
      h1: { rule_id: h1s.length > 1 ? "H1_MULTIPLE" : "H1_MISSING", severity: h1s.length ? "MEDIUM" : "HIGH" },
      alt: { rule_id: "IMAGE_ALT_MISSING", severity: "LOW" },
      social: { rule_id: "SOCIAL_METADATA_INCOMPLETE", severity: "LOW" },
      schema: { rule_id: "STRUCTURED_DATA_MISSING", severity: "MEDIUM" },
    };
    for (const item of [...seoChecks, ...geoChecks]) {
      const mapped = ruleMap[item.key];
      if (mapped) {
        item.rule_id = mapped.rule_id;
        item.issue_id = mapped.rule_id;
        item.severity = mapped.severity;
        item.fix_category = getFixPolicy(mapped.rule_id).category;
      }
      const found = item.key === "title" ? title : item.key === "description" ? description : item.key === "h1" ? h1s.length : item.key === "alt" ? imagesMissingAlt : item.key === "schema" ? validJsonLd : null;
      item.evidence = { url: finalUrl.toString(), found, details: item.message };
      item.issue_status = statusCode(item.status);
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
    const selectedSeoScore = selectedSeoChecks.length ? Math.round((selectedSeoChecks.reduce((sum, c) => sum + c.points, 0) / selectedSeoChecks.reduce((sum, c) => sum + c.maxPoints, 0)) * 100) : 0;
    const selectedGeoScore = selectedGeoChecks.length ? Math.round((selectedGeoChecks.reduce((sum, c) => sum + c.points, 0) / selectedGeoChecks.reduce((sum, c) => sum + c.maxPoints, 0)) * 100) : 0;
    const selectedOverallScore = mode === "seo" ? selectedSeoScore : mode === "geo" ? selectedGeoScore : Math.round(selectedSeoScore * 0.6 + selectedGeoScore * 0.4);
    const checks = [...selectedSeoChecks, ...selectedGeoChecks];

    let user = null;
    try { user = await getCurrentUser(); } catch {}
    if (user) {
      try {
        await ensureDatabase();
        await getDb().query(
          "INSERT INTO scans (user_id, scanned_url, final_url, overall_score, seo_score, geo_score, result, crawler_version, rules_version, fix_policy_version, ai_policy_version) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
          [user.id, target.toString(), finalUrl.toString(), selectedOverallScore, selectedSeoScore, selectedGeoScore, JSON.stringify({
            scannedUrl: target.toString(), finalUrl: finalUrl.toString(), responseTime, httpStatus: response.status,
            mode, overallScore: selectedOverallScore, grade: grade(selectedOverallScore),
            seo: { score: selectedSeoScore, grade: grade(selectedSeoScore), checks: selectedSeoChecks },
            geo: { score: selectedGeoScore, grade: grade(selectedGeoScore), checks: selectedGeoChecks },
            metrics: { siteType: (hasProductSchema || /add-to-cart|shopping cart|winkelwagen|checkout|sku|price|availability/i.test(text)) ? "ECOMMERCE" : "WEBSITE", title, titleLength: title.length, description, descriptionLength: description.length, h1Count: h1s.length, h1s,
              imageCount, imageElementCount, imagesMissingAlt, wordCount, headingsCount: headings.length, linksCount: links.length, pageType: schemaContextLabel, recommendedSchema, localBusinessDetails,
              internalLinks, canonical: canonical || null, lang: lang || null, robots: robots || null,
              openGraph: { title: ogTitle || null, description: ogDescription || null, image: ogImage || null }, imageAltCandidates,
              twitterCard: twitterCard || null, schemaTypes: [...new Set(schemaTypes)].slice(0,12),
              jsonLdBlocks: validJsonLd, sitemapFound, robotsMentionsSitemap, robotsStatus, sitemapUrl: discoveredSitemapUrl }
          })]
        );
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
      seo: { score: selectedSeoScore, grade: grade(selectedSeoScore), checks: selectedSeoChecks },
      geo: { score: selectedGeoScore, grade: grade(selectedGeoScore), checks: selectedGeoChecks },
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
    });
  } catch {
    return NextResponse.json({ error: "Er ging iets mis tijdens de SEO/GEO-scan." }, { status: 500 });
  }
}