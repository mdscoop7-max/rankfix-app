import { createHash, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { ensureDatabase } from "@/lib/db-init";
import { getDb } from "@/lib/db";

const TEST_CODE_HASH="23266f2bfb1fc8ae16340aca5a1b22fe2a1be0d63e5c45631549e1215ada3696";

export async function POST(request:Request){
 const user=await getCurrentUser();
 if(!user)return NextResponse.json({error:"Login vereist."},{status:401});
 const body=await request.json().catch(()=>({}));
 const code=typeof body?.code==="string"?body.code.trim():"";
 const supplied=createHash("sha256").update(code).digest();
 const expected=Buffer.from(TEST_CODE_HASH,"hex");
 if(!code||supplied.length!==expected.length||!timingSafeEqual(supplied,expected))return NextResponse.json({error:"Ongeldige test abonnementscode."},{status:403});
 await ensureDatabase();
 await getDb().query("UPDATE users SET plan_code='pro', subscription_status='test' WHERE id=$1",[user.id]);
 return NextResponse.json({success:true,plan:"pro",status:"test"});
}
