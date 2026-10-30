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
const ROOT = new URL("../../", import.meta.url).pathname.replace(/\/$/, "");
const { auditReportClaims } = await import(ROOT + "/lib/report-claim-audit.mjs");
const words = (s, n = 18) => `<p>${(s + " ").repeat(n)}</p>`;
const ld = (obj) => `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", ...obj })}</script>`;
const page = ({ lang = "nl", title, description, h1, body, head = "", canonical = "/" }) => `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>${title}</title><meta name="description" content="${description}"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="canonical" href="${canonical}">${head}</head><body><header><nav><a href="/over-ons">Over ons</a><a href="/contact">Contact</a></nav></header><h1>${h1}</h1><main>${body}</main><footer><a href="/privacy">Privacy</a></footer></body></html>`;
const contact = `<p>Adres: Hoofdstraat 12, 1234 AB Utrecht. Telefoon: 030 123 4567. Contact: info@voorbeeld.nl</p>`;
const cards = Array.from({ length: 6 }, (_, i) => `<div class="product-card"><a href="/tarieven/abonnement-${i}">Abonnement ${i}</a><span class="price">€ ${20 + i},00 per maand</span><form action="/cart/add" method="post"><button>In winkelwagen</button></form></div>`).join("");
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
  if (s.pageType && j.pageTypeEvidence?.type !== s.pageType) problems.push(`${s.url}: page type ${j.pageTypeEvidence?.type}, expected ${s.pageType}`);
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
