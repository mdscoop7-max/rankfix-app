// QA #186 (check 4): wall-clock behaviour with requests that really hang until
// the client timeout fires (no instant fake errors). Slow by design (~2 min);
// run on demand: RF_SLOW_TESTS=1 npm test, or directly:
// node --experimental-strip-types --import ./tests/scan-matrix/register.mjs tests/scan-matrix/run-timeout-budget.mjs
const ROOT = new URL("../../", import.meta.url).pathname.replace(/\/$/, "");
const page = (host, title) => `<!doctype html><html lang="nl"><head><meta charset="utf-8"><title>${title}</title><meta name="description" content="${title}: wegtransport, groupage en opslag in heel Europa."><link rel="canonical" href="https://${host}/"></head><body><h1>${title}</h1><p>${"Wegtransport en logistiek met groupage en opslag. ".repeat(40)}</p>${["/diensten", "/over-ons", "/contact", "/vacatures", "/opslag", "/nieuws", "/team", "/locaties"].map((p) => `<a href="${p}">${p.slice(1)}</a>`).join(" ")}</body></html>`;
// Hangs until the caller's AbortSignal fires, exactly like an unresponsive server.
const hang = (init) => new Promise((_, reject) => {
  const signal = init?.signal;
  const fail = () => { const e = new Error("The operation was aborted due to timeout"); e.name = "TimeoutError"; reject(e); };
  if (signal?.aborted) return fail();
  signal?.addEventListener("abort", fail, { once: true });
});
const SCEN = {
  "primary-hangs-browser-ok": { primary: "hang", render: "ok" },
  "primary-hangs-browser-fails": { primary: "hang", render: "fail" },
  "all-samples-hang": { primary: "ok", samples: "hang" },
};
let current = null;
globalThis.fetch = async (input, init) => {
  const u = new URL(typeof input === "string" ? input : input.url);
  const sc = SCEN[current];
  if (/\.(?:txt|xml)$/.test(u.pathname)) return new Response("nf", { status: 404 });
  if (u.pathname === "/" ) return sc.primary === "hang" ? hang(init) : new Response(page(u.host, "Vervoerder"), { status: 200, headers: { "content-type": "text/html" } });
  return sc.samples === "hang" ? hang(init) : new Response(page(u.host, u.pathname.slice(1)), { status: 200, headers: { "content-type": "text/html" } });
};
globalThis.__RF_RENDER = async (url) => {
  if (SCEN[current].render !== "ok") throw new Error("TimeoutError: Navigation timeout of 15000 ms exceeded");
  await new Promise((r) => setTimeout(r, 1500));
  return { html: page(new URL(url).host, "Vervoerder"), finalUrl: url, elapsedMs: 1500, requests: 10, titlePixelWidth: 300, domAccessibility: { controls: 0, unnamedButtons: 0, unlabeledControls: 0 }, axeReport: null };
};
const { POST } = await import(ROOT + "/app/api/scan/route.ts");
console.info = () => {}; console.warn = () => {}; console.error = () => {};
const problems = [];
for (const id of Object.keys(SCEN)) {
  current = id;
  const t0 = Date.now();
  const res = await POST(new Request("http://localhost/api/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: `https://${id}.test/`, mode: "both", language: "nl" }) }));
  const j = await res.json();
  const s = Math.round((Date.now() - t0) / 1000);
  const fail = (m) => problems.push(`${id}: ${m}`);
  if (id === "primary-hangs-browser-ok") {
    if (res.status !== 200) fail(`HTTP ${res.status} ${j.code}`);
    if (!j.access?.rankfixBlocked || !/time-out|tijdslimiet/.test(j.access?.note || "")) fail(`access note ${j.access?.note}`);
    if (s > 60) fail(`took ${s}s (limit 60s)`);
  }
  if (id === "primary-hangs-browser-fails") {
    if (res.status !== 502 || j.code !== "FETCH_TIMEOUT") fail(`HTTP ${res.status} ${j.code}`);
    if (j.diagnosis?.attempts !== 2) fail(`diagnosis attempts ${j.diagnosis?.attempts}`);
    if (j.charged !== false) fail("must not be charged");
    if (s > 45) fail(`took ${s}s (limit 45s)`);
  }
  if (id === "all-samples-hang") {
    if (res.status !== 200) fail(`HTTP ${res.status} ${j.code}`);
    const rp = j.multiPage?.sampleRetryPass;
    if (rp?.triggered) fail("timeouts must never trigger the retry pass");
    const timedOut = (j.multiPage?.pageAudits || []).filter((p) => p.status === "unable_to_confirm").length;
    if (timedOut < 5) fail(`only ${timedOut} hanging sample pages reported as unconfirmed`);
    if (s > 90) fail(`took ${s}s (limit 90s)`);
  }
  console.log(`${id}: HTTP ${res.status} ${j.code || ""} in ${s}s`);
}
for (const p of problems) console.log(" - " + p);
console.log("SCAN_MATRIX_RESULT " + JSON.stringify({ total: Object.keys(SCEN).length, failed: problems.length }));
process.exit(0);
