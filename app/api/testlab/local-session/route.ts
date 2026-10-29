import { NextRequest, NextResponse } from "next/server";
import { hasLocalQaSession, localQaCookieName, loopbackRequest, validLocalQaToken } from "@/lib/local-qa";
export async function GET(request: NextRequest) {
  if (!loopbackRequest(request)) return NextResponse.json({error:"LOCAL_ONLY"},{status:403});
  const token = request.nextUrl.searchParams.get("token") || "";
  if (token && validLocalQaToken(token)) {
    if (request.headers.get("x-rankfix-qa-probe") === "1") return NextResponse.json({authorized:true,mode:"local-qa"});
    const redirect = NextResponse.redirect(new URL("/dashboard/testlab?catalog=fresh144",request.url));
    redirect.cookies.set(localQaCookieName,token,{httpOnly:true,sameSite:"strict",secure:false,path:"/"});
    return redirect;
  }
  if (await hasLocalQaSession(request)) return NextResponse.json({authorized:true,mode:"local-qa"});
  return NextResponse.json({authorized:false,error:"LOCAL_QA_SESSION_REQUIRED"},{status:401});
}
