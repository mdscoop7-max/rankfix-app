import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { sendScanReportEmail } from "@/lib/email";

type Status = "pass" | "warning" | "fail";

type Check = {
  key: string;
  category: "seo" | "geo";
  title: string;
  status: Status;
  message: string;
  fix: string;
  points: number;
  maxPoints: number;
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
  return { key, category, title, status, message, fix, points, maxPoints };
}

function grade(score: number) {
  return score >= 90 ? "A" : score >= 75 ? "B" : score >= 60 ? "C" : score >= 45 ? "D" : "E";
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const rawUrl = typeof body?.url === "string" ? body.url.trim() : "";

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
    const images = [...html.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]);
    const imagesMissingAlt = images.filter((tag) => !attrFromTag(tag, "alt").trim()).length;
    const links = [...html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi)].map((m) => m[1]);
    const internalLinks = links.filter((href) => {
      try { return new URL(href, finalUrl).hostname === finalUrl.hostname; } catch { return false; }
    }).length;
    const text = stripHtml(html);
    const wordCount = text ? text.split(/\s+/).filter(Boolean).length : 0;

    const metaTags = [...html.matchAll(/<meta\b[^>]*>/gi)].map((m) => m[0]);
    const getMeta = (key: string) =>
      metaTags.map((tag) => ({
        property: attrFromTag(tag, "property"),
        name: attrFromTag(tag, "name"),
        content: attrFromTag(tag, "content"),
      })).find((x) => x.property.toLowerCase() === key.toLowerCase() || x.name.toLowerCase() === key.toLowerCase())?.content || "";

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

    const robotsUrl = new URL("/robots.txt", finalUrl);
    const sitemapUrl = new URL("/sitemap.xml", finalUrl);
    let robotsTxt = "";
    let sitemapFound = false;
    try {
      const r = await safeFetch(robotsUrl, 5000, 2);
      if (r.ok) robotsTxt = await r.text();
    } catch {}
    try {
      const r = await safeFetch(sitemapUrl, 5000, 2);
      sitemapFound = r.ok && (r.headers.get("content-type") || "").includes("xml");
    } catch {}
    const robotsMentionsSitemap = /(^|\n)\s*sitemap\s*:/im.test(robotsTxt);

    const seoChecks: Check[] = [];
    const geoChecks: Check[] = [];

    seoChecks.push(
      title
        ? title.length >= 30 && title.length <= 60
          ? check("pass", "title", "seo", "Meta title", `De title is ${title.length} tekens en valt binnen de aanbevolen lengte.`, "Maak de title uniek, duidelijk en relevant voor de zoekintentie.", 10, 10)
          : check("warning", "title", "seo", "Meta title", `De title is ${title.length} tekens. Richtwaarde: 30–60 tekens.`, "Herschrijf de title zodat onderwerp, merk en zoekintentie direct duidelijk zijn.", 6, 10)
        : check("fail", "title", "seo", "Meta title", "Er is geen meta title gevonden.", "Voeg een unieke, beschrijvende title toe.", 0, 10)
    );
    seoChecks.push(
      description
        ? description.length >= 120 && description.length <= 160
          ? check("pass", "description", "seo", "Meta description", `De description is ${description.length} tekens en goed gevuld.`, "Houd de belofte concreet en voeg een duidelijke call-to-action toe.", 10, 10)
          : check("warning", "description", "seo", "Meta description", `De description is ${description.length} tekens. Richtwaarde: 120–160 tekens.`, "Maak de description concreet, uniek en passend bij de zoekintentie.", 6, 10)
        : check("fail", "description", "seo", "Meta description", "Er is geen meta description gevonden.", "Laat RankFix AI een nieuwe meta description maken op basis van de pagina.", 0, 10)
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
    seoChecks.push(canonical
      ? check("pass", "canonical", "seo", "Canonical URL", "Een canonical URL is aanwezig.", "Controleer dat de canonical naar de gewenste indexeerbare URL wijst.", 7, 7)
      : check("warning", "canonical", "seo", "Canonical URL", "Geen canonical URL gevonden.", "Voeg een self-referencing canonical toe wanneer passend.", 3, 7)
    );
    seoChecks.push(viewport
      ? check("pass", "viewport", "seo", "Mobiele viewport", "Een viewport meta tag is aanwezig.", "Test daarnaast de echte mobiele layout en Core Web Vitals.", 5, 5)
      : check("fail", "viewport", "seo", "Mobiele viewport", "Geen viewport meta tag gevonden.", "Voeg een responsive viewport meta tag toe.", 0, 5)
    );
    seoChecks.push(lang
      ? check("pass", "lang", "seo", "HTML-taal", `De pagina heeft lang="${lang}".`, "Gebruik de juiste taalcode voor de primaire paginataal.", 4, 4)
      : check("warning", "lang", "seo", "HTML-taal", "Geen HTML lang-attribuut gevonden.", "Voeg het juiste lang-attribuut toe aan <html>.", 1, 4)
    );
    seoChecks.push(images.length === 0 || imagesMissingAlt === 0
      ? check("pass", "alt", "seo", "Afbeelding alt-teksten", images.length ? "Alle gevonden afbeeldingen hebben alt-attributen." : "Geen afbeeldingen gevonden.", "Schrijf beschrijvende alt-teksten voor informatieve afbeeldingen.", 7, 7)
      : check("warning", "alt", "seo", "Afbeelding alt-teksten", `${imagesMissingAlt} van ${images.length} afbeeldingen missen alt.`, "Voeg beschrijvende alt-teksten toe waar ze betekenis toevoegen.", 3, 7)
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

    geoChecks.push(validJsonLd > 0
      ? check("pass", "schema", "geo", "Structured data", `${validJsonLd} geldige JSON-LD block(s) gevonden.`, "Gebruik schema.org om entiteiten, contenttype en relaties expliciet te maken.", 12, 12)
      : check("fail", "schema", "geo", "Structured data", "Geen geldige JSON-LD structured data gevonden.", "Voeg relevante schema.org JSON-LD toe voor de pagina en de organisatie.", 0, 12)
    );
    geoChecks.push(hasEntitySchema
      ? check("pass", "entity", "geo", "Entity-signalen", `Entity schema gevonden: ${schemaTypes.slice(0, 5).join(", ")}.`, "Maak organisatie, product, persoon of publicatie nog duidelijker met consistente gegevens.", 10, 10)
      : check("warning", "entity", "geo", "Entity-signalen", "Er is weinig expliciete entity-informatie gevonden.", "Definieer de organisatie/brand en relevante entiteiten met schema.org.", 4, 10)
    );
    geoChecks.push(hasBreadcrumb
      ? check("pass", "breadcrumbs", "geo", "Breadcrumbs", "BreadcrumbList structured data is aanwezig.", "Houd breadcrumbs gelijk aan de zichtbare navigatiestructuur.", 6, 6)
      : check("warning", "breadcrumbs", "geo", "Breadcrumbs", "Geen BreadcrumbList schema gevonden.", "Voeg breadcrumbs toe op diepe content-, categorie- en productpagina's.", 2, 6)
    );
    geoChecks.push(hasFaqContent || hasFaqSchema
      ? check("pass", "faq", "geo", "Vraag & antwoord content", "FAQ/Q&A-signalen zijn op de pagina gevonden.", "Beantwoord echte klantvragen kort, concreet en zonder marketingtaal.", 10, 10)
      : check("warning", "faq", "geo", "Vraag & antwoord content", "Geen duidelijke FAQ/Q&A-sectie gevonden.", "Voeg relevante vragen en directe antwoorden toe waar dat de gebruiker helpt.", 4, 10)
    );
    geoChecks.push(hasAuthorSignal
      ? check("pass", "author", "geo", "Expertise-signalen", "Auteur- of expertisesignalen zijn gevonden.", "Maak auteur, expertise en bronnen waar relevant nog explicieter.", 8, 8)
      : check("warning", "author", "geo", "Expertise-signalen", "Geen duidelijke auteur/expertisesignalen gevonden.", "Voeg auteur, organisatie, expertise en betrouwbare bronnen toe aan informatieve content.", 3, 8)
    );
    geoChecks.push(hasContactSignal && hasAboutSignal
      ? check("pass", "trust", "geo", "Trust & context", "Contact- en organisatiecontext zijn zichtbaar.", "Houd bedrijfsnaam, contactgegevens en About-informatie consistent.", 8, 8)
      : check("warning", "trust", "geo", "Trust & context", "Contact- of About-signalen zijn beperkt gevonden.", "Maak organisatie, contact, locatie en verantwoordelijkheden duidelijk.", 3, 8)
    );
    geoChecks.push(ogTitle && ogDescription
      ? check("pass", "answer", "geo", "Machine-leesbare samenvatting", "De pagina heeft duidelijke social metadata die de kern samenvat.", "Zorg dat title, description en zichtbare intro dezelfde kernboodschap vertellen.", 6, 6)
      : check("warning", "answer", "geo", "Machine-leesbare samenvatting", "De kern van de pagina is niet overal expliciet samengevat.", "Schrijf een heldere introductie en complete meta description.", 2, 6)
    );
    geoChecks.push(hasProductSchema || organizationName || sameAsCount > 0
      ? check("pass", "identity", "geo", "Brand identity", "Er zijn expliciete merk-/identiteitssignalen gevonden.", "Gebruik consistente naam, logo, sameAs en organisatiegegevens.", 5, 5)
      : check("warning", "identity", "geo", "Brand identity", "Weinig expliciete brand identity-signalen gevonden.", "Voeg Organization/LocalBusiness data en officiële profielen toe waar relevant.", 2, 5)
    );

    const seoTotal = seoChecks.reduce((sum, c) => sum + c.points, 0);
    const seoMax = seoChecks.reduce((sum, c) => sum + c.maxPoints, 0);
    const geoTotal = geoChecks.reduce((sum, c) => sum + c.points, 0);
    const geoMax = geoChecks.reduce((sum, c) => sum + c.maxPoints, 0);
    const seoScore = Math.round((seoTotal / seoMax) * 100);
    const geoScore = Math.round((geoTotal / geoMax) * 100);
    const overallScore = Math.round(seoScore * 0.6 + geoScore * 0.4);
    const checks = [...seoChecks, ...geoChecks];

    let user = null;
    try { user = await getCurrentUser(); } catch {}
    if (user) {
      try {
        await getDb().query(
          "INSERT INTO scans (user_id, scanned_url, final_url, overall_score, seo_score, geo_score, result) VALUES ($1,$2,$3,$4,$5,$6,$7)",
          [user.id, target.toString(), finalUrl.toString(), overallScore, seoScore, geoScore, JSON.stringify({
            scannedUrl: target.toString(), finalUrl: finalUrl.toString(), responseTime, httpStatus: response.status,
            overallScore, grade: grade(overallScore),
            seo: { score: seoScore, grade: grade(seoScore), checks: seoChecks },
            geo: { score: geoScore, grade: grade(geoScore), checks: geoChecks },
            metrics: { title, titleLength: title.length, description, descriptionLength: description.length, h1Count: h1s.length, h1s,
              imageCount: images.length, imagesMissingAlt, wordCount, headingsCount: headings.length, linksCount: links.length,
              internalLinks, canonical: canonical || null, lang: lang || null, robots: robots || null,
              openGraph: { title: ogTitle || null, description: ogDescription || null, image: ogImage || null },
              twitterCard: twitterCard || null, schemaTypes: [...new Set(schemaTypes)].slice(0,12),
              jsonLdBlocks: validJsonLd, sitemapFound, robotsMentionsSitemap }
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
          overallScore,
          overallGrade: grade(overallScore),
          seoScore,
          seoGrade: grade(seoScore),
          geoScore,
          geoGrade: grade(geoScore),
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
      overallScore,
      grade: grade(overallScore),
      seo: { score: seoScore, grade: grade(seoScore), checks: seoChecks },
      geo: { score: geoScore, grade: grade(geoScore), checks: geoChecks },
      metrics: {
        title,
        titleLength: title.length,
        description,
        descriptionLength: description.length,
        h1Count: h1s.length,
        h1s,
        imageCount: images.length,
        imagesMissingAlt,
        wordCount,
        headingsCount: headings.length,
        linksCount: links.length,
        internalLinks,
        canonical: canonical || null,
        lang: lang || null,
        robots: robots || null,
        openGraph: { title: ogTitle || null, description: ogDescription || null, image: ogImage || null },
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
