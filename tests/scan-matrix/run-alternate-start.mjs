// Blocked homepage → public page from the site's own sitemap (30 Oct 2026; field
// cases Zara HTTP_BLOCKED / ABB FETCH_TIMEOUT, diagnostic only). Neutral hosts.
//   wall.test     homepage 403, robots + sitemap public → partial report from a category page
//   fortress.test everything 403                         → 422 HTTP_BLOCKED, no report (unchanged)
//   wall.test/x   a blocked non-root page entered        → 422, no substitute page
const ROOT = new URL("../../", import.meta.url).pathname.replace(/\/$/, "");
const words = (s, n = 20) => `<p>${(s + " ").repeat(n)}</p>`;
const page = (title, h1, body) => `<!doctype html><html lang="nl"><head><meta charset="utf-8"><title>${title}</title><meta name="description" content="${title} — bekijk het assortiment en bestel online."><link rel="canonical" href="/"></head><body><header><nav><a href="/categorie/schoenen">Schoenen</a><a href="/categorie/jassen">Jassen</a><a href="/contact">Contact</a><a href="/">Home</a></nav></header><h1>${h1}</h1>${body}</body></html>`;
const cards = Array.from({ length: 8 }, (_, i) => `<div class="product-card"><a href="/product/jas-${i}-998">Jas ${i}</a><span class="price">€ ${49 + i},95</span><form action="/cart/add" method="post"><button>In winkelmand</button></form></div>`).join("");
const WALL = {
  "/robots.txt": "User-agent: *\nAllow: /\nSitemap: https://wall.test/sitemap.xml",
  "/sitemap.xml": `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${["/privacy", "/categorie/jassen", "/product/jas-1-998"].map((p) => `<url><loc>https://wall.test${p}</loc></url>`).join("")}</urlset>`,
  "/categorie/jassen": page("Jassen kopen | Wall", "Jassen", cards + words("Winterjassen en regenjassen online bestellen.")),
  "/categorie/schoenen": page("Schoenen kopen | Wall", "Schoenen", cards + words("Schoenen online bestellen.")),
  "/contact": page("Contact | Wall", "Contact", words("Klantenservice bereikbaar via 010 123 4567.")),
};
const blocked = () => new Response("<html><head><title>Access Denied</title></head><body>Access Denied</body></html>", { status: 403, headers: { "content-type": "text/html" } });
globalThis.fetch = async (input) => {
  const u = new URL(typeof input === "string" ? input : input.url);
  const path = u.pathname.replace(/\/$/, "") || "/";
  if (u.host === "fortress.test") return blocked();
  if (u.host !== "wall.test") return new Response("nf", { status: 404 });
  if (path === "/" || path === "/x") return blocked();
  const body = WALL[path];
  if (body === undefined) return new Response("nf", { status: 404 });
  return new Response(body, { status: 200, headers: { "content-type": path.endsWith(".xml") ? "application/xml" : path === "/robots.txt" ? "text/plain" : "text/html; charset=utf-8" } });
};
globalThis.__RF_RENDER = async () => { throw new Error("RENDER_UNAVAILABLE_IN_TEST"); };
const { POST } = await import(ROOT + "/app/api/scan/route.ts");
console.info = () => {}; console.warn = () => {}; console.error = () => {};
const scan = async (url) => { const res = await POST(new Request("http://localhost/api/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url, mode: "both", language: "nl" }) })); return { status: res.status, j: await res.json() }; };
const problems = [];
const a = await scan("https://wall.test/");
if (a.status !== 200) problems.push(`wall.test: HTTP ${a.status} ${a.j.code}`);
else {
  if (a.j.alternateStart?.startUrl !== "https://wall.test/categorie/jassen") problems.push(`wall.test: start ${a.j.alternateStart?.startUrl}`);
  if (a.j.alternateStart?.reasonCode !== "HTTP_BLOCKED") problems.push(`wall.test: reason ${a.j.alternateStart?.reasonCode}`);
  if (!/gedeeltelijk rapport/.test(a.j.alternateStart?.note || "")) problems.push("wall.test: note not partial");
  if (a.j.scoreModel?.evidenceLevel === "complete") problems.push("wall.test: complete despite blocked homepage");
  const home = (a.j.multiPage?.sectionCoverage?.items || []).find((i) => i.section === "homepage");
  if (home?.status === "checked") problems.push("wall.test: homepage claimed as checked");
}
const b = await scan("https://fortress.test/");
if (b.status !== 422 || b.j.code !== "HTTP_BLOCKED" || b.j.alternateStart) problems.push(`fortress.test: ${b.status} ${b.j.code}`);
const c = await scan("https://wall.test/x");
if (c.status !== 422 || c.j.alternateStart) problems.push(`wall.test/x: ${c.status} ${c.j.code}`);
console.log(JSON.stringify({ a: { status: a.status, alt: a.j.alternateStart, level: a.j.scoreModel?.evidenceLevel, home: (a.j.multiPage?.sectionCoverage?.items || []).find((i) => i.section === "homepage") }, b: [b.status, b.j.code], c: [c.status, c.j.code] }));
for (const p of problems) console.log(" - " + p);
console.log("SCAN_MATRIX_RESULT " + JSON.stringify({ total: 3, failed: problems.length }));
process.exit(0);
