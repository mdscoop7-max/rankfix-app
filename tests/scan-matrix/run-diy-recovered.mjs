// QA 144 run 7a2155c: a DIY store chain whose homepage refused RankFix (403); the
// browser page names the store chain in its title ("De grootste doe-het-zelf
// winkels van België") and shows category navigation, without prices or cart.
// Field result: sector unknown. Neutral hosts; NL + FR variants; SaaS control.
const ROOT = new URL("../../", import.meta.url).pathname.replace(/\/$/, "");
const navNl = ["Gereedschap", "Bouwmaterialen", "Tuin", "Verf", "Sanitair", "Verlichting", "Winkels", "Folder", "Klantenservice"].map((t) => `<a href="/${t.toLowerCase()}">${t}</a>`).join(" ");
const navFr = ["Outillage", "Matériaux", "Jardin", "Peinture", "Sanitaire", "Éclairage", "Magasins", "Dépliant", "Service client"].map((t, i) => `<a href="/fr/c${i}">${t}</a>`).join(" ");
const page = (lang, title, desc, nav, text) => `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>${title}</title>${desc ? `<meta name="description" content="${desc}">` : ""}</head><body><header><nav>${nav}</nav></header><main><p>${text.repeat(40)}</p></main><footer><a href="/privacy">Privacy</a></footer></body></html>`;
const SITES = {
  "klusketen.test": page("nl", "Klusketen.be | De grootste doe-het-zelf winkels van België", "", navNl, "Ontdek ons aanbod voor in huis en tuin. "),
  "bricoketen.test": page("fr", "Bricoketen.be | Plus grands magasins de bricolage en Belgique", "", navFr, "Découvrez notre offre pour la maison et le jardin. "),
  "kassasoft2.test": page("nl", "KassaSoft | Kassasoftware voor bouwmarkten en doe-het-zelf winkels", "Kassasysteem voor bouwmarkten. Vraag een demo aan.", `<a href="/functies">Functies</a> <a href="/prijzen">Prijzen</a> <a href="/demo">Demo</a>`, "Software voor retailers en bouwmarkten. "),
};
globalThis.fetch = async (input) => {
  const u = new URL(typeof input === "string" ? input : input.url);
  if (!SITES[u.host]) return new Response("nf", { status: 404 });
  if (u.pathname === "/robots.txt") return new Response("User-agent: *\nAllow: /\n", { status: 200, headers: { "content-type": "text/plain" } });
  if (u.pathname === "/") return new Response("<html><head><title>Forbidden</title></head><body>Forbidden</body></html>", { status: 403, headers: { "content-type": "text/html" } });
  return new Response("nf", { status: 404, headers: { "content-type": "text/html" } });
};
globalThis.__RF_RENDER = async (url) => {
  const u = new URL(url);
  if (!SITES[u.host] || u.pathname !== "/") throw new Error("RENDER_UNAVAILABLE_IN_TEST");
  return { html: SITES[u.host], finalUrl: url, elapsedMs: 700, requests: 9, titlePixelWidth: 300, domAccessibility: { controls: 0, unnamedButtons: 0, unlabeledControls: 0 }, axeReport: null };
};
const { POST } = await import(ROOT + "/app/api/scan/route.ts");
console.info = () => {}; console.warn = () => {}; console.error = () => {};
const problems = []; const rows = [];
for (const [host, expectRetail] of [["klusketen.test", true], ["bricoketen.test", true], ["kassasoft2.test", false]]) {
  const res = await POST(new Request("http://localhost/api/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: `https://${host}/`, mode: "both", language: "nl" }) }));
  const j = await res.json(); const sp = j.sectorProfile || {};
  rows.push({ host, status: res.status, sector: sp.sector, key: sp.key, conf: sp.confidenceScore });
  if (res.status !== 200) { problems.push(`${host}: HTTP ${res.status} ${j.code}`); continue; }
  if (expectRetail && sp.sector !== "ecommerce") problems.push(`${host}: store chain named in its own title is ${sp.sector}/${sp.confidenceScore}`);
  if (!expectRetail && sp.sector === "ecommerce") problems.push(`${host}: software for DIY stores became a retailer`);
}
for (const r of rows) console.log(JSON.stringify(r));
for (const p of problems) console.log(" - " + p);
console.log("SCAN_MATRIX_RESULT " + JSON.stringify({ total: rows.length, failed: problems.length, rows }));
process.exit(0);
