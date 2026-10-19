import { NextResponse } from "next/server";
import { safePublicFetch, readResponseTextLimited } from "@/lib/safe-fetch";

export const runtime="nodejs";
export const maxDuration=60;
const targets: Record<string,{url:string;expected:string}>={
 "monumenten.nl":{url:"https://www.monumenten.nl/",expected:"Erfgoed / informatie"},
 "coolblue.nl":{url:"https://www.coolblue.nl/",expected:"Webshop / e-commerce"},
 "mollie.com":{url:"https://www.mollie.com/nl/",expected:"Financiële dienstverlening"},
 "concertgebouw.nl":{url:"https://www.concertgebouw.nl/",expected:"Cultuur / evenementen"},
 "vogelbescherming.nl":{url:"https://www.vogelbescherming.nl/",expected:"Natuurorganisatie / goed doel"}
};
const get=(html:string,re:RegExp)=>html.match(re)?.[1]?.replace(/<[^>]*>/g,"").replace(/\s+/g," ").trim()||"";
const strip=(html:string)=>html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi," ").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ").replace(/&nbsp;|&#160;/gi," ").replace(/\s+/g," ").slice(0,120000);
export async function POST(request:Request){
 const origin=request.headers.get("origin");const host=request.headers.get("host")||"";
 if(origin){let parsed:URL;try{parsed=new URL(origin)}catch{return NextResponse.json({error:"Ongeldige herkomst."},{status:403})}if(parsed.host!==host)return NextResponse.json({error:"Alleen vanaf RankFix testen."},{status:403});}
 let body:{website?:unknown};try{body=await request.json()}catch{return NextResponse.json({error:"Ongeldige aanvraag."},{status:400})}
 const key=typeof body.website==="string"?body.website.toLowerCase().trim():"";
 const selection=targets[key];if(!selection)return NextResponse.json({error:"Deze QA-scanner accepteert uitsluitend de vijf vastgelegde testwebsites."},{status:400});
 try{
  const fetchResult=await safePublicFetch(selection.url,{timeoutMs:13000,maxRedirects:4,userAgent:"RankFixBot/2.1 (+https://rankfix-app.vercel.app)"});
  const response=fetchResult.response;
  if(!response.ok)return NextResponse.json({website:key,error:"Website gaf HTTP "+response.status,code:"HTTP_ERROR"},{status:502});
  const html=await readResponseTextLimited(response,5_000_000,20000);
  const title=get(html,/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const description=get(html,/<meta\b(?=[^>]*name=["']description["'])(?=[^>]*content=["']([^"']*)["'])[^>]*>/i)||get(html,/<meta\b(?=[^>]*content=["']([^"']*)["'])(?=[^>]*name=["']description["'])[^>]*>/i);
  const heading=get(html,/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  const visible=strip(html).toLowerCase();
  const scripts=[...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].slice(0,40);
  const schemaTypes=[...new Set(scripts.flatMap(s=>[...s[1].matchAll(/"@type"\s*:\s*"([^"]+)"/g)].map(m=>m[1])))].slice(0,20);
  const terms={retail:/\b(winkelwagen|add to cart|in winkelwagen|producten|bestellen|checkout)\b/i.test(visible),events:/\b(concerten|concert|evenementen|agenda|tickets|kaarten)\b/i.test(visible),financial:/\b(betaaloplossingen|betalingen|payment|payments|payment service provider|betaalprovider)\b/i.test(visible),heritage:/\b(monument|monumenten|erfgoed|restauratie|rijksmonument)\b/i.test(visible),nature:/\b(vogels|vogelbescherming|natuur|doneren|leden)\b/i.test(visible)};
  return NextResponse.json({website:key,expected:selection.expected,finalUrl:fetchResult.finalUrl.toString(),httpStatus:response.status,observations:{title,description,h1:heading,schemaTypes,terms},scanKind:"limited-live-page-check",disclaimer:"Beperkte HTML-controle. Geen volledige RankFix SEO/GEO-score, sectorclassificatie of opgeslagen scan.",checkedAt:new Date().toISOString()},{headers:{"Cache-Control":"no-store"}});
 }catch(error){const reason=error instanceof Error?error.message:"unknown";console.warn("QA page check failed",reason);return NextResponse.json({website:key,error:reason==="RESPONSE_TOO_LARGE"?"De website heeft meer HTML dan deze beperkte test kan verwerken.":reason==="BODY_TIMEOUT"?"De website stuurde de HTML niet op tijd terug.":"Kon deze website nu niet uitlezen. Dit is geen SEO-oordeel.",code:reason==="RESPONSE_TOO_LARGE"?"HTML_TOO_LARGE":reason==="BODY_TIMEOUT"?"HTML_TIMEOUT":"FETCH_FAILED"},{status:502})}
}
