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
  const cacheFile = opt("cache");
  const cached = cacheFile && existsSync(resolve(cacheFile)) ? JSON.parse(gunzipSync(readFileSync(resolve(cacheFile))).toString("utf8")) : {};
  const sd = await import(pathToFileURL(resolve(root, "lib/structured-data-evidence.ts")).href);
  let render = null, renderImportError = null;
  if (process.env.AB_SELFTEST) render = globalThis.__AB_FAKE_RENDER;
  else {
    // The observe measurement needs the REAL browser. Under the test loader the
    // renderer is a stub unless RF_REAL_RENDER=1 was set when node started.
    if (process.env.RF_REAL_RENDER !== "1") { console.error("GESTOPT: observe vraagt de echte browser. Start met RF_REAL_RENDER=1 (Run-AB-P5.ps1 doet dat)."); process.exit(3); }
    try { ({ renderPublicPage: render } = await import(pathToFileURL(resolve(root, "lib/headless-render.ts")).href)); } catch (e) { renderImportError = String(e?.message || e); }
    if (render && /__RF_RENDER|RENDER_UNAVAILABLE_IN_MATRIX/.test(String(render))) { console.error("GESTOPT: de browserfunctie is de teststub, niet de echte browser; er is niets gemeten."); process.exit(3); }
  }
  const fetcher = process.env.AB_SELFTEST ? globalThis.__AB_FAKE_FETCH : globalThis.fetch;
  const jsonLd = (html) => {
    const blocks = [...String(html || "").matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1].trim());
    const types = new Set(); let valid = 0, invalid = 0;
    for (const b of blocks) { if (!b) continue; try { const walk = (v) => { if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === "object") { for (const t of [].concat(v["@type"] || [])) types.add(String(t)); Object.values(v).forEach(walk); } }; walk(JSON.parse(b)); valid++; } catch { invalid++; } }
    return { blocks: blocks.length, valid, invalid, empty: blocks.filter((b) => !b).length, types: [...types].slice(0, 15) };
  };
  const pickSubpages = (host) => {
    const own = Object.entries(cached).filter(([k, v]) => { try { const u = new URL(k.slice(4)); return u.hostname.replace(/^www\./, "") === host && u.pathname !== "/" && v.status === 200 && /html/.test(String(v.headers?.find?.(([h]) => h === "content-type")?.[1] || "")); } catch { return false; } }).map(([k]) => k.slice(4));
    const about = own.filter((u) => /over|about|uber|ueber|qui-sommes|chi-siamo|quienes|organi[sz]ation|unternehmen/i.test(new URL(u).pathname));
    return [...new Set([...about, ...own])].slice(0, perSite);
  };
  const result = { commit: (() => { try { return execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(); } catch { return "onbekend"; } })(), mode: "observe", generatedAt: new Date().toISOString(), renderImportError, renderer: process.env.AB_SELFTEST ? "selftest" : "real-headless-browser", urls: [] };
  for (const host of sites) {
    for (const url of [`https://${host}/`, ...pickSubpages(host)]) {
      const row = { host, url, raw: null, rawError: null, rendered: null, browser: { started: false, elapsedMs: null, error: renderImportError } };
      try { const r = await fetcher(url, { headers: { "user-agent": "RankFixBot/2.1 (+https://rankfix-app.vercel.app)", accept: "text/html" } }); const html = await r.text(); row.raw = { status: r.status, ...jsonLd(html), injectors: sd.jsonLdInjectorSignals(html) }; } catch (e) { row.rawError = String(e?.message || e); }
      if (render) {
        const t = Date.now();
        try { const page = await render(url, 15000); row.browser = { started: true, elapsedMs: Date.now() - t, error: null, finalUrl: page.finalUrl || null }; row.rendered = jsonLd(page.html); }
        catch (e) { row.browser = { started: false, elapsedMs: Date.now() - t, error: String(e?.message || e).slice(0, 300) }; }
      }
      // Three states per URL, never mixed.
      row.verdict = row.raw?.valid ? "aanwezig in server-HTML"
        : row.rendered?.valid ? "aanwezig, pas na JavaScript (browser-DOM)"
        : row.rendered ? "bewezen afwezig (browser-DOM bekeken)"
        : row.raw && !row.raw.injectors.length ? "afwezig in server-HTML zonder tag manager (browser niet bekeken)"
        : "niet waargenomen (geen browserwaarneming)";
      result.urls.push(row);
      console.log(`observe ${url}: server ${row.raw?.valid ?? "?"} blok(ken) | browser ${row.browser.started ? `${row.rendered?.valid} blok(ken) in ${row.browser.elapsedMs} ms` : `NIET gestart: ${row.browser.error}`} | ${row.verdict}`);
    }
  }
  writeFileSync(outFile, JSON.stringify(result, null, 1));
  const md = ["# JSON-LD: server-HTML tegenover browser-DOM", `commit ${result.commit}`, "", "| URL | server-HTML | browser-DOM | browser | oordeel |", "|---|---|---|---|---|",
    ...result.urls.map((r) => `| ${r.url} | ${r.raw ? `${r.raw.valid} geldig${r.raw.empty ? ` + ${r.raw.empty} leeg` : ""} ${r.raw.types.slice(0, 4).join(",")}${r.raw.injectors.length ? ` · ${r.raw.injectors.join(",")}` : ""}` : r.rawError} | ${r.rendered ? `${r.rendered.valid} geldig ${r.rendered.types.slice(0, 4).join(",")}` : "—"} | ${r.browser.started ? `gestart, ${r.browser.elapsedMs} ms` : `niet gestart: ${r.browser.error}`} | ${r.verdict} |`)];
  writeFileSync(outFile.replace(/\.json$/, ".md"), md.join("\n") + "\n");
  console.log(`Klaar: ${outFile} en ${outFile.replace(/\.json$/, ".md")}`);
  process.exit(0);
}
