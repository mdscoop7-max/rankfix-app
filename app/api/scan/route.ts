import { NextResponse } from "next/server";

type Check = {
  key: string;
  title: string;
  status: "pass" | "warning" | "fail";
  message: string;
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
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\\s+/g, " ")
    .trim();

function firstMatch(html: string, regex: RegExp) {
  const match = html.match(regex);
  return match?.[1] ? decode(match[1]) : "";
}

function allMatches(html: string, regex: RegExp) {
  return [...html.matchAll(regex)].map((m) => decode(m[1] || ""));
}

function attrFromTag(tag: string, attr: string) {
  const match = tag.match(new RegExp(attr + '\\s*=\\s*["\\']([^"\\']*)["\\']', "i"));
  return match?.[1] || "";
}

function isPrivateHost(hostname: string) {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h === "::1") return true;
  if (/^127\\./.test(h) || /^10\\./.test(h) || /^192\\.168\\./.test(h)) return true;
  const m = h.match(/^172\\.(\\d+)\\./);
  if (m && Number(m[1]) >= 16 && Number(m[1]) <= 31) return true;
  return false;
}

function check(status: Check["status"], key: string, title: string, message: string, points: number, maxPoints: number): Check {
  return { key, title, status, message, points, maxPoints };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const rawUrl = typeof body?.url === "string" ? body.url.trim() : "";

    if (!rawUrl) return NextResponse.json({ error: "Vul een website URL in." }, { status: 400 });

    let target: URL;
    try {
      target = new URL(/^https?:\\/\\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`);
    } catch {
      return NextResponse.json({ error: "Ongeldige URL." }, { status: 400 });
    }

    if (!["http:", "https:"].includes(target.protocol) || isPrivateHost(target.hostname)) {
      return NextResponse.json({ error: "Deze URL kan niet worden gescand." }, { status: 400 });
    }

    const started = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    let response: Response;
    try {
      response = await fetch(target.toString(), {
        signal: controller.signal,
        redirect: "follow",
        headers: {
          "User-Agent": "RankFixBot/1.0 (+https://rankfix.app)",
          "Accept": "text/html,application/xhtml+xml",
        },
        cache: "no-store",
      });
    } catch {
      return NextResponse.json({ error: "De website kon niet worden opgehaald. Controleer de URL en probeer opnieuw." }, { status: 502 });
    } finally {
      clearTimeout(timeout);
    }

    const responseTime = Date.now() - started;
    const html = await response.text();

    if (!html || html.length < 20) {
      return NextResponse.json({ error: "De website gaf geen bruikbare HTML terug." }, { status: 422 });
    }

    const title = firstMatch(html, /<title[^>]*>([\\s\\S]*?)<\\/title>/i);
    const description = firstMatch(
      html,
      /<meta[^>]+(?:name|property)\\s*=\\s*["']description["'][^>]+content\\s*=\\s*["']([\\s\\S]*?)["'][^>]*>/i
    ) || firstMatch(
      html,
      /<meta[^>]+content\\s*=\\s*["']([\\s\\S]*?)["'][^>]+(?:name|property)\\s*=\\s*["']description["'][^>]*>/i
    );

    const h1s = allMatches(html, /<h1[^>]*>([\\s\\S]*?)<\\/h1>/gi).map(stripHtml).filter(Boolean);
    const headings = allMatches(html, /<h[2-6][^>]*>([\\s\\S]*?)<\\/h[2-6]>/gi).map(stripHtml).filter(Boolean);
    const canonical = firstMatch(html, /<link[^>]+rel\\s*=\\s*["']canonical["'][^>]+href\\s*=\\s*["']([^"']+)["'][^>]*>/i)
      || firstMatch(html, /<link[^>]+href\\s*=\\s*["']([^"']+)["'][^>]+rel\\s*=\\s*["']canonical["'][^>]*>/i);
    const lang = firstMatch(html, /<html[^>]+lang\\s*=\\s*["']([^"']+)["']/i);
    const viewport = /<meta[^>]+name\\s*=\\s*["']viewport["']/i.test(html);
    const robots = firstMatch(html, /<meta[^>]+name\\s*=\\s*["']robots["'][^>]+content\\s*=\\s*["']([^"']+)["']/i);
    const images = [...html.matchAll(/<img\\b[^>]*>/gi)].map((m) => m[0]);
    const imagesMissingAlt = images.filter((tag) => !attrFromTag(tag, "alt").trim()).length;
    const links = [...html.matchAll(/<a\\b[^>]*href\\s*=\\s*["']([^"']+)["'][^>]*>/gi)].map((m) => m[1]);
    const text = stripHtml(html);
    const wordCount = text ? text.split(/\\s+/).filter(Boolean).length : 0;
    const checks: Check[] = [];

    checks.push(
      title
        ? title.length >= 30 && title.length <= 60
          ? check("pass", "title", "Meta title", `De title is ${title.length} tekens en valt binnen de aanbevolen lengte.`, 12, 12)
          : check("warning", "title", "Meta title", `De title is ${title.length} tekens. Richtwaarde: 30–60 tekens.`, 7, 12)
        : check("fail", "title", "Meta title", "Er is geen meta title gevonden.", 0, 12)
    );

    checks.push(
      description
        ? description.length >= 120 && description.length <= 160
          ? check("pass", "description", "Meta description", `De description is ${description.length} tekens en is goed gevuld.`, 12, 12)
          : check("warning", "description", "Meta description", `De description is ${description.length} tekens. Richtwaarde: 120–160 tekens.`, 7, 12)
        : check("fail", "description", "Meta description", "Er is geen meta description gevonden.", 0, 12)
    );

    checks.push(
      h1s.length === 1
        ? check("pass", "h1", "H1-heading", "Er is precies één H1-heading gevonden.", 10, 10)
        : h1s.length === 0
          ? check("fail", "h1", "H1-heading", "Er is geen H1-heading gevonden.", 0, 10)
          : check("warning", "h1", "H1-heading", `Er zijn ${h1s.length} H1-headings gevonden. Gebruik meestal één duidelijke H1.`, 5, 10)
    );

    checks.push(
      canonical
        ? check("pass", "canonical", "Canonical URL", "Een canonical URL is aanwezig.", 8, 8)
        : check("warning", "canonical", "Canonical URL", "Geen canonical URL gevonden.", 4, 8)
    );

    checks.push(
      viewport
        ? check("pass", "viewport", "Mobiele viewport", "Een viewport meta tag is aanwezig.", 6, 6)
        : check("fail", "viewport", "Mobiele viewport", "Geen viewport meta tag gevonden.", 0, 6)
    );

    checks.push(
      lang
        ? check("pass", "lang", "HTML-taal", `De pagina heeft lang="${lang}".`, 5, 5)
        : check("warning", "lang", "HTML-taal", "Geen HTML lang-attribuut gevonden.", 2, 5)
    );

    checks.push(
      images.length === 0 || imagesMissingAlt === 0
        ? check("pass", "alt", "Afbeelding alt-teksten", images.length ? "Alle gevonden afbeeldingen hebben een alt-attribuut." : "Geen afbeeldingen gevonden.", 8, 8)
        : check("warning", "alt", "Afbeelding alt-teksten", `${imagesMissingAlt} van ${images.length} afbeeldingen missen een alt-attribuut.`, 4, 8)
    );

    checks.push(
      wordCount >= 300
        ? check("pass", "content", "Contentvolume", `Ongeveer ${wordCount} woorden gevonden op de pagina.`, 8, 8)
        : check("warning", "content", "Contentvolume", `Ongeveer ${wordCount} woorden gevonden. Meer relevante content kan nodig zijn.`, 4, 8)
    );

    checks.push(
      target.protocol === "https:"
        ? check("pass", "https", "HTTPS", "De ingevoerde URL gebruikt HTTPS.", 8, 8)
        : check("fail", "https", "HTTPS", "De ingevoerde URL gebruikt geen HTTPS.", 0, 8)
    );

    checks.push(
      response.ok
        ? check("pass", "status", "HTTP-status", `De pagina gaf HTTP ${response.status} terug.`, 8, 8)
        : check("warning", "status", "HTTP-status", `De pagina gaf HTTP ${response.status} terug.`, 3, 8)
    );

    checks.push(
      responseTime < 1500
        ? check("pass", "response", "Reactietijd", `De eerste response kwam in ongeveer ${responseTime} ms.`, 5, 5)
        : responseTime < 3000
          ? check("warning", "response", "Reactietijd", `De eerste response duurde ongeveer ${responseTime} ms.`, 3, 5)
          : check("fail", "response", "Reactietijd", `De eerste response duurde ongeveer ${responseTime} ms.`, 0, 5)
    );

    const totalPoints = checks.reduce((sum, c) => sum + c.points, 0);
    const maxPoints = checks.reduce((sum, c) => sum + c.maxPoints, 0);
    const score = Math.round((totalPoints / maxPoints) * 100);

    return NextResponse.json({
      success: true,
      scannedUrl: target.toString(),
      finalUrl: response.url,
      score,
      grade: score >= 90 ? "A" : score >= 75 ? "B" : score >= 60 ? "C" : score >= 45 ? "D" : "E",
      scannedAt: new Date().toISOString(),
      responseTime,
      httpStatus: response.status,
      metrics: {
        title,
        titleLength: title.length,
        description,
        descriptionLength: description.length,
        h1Count: h1s.length,
        imageCount: images.length,
        imagesMissingAlt,
        wordCount,
        headingsCount: headings.length,
        linksCount: links.length,
        canonical: canonical || null,
        lang: lang || null,
        robots: robots || null,
      },
      checks,
    });
  } catch {
    return NextResponse.json({ error: "Er ging iets mis tijdens de SEO-scan." }, { status: 500 });
  }
}
