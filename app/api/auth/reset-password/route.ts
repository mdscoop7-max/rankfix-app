import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { getDb } from "@/lib/db";
import { ensureDatabase } from "@/lib/db-init";
import { hashPassword, createSession } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const body=await request.json();
    const token=typeof body?.token==="string"?body.token:"";
    const password=typeof body?.password==="string"?body.password:"";
    if(token.length<40 || password.length<8) return NextResponse.json({error:"Ongeldige resetlink of wachtwoord."},{status:400});
    await ensureDatabase();
    const db=getDb();
    const tokenHash=createHash("sha256").update(token).digest("hex");
    const result=await db.query("SELECT user_id FROM password_reset_tokens WHERE token_hash=$1 AND expires_at>NOW()",[tokenHash]);
    if(!result.rows[0]) return NextResponse.json({error:"Deze resetlink is verlopen of al gebruikt."},{status:400});
    const userId=result.rows[0].user_id;
    await db.query("UPDATE users SET password_hash=$1 WHERE id=$2",[await hashPassword(password),userId]);
    await db.query("DELETE FROM password_reset_tokens WHERE token_hash=$1",[tokenHash]);
    await db.query("DELETE FROM sessions WHERE user_id=$1",[userId]);
    await createSession(userId);
    return NextResponse.json({success:true});
  } catch { return NextResponse.json({error:"Wachtwoord wijzigen mislukt."},{status:500}); }
}