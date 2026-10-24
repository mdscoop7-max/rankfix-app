// QA-144 (Big.dk: no answer after 300 s, the platform killed the function).
// A scan whose browser work keeps hanging must stop itself at the hard limit with a
// controlled SCAN_TIMEOUT answer (not charged, nothing stored), well before the
// platform limit. Run with a short limit: RANKFIX_SCAN_HARD_LIMIT_MS=12000.
const ROOT = new URL("../../", import.meta.url).pathname.replace(/\/$/, "");
const shell = () => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Studio</title><script src="/_next/static/a.js"></script><script src="/b.js"></script><script src="/c.js"></script><script src="/d.js"></script></head><body><div id="__next"></div></body></html>`;
globalThis.fetch = async (input) => {
  const u = new URL(typeof input === "string" ? input : input.url);
  if (/\.(?:txt|xml)$/.test(u.pathname)) return new Response("nf", { status: 404 });
  return new Response(shell(), { status: 200, headers: { "content-type": "text/html" } });
};
// A browser that never finishes (ignores its own timeout), like a hung Chromium.
globalThis.__RF_RENDER = () => new Promise(() => {});
const { POST } = await import(ROOT + "/app/api/scan/route.ts");
console.info = () => {}; console.warn = () => {}; console.error = () => {};
const problems = [];
const t0 = Date.now();
const res = await POST(new Request("http://localhost/api/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: "https://heavy-js.test/", mode: "both", language: "nl" }) }));
const j = await res.json();
const s = (Date.now() - t0) / 1000;
const limit = Number(process.env.RANKFIX_SCAN_HARD_LIMIT_MS) / 1000;
if (res.status !== 503 || j.code !== "SCAN_TIMEOUT") problems.push(`HTTP ${res.status} ${j.code}`);
if (j.charged !== false) problems.push("must not be charged");
if (!/tijdslimiet/.test(j.error || "")) problems.push(`message ${j.error}`);
if (s > limit + 3) problems.push(`answered after ${s.toFixed(1)} s (limit ${limit} s)`);
console.log(`hung render: HTTP ${res.status} ${j.code} after ${s.toFixed(1)} s`);
for (const p of problems) console.log(" - " + p);
console.log("SCAN_MATRIX_RESULT " + JSON.stringify({ total: 1, failed: problems.length }));
process.exit(0);
