import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { encryptToken, githubFetch } from "@/lib/github";

export async function GET(request:Request) {
  const url=new URL(request.url);
  const code=url.searchParams.get("code"), state=url.searchParams.get("state");
  const store=await cookies(), expected=store.get("github_oauth_state")?.value;
  const user=await getCurrentUser(), base=process.env.APP_URL || url.origin;
  if(!user) return NextResponse.redirect(base+"/account");
  if(!code || !state || !expected || state!==expected) return NextResponse.redirect(base+"/dashboard?github=error");
  store.delete("github_oauth_state");
  try {
    const tokenResponse=await fetch("https://github.com/login/oauth/access_token",{
      method:"POST",headers:{"Accept":"application/json","Content-Type":"application/json"},
      body:JSON.stringify({client_id:process.env.GITHUB_CLIENT_ID,client_secret:process.env.GITHUB_CLIENT_SECRET,code,redirect_uri:process.env.GITHUB_CALLBACK_URL || base+"/api/github/callback"})
    });
    const tokenData=await tokenResponse.json();
    if(!tokenResponse.ok || !tokenData.access_token) throw new Error("GitHub autorisatie mislukt.");
    const ghUser=await githubFetch<any>(tokenData.access_token,"/user");
    await getDb().query(
      "INSERT INTO github_connections (user_id,github_user_id,github_login,access_token_encrypted,scopes) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (user_id) DO UPDATE SET github_user_id=EXCLUDED.github_user_id,github_login=EXCLUDED.github_login,access_token_encrypted=EXCLUDED.access_token_encrypted,scopes=EXCLUDED.scopes,updated_at=NOW()",
      [user.id,ghUser.id,ghUser.login,encryptToken(tokenData.access_token),typeof tokenData.scope==="string"?tokenData.scope:""]
    );
    return NextResponse.redirect(base+"/dashboard?github=connected");
  } catch { return NextResponse.redirect(base+"/dashboard?github=error"); }
}
