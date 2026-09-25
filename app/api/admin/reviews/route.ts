import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { ensureDatabase } from "@/lib/db-init";
async function admin(){
 const user=await getCurrentUser();
 const email=(process.env.RANKFIX_ADMIN_EMAIL||"").trim().toLowerCase();
 return user && email && user.email.toLowerCase()===email ? user : null;
}
export async function GET(){
 await ensureDatabase(); if(!await admin())return NextResponse.json({error:"Geen toegang."},{status:403});
 const r=await getDb().query(`SELECT r.id,r.rating,r.review_text,r.company_name,r.website,r.status,r.created_at,u.name,u.email FROM reviews r JOIN users u ON u.id=r.user_id ORDER BY CASE r.status WHEN 'PENDING' THEN 0 ELSE 1 END,r.created_at DESC LIMIT 100`);
 return NextResponse.json({reviews:r.rows});
}
export async function PATCH(request:Request){
 await ensureDatabase(); if(!await admin())return NextResponse.json({error:"Geen toegang."},{status:403});
 const body=await request.json(); const id=typeof body?.id==="string"?body.id:""; const status=body?.status;
 if(!id||!["APPROVED","REJECTED","PENDING"].includes(status))return NextResponse.json({error:"Ongeldige reviewactie."},{status:400});
 const r=await getDb().query("UPDATE reviews SET status=$1,updated_at=NOW() WHERE id=$2 RETURNING id,status",[status,id]);
 if(!r.rowCount)return NextResponse.json({error:"Review niet gevonden."},{status:404});
 return NextResponse.json({review:r.rows[0]});
}