import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { ensureDatabase } from "@/lib/db-init";
import { getDb } from "@/lib/db";

function normalize(value:string){
  try{
    const url=new URL(value);
    if(!["http:","https:"].includes(url.protocol)) return null;
    return {host:url.hostname.toLowerCase().replace(/^www\./,""),url:url.origin};
  }catch{return null;}
}

export async function GET(request:Request){
  const user=await getCurrentUser();
  if(!user) return NextResponse.json({error:"Login vereist."},{status:401});
  const target=normalize(new URL(request.url).searchParams.get("url")||"");
  if(!target) return NextResponse.json({error:"Ongeldige website-URL."},{status:400});
  await ensureDatabase();
  const row=await getDb().query(
    "SELECT enabled,interval_hours,last_checked_at,next_check_at,last_status,consecutive_failures FROM website_monitors WHERE user_id=$1 AND website_host=$2 LIMIT 1",
    [user.id,target.host]
  );
  return NextResponse.json({enabled:!!row.rows[0]?.enabled,interval_hours:row.rows[0]?.interval_hours||168,last_checked_at:row.rows[0]?.last_checked_at||null,next_check_at:row.rows[0]?.next_check_at||null,last_status:row.rows[0]?.last_status||null,consecutive_failures:row.rows[0]?.consecutive_failures||0});
}

export async function POST(request:Request){
  const user=await getCurrentUser();
  if(!user) return NextResponse.json({error:"Login vereist."},{status:401});
  const body=await request.json().catch(()=>null);
  const target=normalize(String(body?.url||""));
  if(!target||typeof body?.enabled!=="boolean") return NextResponse.json({error:"Ongeldige invoer."},{status:400});
  await ensureDatabase();

  // A user may only monitor a host that already exists in their own scan history.
  const owned=await getDb().query(
    "SELECT 1 FROM scans WHERE user_id=$1 AND lower(regexp_replace(split_part(split_part(final_url, '://', 2), '/', 1), '^www\\.', ''))=$2 LIMIT 1",
    [user.id,target.host]
  );
  if(!owned.rowCount) return NextResponse.json({error:"Scan deze website eerst voordat monitoring wordt ingeschakeld."},{status:403});

  await getDb().query(
    `INSERT INTO website_monitors (user_id,website_host,website_url,enabled,interval_hours,next_check_at)
     VALUES ($1,$2,$3,$4,168,CASE WHEN $4 THEN NOW() ELSE NULL END)
     ON CONFLICT (user_id,website_host) DO UPDATE SET
       website_url=EXCLUDED.website_url,
       enabled=EXCLUDED.enabled,
       interval_hours=168,
       next_check_at=CASE WHEN EXCLUDED.enabled THEN COALESCE(website_monitors.next_check_at,NOW()) ELSE NULL END,
       updated_at=NOW()`,
    [user.id,target.host,target.url,body.enabled]
  );
  return NextResponse.json({ok:true,enabled:body.enabled,interval_hours:168});
}
