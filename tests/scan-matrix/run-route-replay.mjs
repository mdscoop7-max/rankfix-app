// Full-route replay of the recorded 96-site TestLab run (QA #186).
//
// Each recorded site is reconstructed from what the TestLab scan stored: the
// scanned page's title, description, H1, schema types and first 3000 characters
// of text; the sampled link labels (navigation evidence); the commerce evidence
// of the scanned page and of every sampled page (cart, add-to-cart, checkout,
// prices, Product/ItemList/Store schema); and the sampled pages themselves.
// The reconstruction then runs through the REAL /api/scan route (sector
// decision, commerce reconciliation, page evidence, report). No network.
//
// It is an approximation: full navigation, H2s and the body beyond 3000
// characters were not stored. FIDELITY is therefore measured by running the
// same reconstruction on the old engine and comparing with the old engine's
// live result.
//
// Run: node --experimental-strip-types --no-warnings --import ./tests/scan-matrix/register.mjs tests/scan-matrix/run-route-replay.mjs [--json]
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

const ROOT = new URL("../../", import.meta.url).pathname.replace(/\/$/, "");
const fixturePath = process.env.ROUTE_FIXTURE || `${ROOT}/tests/fixtures/testlab-96-replay/route.json.gz`;
const raw = readFileSync(fixturePath);
const fixture = JSON.parse((fixturePath.endsWith(".gz") ? gunzipSync(raw) : raw).toString("utf8"));
const only = process.env.ONLY ? new Set(process.env.ONLY.split(",")) : null;
// Recorded fields are sometimes still HTML-encoded (descriptions, nav labels were
// stored raw): decode once so the reconstructed HTML encodes them exactly once.
const { decodeHtmlEntities } = await import(new URL("../../lib/html-entities.ts", import.meta.url).href);
const esc = (v) => decodeHtmlEntities(String(v ?? "")).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function commerceMarkup(c) {
  if (!c) return "";
  const parts = [];
  if (c.strongCommerceAction || c.addToCart || c.cart) parts.push(`<form action="/cart/add" method="post"><input type="hidden" name="product_id" value="1"><button type="submit">Add to cart</button></form><a href="/cart">Cart</a>`);
  if (c.checkout) parts.push(`<a href="/checkout">Checkout</a>`);
  const prices = typeof c.priceSignals === "number" ? c.priceSignals : c.prices || 0;
  for (let i = 0; i < Math.min(prices, 12); i++) parts.push(`<span class="price">€ ${19 + i},99</span>`);
  if (c.repeatedProductLinks || c.products) for (let i = 1; i <= 4; i++) parts.push(`<a class="product-card" href="/product/item-${i}">Item ${i}</a>`);
  return parts.join(" ");
}
function ldBlocks(types, product) {
  return [...new Set(types || [])].slice(0, 12).map((t) => {
    const type = t.replace(/^./, (m) => m.toUpperCase());
    const body = /^product$/i.test(t) && product
      ? { "@type": "Product", name: product.name || "Product", image: product.image || undefined, sku: product.sku || undefined, offers: product.price ? { "@type": "Offer", price: product.price, priceCurrency: product.currency || "EUR", availability: product.availability || undefined } : undefined }
      : { "@type": type, name: "Site" };
    return `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", ...body })}</script>`;
  }).join("");
}
function pageHtml(p, { lang, nav = [], commerce = null } = {}) {
  const body = String(p.body || "").slice(0, 3000);
  const navHtml = nav.length ? `<header><nav>${nav.map(([href, label]) => `<a href="${esc(href)}">${esc(label)}</a>`).join(" ")}</nav></header>` : "";
  return `<!doctype html><html lang="${esc(lang || "en")}"><head><meta charset="utf-8">${p.title ? `<title>${esc(p.title)}</title>` : ""}${p.description ? `<meta name="description" content="${esc(p.description)}">` : ""}<meta name="viewport" content="width=device-width, initial-scale=1"><link rel="canonical" href="${esc(p.url)}">${ldBlocks(p.schemaTypes, p.product)}</head><body>${navHtml}${(p.identityHeadings || []).map((h) => `<h1>${esc(h)}</h1>`).join("")}<main><p>${esc(body)}</p>${commerceMarkup(commerce || p.commerce)}</main><footer><a href="/privacy">Privacy</a></footer></body></html>`;
}

