// 31 Oct 2026 (five-site QA, P7): the product hunt added /bg/, /cz/, /dk/, /de/,
// /at/ copies of one sampled page (it deduplicated on the exact URL only).
// 1. Shop: listing links to locale copies of the same products → each product once.
// 2. Payment provider: fee pages under /products/ never start the product hunt.
const card = (path, n) => `<div class="product"><a href="${path}">Laptop model ${n}</a><span class="price">€ ${499 + n},00</span><button>In winkelwagen</button></div>`;
const productPage = (n) => `<!doctype html><html lang="nl"><head><title>Laptop model ${n} kopen | Shop</title><meta name="description" content="Laptop model ${n} met 16 GB geheugen."></head><body><h1>Laptop model ${n}</h1><p>${"Snelle laptop voor werk en studie. ".repeat(20)}</p><span class="price">€ ${499 + n},00</span></body></html>`;
const SHOP = {
  "/": `<!doctype html><html lang="nl"><head><title>Laptopshop: laptops online kopen</title><meta name="description" content="Laptops online kopen met gratis verzending en 30 dagen bedenktijd."></head><body><nav><a href="/laptops">Laptops</a><a href="/over-ons">Over ons</a><a href="/contact">Contact</a><a href="/winkelwagen">Winkelwagen</a></nav><h1>Laptops online kopen</h1><p>${"Bestel je nieuwe laptop vandaag, morgen in huis. ".repeat(20)}</p></body></html>`,
  "/laptops": `<!doctype html><html lang="nl"><head><title>Laptops | Laptopshop</title></head><body><h1>Laptops</h1>${card("/p/laptop-model-1-123451", 1)}${card("/de/p/laptop-model-1-123451", 1)}${card("/at/p/laptop-model-1-123451", 1)}${card("/p/laptop-model-2-123452", 2)}${card("/de/p/laptop-model-2-123452", 2)}${card("/p/laptop-model-3-123453", 3)}<p>${"Alle laptops op voorraad. ".repeat(20)}</p></body></html>`,
  "/over-ons": `<!doctype html><html lang="nl"><head><title>Over ons | Laptopshop</title></head><body><h1>Over Laptopshop</h1><p>${"Wij verkopen laptops sinds 2005. ".repeat(20)}</p></body></html>`,
  "/contact": `<!doctype html><html lang="nl"><head><title>Contact | Laptopshop</title></head><body><h1>Contact</h1><p>Bel 010 123 4567 of mail info@laptopshop.test</p></body></html>`,
};
for (const prefix of ["", "/de", "/at"]) for (const n of [1, 2, 3]) SHOP[`${prefix}/p/laptop-model-${n}-12345${n}`] = productPage(n);
const fee = "<p>Geen vaste kosten. iDEAL €0,29 per transactie, creditcards 1,8% + €0,25. Terminal vanaf €49,00.</p>";
const PAY = {
  "/": `<!doctype html><html lang="nl"><head><title>Paymo: online betalingen voor groeiende bedrijven</title><meta name="description" content="Paymo maakt online betalen eenvoudig. Accepteer iDEAL, creditcards en Apple Pay met één integratie. Transparante tarieven, geen vaste kosten."></head><body><nav><a href="/products/pos-payments">Kaartterminals</a><a href="/payments">Betaalmethoden</a><a href="/pricing">Prijzen</a><a href="/developers">Ontwikkelaars</a><a href="/about">Over ons</a></nav><h1>Betalingen voor groeiende bedrijven</h1><p>${"Accepteer alle populaire betaalmethoden met één integratie. ".repeat(20)}</p></body></html>`,
  "/products/pos-payments": `<!doctype html><html lang="nl"><head><title>Kaartterminals | Paymo</title></head><body><h1>Kaartterminals</h1>${fee.repeat(3)}${["", "/de", "/at", "/bg", "/cz"].map((p) => `<a href="${p}/products/pos-payments/tap-app">Tap app</a><span>€0,25</span>`).join("")}</body></html>`,
  "/payments": `<!doctype html><html lang="nl"><head><title>Betaalmethoden | Paymo</title></head><body><h1>Betaalmethoden</h1>${fee.repeat(3)}</body></html>`,
  "/pricing": `<!doctype html><html lang="nl"><head><title>Prijzen | Paymo</title></head><body><h1>Prijzen</h1>${fee.repeat(4)}</body></html>`,
};
for (const p of ["", "/de", "/at", "/bg", "/cz"]) PAY[`${p}/products/pos-payments/tap-app`] = `<!doctype html><html><head><title>Tap app | Paymo</title></head><body><h1>Tap to Pay</h1>${fee.repeat(3)}</body></html>`;
const SITES = { "laptopshop.test": SHOP, "paymo.test": PAY };
globalThis.fetch = async (input) => {
  const u = new URL(typeof input === "string" ? input : input.url);
  const site = SITES[u.host.replace(/^www\./, "")];
  if (!site) return new Response("nf", { status: 404 });
  if (u.pathname === "/robots.txt") return new Response("User-agent: *\nAllow: /\n", { status: 200, headers: { "content-type": "text/plain" } });
  const body = site[u.pathname.replace(/\/$/, "") || "/"];
  return body ? new Response(body, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } }) : new Response("nf", { status: 404 });
};
globalThis.__RF_RENDER = async () => { throw new Error("RENDER_UNAVAILABLE_IN_TEST"); };
const { POST } = await import(new URL("../../app/api/scan/route.ts", import.meta.url));
const { sampleIdentityKey } = await import(new URL("../../lib/report-quality.ts", import.meta.url));
console.info = () => {}; console.warn = () => {}; console.error = () => {};
const problems = []; const rows = [];
for (const host of Object.keys(SITES)) {
  const j = await (await POST(new Request("http://localhost/api/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: `https://${host}/`, mode: "both", language: "nl" }) }))).json();
  const urls = (j.multiPage?.pageAudits || []).map((p) => p.url);
  const keys = urls.map((u) => sampleIdentityKey(u));
  const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
  const localeCopies = urls.filter((u) => /\/(?:de|at|bg|cz)\//.test(new URL(u).pathname));
  rows.push({ host, sample: urls.length, dupes: dupes.length, localeCopies: localeCopies.length, products: urls.filter((u) => /model-\d/.test(u)).length });
  if (dupes.length) problems.push(`${host}: ${dupes.length} language/variant duplicate(s) in the sample: ${[...new Set(dupes)].join(", ")}`);
  if (host === "laptopshop.test" && rows.at(-1).products < 2) problems.push(`${host}: product hunt found ${rows.at(-1).products} distinct products (expected ≥ 2)`);
  if (host === "paymo.test" && localeCopies.length) problems.push(`${host}: fee pages started a product hunt (${localeCopies.join(", ")})`);
}
for (const r of rows) console.log(JSON.stringify(r));
for (const p of problems) console.log(" - " + p);
console.log("SCAN_MATRIX_RESULT " + JSON.stringify({ total: rows.length, failed: problems.length, rows }));
process.exit(0);
