import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { ensureDatabase } from "@/lib/db-init";
import { getDb } from "@/lib/db";

function normalizeHost(value:string){
  try { return new URL(value).hostname.toLowerCase().replace(/^www\./,""); }
  catch { return ""; }
}

export async function GET(request:Request){
  const user=await getCurrentUser();
  if(!user) return NextResponse.json({error:"Login vereist."},{status:401});
  const url=new URL(request.url).searchParams.get("url")||"";
  const host=normalizeHost(url);
  if(!host) return NextResponse.json({error:"Ongeldige website-URL."},{status:400});
  await ensureDatabase();
  const result=await getDb().query(
    "SELECT repository,base_branch,verified_at FROM website_repositories WHERE user_id=$1 AND website_host=$2 LIMIT 1",
    [user.id,host]
  );
  if(!result.rowCount) return NextResponse.json({mapped:false,website_host:host});
  const row=result.rows[0];
  return NextResponse.json({mapped:true,website_host:host,repository:row.repository,baseBranch:row.base_branch,verifiedAt:row.verified_at});
}
