import { NextRequest, NextResponse } from "next/server";
import { hasLocalQaSession, localQaCookieName, loopbackRequest, validLocalQaToken } from "@/lib/local-qa";
export async function GET(request: NextRequest) {
  if (!loopbackRequest(request)) return NextResponse.json({error:"LOCAL_ONLY"},{status:403});
  const token = request.nextUrl.searchParams.get("token") || "";
  if (token && validLocalQaToken(token)) {
    if (request.headers.get("x-rankfix-qa-probe") === "1") return NextResponse.json({authorized:true,mode:"local-qa"});
    // A 200 response lets the browser store the local QA cookie before navigating.
    // The token never appears in the destination URL or HTML body.
    const html = `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>RankFix QA aanmelden</title></head><body><h1>Lokale QA-aanmelding controleren</h1><p id="status">Browsersessie controleren...</p><p id="help" hidden>De browser heeft geen geldige QA-sessie. Controleer of cookies voor 127.0.0.1 zijn toegestaan en open de launcher opnieuw in hetzelfde browserprofiel. Er zijn geen resultaten gewist.</p><a href="/dashboard/testlab?catalog=fresh144">Open TestLab</a><script>
(async function(){
  const status=document.getElementById("status");
  try {
    const response=await fetch("/api/testlab/catalog?catalog=fresh144",{credentials:"same-origin",cache:"no-store"});
    if(!response.ok){status.textContent="QA-aanmelding mislukt (HTTP "+response.status+").";document.getElementById("help").hidden=false;return;}
    const data=await response.json();
    if(!Array.isArray(data.sites)){status.textContent="Catalogusantwoord is ongeldig.";document.getElementById("help").hidden=false;return;}
    status.textContent="QA-sessie bevestigd. TestLab wordt geopend...";
    window.location.replace("/dashboard/testlab?catalog=fresh144");
  }catch(e){status.textContent="Kan QA-catalogus niet bereiken.";document.getElementById("help").hidden=false;}
})();
</script></body></html>`;
    const response = new NextResponse(html,{status:200,headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store","Referrer-Policy":"no-referrer","X-Robots-Tag":"noindex"}});
    response.cookies.set(localQaCookieName,token,{httpOnly:true,sameSite:"lax",secure:false,path:"/",maxAge:60*60*12});
    return response;
  }
  if (await hasLocalQaSession(request)) return NextResponse.json({authorized:true,mode:"local-qa"});
  return NextResponse.json({authorized:false,error:"LOCAL_QA_SESSION_REQUIRED"},{status:401});
}
