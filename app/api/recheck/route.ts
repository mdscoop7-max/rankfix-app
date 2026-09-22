import { NextResponse } from "next/server";
import { runRuleForUrl, isRecheckSupported } from "@/lib/recheck";
import { CRAWLER_VERSION, RULES_VERSION } from "@/lib/seo-rules";

function validateUrl(value: string) {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("unsupported");
  const host = url.hostname.toLowerCase();
  if (!host || host === "localhost" || host === "127.0.0.1" || host === "::1" || /^10\.|^192\.168\.|^169\.254\./.test(host)) throw new Error("blocked");
  return url;
}

function decode(value: string) {
  return value.replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").trim();
}
function first(html: string, regex: RegExp) { const m = html.match(regex); return m?.[1] ? decode(m[1]) : ""; }
function all(html: string, regex: RegExp) { return [...html.matchAll(regex)].map((m) => decode(m[1] || "")); }
async function fetchPage(url: URL) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(url.toString(), { signal: controller.signal, redirect: "follow", headers: { "User-Agent": "RankFixBot/1.0" }, cache: "no-store" });
    return response;
  } finally { clearTimeout(timer); }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const issue = body?.issue;
    const urlValue = typeof body?.url === "string" ? body.url.trim() : "";
    if (!issue?.issue_id || !issue?.rule_id || !urlValue) return NextResponse.json({ error: "issue_id, rule_id en url zijn verplicht." }, {status:400});
    if (!isRecheckSupported(issue)) return NextResponse.json({ success:false, error:"recheck_not_supported" }, {status:422});
    let url: URL;
    try { url = validateUrl(urlValue); } catch { return NextResponse.json({ success:false, error:"unable_to_confirm" }, {status:422}); }
    let response: Response;
    try { response = await fetchPage(url); } catch { return NextResponse.json({ success:true, status:"UNABLE_TO_CONFIRM", evidence:{url:url.toString(),details:"De pagina kon door een netwerk-/timeoutprobleem niet betrouwbaar worden gecontroleerd."}, crawler_version:CRAWLER_VERSION, rules_version:RULES_VERSION }); }
    if (!response.ok) return NextResponse.json({ success:true, status:"UNABLE_TO_CONFIRM", evidence:{url:url.toString(),details:`HTTP ${response.status}; recheck kan de oorspronkelijke SEO-status niet betrouwbaar vaststellen.`}, crawler_version:CRAWLER_VERSION, rules_version:RULES_VERSION });
    const html = await response.text();
    const title = first(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
    const description = first(html, /<meta[^>]+(?:name|property)\s*=\s*["']description["'][^>]+content\s*=\s*["']([\s\S]*?)["'][^>]*>/i) || first(html, /<meta[^>]+content\s*=\s*["']([\s\S]*?)["'][^>]+(?:name|property)\s*=\s*["']description["'][^>]*>/i);
    const h1s = all(html, /<h1[^>]*>([\s\S]*?)<\/h1>/gi);
    const result = runRuleForUrl(issue, {title, description, h1s, url:url.toString()});
    return NextResponse.json({...result, issue_id:issue.issue_id, rule_id:issue.rule_id, crawler_version:CRAWLER_VERSION, rules_version:RULES_VERSION});
  } catch { return NextResponse.json({error:"recheck_failed"},{status:500}); }
}
