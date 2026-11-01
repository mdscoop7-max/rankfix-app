#!/usr/bin/env node
// A/B scan-engine comparison on IDENTICAL content (31 Oct 2026, P5 request).
// Read-only: only GET requests to the listed public websites, no fixes, no DB.
//
//   record : scan with the engine in --root, and store every HTTP answer the scan
//            received (URL, status, relevant headers, body) in --cache.
//   replay : scan with the engine in --root, answering every request from --cache
//            only (no network). Requests the cache does not hold are reported.
//   compare: per site and per check, the differences between two result files.
//   observe: per URL (homepage + up to 2 own subpages from --cache), JSON-LD in the
//            server HTML versus the browser DOM, with the browser started directly
//            (independent of the scan route's own render decision). Every render
//            records whether the browser started and the exact error if not.
//
// Browser rendering is OFF in every mode, so both engines judge the same server
// HTML; render-dependent conclusions are out of scope of this comparison.
//
// Run with the loader of the SAME root (it stubs the DB and DNS):
//   node --experimental-strip-types --no-warnings --import <root>/tests/scan-matrix/register.mjs \
//        scripts/testlab/ab-replay.mjs record --root <root> --cache ab-cache.json.gz --out ab-new.json --sites a.com,b.nl
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { gzipSync, gunzipSync } from "node:zlib";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";

const args = process.argv.slice(2);
const mode = args[0];
const opt = (name, fallback = null) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
if (mode === "compare") {
  const [a, b] = [opt("a"), opt("b")].map((f) => JSON.parse(readFileSync(f, "utf8")));
  const lines = [];
  for (const host of Object.keys(a.sites)) {
    const x = a.sites[host], y = b.sites[host];
    if (!y) { lines.push(`${host}: ontbreekt in ${opt("b")}`); continue; }
    if (x.rendered || y.rendered) lines.push(`\n(let op: ${x.rendered ? "A" : "B"} is met browserweergave gemeten; vergelijk alleen render-uit met render-uit)`);
    lines.push(`\n## ${host}\n- score ${x.score} → ${y.score} | SEO ${x.seo} → ${y.seo} | GEO ${x.geo} → ${y.geo} | dekking ${x.coverage}% → ${y.coverage}% | sector ${x.sector} → ${y.sector} | cache-missers ${x.misses} / ${y.misses}`);
    const keys = new Set([...Object.keys(x.checks), ...Object.keys(y.checks)]);
    for (const k of [...keys].sort()) {
      const c = x.checks[k], d = y.checks[k];
      if (!c || !d) { lines.push(`  - ${k}: alleen in ${c ? "A" : "B"} (${(c || d).status} ${(c || d).points}/${(c || d).max})`); continue; }
      if (c.status !== d.status || c.points !== d.points || c.max !== d.max) lines.push(`  - ${k}: ${c.status} ${c.points}/${c.max} → ${d.status} ${d.points}/${d.max}\n      A: ${c.msg}\n      B: ${d.msg}`);
    }
  }
  const out = opt("out");
  const text = `# A/B-vergelijking op identieke inhoud\nA = ${a.commit} (${opt("a")})\nB = ${b.commit} (${opt("b")})\n` + lines.join("\n") + "\n";
  if (out) writeFileSync(out, text);
  console.log(text);
  process.exit(0);
}
if (mode === "observe") await observe();
if (!["record", "replay"].includes(mode)) { console.error("Gebruik: record | replay | compare | observe (zie kop van dit bestand)"); process.exit(2); }
const root = resolve(opt("root", process.cwd()));
const cacheFile = resolve(opt("cache", "ab-cache.json.gz"));
const outFile = resolve(opt("out", `ab-${mode}.json`));
const sites = String(opt("sites", "")).split(",").map((s) => s.trim()).filter(Boolean);
if (!sites.length) { console.error("--sites ontbreekt"); process.exit(2); }
let commit = "onbekend";
try { commit = execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(); } catch { /* not a git checkout */ }

