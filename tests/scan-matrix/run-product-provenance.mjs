// QA 144 (24 Oct 2026): product data must stay bound to its source URL.
// Field case (diagnostic only): a product URL ending in article number 1807532
// showed SKU 1807530 (a sibling model) in the product diagnostics. Neutral host.
//   1. Page JSON-LD lists the sibling first and the page's own product second →
//      diagnostics use the page's own product (article number in the URL).
//   2. Two products, neither matching URL/H1 → not confirmable, never merged.
//   3. A sampled sibling product page never overwrites the entered product.
const ROOT = new URL("../../", import.meta.url).pathname.replace(/\/$/, "");
const HOST = "witgoed.test";
const P_OWN = "/nl/product/_merk-wm-7000-serie-wasmachine-1807532.html";
const P_SIB = "/nl/product/_merk-wm-8000-serie-wasmachine-1807530.html";
const P_AMBIG = "/nl/product/_bundel-wasmachine-droger-5550001.html";
const ld = (o) => `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", ...o })}</script>`;
const prod = (name, sku, price, avail = "https://schema.org/InStock") => ({ "@type": "Product", name, sku, image: `https://${HOST}/img/${sku}.jpg`, offers: { "@type": "Offer", price, priceCurrency: "EUR", availability: avail } });
const page = ({ title, h1, ldObjs, links = [] }) => `<!doctype html><html lang="nl"><head><meta charset="utf-8"><title>${title}</title><meta name="description" content="${title} kopen met gratis bezorging en installatie. Bekijk specificaties, reviews en levertijd."><meta name="viewport" content="width=device-width, initial-scale=1">${ldObjs.map(ld).join("")}</head><body><header><nav>${links.map((h) => `<a href="${h}">${h}</a>`).join(" ")}<a href="/nl/category/wasmachines">Wasmachines</a></nav></header><h1>${h1}</h1><main><span class="price">€ 699,00</span><form action="/cart/add" method="post"><button>In winkelwagen</button></form><p>${"Specificaties, energielabel en reviews van deze wasmachine. ".repeat(20)}</p></main></body></html>`;
const PAGES = {
  [P_OWN]: page({ title: "MERK WM 7000 serie wasmachine | Witgoed", h1: "MERK WM 7000 serie wasmachine", ldObjs: [prod("MERK WM 8000 serie wasmachine", "1807530", "899.00"), prod("MERK WM 7000 serie wasmachine", "1807532", "699.00")], links: [P_SIB] }),
  [P_SIB]: page({ title: "MERK WM 8000 serie wasmachine | Witgoed", h1: "MERK WM 8000 serie wasmachine", ldObjs: [prod("MERK WM 8000 serie wasmachine", "1807530", "899.00")], links: [P_OWN] }),
  [P_AMBIG]: page({ title: "Voordeelbundel | Witgoed", h1: "Voordeelbundel", ldObjs: [prod("MERK wasmachine", "4440001", "699.00"), prod("MERK droger", "4440002", "599.00")] }),
  "/nl/category/wasmachines": page({ title: "Wasmachines | Witgoed", h1: "Wasmachines", ldObjs: [], links: [P_OWN, P_SIB] }),
  "/": page({ title: "Witgoed | Elektronica en witgoed online kopen", h1: "Witgoed", ldObjs: [{ "@type": "OnlineStore", name: "Witgoed" }], links: [P_OWN, P_SIB] }),
};
globalThis.fetch = async (input) => {
  const u = new URL(typeof input === "string" ? input : input.url);
  if (u.host.replace(/^www\./, "") !== HOST) return new Response("nf", { status: 404 });
  const html = PAGES[u.pathname] ?? PAGES[u.pathname.replace(/\/$/, "")];
  if (!html) return new Response("nf", { status: 404, headers: { "content-type": "text/html" } });
  return new Response(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
};
globalThis.__RF_RENDER = async () => { throw new Error("RENDER_UNAVAILABLE_IN_TEST"); };
const { POST } = await import(ROOT + "/app/api/scan/route.ts");
console.info = () => {}; console.warn = () => {}; console.error = () => {};
const problems = [];
const rows = [];
const scan = async (path) => {
  const res = await POST(new Request("http://localhost/api/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: `https://${HOST}${path}`, mode: "both", language: "nl" }) }));
  return { res, j: await res.json() };
};
{
  const { res, j } = await scan(P_OWN);
  const po = j.metrics?.productOptimizer;
  rows.push({ case: "own-second", status: res.status, sku: po?.product?.sku, matchedBy: po?.productMatch?.matchedBy, sourceUrl: po?.sourceUrl });
  if (res.status !== 200) problems.push(`own: HTTP ${res.status} ${j.code}`);
  else {
    if (po?.product?.sku !== "1807532") problems.push(`own: diagnostics show SKU ${po?.product?.sku}, expected 1807532`);
    if (!po?.sourceUrl || !po.sourceUrl.endsWith("-1807532.html")) problems.push(`own: product source URL ${po?.sourceUrl}`);
    if (po?.provenance !== "current_page") problems.push(`own: provenance ${po?.provenance}`);
    const startSample = (j.multiPage?.pageAudits || []).find((p) => p.url.endsWith("-1807532.html"));
    if (startSample?.commerceEvidence?.product?.sku && startSample.commerceEvidence.product.sku !== "1807532") problems.push(`own: start page sample carries SKU ${startSample.commerceEvidence.product.sku}`);
    // Product checks on the entered page never point at the sibling page.
    for (const c of [...(j.seo?.checks || []), ...(j.geo?.checks || [])]) {
      if (/product/.test(c.key) && c.evidence?.url && c.evidence.url.includes("1807530")) problems.push(`own: check ${c.key} uses sibling evidence ${c.evidence.url}`);
    }
    const priceSource = j.metrics?.pricingCurrency?.structuredPriceSource;
    if (priceSource && priceSource.includes("1807530")) problems.push(`own: price source is the sibling page ${priceSource}`);
  }
}
{
  const { res, j } = await scan(P_AMBIG);
  const po = j.metrics?.productOptimizer;
  rows.push({ case: "ambiguous", status: res.status, sku: po?.product?.sku ?? null, status2: po?.status });
  if (res.status !== 200) problems.push(`ambiguous: HTTP ${res.status} ${j.code}`);
  else {
    if (po?.product) problems.push(`ambiguous: product ${po.product.sku} chosen without proof`);
    if (po?.status !== "page_product_not_confirmable") problems.push(`ambiguous: status ${po?.status}`);
  }
}
for (const r of rows) console.log(JSON.stringify(r));
for (const p of problems) console.log(" - " + p);
console.log("SCAN_MATRIX_RESULT " + JSON.stringify({ total: rows.length, failed: problems.length, rows }));
process.exit(0);
