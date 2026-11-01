// Crawl coverage (30 Oct 2026): relevant parts missing from the page's own links
// are nominated from what the site publishes (sitemap index → child sitemap,
// raw HTML). Neutral .test host; no guessed paths.
const ROOT = new URL("../../", import.meta.url).pathname.replace(/\/$/, "");
const words = (s, n = 15) => `<p>${(s + " ").repeat(n)}</p>`;
const page = (title, h1, body) => `<!doctype html><html lang="nl"><head><meta charset="utf-8"><title>${title}</title><meta name="description" content="${title} — informatie en aanbod voor klanten in heel Nederland."><link rel="canonical" href="/"></head><body><h1>${h1}</h1>${body}</body></html>`;
const home = page("Winkelvoorbeeld | Wonen en keuken online", "Nieuw binnen", `<header><nav><a href="/nieuw">Nieuw</a><a href="/inspiratie">Inspiratie</a><a href="/merken">Merken</a><a href="/winkels">Winkels</a></nav></header>${Array.from({ length: 6 }, (_, i) => `<div class="product-card"><span class="price">€ ${9 + i},99</span><form action="/cart/add" method="post"><button>In winkelmand</button></form></div>`).join("")}${words("Wonen en keuken online bestellen.")}`);
const SITE = {
  "/": home,
  "/robots.txt": "User-agent: *\nAllow: /\nSitemap: https://gap.test/sitemap_index.xml",
  "/sitemap_index.xml": `<?xml version="1.0"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>https://gap.test/sitemap-images.xml</loc></sitemap><sitemap><loc>https://gap.test/sitemap-pages.xml</loc></sitemap></sitemapindex>`,
  "/sitemap-pages.xml": `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${["/contact", "/privacy", "/klantenservice", "/categorie/keuken", "/product/theepot-blauw-1234"].map((p) => `<url><loc>https://gap.test${p}</loc></url>`).join("")}</urlset>`,
  "/contact": page("Contact | Winkelvoorbeeld", "Contact", words("Bel of mail onze klantenservice. Adres: Hoofdstraat 1, 1234 AB Utrecht.")),
  "/privacy": page("Privacyverklaring | Winkelvoorbeeld", "Privacyverklaring", words("Wij verwerken persoonsgegevens volgens de AVG.")),
  "/klantenservice": page("Klantenservice | Winkelvoorbeeld", "Klantenservice", words("Veelgestelde vragen over bezorgen en retourneren.")),
  "/categorie/keuken": page("Keuken | Winkelvoorbeeld", "Keuken", Array.from({ length: 8 }, (_, i) => `<div class="product-card"><a href="/product/item-${i}-5678">Item ${i}</a><span class="price">€ ${5 + i},00</span></div>`).join("")),
  "/product/theepot-blauw-1234": page("Theepot blauw | Winkelvoorbeeld", "Theepot blauw", `<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Theepot blauw","sku":"1234","offers":{"@type":"Offer","price":"19.99","priceCurrency":"EUR","availability":"https://schema.org/InStock"}}</script><span class="price">€ 19,99</span><form action="/cart/add" method="post"><button>In winkelmand</button></form>${words("Een blauwe theepot van aardewerk.")}`),
  "/nieuw": page("Nieuw | Winkelvoorbeeld", "Nieuw", words("Nieuwe producten.")), "/inspiratie": page("Inspiratie", "Inspiratie", words("Ideeën.")), "/merken": page("Merken", "Merken", words("Merken.")), "/winkels": page("Winkels", "Winkels", words("Onze winkels.")),
};
globalThis.fetch = async (input) => {
  const u = new URL(typeof input === "string" ? input : input.url);
  if (u.host !== "gap.test") return new Response("nf", { status: 404 });
  const body = SITE[u.pathname.replace(/\/$/, "") || "/"];
  if (body === undefined) return new Response("nf", { status: 404 });
  const type = u.pathname.endsWith(".xml") ? "application/xml" : u.pathname === "/robots.txt" ? "text/plain" : "text/html; charset=utf-8";
  return new Response(body, { status: 200, headers: { "content-type": type } });
};
globalThis.__RF_RENDER = async () => { throw new Error("RENDER_UNAVAILABLE_IN_TEST"); };
const { POST } = await import(ROOT + "/app/api/scan/route.ts");
console.info = () => {}; console.warn = () => {}; console.error = () => {};
const j = await (await POST(new Request("http://localhost/api/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: "https://gap.test/", mode: "both", language: "nl" }) }))).json();
const items = Object.fromEntries((j.multiPage?.sectionCoverage?.items || []).map((i) => [i.section, i.status]));
const problems = [];
for (const s of ["contact", "legal", "support", "category", "product"]) if (items[s] !== "checked") problems.push(`${s}: ${items[s]}`);
if (!(j.multiPage?.sectionGapFill || []).some((g) => g.source === "sitemap")) problems.push("no sitemap gap fill recorded");
console.log(JSON.stringify({ items, gapFill: j.multiPage?.sectionGapFill, selected: j.multiPage?.siteAccess?.pages }));
for (const p of problems) console.log(" - " + p);
console.log("SCAN_MATRIX_RESULT " + JSON.stringify({ total: 1, failed: problems.length }));
process.exit(0);
