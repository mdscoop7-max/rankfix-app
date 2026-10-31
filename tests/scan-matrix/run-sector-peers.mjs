// Sector peers (31 Oct 2026, "Mollie wordt herkend, PayPal niet"): sites with the
// same sector and function must get the same sector, website type and module
// gating through the REAL /api/scan route. Fixtures: tests/fixtures/sector-peers/*.json
// (realistic homepages, no network). Every group also holds negative controls.
import { readFileSync, readdirSync } from "node:fs";
const ROOT = new URL("../../", import.meta.url).pathname.replace(/\/$/, "");
const DIR = `${ROOT}/tests/fixtures/sector-peers/`;
const groups = readdirSync(DIR).filter((f) => f.endsWith(".json")).filter((f) => !process.env.GROUP || f.startsWith(process.env.GROUP)).map((f) => JSON.parse(readFileSync(DIR + f, "utf8")));
const SITES = Object.assign({}, ...groups.map((g) => g.sites));
const esc = (v) => String(v).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const page = (s) => `<!doctype html><html lang="${s.lang || "nl"}"><head><meta charset="utf-8"><title>${esc(s.title)}</title><meta name="description" content="${esc(s.desc)}">${s.head || ""}</head><body><header><nav>${(s.nav || []).map((n) => `<a href="/${encodeURIComponent(n.toLowerCase())}">${esc(n)}</a>`).join("")}</nav></header><main><h1>${esc(s.h1)}</h1>${(s.h2 || []).map((h) => `<h2>${esc(h)}</h2><p>${esc(s.desc)}</p>`).join("")}${s.body || ""}</main><footer>${s.footer || ""}<a href="/privacy">Privacy</a><a href="/contact">Contact</a></footer></body></html>`;
globalThis.fetch = async (i) => { const u = new URL(typeof i === "string" ? i : i.url); const s = SITES[u.host]; return s && u.pathname === "/" ? new Response(page(s), { status: 200, headers: { "content-type": "text/html" } }) : new Response("nf", { status: 404 }); };
globalThis.__RF_RENDER = async () => { throw new Error("no"); };
const { POST } = await import(ROOT + "/app/api/scan/route.ts"); console.info = console.warn = console.error = () => {};
const problems = []; const got = {};
for (const [host, site] of Object.entries(SITES)) {
  const j = await (await POST(new Request("http://localhost/api/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: `https://${host}/`, mode: "both", language: "nl" }) }))).json();
  const shop = [...(j.seo?.checks || []), ...(j.geo?.checks || [])].filter((c) => /commerce|product|cart|checkout|shop|omnibus/i.test(c.key || "")).map((c) => c.status);
  const r = { sector: j.sectorProfile?.sector, key: j.sectorProfile?.key, type: j.websiteProfile?.websiteType?.value, platform: j.technologyProfile?.cms || j.technologyProfile?.platform || null, coverage: j.coverage?.coveragePercent, shop: [...new Set(shop)] };
  got[host] = r;
  const e = site.expect || {};
  if (e.sector && r.sector !== e.sector) problems.push(`${host}: sector ${r.sector}/${r.key}, expected ${e.sector}`);
  if (e.key && r.key !== e.key) problems.push(`${host}: subtype ${r.key}, expected ${e.key}`);
  if (e.notKey && r.key === e.notKey) problems.push(`${host}: must not be ${e.notKey}`);
  if (e.type && r.type !== e.type) problems.push(`${host}: website type ${r.type}, expected ${e.type}`);
  if (e.shopChecks && r.shop.some((x) => x !== e.shopChecks)) problems.push(`${host}: shop checks ${r.shop.join("/")}, expected ${e.shopChecks}`);
  if (e.platform && r.platform !== e.platform) problems.push(`${host}: platform ${r.platform}, expected ${e.platform}`);
  if (e.minCoverage && !(r.coverage >= e.minCoverage)) problems.push(`${host}: coverage ${r.coverage}%, expected ≥ ${e.minCoverage}%`);
}
for (const p of problems) console.log(" - " + p);
if (process.env.VERBOSE) for (const [h, r] of Object.entries(got)) console.log(h, JSON.stringify(r));
console.log("SCAN_MATRIX_RESULT " + JSON.stringify({ total: Object.keys(SITES).length, failed: problems.length }));
process.exit(0);
