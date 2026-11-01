// 1 Nov 2026: a 5xx challenge page is a refusal (HTTP_BLOCKED, bot protection),
// a real 5xx is a server error. A CDN header alone (cf-ray) never decides.
const ROOT = new URL("../../", import.meta.url).pathname.replace(/\/$/, "");
const CASES = {
  "cf503.test": [503, { "cf-ray": "8c1f2a3b4c5d6e7f-AMS", server: "cloudflare" }, `<!doctype html><html><head><title>Just a moment...</title></head><body><p>Checking your browser before accessing the site.</p><script>window._cf_chl_opt={cvId:'3'};</script></body></html>`, "HTTP_BLOCKED", "bot_protection"],
  "sucuri503.test": [503, { server: "Sucuri/Cloudproxy" }, `<html><head><title>Sucuri WebSite Firewall - Access Denied</title></head><body><h1>Access Denied - Sucuri Website Firewall</h1></body></html>`, "HTTP_BLOCKED", "bot_protection"],
  "akamai503-nl.test": [503, {}, `<html><head><title>Een ogenblik geduld...</title></head><body><p>Verify you are human by completing the action below.</p></body></html>`, "HTTP_BLOCKED", "bot_protection"],
  // Real server errors, also behind the same CDN.
  "origin503.test": [503, { "cf-ray": "8c1f2a3b4c5d6e7f-AMS", server: "cloudflare" }, `<html><head><title>503 Service Unavailable</title></head><body><h1>Service Unavailable</h1><p>The server is temporarily unable to service your request due to maintenance downtime or capacity problems.</p></body></html>`, "HTTP_SERVER_ERROR", null],
  "badgateway.test": [502, { server: "nginx" }, `<html><head><title>502 Bad Gateway</title></head><body><center><h1>502 Bad Gateway</h1></center><hr><center>nginx</center></body></html>`, "HTTP_SERVER_ERROR", null],
  "empty500.test": [500, {}, "", "HTTP_SERVER_ERROR", null],
};
globalThis.fetch = async (input) => {
  const u = new URL(typeof input === "string" ? input : input.url);
  const c = CASES[u.host];
  if (!c) return new Response("nf", { status: 404 });
  return new Response(c[2], { status: c[0], headers: { "content-type": "text/html; charset=utf-8", ...c[1] } });
};
globalThis.__RF_RENDER = async () => { throw new Error("RENDER_UNAVAILABLE_IN_TEST"); };
const { POST } = await import(ROOT + "/app/api/scan/route.ts");
console.info = () => {}; console.warn = () => {}; console.error = () => {};
const problems = []; const rows = [];
for (const [host, [, , , code, kind]] of Object.entries(CASES)) {
  const r = await POST(new Request("http://localhost/api/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: `https://${host}/`, mode: "both", language: "nl" }) }));
  const j = await r.json();
  rows.push({ host, api: r.status, code: j.code, blockKind: j.blockKind, score: j.overallScore ?? null });
  if (j.code !== code) problems.push(`${host}: code ${j.code}, expected ${code}`);
  if ((j.blockKind || null) !== kind) problems.push(`${host}: blockKind ${j.blockKind}, expected ${kind}`);
  if (j.overallScore != null) problems.push(`${host}: scored ${j.overallScore}`);
  if (code === "HTTP_BLOCKED" && !/beveiligings- of controlepagina|beveiliging/i.test(String(j.error))) problems.push(`${host}: message does not name the security check: ${j.error}`);
}
for (const r of rows) console.log(JSON.stringify(r));
for (const p of problems) console.log(" - " + p);
console.log("SCAN_MATRIX_RESULT " + JSON.stringify({ total: rows.length, failed: problems.length, rows }));
process.exit(0);
