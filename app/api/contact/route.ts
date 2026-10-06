import { NextResponse } from "next/server";
import { ensureDatabase } from "@/lib/db-init";
import { consumeRateLimit, requestIp } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    const declaredLength=Number(request.headers.get("content-length")||0);
    if(Number.isFinite(declaredLength)&&declaredLength>20_000){
      return NextResponse.json({error:"Bericht is te groot."},{status:413});
    }
    await ensureDatabase();
    if(!await consumeRateLimit("contact",requestIp(request),5,3600)){
      return NextResponse.json({error:"Te veel contactverzoeken vanaf dit netwerk. Probeer later opnieuw."},{status:429,headers:{"Retry-After":"3600"}});
    }
    const body = await request.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const company = typeof body.company === "string" ? body.company.trim() : "";
    const message = typeof body.message === "string" ? body.message.trim() : "";

    if (!name || !email || !message) return NextResponse.json({ error: "Vul naam, e-mailadres en bericht in." }, { status: 400 });
    if(name.length>120||email.length>254||company.length>160||message.length>5000) return NextResponse.json({error:"Een of meer velden zijn te lang."},{status:400});
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Vul een geldig e-mailadres in." }, { status: 400 });

    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.SCAN_REPORT_FROM || process.env.RESEND_FROM;
    const to = process.env.CONTACT_EMAIL || process.env.SCAN_REPORT_TO;
    if (!apiKey || !from || !to) return NextResponse.json({ error: "Contactformulier is tijdelijk niet beschikbaar." }, { status: 503 });

    const subject = `Nieuw RankFix contactbericht van ${name}`;
    const text = [`Naam: ${name}`,`E-mail: ${email}`,company?`Bedrijf: ${company}`:"","",message].filter(Boolean).join("\n");
    const html = `<h2>Nieuw RankFix contactbericht</h2><p><strong>Naam:</strong> ${escapeHtml(name)}</p><p><strong>E-mail:</strong> ${escapeHtml(email)}</p>${company?`<p><strong>Bedrijf:</strong> ${escapeHtml(company)}</p>`:""}<p><strong>Bericht:</strong></p><p>${escapeHtml(message).replace(/\n/g,"<br />")}</p>`;
    const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"},body:JSON.stringify({from,to:[to],reply_to:email,subject,text,html})});
    if(!response.ok){
      console.error("Resend contact delivery failed",{status:response.status});
      return NextResponse.json({error:"Bericht kon niet worden verzonden."},{status:502});
    }
    return NextResponse.json({ok:true});
  } catch (error) {
    console.error("Contact route error:",error instanceof Error?error.message:"CONTACT_FAILED");
    return NextResponse.json({error:"Bericht kon niet worden verzonden."},{status:500});
  }
}
function escapeHtml(value:string){return value.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;");}
