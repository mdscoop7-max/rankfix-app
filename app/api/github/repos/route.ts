import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { decryptToken, githubFetch } from "@/lib/github";
export async function GET() {
  const user=await getCurrentUser();
  if(!user) return NextResponse.json({error:"Login vereist."},{status:401});
  const r=await getDb().query("SELECT access_token_encrypted FROM github_connections WHERE user_id=$1",[user.id]);
  if(!r.rowCount) return NextResponse.json({error:"GitHub is nog niet verbonden."},{status:409});
  try {
    const repos=await githubFetch<any[]>(decryptToken(r.rows[0].access_token_encrypted),"/user/repos?sort=updated&per_page=100");
    return NextResponse.json({repos:repos.map((x:any)=>({full_name:x.full_name,default_branch:x.default_branch,private:x.private}))});
  } catch(error) { return NextResponse.json({error:error instanceof Error?error.message:"GitHub repos laden mislukt."},{status:502}); }
}
