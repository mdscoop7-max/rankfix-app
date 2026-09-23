import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { validateFix } from "@/lib/seo-fix-validator";

type FixType = "meta_title" | "meta_description" | "h1" | "faq" | "structured_data";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[char]!));
}
function trimTo(value: string, max: number) {
  return value.length <= max ? value : value.slice(0, max - 1).trimEnd() + "…";
}

async function generateWithOpenAI(type: FixType, url: string, current: string, context: Record<string,string>) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const model = process.env.OPENAI_MODEL || "gpt-5.6-luna";
  const prompt = [
    "You are RankFix AI, an SEO/GEO optimization expert.",
    "Create one production-ready fix for the supplied webpage.",
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
  const subject = context.h1 || context.title || host;
  if (type==="meta_title") return {title:"Nieuwe meta title",content:trimTo(`${current.trim() || subject} | ${host}`,60),reason:"Lokale fallback wanneer geen AI-key is ingesteld."};
  if (type==="meta_description") return {title:"Nieuwe meta description",content:trimTo(`Ontdek alles over ${subject.replace(/[.!?]+$/,"")}. Bekijk de belangrijkste informatie, voordelen en praktische antwoorden op één plek. ${host} helpt je direct verder.`,158),reason:"Lokale fallback wanneer geen AI-key is ingesteld."};
  if (type==="h1") return {title:"Nieuwe H1",content:current.trim()||subject,reason:"Eén duidelijke hoofdboodschap passend bij de pagina-intentie."};
  if (type==="faq") return {title:"FAQ-blok",content:`<section><h2>Veelgestelde vragen over ${escapeHtml(subject)}</h2><h3>Wat is ${escapeHtml(subject)}?</h3><p>Deze pagina geeft een helder antwoord op de belangrijkste vragen over ${escapeHtml(subject)}.</p></section>`,reason:"Directe vragen en antwoorden maken de pagina beter scanbaar."};
  if (type==="structured_data") {
    const recommendedSchema = context.recommendedSchema || "WebPage";
    const details = {
      "@context":"https://schema.org",
      "@type":recommendedSchema,
      ...(context.businessName ? {name: context.businessName} : {}),
      ...(context.streetAddress || context.postalCode || context.addressLocality ? {
        address: {
          "@type":"PostalAddress",
          ...(context.streetAddress ? {streetAddress: context.streetAddress} : {}),
          ...(context.postalCode ? {postalCode: context.postalCode} : {}),
          ...(context.addressLocality ? {addressLocality: context.addressLocality} : {}),
          ...(context.addressCountry ? {addressCountry: context.addressCountry} : {})
        }
      } : {}),
      ...(context.telephone ? {telephone: context.telephone} : {}),
      ...(context.url ? {url: context.url} : {})
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
    const issueId = typeof body?.issue_id === "string" ? body.issue_id : type === "meta_title" ? (current ? "META_TITLE_GUIDANCE" : "META_TITLE_MISSING") : type === "meta_description" ? (current ? "META_DESCRIPTION_GUIDANCE" : "META_DESCRIPTION_MISSING") : type === "h1" ? "H1_MISSING" : type === "structured_data" ? "STRUCTURED_DATA_MISSING" : "AI_PROPOSAL";
    const issueStatus = typeof body?.issue_status === "string" ? body.issue_status : "FAIL";
    if (!url || !["meta_title","meta_description","h1","faq","structured_data"].includes(type)) return NextResponse.json({error:"Ongeldige AI-fix aanvraag."},{status:400});

    let user = null;
    try { user = await getCurrentUser(); } catch {}
    if (user && user.credits < 2) return NextResponse.json({error:"Onvoldoende credits. Deze AI-fix kost 2 credits."},{status:402});

    let mode = "rule_based_fallback";
    let fix = await generateWithOpenAI(type,url,current,context).catch((error) => {
      if (process.env.NODE_ENV === "production") throw error;
      return null;
    });
    if (fix === null) {
      fix = fallback(type,url,current,context);
    }
    if (!fix) {
      return NextResponse.json({error:"De AI-fix kon niet worden gemaakt."},{status:502});
    }
    mode = "openai";

    const validated = validateFix({ issue_id: issueId, rule_id: issueId, proposed: fix.content, source: "ai", currentIssue: { issue_id: issueId, rule_id: issueId, status: issueStatus }, currentValue: current, expectedSchema: typeof context.recommendedSchema === "string" ? context.recommendedSchema : null });
    if (!validated.validation.valid) return NextResponse.json({ success:false, error:"invalid_output", validation:validated.validation }, {status:422});

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
