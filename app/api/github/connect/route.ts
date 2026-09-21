import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  const user=await getCurrentUser();
  const base=process.env.APP_URL || "http://localhost:3000";
  if(!user) return NextResponse.redirect(new URL("/account",base));
  const clientId=process.env.GITHUB_CLIENT_ID;
  if(!clientId) return NextResponse.json({error:"GITHUB_CLIENT_ID ontbreekt."},{status:503});
  const callback=process.env.GITHUB_CALLBACK_URL || base + "/api/github/callback";
  const state=randomBytes(24).toString("hex");
  const store=await cookies();
  store.set("github_oauth_state",state,{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",maxAge:600,path:"/"});
  const params=new URLSearchParams({client_id:clientId,redirect_uri:callback,state,scope:"repo user:email offline_access"});
  return NextResponse.redirect("https://github.com/login/oauth/authorize?"+params.toString());
}
