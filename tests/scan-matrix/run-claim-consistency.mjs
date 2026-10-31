// Report claims follow evidence (30 Oct 2026, replay claim audit). Neutral .test hosts.
// Each scenario reproduces one generic failure class found in the recorded
// TestLab evidence; every report must also pass auditReportClaims().
//   legal.test      law firm, LegalService JSON-LD            -> schema pass (Organization subtype)
//   staffing.test   Corporation JSON-LD, "vacatures in logistiek" -> schema pass, no transport context
//   bank.test       bank with address/phone text              -> no LocalBusiness advice, no self-check correction
//   hospital.test   MedicalOrganization JSON-LD + contact     -> schema pass (typed local entity)
//   telco.test      root 301 → /start with product cards      -> homepage, not product
//   direct.test     /en/home.html scanned directly            -> homepage, not category
//   aem.test        ld+json with CMS component "@type"s       -> only schema.org types reported
//   ssr-shop.test   product cards + cart + product page       -> confirmed webshop, sector ecommerce
//   garden-shop.test feed/seeds/poultry assortment + cart      -> webshop, never agriculture
//   links-bad.test  anchor "Sony WH-1000XM5 koptelefoon zwart" → /product/2/samsung-galaxy-s24 -> semantic warning kept
//   links-ok.test   rating anchor and 2-word use-case label on product URLs -> no semantic warning
//   entity.test     encoded description/nav, one double-encoded field -> decoded once; double encoding reported
//   stat.test / land.test  statistics office / land registry      -> government; no professional/real-estate modules
//   chip.test       semiconductor maker, title lists markets      -> manufacturing; no automotive module
//   spa-shop.test   JS shell, no render                       -> honest unknown/unconfirmed, no webshop claim
const ROOT = new URL("../../", import.meta.url).pathname.replace(/\/$/, "");
const { auditReportClaims } = await import(ROOT + "/lib/report-claim-audit.mjs");
const words = (s, n = 18) => `<p>${(s + " ").repeat(n)}</p>`;
const ld = (obj) => `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", ...obj })}</script>`;
const page = ({ lang = "nl", title, description, h1, body, head = "", canonical = "/" }) => `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>${title}</title><meta name="description" content="${description}"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="canonical" href="${canonical}">${head}</head><body><header><nav><a href="/over-ons">Over ons</a><a href="/contact">Contact</a></nav></header><h1>${h1}</h1><main>${body}</main><footer><a href="/privacy">Privacy</a></footer></body></html>`;
const contact = `<p>Adres: Hoofdstraat 12, 1234 AB Utrecht. Telefoon: 030 123 4567. Contact: info@voorbeeld.nl</p>`;
const cards = Array.from({ length: 6 }, (_, i) => `<div class="product-card"><a href="/tarieven/abonnement-${i}">Abonnement ${i}</a><span class="price">€ ${20 + i},00 per maand</span><form action="/cart/add" method="post"><button>In winkelwagen</button></form></div>`).join("");
const shopCards = (n) => Array.from({ length: n }, (_, i) => `<div class="product-card"><a href="/p/artikel-${i}">Artikel ${i}</a><span class="price">€ ${3 + i},99</span><form action="/cart/add" method="post"><input type="hidden" name="sku" value="${i}"><button type="submit">In winkelmand</button></form></div>`).join("");
const shopNav = (labels) => labels.map(([h, l]) => `<a href="${h}">${l}</a>`).join("");
const shopPage = ({ title, description, h1 = "", body = "", nav: n = [] }) => `<!doctype html><html lang="nl"><head><meta charset="utf-8"><title>${title}</title><meta name="description" content="${description}"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="canonical" href="/"></head><body><header><nav>${shopNav(n)}</nav></header>${h1 ? `<h1>${h1}</h1>` : ""}<main>${body}</main><footer><a href="/privacy">Privacy</a></footer></body></html>`;
const shopProduct = (name) => `<!doctype html><html lang="nl"><head><meta charset="utf-8"><title>${name} | Winkel</title><meta name="description" content="${name} online bestellen."><link rel="canonical" href="/p/artikel-0">${ld({ "@type": "Product", name, sku: "1", offers: { "@type": "Offer", price: "4.99", priceCurrency: "EUR", availability: "https://schema.org/InStock" } })}</head><body><h1>${name}</h1><span class="price">€ 4,99</span><form action="/cart/add" method="post"><button>In winkelmand</button></form>${words("Productbeschrijving.", 10)}</body></html>`;
const SITES = {
  "legal.test": { "/": page({ title: "Kantoor Voorbeeld | Advocaten en notarissen", description: "Advocatenkantoor voor ondernemingsrecht, arbeidsrecht en fiscaal advies.", h1: "Advocaten voor ondernemers", head: ld({ "@type": "LegalService", name: "Kantoor Voorbeeld", url: "https://legal.test/" }), body: words("Ons advocatenkantoor adviseert ondernemingen over contracten, geschillen en fiscale vraagstukken.") + contact }) },
  "staffing.test": { "/": page({ title: "Werkvoorbeeld | Uitzendbureau en vacatures", description: "Uitzendbureau met vacatures in logistiek, techniek en administratie.", h1: "Vind je volgende baan", head: ld({ "@type": "Corporation", name: "Werkvoorbeeld", url: "https://staffing.test/" }), body: words("Als uitzendbureau verbinden wij werkgevers en kandidaten in heel Nederland met passende vacatures.") }) },
  "bank.test": { "/": page({ title: "Voorbeeldbank | Betalen, sparen, hypotheek", description: "Bank voor betalen, sparen, lenen en hypotheken voor particulieren en ondernemers.", h1: "Bankieren bij Voorbeeldbank", head: ld({ "@type": "BankOrCreditUnion", name: "Voorbeeldbank", url: "https://bank.test/" }), body: words("Open een betaalrekening, spaar online of vraag een hypotheek aan bij onze bank. Bekijk de rente en voorwaarden.") + `<p>Openingstijden kantoor: ma-vr 9-17 uur.</p>` + contact }) },
  "hospital.test": { "/": page({ title: "Universitair Medisch Centrum Voorbeeld | Ziekenhuis", description: "Universitair medisch centrum voor zorg, onderzoek en onderwijs.", h1: "Welkom bij het ziekenhuis", head: ld({ "@type": "MedicalOrganization", name: "UMC Voorbeeld", url: "https://hospital.test/" }), body: words("Ons ziekenhuis biedt specialistische zorg, patiëntenvoorlichting en behandelingen. Maak een afspraak via uw huisarts.") + `<p>Openingstijden poli: 8-17 uur.</p>` + contact }) },
  "telco.test": {
    "/": { status: 301, location: "https://telco.test/start" },
    "/start": page({ lang: "de", title: "Telco Voorbeeld | Mobilfunk, Internet und TV", description: "Mobilfunk-Tarife, Internet und Fernsehen von Telco Voorbeeld.", h1: "Willkommen bei Telco", head: ld({ "@type": "Organization", name: "Telco", url: "https://telco.test/" }) + ld({ "@type": "WebSite", name: "Telco", url: "https://telco.test/" }), canonical: "https://telco.test/start", body: words("Telekommunikation: Mobilfunk, Glasfaser-Internet und TV-Pakete für Privatkunden und Geschäftskunden.") + cards }),
  },
  "direct.test": { "/en/home.html": page({ lang: "en", title: "Rentals Voorbeeld | Car and van rental", description: "Car rental and van rental at locations across Europe.", h1: "Rent a car", head: ld({ "@type": "Organization", name: "Rentals", url: "https://direct.test/" }), canonical: "https://direct.test/en/home.html", body: words("Car rental for business and leisure trips. Pick up at the airport or in the city.") + cards }) },
  "ssr-shop.test": { "/": shopPage({ title: "Winkelvoorbeeld | Altijd iets leuks", description: "Shop online: wonen, keuken, kleding en meer.", h1: "Nieuw binnen", nav: [["/wonen", "Wonen"], ["/keuken", "Keuken"], ["/winkels", "Winkels"], ["/cart", "Winkelmandje"]], body: shopCards(12) + words("Bekijk ons assortiment voor wonen, keuken en kleding.") }), "/p/artikel-0": shopProduct("Theepot") },
  "garden-shop.test": { "/": shopPage({ title: "Buitenvoorbeeld | Alles voor dier, tuin en buitenleven", description: "Bestel online diervoeding, zaden en tuinartikelen. Gratis bezorging of afhalen in de winkel.", h1: "Alles voor dier en tuin", nav: [["/diervoeding", "Diervoeding"], ["/pluimvee", "Pluimvee"], ["/zaden", "Zaden en bollen"], ["/bodem", "Bodemverbetering"], ["/winkels", "Winkels"], ["/cart", "Winkelmand"]], body: shopCards(10) + words("Diervoeding, kippenvoer en tuinzaden voor elk seizoen.") }), "/p/artikel-0": shopProduct("Kippenvoer 20 kg") },
  "spa-shop.test": { "/": shopPage({ title: "Interieurvoorbeeld | Interieur, hobby en keuken", description: "Ontdek onze nieuwe collectie voor je huis, hobby en keuken.", nav: [["/nieuw", "Nieuw"], ["/interieur", "Interieur"], ["/winkels", "Winkels"], ["/cart", "Winkelmand"]], body: `<div id="app"></div><script src="/app.js"></script>` }) },
  "links-bad.test": { "/": shopPage({ title: "Elektronica Voorbeeld | Koptelefoons en telefoons", description: "Shop online koptelefoons, telefoons en accessoires.", h1: "Aanbiedingen", nav: [["/koptelefoons", "Koptelefoons"], ["/cart", "Winkelmand"]], body: `<a href="/product/2/samsung-galaxy-s24">Sony WH-1000XM5 koptelefoon zwart</a>` + shopCards(4) + words("Koptelefoons en telefoons van topmerken.") }), "/product/2/samsung-galaxy-s24": shopProduct("Samsung Galaxy S24") },
  "links-ok.test": { "/": shopPage({ title: "Elektronica Voorbeeld | Koptelefoons en telefoons", description: "Shop online koptelefoons, telefoons en accessoires.", h1: "Aanbiedingen", nav: [["/koptelefoons", "Koptelefoons"], ["/cart", "Winkelmand"]], body: `<a href="/product/3/hp-color-laserjet-3302sdw">Beoordeling is 8,8 van de 10, gebaseerd op 15 reviews</a><a href="/care/products/respiratory-drug-delivery">Asthma management</a>` + shopCards(4) + words("Printers en zorgproducten van topmerken.") }), "/product/3/hp-color-laserjet-3302sdw": shopProduct("HP Color LaserJet"), "/care/products/respiratory-drug-delivery": shopProduct("Respiratory drug delivery") },
  "entity.test": { "/": `<!doctype html><html lang="nl"><head><meta charset="utf-8"><title>Caf&eacute; Voorbeeld | Eten &amp; drinken</title><meta name="description" content="Nederland&#x27;s favoriete caf&eacute; &mdash; eten &amp; drinken in de stad. Reserveer een tafel."><link rel="canonical" href="/"></head><body><header><nav><a href="/menu">Menu &amp; prijzen</a><a href="/contact">Contact</a></nav></header><h1>Welkom bij caf&eacute; Voorbeeld</h1>${words("Ons café serveert lunch en diner met verse gerechten.")}</body></html>` },
  "entity2.test": { "/": `<!doctype html><html lang="nl"><head><meta charset="utf-8"><title>Voorbeeld | Diensten</title><meta name="description" content="Nederland&amp;#x27;s beste adviseur voor ondernemers en particulieren in de regio."><link rel="canonical" href="/"></head><body><h1>Advies</h1>${words("Wij adviseren ondernemers over administratie en belastingen.")}</body></html>` },
  "stat.test": { "/": page({ title: "Centraal Bureau voor de Statistiek", description: "Het CBS publiceert betrouwbare en samenhangende statistische informatie die inspeelt op de behoefte van de samenleving.", h1: "Cijfers over Nederland", body: words("Nieuwe cijfers over inflatie, werkloosheid en bevolkingsgroei. Bekijk de tabellen en dashboards.") + `<nav><a href="/cijfers">Cijfers</a><a href="/diensten">Onze diensten</a></nav>` }) },
  "land.test": { "/": page({ title: "Kadaster", description: "Het Kadaster registreert administratieve en geografische gegevens van onroerende zaken in Nederland, zoals huizen, percelen en schepen.", h1: "Wat wilt u weten over uw woning of perceel?", body: words("Vraag eigendomsinformatie op, bekijk de kadastrale kaart of bekijk verkoopprijzen van woningen.") }) },
  "chip.test": { "/": page({ lang: "en", title: "NXP Semiconductors | Automotive, Security, IoT", description: "NXP is a global semiconductor company creating solutions that enable secure connections for a smarter world.", h1: "Brighter together", body: words("Microcontrollers, processors, automotive radar and secure identification chips. Development boards and design tools.") }) },
  "aem.test": { "/": page({ title: "Hotels Voorbeeld | Hotels in Europa", description: "Boek een hotelkamer in een van onze hotels in Europa.", h1: "Onze hotels", head: ld({ "@type": "Organization", name: "Hotels" }) + `<script type="application/ld+json">{"@type":"mi-aem-common-spa/components/experiencefragment","items":[{"@type":"mi-aem-homepage-spa/components/content/universal-footer"}]}</script>`, body: words("Boek een hotelkamer voor een overnachting in de stad. Ontbijt en late check-out mogelijk.") }) },
};
const respond = (hit) => hit.location
  ? new Response(null, { status: hit.status, headers: { location: hit.location } })
  : new Response(hit, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
globalThis.fetch = async (input) => {
  const u = new URL(typeof input === "string" ? input : input.url);
  const site = SITES[u.host.replace(/^www\./, "")];
  const path = u.pathname.replace(/\/$/, "") || "/";
  const hit = site?.[path] ?? site?.[u.pathname];
  return hit ? respond(hit) : new Response("nf", { status: 404 });
};
globalThis.__RF_RENDER = async () => { throw new Error("RENDER_UNAVAILABLE_IN_TEST"); };
const { POST } = await import(ROOT + "/app/api/scan/route.ts");
console.info = () => {}; console.warn = () => {}; console.error = () => {};
const scan = async (url) => {
  const res = await POST(new Request("http://localhost/api/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url, mode: "both", language: "nl" }) }));
  return { res, j: await res.json() };
};
const SCENARIOS = [
  { url: "https://legal.test/", expect: { schema: "pass" } },
  { url: "https://staffing.test/", expect: { schema: "pass" }, forbid: /transport|logistiek/i },
  { url: "https://bank.test/", expect: {}, noLocalAdvice: true },
  { url: "https://hospital.test/", expect: { schema: "pass" } },
  { url: "https://telco.test/", pageType: "homepage" },
  { url: "https://direct.test/en/home.html", pageType: "homepage" },
  { url: "https://aem.test/", types: ["Organization"] },
  { url: "https://ssr-shop.test/", sector: "ecommerce", shop: "confirmed" },
  { url: "https://stat.test/", sector: "government", noModules: ["professional_services", "real_estate", "news_media"] },
  { url: "https://land.test/", sector: "government", noModules: ["professional_services", "real_estate"] },
  { url: "https://chip.test/", sector: "manufacturing_industrial", noModules: ["automotive", "telecom_technology"] },
  { url: "https://entity.test/", expect: { html_escape: "pass" }, metrics: { description: "Nederland's favoriete café — eten & drinken in de stad. Reserveer een tafel.", navigationLabels: ["Menu & prijzen", "Contact"] } },
  { url: "https://entity2.test/", expect: { html_escape: "warning" }, messageHas: { html_escape: /meta description \(&#x27;\)/ } },
  { url: "https://links-bad.test/", expect: { semantic_link_destination: "warning" } },
  { url: "https://links-ok.test/", notStatus: { semantic_link_destination: "warning" } },
  { url: "https://garden-shop.test/", sector: "ecommerce", shop: "confirmed" },
  { url: "https://spa-shop.test/", sector: "unknown", shop: "none" },
];
const problems = [];
const rows = [];
for (const s of SCENARIOS) {
  const { res, j } = await scan(s.url);
  const all = [...(j.seo?.checks || []), ...(j.geo?.checks || [])];
  const get = (k) => all.find((c) => c.key === k);
  rows.push({ url: s.url, http: res.status, sector: j.sectorProfile?.sector, pageType: j.pageTypeEvidence?.type, schema: get("schema")?.status, types: j.metrics?.schemaTypes });
  if (res.status !== 200) { problems.push(`${s.url}: HTTP ${res.status} ${j.code}`); continue; }
  for (const [k, v] of Object.entries(s.expect || {})) if (get(k)?.status !== v) problems.push(`${s.url}: ${k} is ${get(k)?.status} (${get(k)?.message}), expected ${v}`);
  for (const [k, v] of Object.entries(s.metrics || {})) if (JSON.stringify(j.metrics?.[k]) !== JSON.stringify(v)) problems.push(`${s.url}: metrics.${k} = ${JSON.stringify(j.metrics?.[k])}`);
  for (const [k, re] of Object.entries(s.messageHas || {})) if (!re.test(get(k)?.message || "")) problems.push(`${s.url}: ${k} message: ${get(k)?.message}`);
  for (const [k, v] of Object.entries(s.notStatus || {})) if (get(k)?.status === v) problems.push(`${s.url}: ${k} is ${v}: ${get(k)?.message}`);
  if (s.pageType && j.pageTypeEvidence?.type !== s.pageType) problems.push(`${s.url}: page type ${j.pageTypeEvidence?.type}, expected ${s.pageType}`);
  for (const m of s.noModules || []) if ((j.sectorProfile?.applicableModules || []).includes(m)) problems.push(`${s.url}: foreign sector module ${m} applied`);
  if (s.sector && j.sectorProfile?.sector !== s.sector) problems.push(`${s.url}: sector ${j.sectorProfile?.sector}/${j.sectorProfile?.key}, expected ${s.sector}`);
  const wt = j.websiteProfile?.websiteType;
  if (s.shop === "confirmed" && !(wt?.value === "ecommerce_store" && wt?.status === "confirmed" && j.classification?.websiteType === "Webshop")) problems.push(`${s.url}: webshop not confirmed (${wt?.value}/${wt?.status}, ${j.classification?.websiteType})`);
  if (s.shop === "none" && (j.classification?.websiteType === "Webshop" || wt?.status === "confirmed")) problems.push(`${s.url}: webshop claimed without evidence (${wt?.value}/${wt?.status})`);
  if (s.sector === "unknown" && j.sectorProfile?.confidenceScore) problems.push(`${s.url}: unknown sector with ${j.sectorProfile.confidenceScore}%`);
  if (s.types && JSON.stringify(j.metrics?.schemaTypes) !== JSON.stringify(s.types)) problems.push(`${s.url}: schemaTypes ${JSON.stringify(j.metrics?.schemaTypes)}`);
  if (s.forbid && s.forbid.test(get("schema")?.message || "")) problems.push(`${s.url}: schema context names another sector: ${get("schema")?.message}`);
  if (s.noLocalAdvice) {
    const text = all.filter((c) => ["schema", "organization_website"].includes(c.key)).map((c) => `${c.message} ${c.fix || ""}`).join(" ");
    if (/LocalBusiness|lokale bedrijfs/.test(text)) problems.push(`${s.url}: LocalBusiness advice for sector ${j.sectorProfile?.sector}: ${text.slice(0, 200)}`);
  }
  for (const v of auditReportClaims(j)) problems.push(`${s.url}: claim audit ${v.code} ${v.detail}`);
}
for (const r of rows) console.log(JSON.stringify(r));
for (const p of problems) console.log(" - " + p);
console.log("SCAN_MATRIX_RESULT " + JSON.stringify({ total: rows.length, failed: problems.length }));
process.exit(0);
