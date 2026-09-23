import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { validateFix } from "@/lib/seo-fix-validator";

type FixType = "meta_title" | "meta_description" | "h1" | "faq" | "breadcrumb" | "expertise" | "structured_data";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[char]!));
}
function trimTo(value: string, max: number) {
  return value.length <= max ? value : value.slice(0, max - 1).trimEnd() + "…";
}

function cleanContextValue(value: string) {
  return value.replace(/\s*\|\s*hide no longer\b/gi, "").replace(/\bhide no longer\b/gi, "").replace(/\s{2,}/g, " ").trim();
}

function cleanFix(fix: { title: string; content: string; reason: string }) {
  return { title: cleanContextValue(fix.title), content: cleanContextValue(fix.content), reason: cleanContextValue(fix.reason) };
}

function cleanContext(context: Record<string, string>) {
  return Object.fromEntries(Object.entries(context).map(([key, value]) => [key, cleanContextValue(String(value || ""))]));
}

async function generateWithOpenAI(type: FixType, url: string, current: string, context: Record<string,string>) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const model = process.env.OPENAI_MODEL || "gpt-5.6-luna";
  const prompt = [
    "You are RankFix AI, an SEO/GEO optimization expert.",
    "Create one production-ready fix for the supplied webpage.",
    "For breadcrumb fixes, generate a valid BreadcrumbList JSON-LD proposal using only the supplied URL and page title; do not invent intermediate categories.",
    "For expertise fixes, propose visible author/expert/organization context using only verified context; do not invent people, credentials, certifications, or claims.",
    "Be factual, concise, natural in the page language, and never invent business facts. For structured_data, use the supplied recommended schema and verified business fields only; never invent address, phone, hours, profiles, coordinates, reviews, or ratings.",
    "Return ONLY valid JSON with keys title, content, reason.",
    `type=${type}`, `URL=${url}`, `Current=${current}`, `Context=${JSON.stringify(context)}`
  ].join("\n");
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, input: prompt, max_output_tokens: 700 }),
  });
  if (!response.ok) throw new Error("AI-provider gaf geen geldige response.");
  const data = await response.json();
  const text = typeof data?.output_text === "string"
    ? data.output_text
    : data?.output?.flatMap((x:any)=>x?.content||[]).map((x:any)=>x?.text||"").join("") || "";
  const clean = text.replace(/^\`\`\`json\s*/i,"").replace(/\s*\`\`\`$/,"").trim();
  const parsed = JSON.parse(clean);
  if (!parsed?.title || !parsed?.content || !parsed?.reason) throw new Error("AI-output is onvolledig.");
  return { title:String(parsed.title), content:String(parsed.content), reason:String(parsed.reason) };
}

function fallback(type: FixType, url: string, current: string, context: Record<string,string>): { title: string; content: string; reason: string } {
  const host = new URL(url).hostname.replace(/^www\./,"");
  const safeContext = cleanContext(context);
  const safeCurrent = cleanContextValue(current);
  const subject = safeContext.h1 || safeContext.businessName || safeContext.name || safeContext.title || host;
  if (type==="meta_title") return {title:"Nieuwe meta title",content:trimTo(`${safeCurrent || subject} | ${host}`,60),reason:"Lokale fallback wanneer geen AI-key is ingesteld."};
  if (type==="meta_description") return {title:"Nieuwe meta description",content:trimTo(`Ontdek alles over ${subject.replace(/[.!?]+$/,"")}. Bekijk de belangrijkste informatie, voordelen en praktische antwoorden op één plek. ${host} helpt je direct verder.`,158),reason:"Lokale fallback wanneer geen AI-key is ingesteld."};
  if (type==="h1") return {title:"Nieuwe H1",content:safeCurrent||subject,reason:"Eén duidelijke hoofdboodschap passend bij de pagina-intentie."};
  if (type==="breadcrumb") {
    const pageName = safeContext.title || subject;
    const homeUrl = new URL("/", url).toString();
    const breadcrumb = {"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[
      {"@type":"ListItem","position":1,"name":"Home","item":homeUrl},
      {"@type":"ListItem","position":2,"name":pageName,"item":url}
    ]};
    return {title:"BreadcrumbList voorstel",content:`<script type="application/ld+json">${JSON.stringify(breadcrumb,null,2)}</script>`,reason:"Gebruikt alleen de homepage en de huidige pagina; er worden geen verzonnen tussenliggende categorieën toegevoegd."};
  }
  if (type==="expertise") {
    const businessName = safeContext.businessName || safeContext.name || host;
    return {title:"Expertise-context voorstel",content:`<section><h2>Over ${escapeHtml(businessName)}</h2><p>${escapeHtml(businessName)} publiceert op deze pagina informatie over het onderwerp van de pagina. Houd expertiseclaims gekoppeld aan aantoonbare organisatie- en inhoudssignalen.</p></section>`,reason:"De fallback voegt alleen aantoonbare organisatiecontext toe en verzint geen auteur, certificering of deskundigheidsclaim."};
  }
  if (type==="faq") {
    const businessName = safeContext.businessName || safeContext.name || subject;
    const locality = safeContext.addressLocality;
    const locationQuestion = locality ? `<h3>Waar is ${escapeHtml(businessName)} gevestigd?</h3><p>${escapeHtml(businessName)} is gevestigd in ${escapeHtml(locality)}.</p>` : "";
    return {
      title:"FAQ-blok",
      content:`<section><h2>Veelgestelde vragen over ${escapeHtml(businessName)}${locality ? ` in ${escapeHtml(locality)}` : ""}</h2><h3>Wat is ${escapeHtml(businessName)}?</h3><p>${escapeHtml(businessName)} is een bedrijf dat op deze pagina wordt beschreven.</p>${locationQuestion}</section>`,
      reason:"De FAQ gebruikt alleen de gevonden bedrijfsnaam en locatie en vermijdt verzonnen diensten, prijzen of openingstijden."
    };
  }
  if (type==="structured_data") {
    const classificationText = [safeContext.recommendedSchema, safeContext.title, safeContext.description, safeContext.h1, safeContext.name, safeContext.businessName].filter(Boolean).join(" ");
    const inferredSchema = /\b(hairdresser|kapper|kappers|kapsalon|salon|knippen|haarkleur|haar)\b/i.test(classificationText)
      ? "Hairdresser"
      : /\b(restaurant|eetcafé|eetgelegenheid|keuken|menu|diner|lunch)\b/i.test(classificationText)
        ? "Restaurant"
        : /\b(dentist|tandarts|tandheelkunde)\b/i.test(classificationText)
          ? "Dentist"
          : /\b(electrician|elektricien|elektro)\b/i.test(classificationText)
            ? "Electrician"
            : /\b(plumber|loodgieter|loodgieters)\b/i.test(classificationText)
              ? "Plumber"
              : /\b(aannemer|contractor|bouwbedrijf|bouwservice|verbouwing|renovatie)\b/i.test(classificationText)
                ? "GeneralContractor"
                : /\b(dakdekker|dakbedekking|dakwerken)\b/i.test(classificationText)
                  ? "RoofingContractor"
                  : /\b(beauty salon|beautysalon|schoonheidssalon)\b/i.test(classificationText)
                    ? "BeautySalon"
                    : /\b(store|winkel|shop|boetiek|retail)\b/i.test(classificationText)
                      ? "Store"
                      : /\b(garage|autogarage|autoservice|autobedrijf|autodealer|car dealer)\b/i.test(classificationText)
                        ? "AutomotiveBusiness"
                        : /\b(makelaar|makelaars|vastgoedmakelaar|real estate agent|realtor|woningmakelaar)\b/i.test(classificationText)
                          ? "RealEstateAgent"
                          : /\b(advocaat|advocatenkantoor|law firm|jurist|notaris|notariskantoor)\b/i.test(classificationText)
                            ? "LegalService"
                            : /\b(accountant|accountantskantoor|boekhouder|boekhoudkantoor|administratiekantoor)\b/i.test(classificationText)
                              ? "AccountingService"
                              : /\b(reisbureau|reisorganisatie|travel agency|tour operator|reisagent)\b/i.test(classificationText)
                                ? "TravelAgency"
                                : /\b(hotel|bed and breakfast|b&b|pension)\b/i.test(classificationText)
                                  ? "Hotel"
                                  : /\b(product|webshop|e-commerce|winkelwagen|shopping cart|sku|price|availability)\b/i.test(classificationText)
                                    ? "Product"
                                    : "LocalBusiness";
    const recommendedSchema = safeContext.recommendedSchema && safeContext.recommendedSchema !== "WebPage"
      ? safeContext.recommendedSchema
      : inferredSchema;
    const details = {
      "@context":"https://schema.org",
      "@type":recommendedSchema,
      ...((safeContext.businessName || safeContext.name) ? {name: safeContext.businessName || safeContext.name} : {}),
      ...(safeContext.streetAddress || safeContext.postalCode || safeContext.addressLocality ? {
        address: {
          "@type":"PostalAddress",
          ...(safeContext.streetAddress ? {streetAddress: safeContext.streetAddress} : {}),
          ...(safeContext.postalCode ? {postalCode: safeContext.postalCode} : {}),
          ...(safeContext.addressLocality ? {addressLocality: safeContext.addressLocality} : {}),
          ...(safeContext.addressCountry ? {addressCountry: safeContext.addressCountry} : {})
        }
      } : {}),
      ...(safeContext.telephone ? {telephone: safeContext.telephone} : {}),
      ...(safeContext.url ? {url: safeContext.url} : {})
    };
    return {title:"Structured data voorstel",content:`<script type="application/ld+json">${JSON.stringify(details,null,2)}</script>`,reason:"Gebruikt alleen de tijdens de scan gevonden bedrijfsgegevens en het passende schema-type."};
  }
  throw new Error("Unsupported fix type.");
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const url = typeof body?.url==="string" ? body.url.trim() : "";
    const type = body?.type as FixType;
    const current = typeof body?.current==="string" ? body.current : "";
    const context = body?.context && typeof body.context==="object" ? body.context : {};
    const requestId = typeof body?.request_id === "string" && body.request_id.length <= 120 ? body.request_id : crypto.randomUUID();
    const issueId = typeof body?.issue_id === "string" ? body.issue_id : type === "meta_title" ? (current ? "META_TITLE_GUIDANCE" : "META_TITLE_MISSING") : type === "meta_description" ? (current ? "META_DESCRIPTION_GUIDANCE" : "META_DESCRIPTION_MISSING") : type === "h1" ? "H1_MISSING" : type === "faq" ? "faq" : type === "breadcrumb" ? "breadcrumbs" : type === "expertise" ? "author" : type === "structured_data" ? "STRUCTURED_DATA_MISSING" : "AI_PROPOSAL";
    const issueStatus = typeof body?.issue_status === "string" ? body.issue_status : "FAIL";
    if (!url || !["meta_title","meta_description","h1","faq","breadcrumb","expertise","structured_data"].includes(type)) return NextResponse.json({error:"Ongeldige AI-fix aanvraag."},{status:400});

    let user = null;
    try { user = await getCurrentUser(); } catch {}
    if (user && user.credits < 2) return NextResponse.json({error:"Onvoldoende credits. Deze AI-fix kost 2 credits."},{status:402});

    const safeContext = cleanContext(context);
    let mode = "rule_based_fallback";
    const safeCurrent = cleanContextValue(current);
    let fix = await generateWithOpenAI(type,url,safeCurrent,safeContext).catch((error) => {
      if (process.env.NODE_ENV === "production") throw error;
      return null;
    });
    let expectedSchema = typeof safeContext.recommendedSchema === "string" ? safeContext.recommendedSchema.trim() : "";
    if (type === "structured_data" && (!expectedSchema || expectedSchema === "WebPage")) {
      const classificationText = [safeContext.title, safeContext.description, safeContext.h1, safeContext.name, safeContext.businessName].filter(Boolean).join(" ");
      expectedSchema = /\b(hairdresser|kapper|kappers|kapsalon|salon|knippen|haarkleur|haar)\b/i.test(classificationText)
        ? "Hairdresser"
        : /\b(restaurant|eetcafé|eetgelegenheid|keuken|menu|diner|lunch)\b/i.test(classificationText)
          ? "Restaurant"
          : /\b(dentist|tandarts|tandheelkunde)\b/i.test(classificationText)
            ? "Dentist"
            : /\b(electrician|elektricien|elektro)\b/i.test(classificationText)
              ? "Electrician"
              : /\b(plumber|loodgieter|loodgieters)\b/i.test(classificationText)
                ? "Plumber"
                : /\b(aannemer|contractor|bouwbedrijf|bouwservice|verbouwing|renovatie)\b/i.test(classificationText)
                  ? "GeneralContractor"
                  : /\b(dakdekker|dakbedekking|dakwerken)\b/i.test(classificationText)
                    ? "RoofingContractor"
                    : /\b(beauty salon|beautysalon|schoonheidssalon)\b/i.test(classificationText)
                      ? "BeautySalon"
                      : /\b(store|winkel|shop|boetiek|retail)\b/i.test(classificationText)
                        ? "Store"
                        : /\b(garage|autogarage|autoservice|autobedrijf|autodealer|car dealer)\b/i.test(classificationText)
                          ? "AutomotiveBusiness"
                          : /\b(makelaar|makelaars|vastgoedmakelaar|real estate agent|realtor|woningmakelaar)\b/i.test(classificationText)
                            ? "RealEstateAgent"
                            : /\b(advocaat|advocatenkantoor|law firm|jurist|notaris|notariskantoor)\b/i.test(classificationText)
                              ? "LegalService"
                              : /\b(accountant|accountantskantoor|boekhouder|boekhoudkantoor|administratiekantoor)\b/i.test(classificationText)
                                ? "AccountingService"
                                : /\b(reisbureau|reisorganisatie|travel agency|tour operator|reisagent)\b/i.test(classificationText)
                                  ? "TravelAgency"
                                  : /\b(hotel|bed and breakfast|b&b|pension)\b/i.test(classificationText)
                                    ? "Hotel"
                                    : /\b(product|webshop|e-commerce|winkelwagen|shopping cart|sku|price|availability)\b/i.test(classificationText)
                                      ? "Product"
                                      : "";
    }
    if (type === "structured_data" && !expectedSchema) {
      return NextResponse.json({ error: "Geen aanbevolen schema-context beschikbaar voor deze structured-data fix." }, { status: 422 });
    }

    if (fix === null) {
      fix = fallback(type, url, safeCurrent, safeContext);
    } else {
      mode = "openai";
    }
    fix = cleanFix(fix);
    if (!fix) {
      return NextResponse.json({error:"De AI-fix kon niet worden gemaakt."},{status:502});
    }

    let validated = validateFix({
      issue_id: issueId,
      rule_id: issueId,
      proposed: fix.content,
      source: "ai",
      currentIssue: { issue_id: issueId, rule_id: issueId, status: issueStatus },
      currentValue: safeCurrent,
      expectedSchema: expectedSchema || null
    });

    if (!validated.validation.valid && type === "structured_data" && expectedSchema) {
      fix = cleanFix(fallback(type, url, safeCurrent, safeContext));
      mode = "rule_based_fallback";
      validated = validateFix({
        issue_id: issueId,
        rule_id: issueId,
        proposed: fix.content,
        source: "deterministic",
        currentIssue: { issue_id: issueId, rule_id: issueId, status: issueStatus },
        currentValue: current,
        expectedSchema
      });
    }

    if (!validated.validation.valid) {
      return NextResponse.json({ success:false, error:"invalid_output", validation:validated.validation }, {status:422});
    }

    if (user) {
      const db = getDb();
      const client = await db.connect();
      try {
        await client.query("BEGIN");
        const existing = await client.query("SELECT id FROM credit_transactions WHERE user_id=$1 AND reference_id=$2 LIMIT 1",[user.id,requestId]);
        if (existing.rowCount) {
          await client.query("COMMIT");
        } else {
          const locked = await client.query("SELECT credits FROM users WHERE id=$1 FOR UPDATE",[user.id]);
          if (!locked.rowCount || Number(locked.rows[0].credits) < 2) {
            await client.query("ROLLBACK");
            return NextResponse.json({error:"Onvoldoende credits."},{status:402});
          }
          await client.query("UPDATE users SET credits=credits-2 WHERE id=$1",[user.id]);
          await client.query("INSERT INTO credit_transactions (user_id,amount,reason,reference_id) VALUES ($1,-2,$3,$2)",[user.id,requestId,`ai_fix:${type}`]);
          await client.query("COMMIT");
        }
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally { client.release(); }
    }
    return NextResponse.json({success:true,mode,provider:mode==="openai"?"OpenAI":"RankFix",model:mode==="openai"?(process.env.OPENAI_MODEL||"gpt-5.6-luna"):null,fix,normalizedFix:validated,creditsCharged:user?2:0, requestId});
  } catch { return NextResponse.json({error:"De AI-fix kon niet worden gemaakt."},{status:500}); }
}
