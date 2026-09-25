import { NextResponse } from "next/server";
import { runRuleForUrl, isRecheckSupported } from "@/lib/recheck";
import { CRAWLER_VERSION, RULES_VERSION } from "@/lib/seo-rules";
import { safePublicFetch, validatePublicHttpUrl } from "@/lib/safe-fetch";

function decode(value: string) {
  return value.replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").trim();
}
function first(html: string, regex: RegExp) { const m = html.match(regex); return m?.[1] ? decode(m[1]) : ""; }
function all(html: string, regex: RegExp) { return [...html.matchAll(regex)].map((m) => decode(m[1] || "")); }
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const issue = body?.issue;
    const urlValue = typeof body?.url === "string" ? body.url.trim() : "";
    if (!issue?.issue_id || !issue?.rule_id || !urlValue) return NextResponse.json({ error: "issue_id, rule_id en url zijn verplicht." }, {status:400});
    if (!isRecheckSupported(issue)) return NextResponse.json({ success:false, error:"recheck_not_supported" }, {status:422});
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
    const result = runRuleForUrl(issue, {title, description, h1s, url:url.toString(), canonical, ogTitle:meta("og:title"), ogDescription:meta("og:description"), ogImage:meta("og:image"), imageCount:images.length, imagesMissingAlt, jsonLdTypes:[...new Set(jsonLdTypes)]});
    return NextResponse.json({...result, issue_id:issue.issue_id, rule_id:issue.rule_id, crawler_version:CRAWLER_VERSION, rules_version:RULES_VERSION});
  } catch { return NextResponse.json({error:"recheck_failed"},{status:500}); }
}
