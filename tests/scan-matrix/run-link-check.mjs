// 31 Oct (PDF P4): links to an error page are broken, honeypot links are skipped,
// a link without answer gets one retry, and the same anchor text with different
// targets is reported (no deduction).
const ROOT = new URL("../../", import.meta.url).pathname.replace(/\/$/, "");
const body = (t) => `<!doctype html><html lang="nl"><head><title>${t}</title></head><body><h1>${t}</h1><p>${"Tekst over banden en onderhoud. ".repeat(30)}</p></body></html>`;
const home = `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Garage Noord | Banden en APK</title><meta name="description" content="Garage Noord in Groningen voor banden, APK en onderhoud van alle merken. Maak eenvoudig online een afspraak."></head><body>
<nav><a href="/apk">APK</a><a href="/banden">Banden</a><a href="/salons">Vind je vestiging</a><a href="/">Vind je vestiging</a></nav><h1>Garage Noord</h1><p>${"Banden, APK en onderhoud voor alle merken in Groningen en omgeving. ".repeat(12)}</p>
<a href="/pagenotfound">Banden wisselen</a><a href="/flaky">Onderhoud</a><a href="/trap" style="display:none">Secret Link</a><a href="/trap2">Secret Link</a>
<footer><a href="/privacy">Privacy</a><a href="/contact">Contact</a></footer></body></html>`;
let flakyCalls = 0;
globalThis.fetch = async (i) => {
  const u = new URL(typeof i === "string" ? i : i.url);
  if (u.host !== "links.test") return new Response("nf", { status: 404 });
  if (u.pathname === "/") return new Response(home, { status: 200, headers: { "content-type": "text/html" } });
  if (u.pathname === "/flaky") { if (++flakyCalls === 1) throw new Error("timeout"); return new Response(body("Onderhoud"), { status: 200, headers: { "content-type": "text/html" } }); }
  if (u.pathname === "/trap" || u.pathname === "/trap2") return new Response("forbidden", { status: 403 });
  if (["/apk", "/banden", "/salons", "/privacy", "/contact", "/pagenotfound"].includes(u.pathname)) return new Response(body(u.pathname === "/pagenotfound" ? "Garage Noord" : u.pathname.slice(1)), { status: 200, headers: { "content-type": "text/html" } });
  return new Response("nf", { status: 404 });
};
globalThis.__RF_RENDER = async () => { throw new Error("no"); };
const { POST } = await import(ROOT + "/app/api/scan/route.ts"); console.info = console.warn = console.error = () => {};
const j = await (await POST(new Request("http://localhost/api/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: "https://links.test/", mode: "both", language: "nl" }) }))).json();
const c = j.seo.checks.find((x) => x.key === "broken_links");
const problems = [];
if (!c) problems.push("no broken_links check");
else {
  if (!/pagenotfound/.test(c.message) || c.status !== "warning") problems.push(`link to /pagenotfound not reported as broken (${c.status}: ${c.message.slice(0, 160)})`);
  if (/trap/.test(c.message)) problems.push("honeypot link was checked and reported");
  if (/flaky/.test(c.message)) problems.push(`link without first answer not retried: ${c.message.slice(0, 160)}`);
  if (!/dezelfde linktekst verwijst naar verschillende pagina's: "vind je vestiging"/i.test(c.message)) problems.push(`anchor conflict not reported: ${c.message.slice(-200)}`);
  if (/Let op \(geen aftrek\)/.test(c.message) && c.points < 3) problems.push(`anchor note must not cost points (${c.points})`);
}
for (const p of problems) console.log(" - " + p);
if (process.env.VERBOSE) console.log(c?.status, c?.points, c?.message);
console.log("SCAN_MATRIX_RESULT " + JSON.stringify({ total: 1, failed: problems.length }));
process.exit(0);
