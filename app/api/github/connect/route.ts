import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { githubOAuthConfiguration, githubReturnPath, githubReturnStatus } from "@/lib/github-oauth-navigation";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const returnTo = githubReturnPath(url.searchParams.get("return_to"));
  const user=await getCurrentUser();
  const base=url.origin;
  if(!user) return NextResponse.redirect(new URL("/account",base));
  const clientId=process.env.GITHUB_CLIENT_ID;
  if(!clientId || !githubOAuthConfiguration(base, process.env).ready) return NextResponse.redirect(new URL(githubReturnStatus(returnTo, "unavailable"), base));
  const callback=process.env.GITHUB_CALLBACK_URL || base + "/api/github/callback";
  const state=randomBytes(24).toString("hex");
  const store=await cookies();
  store.set("github_oauth_state",state,{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",maxAge:600,path:"/"});
  store.set("github_oauth_return",returnTo,{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",maxAge:600,path:"/"});
  const params=new URLSearchParams({client_id:clientId,redirect_uri:callback,state,scope:"repo user:email offline_access"});
  return NextResponse.redirect("https://github.com/login/oauth/authorize?"+params.toString());
}