const cache = existsSync(cacheFile) ? JSON.parse(gunzipSync(readFileSync(cacheFile)).toString("utf8")) : {};
const KEEP = ["content-type", "location", "server", "x-powered-by", "strict-transport-security", "content-security-policy", "x-content-type-options", "x-frame-options", "referrer-policy", "permissions-policy", "set-cookie", "cf-ray", "cf-mitigated", "x-iinfo", "x-datadome", "x-amzn-waf-action", "x-sucuri-id", "x-robots-tag", "link", "x-cache", "via"];
const keyOf = (input, init) => `${(init?.method || (typeof input === "object" && input.method) || "GET").toUpperCase()} ${typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url}`;
const realFetch = globalThis.fetch;
let misses = [];
globalThis.fetch = async (input, init = {}) => {
  const key = keyOf(input, init);
  if (mode === "replay") {
    const hit = cache[key];
    if (!hit) { misses.push(key); return new Response("not recorded", { status: 599, headers: { "x-ab-miss": "1" } }); }
    const headers = new Headers(); for (const [k, v] of hit.headers) headers.append(k, v);
    return new Response([204, 304].includes(hit.status) ? null : hit.body, { status: hit.status, headers });
  }
  const response = await realFetch(input, init);
  const body = [204, 304].includes(response.status) ? "" : await response.clone().text().catch(() => "");
  const headers = []; response.headers.forEach((v, k) => { if (KEEP.includes(k)) headers.push([k, v]); });
  cache[key] = { status: response.status, headers, body: body.slice(0, 8_000_000) };
  return response;
};
// --render on (record only): use the real headless browser to see whether the
// final DOM holds JSON-LD that the server HTML lacks (the P5 fairness question).
// Never used for the A/B replay itself, which must compare identical inputs.
const renderOn = mode === "record" && opt("render", "off") === "on";
if (!renderOn) globalThis.__RF_RENDER = async () => { throw new Error("RENDER_OFF_FOR_AB"); };
const { POST } = await import(pathToFileURL(resolve(root, "app/api/scan/route.ts")).href);
const quiet = !process.env.AB_VERBOSE; if (quiet) { console.info = () => {}; console.warn = () => {}; }
const result = { commit, mode, root, generatedAt: new Date().toISOString(), renderMode: renderOn ? "on" : "off", sites: {} };
for (const host of sites) {
  misses = [];
  const started = Date.now();
  let j = null, status = 0;
  try {
    const r = await POST(new Request("http://localhost/api/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: `https://${host}/`, mode: "both", language: "nl" }) }));
    status = r.status; j = await r.json();
  } catch (e) { j = { error: String(e?.message || e) }; }
  const checks = {};
  for (const c of [...(j?.seo?.checks || []), ...(j?.geo?.checks || [])]) checks[c.key] = { status: c.status, points: c.points, max: c.maxPoints, msg: String(c.message || "").slice(0, 220) };
  const schemaCheck = [...(j?.geo?.checks || [])].find((c) => c.key === "schema");
  result.sites[host] = { rendered: Boolean(j?.rendering?.javascriptExecuted), schemaEvidence: schemaCheck?.evidence?.found ?? null, schemaTypes: j?.metrics?.schemaTypes || [], http: status, code: j?.code || null, score: j?.overallScore ?? null, seo: j?.seo?.score ?? null, geo: j?.geo?.score ?? null, coverage: j?.coverage?.coveragePercent ?? null, sector: j?.sectorProfile ? `${j.sectorProfile.sector}/${j.sectorProfile.key}` : null, misses: misses.length, missed: misses.slice(0, 20), elapsedMs: Date.now() - started, checks };
  console.log(`${mode} ${host}: HTTP ${status} score ${result.sites[host].score} dekking ${result.sites[host].coverage}% cache-missers ${misses.length}`);
}
writeFileSync(outFile, JSON.stringify(result, null, 1));
if (mode === "record") writeFileSync(cacheFile, gzipSync(JSON.stringify(cache)));
console.log(`Klaar: ${outFile}${mode === "record" ? ` en ${cacheFile} (${Object.keys(cache).length} opgenomen antwoorden)` : ""}`);
process.exit(0);

async function observe() {
  const root = resolve(opt("root", process.cwd()));
  const sites = String(opt("sites", "")).split(",").map((x) => x.trim()).filter(Boolean);
  const outFile = resolve(opt("out", "ab-observe.json"));
  const perSite = Number(opt("subpages", "2"));
  const windows = String(opt("windows", "short,long")).split(",").filter(Boolean);
  const cacheFile = opt("cache");
  const cached = cacheFile && existsSync(resolve(cacheFile)) ? JSON.parse(gunzipSync(readFileSync(resolve(cacheFile))).toString("utf8")) : {};
  const sd = await import(pathToFileURL(resolve(root, "lib/structured-data-evidence.ts")).href);
  const rq = await import(pathToFileURL(resolve(root, "lib/report-quality.ts")).href);
  let render = null, renderImportError = null;
  if (process.env.AB_SELFTEST) render = globalThis.__AB_FAKE_RENDER;
  else {
    if (process.env.RF_REAL_RENDER !== "1") { console.error("GESTOPT: observe vraagt de echte browser. Start met RF_REAL_RENDER=1 (Run-AB-P5.ps1 doet dat)."); process.exit(3); }
    try { ({ renderPublicPage: render } = await import(pathToFileURL(resolve(root, "lib/headless-render.ts")).href)); } catch (e) { renderImportError = String(e?.message || e); }
    if (render && /__RF_RENDER|RENDER_UNAVAILABLE_IN_MATRIX/.test(String(render))) { console.error("GESTOPT: de browserfunctie is de teststub, niet de echte browser; er is niets gemeten."); process.exit(3); }
  }
  const fetcher = process.env.AB_SELFTEST ? globalThis.__AB_FAKE_FETCH : globalThis.fetch;
  // The same browser mode as the scan engine (short) and a long comparison window.
  const WINDOW = { short: { timeout: 12000, options: { mode: "structured_data", settleMs: 3000 } }, long: { timeout: 15000, options: { mode: "structured_data", settleMs: 3000, holdMs: 8000 } } };
  const jsonLd = (html) => {
    const blocks = [...String(html || "").matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1].trim());
    const types = new Set(); let valid = 0, invalid = 0;
    for (const b of blocks) { if (!b) continue; try { const walk = (v) => { if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === "object") { for (const t of [].concat(v["@type"] || [])) types.add(String(t)); Object.values(v).forEach(walk); } }; walk(JSON.parse(b)); valid++; } catch { invalid++; } }
    return { blocks: blocks.length, valid, invalid, empty: blocks.filter((b) => !b).length, types: [...types].slice(0, 15) };
  };
  // Account, login, checkout and cart pages are not representative content pages.
  const ACCOUNT = /(?:^|[\/_.-])(?:account|accounts|customeraccount\w*|myaccount|my-account|mijn-?\w*|login|log-in|signin|sign-in|signup|register|registreren|inloggen|aanmelden|wishlist|verlanglijst|password|wachtwoord|profile|profiel|checkout|cart|basket|winkelwagen|warenkorb|panier|carrito|carrello|kassa|afrekenen|logout|uitloggen)(?:[\/_.?-]|\.x?html?$|$)/i;
  const isContentUrl = (u) => { try { const x = new URL(u); return !ACCOUNT.test(x.pathname + (x.search || "")) && !rq.isNonContentUrl(u); } catch { return false; } };
  const errorCause = (e) => { const c = e?.cause; return [e?.name && e.name !== "TypeError" ? e.name : null, String(e?.message || e), c ? `oorzaak: ${c.code || ""} ${c.message || c}`.trim() : null].filter(Boolean).join(" · ").slice(0, 300); };
  const pickSubpages = async (host, homeHtml) => {
    let own = Object.entries(cached).filter(([k, v]) => { try { const u = new URL(k.slice(4)); return u.hostname.replace(/^www\./, "") === host && u.pathname !== "/" && v.status === 200 && /html/.test(String(v.headers?.find?.(([h]) => h === "content-type")?.[1] || "")); } catch { return false; } }).map(([k]) => k.slice(4));
    if (!own.length && homeHtml) own = [...homeHtml.matchAll(/<a\b[^>]*href\s*=\s*["']([^"'#]+)["']/gi)].map((m) => { try { return new URL(m[1], `https://${host}/`).toString(); } catch { return ""; } }).filter((u) => { try { const x = new URL(u); return x.hostname.replace(/^www\./, "") === host && x.pathname.split("/").filter(Boolean).length >= 1; } catch { return false; } });
    own = [...new Set(own)].filter(isContentUrl);
    const about = own.filter((u) => /over|about|uber|ueber|qui-sommes|chi-siamo|quienes|organi[sz]ation|unternehmen/i.test(new URL(u).pathname));
    // Deeper paths first (product/article pages), then about pages, then the rest.
    const deep = own.filter((u) => new URL(u).pathname.split("/").filter(Boolean).length >= 2);
    return [...new Set([...deep.slice(0, 1), ...about, ...own])].slice(0, perSite);
  };
  const result = { commit: (() => { try { return execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(); } catch { return "onbekend"; } })(), mode: "observe", generatedAt: new Date().toISOString(), renderImportError, renderer: process.env.AB_SELFTEST ? "selftest" : "real-headless-browser", windows, urls: [] };
  const verdictOf = (row, w) => {
    const r = row.render[w];
    const raw = row.raw;
    if (r?.view?.valid && raw?.valid) return "aanwezig in server-HTML en browser-DOM";
    if (r?.view?.valid && raw) return "aanwezig, pas na JavaScript (browser-DOM)";
    if (r?.view?.valid && !raw) return "aanwezig in browser-DOM; server-HTML onbekend (ophalen mislukt)";
    if (raw?.valid) return r?.ok ? "aanwezig in server-HTML (browser zag minder)" : "aanwezig in server-HTML (browser niet waargenomen)";
    if (r?.ok && r.complete) return raw ? "bewezen afwezig (volledige browserwaarneming)" : "afwezig in browser-DOM; server-HTML onbekend";
    if (r?.ok) return `niet waargenomen (${r.limitation})`;
    return `niet waargenomen (${r?.error || "browser niet gestart"})`;
  };
  for (const host of sites) {
    let homeHtml = null;
    const urls = [`https://${host}/`];
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      const row = { host, url, raw: null, rawError: null, render: {} };
      try {
        const r = await fetcher(url, { headers: { "user-agent": "RankFixBot/2.1 (+https://rankfix-app.vercel.app)", accept: "text/html" }, redirect: "follow" });
        const html = await r.text();
        if (i === 0) homeHtml = html;
        row.raw = r.ok ? { status: r.status, ...jsonLd(html), injectors: sd.jsonLdInjectorSignals(html), executableScripts: sd.hasExecutableScripts(html) } : null;
        if (!r.ok) row.rawError = `HTTP ${r.status}`;
      } catch (e) { row.rawError = errorCause(e); }
      if (i === 0) urls.push(...await pickSubpages(host, homeHtml));
      for (const w of windows) {
        if (!render) { row.render[w] = { ok: false, error: renderImportError || "geen browser" }; continue; }
        const t = Date.now();
        try {
          const page = await render(url, WINDOW[w].timeout, undefined, WINDOW[w].options);
          const o = page.observation || {};
          const limitation = !page.observation ? "geen observatiegegevens" : !o.loadReached || page.partialNavigation ? "pagina niet volledig geladen" : o.requestCapHit ? `verzoeklimiet bereikt (${o.abortedRequests})` : null;
          row.render[w] = { ok: true, complete: !limitation, limitation, elapsedMs: Date.now() - t, window: o.window || null, consent: o.consent || "none", failedRequests: o.failedRequests ?? null, finalUrl: page.finalUrl || null, view: jsonLd(page.html) };
        } catch (e) { row.render[w] = { ok: false, elapsedMs: Date.now() - t, error: errorCause(e) }; }
        row.render[w].verdict = verdictOf(row, w);
      }
      result.urls.push(row);
      console.log(`observe ${url}: server ${row.raw ? `${row.raw.valid} blok(ken)` : `onbekend (${row.rawError})`} | ${windows.map((w) => `${w}: ${row.render[w].ok ? `${row.render[w].view.valid} blok(ken), ${row.render[w].elapsedMs} ms` : `fout ${row.render[w].error}`}`).join(" | ")}`);
    }
  }
  // Summary: changes between windows, late JSON-LD, timeouts, extra time.
  const both = result.urls.filter((r) => r.render.short && r.render.long);
  const summary = {
    urls: result.urls.length, sites: sites.length,
    serverJsonLd: result.urls.filter((r) => r.raw?.valid).length,
    rawUnknown: result.urls.filter((r) => !r.raw).length,
    short: { started: both.filter((r) => r.render.short.ok).length, complete: both.filter((r) => r.render.short.complete).length, withJsonLd: both.filter((r) => r.render.short.view?.valid).length, avgMs: Math.round(both.reduce((n, r) => n + (r.render.short.elapsedMs || 0), 0) / Math.max(1, both.length)) },
    long: { started: both.filter((r) => r.render.long.ok).length, complete: both.filter((r) => r.render.long.complete).length, withJsonLd: both.filter((r) => r.render.long.view?.valid).length, avgMs: Math.round(both.reduce((n, r) => n + (r.render.long.elapsedMs || 0), 0) / Math.max(1, both.length)) },
    // False "proven absent": short window complete & no JSON-LD, long window finds it.
    falseAbsentShort: both.filter((r) => r.render.short.complete && !r.render.short.view?.valid && r.render.long.view?.valid).map((r) => r.url),
    verdictChanged: both.filter((r) => r.render.short.verdict !== r.render.long.verdict).map((r) => ({ url: r.url, short: r.render.short.verdict, long: r.render.long.verdict })),
    // Server JSON-LD the browser did not show: an incomplete browser view.
    browserMissedServer: both.filter((r) => r.raw?.valid && r.render.short.ok && (r.render.short.view?.valid || 0) < r.raw.valid).map((r) => r.url),
    timeouts: result.urls.filter((r) => Object.values(r.render).some((x) => !x.ok && /timeout/i.test(String(x.error)))).map((r) => r.url),
  };
  result.summary = summary;
  writeFileSync(outFile, JSON.stringify(result, null, 1));
  const cell = (r, w) => { const x = r.render[w]; if (!x) return "—"; return x.ok ? `${x.view.valid} geldig ${x.view.types.slice(0, 4).join(",")} · ${x.elapsedMs} ms${x.limitation ? ` · ${x.limitation}` : ""}` : `fout: ${x.error}`; };
  const md = ["# JSON-LD: server-HTML tegenover browser-DOM (kort en lang venster)", `commit ${result.commit} · browser: ${result.renderer} · consent: geen (crawlerblik)`, "", `Kort venster = scanmotor (load + ≤3 s netwerkrust, 12 s). Lang venster = load + ≤3 s + 8 s vast (15 s).`, "",
    "| URL | server-HTML | kort venster | lang venster | oordeel kort | oordeel lang |", "|---|---|---|---|---|---|",
    ...result.urls.map((r) => `| ${r.url} | ${r.raw ? `${r.raw.valid} geldig${r.raw.empty ? ` + ${r.raw.empty} leeg` : ""} ${r.raw.types.slice(0, 4).join(",")}${r.raw.injectors.length ? ` · ${r.raw.injectors.join(",")}` : ""}${r.raw.executableScripts ? " · eigen scripts" : ""}` : `onbekend: ${r.rawError}`} | ${cell(r, "short")} | ${cell(r, "long")} | ${r.render.short?.verdict || "—"} | ${r.render.long?.verdict || "—"} |`),
    "", "## Samenvatting", "```", JSON.stringify(summary, null, 1), "```"];
  writeFileSync(outFile.replace(/\.json$/, ".md"), md.join("\n") + "\n");
  console.log(`Klaar: ${outFile} en ${outFile.replace(/\.json$/, ".md")}`);
  process.exit(0);
}
