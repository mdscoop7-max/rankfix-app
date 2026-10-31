// 31 Oct (PDF P1/P5): a short server-rendered page is not a JavaScript shell,
// absent JSON-LD on a substantive server-rendered page is a finding even with a
// tag manager, and a real client-side shell stays "unconfirmed".
const ROOT = new URL("../../", import.meta.url).pathname.replace(/\/$/, "");
const words = (n) => Array.from({ length: n }, (_, i) => ["industriële", "pompen", "service", "onderhoud", "levering", "advies"][i % 6]).join(" ");
const S = {
  // 15 words, WordPress scripts, server-rendered identity: thin content, NOT a shell.
  "kort.test": `<!doctype html><html lang="nl"><head><meta charset="utf-8"><title>Enerco | Industriële componenten</title><meta name="description" content="Enerco levert industriële componenten en regelsystemen voor de procesindustrie in Nederland en België."><script src="/wp-includes/js/jquery/jquery.min.js"></script></head><body><nav><a href="/brands">Brands</a><a href="/applications">Applications</a><a href="/over-ons">Over ons</a></nav><h1>Industriële oplossingen</h1><p>Componenten en systemen voor de procesindustrie.</p><footer><a href="/privacy">Privacy</a><a href="/contact">Contact</a></footer></body></html>`,
  // Substantive server-rendered page with Google Tag Manager and no JSON-LD.
  "gtm.test": `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=0"><title>Banden en onderhoud | Garage Noord</title><meta name="description" content="Garage Noord voor banden, APK en onderhoud van alle merken in Groningen. Maak eenvoudig online een afspraak."><script>(function(w,d,s,l,i){})(window,document,'script','dataLayer','GTM-ABC123');</script><script src="https://www.googletagmanager.com/gtm.js?id=GTM-ABC123"></script></head><body><nav><a href="/apk">APK</a><a href="/banden">Banden</a><a href="/afspraak">Afspraak</a></nav><h1>Garage Noord</h1><p>${words(220)}</p><footer><a href="/privacy">Privacy</a><a href="/contact">Contact</a></footer></body></html>`,
  // A real client-side shell: empty mount point and a bundle.
  "spa.test": `<!doctype html><html lang="nl"><head><meta charset="utf-8"><title>App</title><script src="/static/js/main.4f2a.js"></script><script src="/static/js/vendor.js"></script><script src="/static/js/runtime.js"></script><script src="/static/js/chunk.js"></script></head><body><div id="root"></div></body></html>`,
};
globalThis.fetch = async (i) => { const u = new URL(typeof i === "string" ? i : i.url); return S[u.host] && u.pathname === "/" ? new Response(S[u.host], { status: 200, headers: { "content-type": "text/html" } }) : new Response("nf", { status: 404 }); };
globalThis.__RF_RENDER = async () => { throw new Error("no"); };
const { POST } = await import(ROOT + "/app/api/scan/route.ts"); console.info = console.warn = console.error = () => {};
const scan = async (h) => (await POST(new Request("http://localhost/api/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: `https://${h}/`, mode: "both", language: "nl" }) }))).json();
const problems = [];
const by = (j, key) => [...j.seo.checks, ...j.geo.checks].find((c) => c.key === key);
const kort = await scan("kort.test");
if (kort.rendering?.completeness !== "complete") problems.push(`kort: rendering ${kort.rendering?.completeness}, expected complete (server-rendered)`);
for (const key of ["content", "trust_legal_signals", "image_sources", "headings"]) if (by(kort, key)?.status === "unable_to_confirm") problems.push(`kort: ${key} unable_to_confirm on a server-rendered page`);
if (by(kort, "viewport")?.status !== "fail") problems.push(`kort: missing viewport should be a proven fail (${by(kort, "viewport")?.status})`);
if (!(kort.coverage?.coveragePercent >= 80)) problems.push(`kort: coverage ${kort.coverage?.coveragePercent}%`);
const gtm = await scan("gtm.test");
if (by(gtm, "schema")?.status === "unable_to_confirm") problems.push(`gtm: schema unconfirmed on a substantive server-rendered page (${by(gtm, "schema")?.message?.slice(0, 80)})`);
if (!/zoom|user-scalable/i.test(JSON.stringify([...gtm.seo.checks, ...(gtm.accessibility?.checks || [])].filter((c) => c.status !== "pass").map((c) => c.message)))) problems.push("gtm: user-scalable=0 not reported");
const spa = await scan("spa.test");
if (by(spa, "schema")?.status !== "unable_to_confirm") problems.push(`spa: a real client-side shell must keep schema unconfirmed (${by(spa, "schema")?.status})`);
if (spa.rendering?.completeness === "complete") problems.push("spa: shell reported as complete");
for (const p of problems) console.log(" - " + p);
console.log("SCAN_MATRIX_RESULT " + JSON.stringify({ total: 3, failed: problems.length }));
process.exit(0);
