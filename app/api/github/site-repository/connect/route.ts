import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { ensureDatabase } from "@/lib/db-init";
import { decryptToken, githubFetch } from "@/lib/github";

function host(value:string){
  try{return new URL(value).hostname.toLowerCase().replace(/^www\./,"");}catch{return "";}
}
function safeRepo(value:string){return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value)&&!value.includes("..");}
function safeBranch(value:string){return /^[A-Za-z0-9._/-]{1,120}$/.test(value)&&!value.includes("..");}

export async function POST(request:Request){
  const user=await getCurrentUser();
  if(!user) return NextResponse.json({error:"Login vereist."},{status:401});
  let body:unknown;
  try{body=await request.json();}catch{return NextResponse.json({error:"Ongeldige aanvraag."},{status:400});}
  const input=body&&typeof body==="object"?body as Record<string,unknown>:{};
  const websiteHost=host(String(input.url||""));
  const repository=String(input.repository||"").trim();
  const baseBranch=String(input.baseBranch||"main").trim();
  if(!websiteHost||!safeRepo(repository)||!safeBranch(baseBranch)) return NextResponse.json({error:"Ongeldige website- of repositorygegevens."},{status:400});
  await ensureDatabase();
  const connection=await getDb().query("SELECT access_token_encrypted FROM github_connections WHERE user_id=$1",[user.id]);
  if(!connection.rowCount) return NextResponse.json({error:"Verbind eerst GitHub."},{status:409});
  try{
    const token=decryptToken(connection.rows[0].access_token_encrypted);
    const repo=await githubFetch<{full_name:string}>(token,"/repos/"+repository);
    if(!repo||String(repo.full_name||"").toLowerCase()!==repository.toLowerCase()) return NextResponse.json({error:"Repository kon niet worden bevestigd."},{status:422});
    const branch=await githubFetch<{name:string}>(token,"/repos/"+repository+"/branches/"+encodeURIComponent(baseBranch));
    if(!branch?.name) return NextResponse.json({error:"Branch kon niet worden bevestigd."},{status:422});
    await getDb().query(
      "INSERT INTO website_repositories (user_id,website_host,repository,base_branch,verified_at,updated_at) VALUES ($1,$2,$3,$4,NOW(),NOW()) ON CONFLICT (user_id,website_host) DO UPDATE SET repository=EXCLUDED.repository,base_branch=EXCLUDED.base_branch,verified_at=NOW(),updated_at=NOW()",
      [user.id,websiteHost,String(repo.full_name),String(branch.name)]
    );
    return NextResponse.json({success:true,website_host:websiteHost,repository:repo.full_name,baseBranch:branch.name});
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:"Repository koppelen mislukt."},{status:502});
  }
}
