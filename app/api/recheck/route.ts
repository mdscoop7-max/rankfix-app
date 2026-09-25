import { NextResponse } from "next/server";
import { runRuleForUrl, isRecheckSupported } from "@/lib/recheck";
import { CRAWLER_VERSION, RULES_VERSION } from "@/lib/seo-rules";
import { safePublicFetch, validatePublicHttpUrl } from "@/lib/safe-fetch";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { ensureDatabase } from "@/lib/db-init";
import { consumeRateLimit } from "@/lib/rate-limit";

function decode(value: string) {
  return value.replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").trim();
}
function first(html: string, regex: RegExp) { const m = html.match(regex); return m?.[1] ? decode(m[1]) : ""; }
function all(html: string, regex: RegExp) { return [...html.matchAll(regex)].map((m) => decode(m[1] || "")); }
export async function POST(request: Request) {
  try {
    const user=await getCurrentUser();
    if(!user) return NextResponse.json({error:"Login vereist."},{status:401});
    await ensureDatabase();
    if(!await consumeRateLimit("recheck",String(user.id),30,3600)) return NextResponse.json({error:"Te veel hercontroles. Probeer later opnieuw."},{status:429});
    const body = await request.json();
    const issue = body?.issue;
    const scanId=typeof body?.scan_id==="string"?body.scan_id.trim():"";
    if(!issue?.issue_id || !issue?.rule_id || !scanId) return NextResponse.json({error:"scan_id, issue_id en rule_id zijn verplicht."},{status:400});
    const stored=await getDb().query("SELECT final_url,result FROM scans WHERE id=$1 AND user_id=$2 LIMIT 1",[scanId,user.id]);
    if(!stored.rowCount) return NextResponse.json({error:"Scan niet gevonden."},{status:404});
    const storedResult=typeof stored.rows[0].result==="string"?JSON.parse(stored.rows[0].result):stored.rows[0].result;
    const storedChecks=[...(Array.isArray(storedResult?.seo?.checks)?storedResult.seo.checks:[]),...(Array.isArray(storedResult?.geo?.checks)?storedResult.geo.checks:[])];
    const trustedIssue=storedChecks.find((x:any)=>x?.issue_id===issue.issue_id && x?.rule_id===issue.rule_id);
    if(!trustedIssue) return NextResponse.json({error:"Bevinding hoort niet bij deze scan."},{status:403});
    const urlValue=String(stored.rows[0].final_url||"").trim();
    if(!urlValue) return NextResponse.json({error:"Scan heeft geen betrouwbare eind-URL."},{status:422});
    if (!isRecheckSupported(trustedIssue)) return NextResponse.json({ success:false, error:"recheck_not_supported" }, {status:422});
    let url: URL;
    try { url = validatePublicHttpUrl(urlValue); } catch { return NextResponse.json({ success:false, error:"unable_to_confirm" }, {status:422}); }
    let response: Response;
    try { ({ response } = await safePublicFetch(url, { timeoutMs: 10000, userAgent: "RankFixBot/2.1 (+https://rankfix-app.onrender.com)" })); } catch { return NextResponse.json({ success:true, status:"UNABLE_TO_CONFIRM", evidence:{url:url.toString(),details:"De pagina kon door een netwerk-/timeoutprobleem niet betrouwbaar worden gecontroleerd."}, crawler_version:CRAWLER_VERSION, rules_version:RULES_VERSION }); }
    if (!response.ok) return NextResponse.json({ success:true, status:"UNABLE_TO_CONFIRM", evidence:{url:url.toString(),details:`HTTP ${response.status}; recheck kan de oorspronkelijke SEO-status niet betrouwbaar vaststellen.`}, crawler_version:CRAWLER_VERSION, rules_version:RULES_VERSION });
    const html = await response.text();
    const title = first(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
    const description = first(html, /<meta[^>]+(?:name|property)\s*=\s*["']description["'][^>]+content\s*=\s*["']([\s\S]*?)["'][^>]*>/i) || first(html, /<meta[^>]+content\s*=\s*["']([\s\S]*?)["'][^>]+(?:name|property)\s*=\s*["']description["'][^>]*>/i);
    const h1s = all(html, /<h1[^>]*>([\s\S]*?)<\/h1>/gi);
    const canonical = first(html, /<link[^>]+rel\s*=\s*["']canonical["'][^>]+href\s*=\s*["']([^"']+)["']/i) || first(html, /<link[^>]+href\s*=\s*["']([^"']+)["'][^>]+rel\s*=\s*["']canonical["']/i);
    const metaTags=[...html.matchAll(/<meta\b[^>]*>/gi)].map(m=>m[0]);
    const meta=(key:string)=>{ for(const tag of metaTags){ const n=tag.match(/(?:property|name)\s*=\s*["']([^"']+)["']/i)?.[1]; if(n?.toLowerCase()===key.toLowerCase()) return tag.match(/content\s*=\s*["']([^"']*)["']/i)?.[1]||""; } return ""; };
    const images=[...html.matchAll(/<img\b[^>]*>/gi)].map(m=>m[0]);
    const imagesMissingAlt=images.filter(tag=>!(/\balt\s*=\s*(?:["'][^"']*["']|[^\s>]+)/i.test(tag))).length;
    const jsonLdTypes:string[]=[];
    for(const m of html.matchAll(/<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){ try { const parsed=JSON.parse(m[1]); const items=Array.isArray(parsed)?parsed:(parsed?.["@graph"]||[parsed]); for(const item of items){ const t=item?.["@type"]; jsonLdTypes.push(...(Array.isArray(t)?t:[t]).filter(Boolean).map(String)); } } catch {} }
    const result = runRuleForUrl(trustedIssue, {title, description, h1s, url:url.toString(), canonical, ogTitle:meta("og:title"), ogDescription:meta("og:description"), ogImage:meta("og:image"), imageCount:images.length, imagesMissingAlt, jsonLdTypes:[...new Set(jsonLdTypes)]});
    return NextResponse.json({...result, issue_id:issue.issue_id, rule_id:issue.rule_id, crawler_version:CRAWLER_VERSION, rules_version:RULES_VERSION});
  } catch { return NextResponse.json({error:"recheck_failed"},{status:500}); }
}
