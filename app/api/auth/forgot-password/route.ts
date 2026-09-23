import { NextResponse } from "next/server";
import { randomBytes, createHash } from "crypto";
import { getDb } from "@/lib/db";
import { ensureDatabase } from "@/lib/db-init";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!/^\S+@\S+\.\S+$/.test(email)) return NextResponse.json({error:"Vul een geldig e-mailadres in."},{status:400});
    await ensureDatabase();
    const db=getDb();
    const result=await db.query("SELECT id,email,name FROM users WHERE email=$1",[email]);
    if(!result.rows[0]) return NextResponse.json({success:true});
    const user=result.rows[0];
    const token=randomBytes(32).toString("hex");
    const tokenHash=createHash("sha256").update(token).digest("hex");
    await db.query("DELETE FROM password_reset_tokens WHERE user_id=$1",[user.id]);
    await db.query("INSERT INTO password_reset_tokens (token_hash,user_id,expires_at) VALUES ($1,$2,NOW()+INTERVAL '30 minutes')",[tokenHash,user.id]);
    const base=(process.env.APP_URL || "https://rankfix-app.vercel.app").replace(/\/$/,"");
    const resetUrl=base+"/account/reset-password?token="+encodeURIComponent(token);
    const apiKey=process.env.RESEND_API_KEY, from=process.env.RESEND_FROM;
    if(apiKey && from){
      const safeName=String(user.name).replace(/[<>]/g,"");
      await fetch("https://api.resend.com/emails",{method:"POST",headers:{"Authorization":"Bearer "+apiKey,"Content-Type":"application/json"},body:JSON.stringify({from,to:[user.email],subject:"RankFix — wachtwoord opnieuw instellen",html:"<div style='font-family:Arial,sans-serif;max-width:600px;margin:auto'><h2>Wachtwoord opnieuw instellen</h2><p>Hoi "+safeName+",</p><p>Klik op de knop hieronder om een nieuw RankFix-wachtwoord te kiezen. De link is 30 minuten geldig.</p><p><a href='"+resetUrl+"' style='display:inline-block;background:#06b6d4;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none'>Nieuw wachtwoord kiezen</a></p><p>Heb je dit niet aangevraagd? Dan hoef je niets te doen.</p></div>"})});
    }
    return NextResponse.json({success:true});
  } catch { return NextResponse.json({error:"Aanvraag mislukt. Probeer het later opnieuw."},{status:500}); }
}