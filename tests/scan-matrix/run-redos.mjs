// Pathological page content (long runs of letters, digits, dots, unclosed tags...).
// Every scan must stay fast: a quadratic regex here once stalled scans for minutes.
const LIMIT = Number(process.env.REDOS_LIMIT_MS || 6000);
const N = Number(process.env.N || 60000);
const CASES = {
  letters: "x".repeat(N), digits: "0".repeat(N), digits1: "1".repeat(N), spaces: "a" + " ".repeat(N) + "b", tabsNl: "a\t\n".repeat(N / 3),
  ats: "a@".repeat(N / 2), dots: "a.".repeat(N / 2), atDots: "a@b.".repeat(N / 4), base64: "data:image/png;base64," + "QUJD".repeat(N / 4),
  ltRuns: "<".repeat(N), formOpen: "<form ".repeat(N / 6), scriptOpen: "<script>" + "var a=1;".repeat(N / 8), nested: "<div>".repeat(20000) + "x" + "</div>".repeat(20000),
  euro: "€ 1".repeat(N / 3), postcode: "Straat 1 1234 AB ".repeat(N / 17), commas: "a,".repeat(N / 2), quotes: "\"'".repeat(N / 2), dashes: "-".repeat(N), hashes: "#".repeat(N),
  urls: "https://a.b/".repeat(N / 12), json: "{\"a\":".repeat(N / 5), longWordSpaces: ("y".repeat(5000) + " ").repeat(40), plusPhone: "+31 6 ".repeat(N / 6),
};
let current = "letters";
const page = (payload) => `<!doctype html><html lang="nl"><head><meta charset="utf-8"><title>Test pagina – onderwerp | Merk</title><meta name="description" content="Een beschrijving van de testpagina met voldoende lengte om als bruikbaar te gelden."></head><body><h1>Test</h1><p>${payload}</p><a href="/contact">Contact</a></body></html>`;
globalThis.fetch = async (input) => {
  const u = new URL(typeof input === "string" ? input : input.url);
  if (u.pathname === "/") return new Response(page(CASES[current]), { status: 200, headers: { "content-type": "text/html" } });
  return new Response(`<html><head><title>Sub | Merk</title></head><body><h1>Sub</h1></body></html>`, { status: 200, headers: { "content-type": "text/html" } });
};
const ROOT = new URL("../../", import.meta.url).pathname.replace(/\/$/, "");
const { POST } = await import(ROOT + "/app/api/scan/route.ts");
console.info = () => {}; console.warn = () => {}; console.error = () => {};
let slow = 0;
for (const name of (process.env.CASES ? process.env.CASES.split(",") : Object.keys(CASES))) {
  current = name; const t0 = performance.now();
  const res = await POST(new Request("http://localhost/api/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: "https://redos.test/", mode: "both", language: "nl" }) }));
  await res.json(); const ms = Math.round(performance.now() - t0); if (ms > LIMIT) slow++;
  process.stdout.write(`${ms > LIMIT ? "✗" : "✓"} ${name.padEnd(15)} HTTP ${res.status} ${ms} ms\n`);
}
console.log(`trage gevallen: ${slow}`);
console.log("SCAN_MATRIX_RESULT " + JSON.stringify({ total: Object.keys(CASES).length, failed: slow }));
process.exit(0);
