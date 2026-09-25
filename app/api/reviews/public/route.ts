import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureDatabase } from "@/lib/db-init";

export async function GET() {
  await ensureDatabase();
  const result=await getDb().query(`SELECT r.id,r.rating,r.review_text,r.company_name,r.website,r.created_at,u.name
    FROM reviews r JOIN users u ON u.id=r.user_id WHERE r.status='APPROVED' ORDER BY r.created_at DESC LIMIT 12`);
  const reviews=result.rows.map((row:any)=>({...row,name:(row.name||"RankFix-klant").trim().split(/\s+/)[0]}));
  const count=reviews.length;
  const average=count ? Math.round((reviews.reduce((n:number,r:any)=>n+Number(r.rating),0)/count)*10)/10 : null;
  return NextResponse.json({reviews,count,average});
}