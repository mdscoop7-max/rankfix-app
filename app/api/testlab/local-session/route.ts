import { NextRequest, NextResponse } from "next/server";
import { hasLocalQaSession, localQaCookieName, loopbackRequest, validLocalQaToken } from "@/lib/local-qa";
export async function GET(request: NextRequest) {
  if (!loopbackRequest(request)) return NextResponse.json({error:"LOCAL_ONLY"},{status:403});
  const token = request.nextUrl.searchParams.get("token") || "";
  if (token && validLocalQaToken(token)) {
    if (request.headers.get("x-rankfix-qa-probe") === "1") return NextResponse.json({authorized:true,mode:"local-qa"});
    // A 200 response lets the browser store the local QA cookie before navigating.
    // The token never appears in the destination URL or HTML body.
    const html = `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><meta http-equiv="refresh" content="1;url=/dashboard/testlab?catalog=fresh144"><title>RankFix QA aanmelden</title></head><body><p>Lokale QA-aanmelding wordt geopend...</p><a href="/dashboard/testlab?catalog=fresh144">Open TestLab</a></body></html>`;
    const response = new NextResponse(html,{status:200,headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store","Referrer-Policy":"no-referrer","X-Robots-Tag":"noindex"}});
    response.cookies.set(localQaCookieName,token,{httpOnly:true,sameSite:"lax",secure:false,path:"/",maxAge:60*60*12});
    return response;
  }
  if (await hasLocalQaSession(request)) return NextResponse.json({authorized:true,mode:"local-qa"});
  return NextResponse.json({authorized:false,error:"LOCAL_QA_SESSION_REQUIRED"},{status:401});
}