const routes = new Map();
for (const site of fixture.sites) {
  if (only && !only.has(site.host)) continue;
  const home = site.pages[0];
  const homeCommerce = Object.fromEntries(Object.entries(site.homeCommerce || {}).map(([k, v]) => [k, v?.value && v.confidence !== "low" ? (k === "prices" ? (v.value.count || 0) : v.value) : (k === "prices" ? 0 : false)]));
  const merged = { ...(home.commerce || {}), ...homeCommerce, priceSignals: Math.max(home.commerce?.priceSignals || 0, homeCommerce.prices || 0) };
  const pathOf = (u) => { const x = new URL(u); return x.pathname + x.search; };
  routes.set(new URL(site.finalUrl).host + pathOf(site.finalUrl), { status: 200, html: pageHtml(home, { lang: site.lang, nav: site.nav, commerce: merged }) });
  for (const p of site.pages.slice(1)) {
    let key; try { key = new URL(p.url).host + pathOf(p.url); } catch { continue; }
    if (p.status !== "audited") routes.set(key, { status: p.httpStatus && p.httpStatus >= 400 ? p.httpStatus : 404, html: "<html><head><title>Not found</title></head><body>Not found</body></html>" });
    else routes.set(key, { status: 200, html: pageHtml(p, { lang: site.lang }) });
  }
}
// REPLAY_FROM_ROOT=1: scan https://<host>/ like a live TestLab run; the root
// answers 301 to the recorded landing page (root-redirect landings such as /start).
const fromRoot = process.env.REPLAY_FROM_ROOT === "1";
const startUrl = (site) => fromRoot ? `https://${site.host}/` : site.finalUrl;
if (fromRoot) for (const site of fixture.sites) {
  if (only && !only.has(site.host)) continue;
  const root = `https://${site.host}/`;
  if (new URL(root).toString() !== new URL(site.finalUrl).toString() && !routes.has(`${site.host}/`)) routes.set(`${site.host}/`, { status: 301, location: site.finalUrl, html: "" });
}
globalThis.fetch = async (input) => {
  const u = new URL(typeof input === "string" ? input : input.url);
  const hit = routes.get(u.host + u.pathname + u.search) || routes.get(u.host + u.pathname) || routes.get(u.host + u.pathname.replace(/\/$/, "")) || routes.get(u.host + u.pathname + "/");
  if (hit?.location) return new Response(null, { status: hit.status, headers: { location: hit.location } });
  if (hit) return new Response(hit.html, { status: hit.status, headers: { "content-type": "text/html; charset=utf-8" } });
  return new Response("not found", { status: 404, headers: { "content-type": "text/plain" } });
};
globalThis.__RF_RENDER = async () => { throw new Error("RENDER_UNAVAILABLE_IN_REPLAY"); };

const { POST } = await import(ROOT + "/app/api/scan/route.ts");
const { compareSector } = await import(ROOT + "/scripts/testlab/labels.mjs");
console.info = () => {}; console.warn = () => {};
const rows = [];
for (const site of fixture.sites) {
  if (only && !only.has(site.host)) continue;
  const ce = console.error; console.error = () => {};
  let j = {}, status = 0;
  try {
    const res = await POST(new Request("http://localhost/api/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: startUrl(site), mode: "both", language: "nl" }) }));
    status = res.status; j = await res.json();
  } catch (error) { j = { error: String(error) }; }
  console.error = ce;
  if (process.env.DUMP_DIR) (await import("node:fs")).writeFileSync(`${process.env.DUMP_DIR}/${site.host}.json`, JSON.stringify(j));
  const sector = j.sectorProfile?.sector || "no_report";
  const verdict = status !== 200 ? "no_report" : sector === "unknown" ? "unknown" : compareSector(site.expected, j.sectorProfile).sectorMatch ? "compatible" : "wrong";
  rows.push({ host: site.host, expected: site.expected, status, sector, key: j.sectorProfile?.key || null, verdict, liveOld: site.liveOld.sector, code: j.code || null, score: j.overallScore ?? null, confidence: j.sectorProfile?.confidenceScore ?? null, secondary: (j.sectorProfile?.secondaryActivities || []).map((a) => a.sector) });
}
if (process.argv.includes("--json")) { console.log("ROUTE_REPLAY " + JSON.stringify(rows)); process.exit(0); }
const n = (v) => rows.filter((r) => r.verdict === v).length;
for (const r of rows) console.log(`${r.verdict.padEnd(10)} ${r.host.padEnd(24)} exp=${String(r.expected).padEnd(24)} got=${r.sector}/${r.key} live-old=${r.liveOld}${r.code ? " code=" + r.code : ""}`);
console.log(`\ncompatible ${n("compatible")} · unknown ${n("unknown")} · wrong ${n("wrong")} · no report ${n("no_report")} · total ${rows.length}`);
console.log("ROUTE_REPLAY " + JSON.stringify(rows));
process.exit(0);
