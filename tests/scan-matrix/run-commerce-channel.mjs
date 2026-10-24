// QA-144: a webshop, ticket sale, menu prices or a donation form must not become
// the primary sector of an organisation that does not present itself as a shop.
// Reconstructed from the recorded scans of three sites in the 144-site run
// (a football federation with a shop on a sub-page, a charity with donation
// amounts, a restaurant chain running a WooCommerce plugin), plus genuine shops
// that must stay "ecommerce".
const ROOT = new URL("../../", import.meta.url).pathname.replace(/\/$/, "");
const doc = ({ lang = "nl", title, description, h1 = [], body = "", head = "", schema = [] }) => `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>${title}</title><meta name="description" content="${description}"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="canonical" href="/">${head}${schema.map((t) => `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@type": t, name: "Org" })}</script>`).join("")}</head><body><header><nav><a href="/over-ons">Over ons</a> <a href="/contact">Contact</a> <a href="/shop">Shop</a> <a href="/nieuws">Nieuws</a></nav></header>${h1.map((h) => `<h1>${h}</h1>`).join("")}<main>${body}</main><footer><a href="/privacy">Privacy</a></footer></body></html>`;
const filler = (t) => `<p>${(t + " ").repeat(30)}</p>`;
const productPage = (name, price) => doc({ title: `${name} | Shop`, description: `${name} kopen.`, h1: [name], body: `<div itemscope itemtype="https://schema.org/Product"><span itemprop="name">${name}</span><span class="price">€ ${price}</span><form action="/cart/add" method="post"><button type="submit">In winkelwagen</button></form></div>`, schema: ["Product"] }).replace("</head>", `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@type": "Product", name, offers: { "@type": "Offer", price, priceCurrency: "EUR", availability: "https://schema.org/InStock" } })}</script></head>`);
const SITES = {
  "voetbalbondx.test": {
    expect: { notSector: ["ecommerce"], sector: ["sports_organizations", "unknown"] },
    pages: {
      "/": doc({ title: "Federation.nl: De officiële website van de Koninklijke Nederlandse Voetbalbond | Federation", description: "Met het laatste nieuws vanuit het amateur- en betaald voetbal. Biedt ondersteuning aan vrijwilligers.", body: filler("Competities, clubs en wedstrijden in het amateurvoetbal.") }),
      "/shop": doc({ title: "Fanshop | Federation", description: "Officiële shirts van het Nederlands elftal.", h1: ["Fanshop"], body: `<a class="product-card" href="/shop/thuisshirt-2026">Thuisshirt</a> <span class="price">€ 94,95</span> <a class="product-card" href="/shop/uitshirt-2026">Uitshirt</a> <span class="price">€ 94,95</span>` }),
      "/shop/thuisshirt-2026": productPage("Thuisshirt 2026", "94.95"),
      "/shop/uitshirt-2026": productPage("Uitshirt 2026", "94.95"),
    },
  },
  "hulpkruis.test": {
    expect: { notSector: ["ecommerce"] },
    pages: {
      "/": doc({ title: "Het Nederlandse Hulpkruis | Zie je het Hulpkruis, zie je hulp", description: "Het Hulpkruis staat wereldwijd klaar voor mensen in nood. Bij een natuurramp of conflict helpen we de slachtoffers. Help je mee?", h1: ["In 5 stappen jouw testament goed geregeld"], head: `<link rel="stylesheet" href="/wp-content/themes/x/style.css"><script src="/wp-includes/js/jquery.js"></script>`, body: `<div class="donation"><span class="amount">€ 10</span> <span class="amount">€ 25</span> <span class="amount">€ 50</span><a href="/shop">Webshop</a><a href="https://winkel.hulpkruis.test/product/ehbo-kit">EHBO-kit</a> <a href="https://winkel.hulpkruis.test/product/ehbo-cursus">EHBO-cursus</a><button>Doneer nu</button></div>` + filler("Wij helpen mensen in nood in Nederland en wereldwijd.") }),
    },
  },
  "stamcafe.test": {
    expect: { notSector: ["ecommerce"] },
    pages: {
      "/": doc({ title: "Welkom bij Stamcafé - De lekkerste biefstuk en meer heerlijke gerechten!", description: "Wat ooit begon als biljartcafé groeide uit tot dé plek voor biefstuk in rijke jus en gastvrijheid.", h1: ["Lekker en vertrouwd."], schema: ["LocalBusiness"], head: `<link rel="stylesheet" href="/wp-content/plugins/woocommerce/assets/css/woocommerce.css"><script src="/wp-includes/js/wp-embed.min.js"></script><meta name="generator" content="WordPress 6.6">`, body: filler("Schuif gezellig aan voor lunch en diner.") }),
      "/menukaart": doc({ title: "Menukaart | Stamcafé", description: "Lunch en diner.", h1: ["Menukaart"], body: `<p>Biefstuk € 21,50</p><p>Saté € 18,50</p>` }),
    },
  },
  // Genuine shops: must stay ecommerce.
  "allstep.test": {
    expect: { sector: ["ecommerce"] },
    pages: {
      "/": doc({ lang: "en", title: "Allstep: Comfortable, Sustainable Shoes & Apparel", description: "Shop sustainable shoes online. Free shipping and returns.", h1: ["Shop our new collection"], head: `<link rel="stylesheet" href="https://cdn.shopify.com/s/files/theme.css"><script src="/cdn/shop/t/1/assets/theme.js"></script>`, body: [1, 2, 3, 4].map((i) => `<div class="product-card"><a href="/products/runner-${i}">Runner ${i}</a><span class="price">€ ${99 + i},00</span><form action="/cart/add" method="post"><button type="submit">Add to cart</button></form></div>`).join("") + `<a href="/cart">Cart</a> <a href="/checkout">Checkout</a>` }),
      "/products/runner-1": productPage("Runner 1", "100.00"),
    },
  },
  "sharkfit.test": {
    expect: { sector: ["ecommerce"] },
    pages: {
      "/": doc({ lang: "en", title: "Sharkfit Official Store - Gym Clothes & Workout Clothes", description: "Shop gym clothing for the gym, running and everything in-between. Free delivery on orders over $75.", h1: ["Workout Clothes & Gym Clothes"], body: [1, 2, 3].map((i) => `<div class="product-card"><a href="/products/leggings-${i}">Leggings ${i}</a><span class="price">$ ${40 + i}.00</span></div>`).join("") + `<a href="/cart">Cart</a><form action="/cart/add" method="post"><button>Add to bag</button></form>` }),
    },
  },
};
globalThis.fetch = async (input) => {
  const u = new URL(typeof input === "string" ? input : input.url);
  const site = SITES[u.host.replace(/^www\./, "")];
  const html = site?.pages[u.pathname.replace(/\/$/, "") || "/"];
  if (!html) return new Response("nf", { status: 404, headers: { "content-type": "text/html" } });
  return new Response(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
};
globalThis.__RF_RENDER = async () => { throw new Error("RENDER_UNAVAILABLE_IN_TEST"); };
const { POST } = await import(ROOT + "/app/api/scan/route.ts");
console.info = () => {}; console.warn = () => {}; console.error = () => {};
const problems = [];
const rows = [];
for (const [host, site] of Object.entries(SITES)) {
  const res = await POST(new Request("http://localhost/api/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: `https://${host}/`, mode: "both", language: "nl" }) }));
  const j = await res.json();
  const sp = j.sectorProfile || {};
  if (process.env.DEBUG_COMMERCE) console.log(host, JSON.stringify(Object.fromEntries(Object.entries(j.evidenceLayer?.evidence?.commerce || {}).map(([k, v]) => [k, [v.value, v.confidence]]))));
  rows.push({ host, sector: sp.sector, key: sp.key, confidence: sp.confidenceScore, evidence: (sp.evidence || []).slice(0, 2), secondary: (sp.secondaryActivities || []).map((a) => a.sector), commerce: j.commerceApplicability?.state });
  if (res.status !== 200) { problems.push(`${host}: HTTP ${res.status} ${j.code}`); continue; }
  if (site.expect.notSector?.includes(sp.sector)) problems.push(`${host}: primary sector ${sp.sector} (${sp.confidenceScore})`);
  if (site.expect.sector && !site.expect.sector.includes(sp.sector)) problems.push(`${host}: sector ${sp.sector}, expected ${site.expect.sector.join("|")}`);
}
for (const r of rows) console.log(`${r.host.padEnd(20)} ${String(r.sector).padEnd(22)} ${String(r.confidence).padEnd(4)} secondary=${r.secondary.join(",") || "-"} commerce=${r.commerce}`);
for (const p of problems) console.log(" - " + p);
console.log("SCAN_MATRIX_RESULT " + JSON.stringify({ total: rows.length, failed: problems.length, rows }));
process.exit(0);
