import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";

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
    "Be factual, concise, natural in the page language, and never invent business facts.",
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

function fallback(type: FixType, url: string, current: string, context: Record<string,string>) {
  const host = new URL(url).hostname.replace(/^www\./,"");
  const subject = context.h1 || context.title || host;
  if (type==="meta_title") return {title:"Nieuwe meta title",content:trimTo(`${current.trim() || subject} | ${host}`,60),reason:"Lokale fallback wanneer geen AI-key is ingesteld."};
  if (type==="meta_description") return {title:"Nieuwe meta description",content:trimTo(`Ontdek alles over ${subject.replace(/[.!?]+$/,"")}. Bekijk de belangrijkste informatie, voordelen en praktische antwoorden op één plek. ${host} helpt je direct verder.`,158),reason:"Lokale fallback wanneer geen AI-key is ingesteld."};
  if (type==="h1") return {title:"Nieuwe H1",content:current.trim()||subject,reason:"Eén duidelijke hoofdboodschap passend bij de pagina-intentie."};
  if (type==="faq") return {title:"FAQ-blok",content:`<section><h2>Veelgestelde vragen over ${escapeHtml(subject)}</h2><h3>Wat is ${escapeHtml(subject)}?</h3><p>Deze pagina geeft een helder antwoord op de belangrijkste vragen over ${escapeHtml(subject)}.</p></section>`,reason:"Directe vragen en antwoorden maken de pagina beter scanbaar."};
  return {title:"Structured data voorstel",content:`<script type="application/ld+json">${JSON.stringify({"@context":"https://schema.org","@type":"WebPage",name:subject,url},null,2)}</script>`,reason:"Geeft machines expliciete context over het paginatype."};
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const url = typeof body?.url==="string" ? body.url.trim() : "";
    const type = body?.type as FixType;
    const current = typeof body?.current==="string" ? body.current : "";
    const context = body?.context && typeof body.context==="object" ? body.context : {};
    if (!url || !["meta_title","meta_description","h1","faq","structured_data"].includes(type)) return NextResponse.json({error:"Ongeldige AI-fix aanvraag."},{status:400});

    let user = null;\n    try { user = await getCurrentUser(); } catch {}
    if (user && user.credits < 2) return NextResponse.json({error:"Onvoldoende credits. Deze AI-fix kost 2 credits."},{status:402});

    let fix;
    let mode = "rule_based_fallback";
    try {
      fix = await generateWithOpenAI(type,url,current,context);
      if (fix) mode = "openai";
    } catch (error) {
      if (process.env.NODE_ENV === "production") return NextResponse.json({error:error instanceof Error ? error.message : "AI-fix mislukt."},{status:502});
    }
    fix ||= fallback(type,url,current,context);

    if (user) {
      const db = getDb();
      const updated = await db.query("UPDATE users SET credits=credits-2 WHERE id=$1 AND credits>=2 RETURNING credits",[user.id]);
      if (!updated.rowCount) return NextResponse.json({error:"Onvoldoende credits."},{status:402});
      await db.query("INSERT INTO credit_transactions (user_id,amount,reason) VALUES ($1,-2,$2)",[user.id,`ai_fix:${type}`]);
    }
    return NextResponse.json({success:true,mode,provider:mode==="openai"?"OpenAI":"RankFix",model:mode==="openai"?(process.env.OPENAI_MODEL||"gpt-5.6-luna"):null,fix,creditsCharged:user?2:0});
  } catch { return NextResponse.json({error:"De AI-fix kon niet worden gemaakt."},{status:500}); }
}
