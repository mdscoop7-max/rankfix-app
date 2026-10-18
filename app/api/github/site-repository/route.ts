import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { ensureDatabase } from "@/lib/db-init";
import { getDb } from "@/lib/db";
import { siteConsentValid } from "@/lib/fix-engine";

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
    "SELECT repository,base_branch,verified_at,autofix_publish,autofix_repository,autofix_branch,autofix_consented_at FROM website_repositories WHERE user_id=$1 AND website_host=$2 LIMIT 1",
    [user.id,host]
  );
  if(!result.rowCount) return NextResponse.json({mapped:false,website_host:host,autofix:{enabled:false}});
  const row=result.rows[0];
  return NextResponse.json({mapped:true,website_host:host,repository:row.repository,baseBranch:row.base_branch,verifiedAt:row.verified_at,autofix:{enabled:siteConsentValid(row),consentedAt:row.autofix_consented_at||null}});
}

// Explicit, per-website AutoFix publication consent. It is bound to the exact
// repository + branch at the moment of consent; a later mapping change voids it.
export async function PATCH(request:Request){
  const user=await getCurrentUser();
  if(!user) return NextResponse.json({error:"Login vereist."},{status:401});
  const body=await request.json().catch(()=>({}));
  const host=normalizeHost(typeof body?.url==="string"?body.url:"");
  if(!host) return NextResponse.json({error:"Ongeldige website-URL."},{status:400});
  const enable=body?.autofix_publish===true;
  if(enable && body?.confirm!=="AUTOFIX_PUBLISH_CONSENT") return NextResponse.json({error:"Bevestig eerst expliciet dat RankFix ondersteunde, veilige fixes automatisch mag publiceren.",code:"CONSENT_REQUIRED"},{status:400});
  await ensureDatabase();
  const result=await getDb().query(
    enable
      ? "UPDATE website_repositories SET autofix_publish=TRUE,autofix_repository=repository,autofix_branch=base_branch,autofix_consented_at=NOW(),updated_at=NOW() WHERE user_id=$1 AND website_host=$2 RETURNING repository,base_branch,autofix_publish,autofix_repository,autofix_branch,autofix_consented_at"
      : "UPDATE website_repositories SET autofix_publish=FALSE,autofix_repository=NULL,autofix_branch=NULL,autofix_consented_at=NULL,updated_at=NOW() WHERE user_id=$1 AND website_host=$2 RETURNING repository,base_branch,autofix_publish,autofix_repository,autofix_branch,autofix_consented_at",
    [user.id,host]
  );
  if(!result.rowCount) return NextResponse.json({error:"Koppel eerst de GitHub-repository van deze website.",code:"NOT_MAPPED"},{status:409});
  const row=result.rows[0];
  return NextResponse.json({ok:true,website_host:host,autofix:{enabled:siteConsentValid(row),consentedAt:row.autofix_consented_at||null,repository:row.repository,branch:row.base_branch}});
}


export async function DELETE(request:Request){
  const user=await getCurrentUser();
  if(!user) return NextResponse.json({error:"Login vereist."},{status:401});
  const body=await request.json().catch(()=>({}));
  const host=normalizeHost(typeof body?.url==="string"?body.url:"");
  if(!host) return NextResponse.json({error:"Ongeldige website-URL."},{status:400});
  await ensureDatabase();
  const result=await getDb().query(
    "DELETE FROM website_repositories WHERE user_id=$1 AND website_host=$2 RETURNING repository",
    [user.id,host]
  );
  return NextResponse.json({ok:true,mapped:false,website_host:host,previousRepository:result.rows[0]?.repository||null});
}
