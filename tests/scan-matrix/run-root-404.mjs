// QA #204 (TestLab 144, a large DIY store): the start page answered RankFix with
// HTTP 404 and the browser view was blocked; the report said "page does not
// exist". A site ROOT that answers 404 is verified once (neutral hosts):
//   - the 404 body is the site's own not-found page      → HTTP_NOT_FOUND (confirmed)
//   - empty/odd 404 body, browser view blocked or failed  → UNVERIFIED_NOT_FOUND
//     (no score, attributed to the website, never "page does not exist")
//   - empty 404 body, the browser shows the real homepage → report from the
//     browser view, HTTP status unconfirmed (crawler block)
//   - empty 404 body, the browser shows a not-found page  → HTTP_NOT_FOUND (confirmed)
//   - a deep URL that answers 404 is not verified with a browser (missing page)
const ROOT = new URL("../../", import.meta.url).pathname.replace(/\/$/, "");
const filler = (t) => `<p>${(t + " ").repeat(40)}</p>`;
const notFound = `<!doctype html><html lang="nl"><head><title>Pagina niet gevonden</title></head><body><h1>404 - Pagina niet gevonden</h1><p>Deze pagina bestaat niet (meer).</p></body></html>`;
const realHome = `<!doctype html><html lang="nl"><head><meta charset="utf-8"><title>Bouwmarkt | Gereedschap en tuin</title><meta name="description" content="Bouwmarkt met gereedschap, verf en tuinartikelen."><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><h1>Alles voor je klus</h1><main>${filler("Gereedschap, verf, hout en tuinartikelen voor elke klus.")}</main><a href="/gereedschap">Gereedschap</a> <a href="/tuin">Tuin</a> <a href="/contact">Contact</a></body></html>`;
const SITES = {
  "ownnotfound.test": { body: notFound, render: () => { throw new Error("should not render"); } },
  "blockedroot.test": { body: "", render: () => { throw new Error("RENDER_BLOCKED"); } },
  "challengeroot.test": { body: "<html><body></body></html>", render: () => ({ html: `<html><head><title>Just a moment...</title></head><body><div id="challenge-platform">Checking your browser</div></body></html>` }) },
  "recoveredroot.test": { body: "", render: () => ({ html: realHome }) },
  "rendernotfound.test": { body: "", render: () => ({ html: notFound }) },
};
const renders = [];
globalThis.fetch = async (input) => {
  const u = new URL(typeof input === "string" ? input : input.url);
  const site = SITES[u.host.replace(/^www\./, "")];
  if (!site) return new Response("", { status: 404 });
  if (u.pathname === "/" || u.pathname === "/diep/pagina") return new Response(site.body, { status: 404, headers: { "content-type": "text/html; charset=utf-8" } });
  return new Response(realHome, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
};
globalThis.__RF_RENDER = async (url) => {
  const u = new URL(url);
  renders.push(`${u.host}${u.pathname}`);
  const r = SITES[u.host.replace(/^www\./, "")].render();
  return { finalUrl: url, elapsedMs: 300, requests: 4, titlePixelWidth: 300, domAccessibility: null, axeReport: null, ...r };
};
const { POST } = await import(ROOT + "/app/api/scan/route.ts");
console.info = () => {}; console.warn = () => {}; console.error = () => {};
const scan = async (host, path = "/") => {
  const res = await POST(new Request("http://localhost/api/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: `https://${host}${path}`, mode: "both", language: "nl" }) }));
  return { res, j: await res.json() };
};
const problems = [];
const rows = [];
const expect = {
  "ownnotfound.test": { code: "HTTP_NOT_FOUND", verdict: "confirmed", render: false },
  "blockedroot.test": { code: "UNVERIFIED_NOT_FOUND", verdict: "unverified", render: true },
  "challengeroot.test": { code: "UNVERIFIED_NOT_FOUND", verdict: "unverified", render: true },
  "recoveredroot.test": { status: 200, render: true },
  "rendernotfound.test": { code: "HTTP_NOT_FOUND", verdict: "confirmed", render: true },
};
for (const [host, e] of Object.entries(expect)) {
  renders.length = 0;
  const { res, j } = await scan(host);
  rows.push({ host, http: res.status, code: j.code ?? null, verdict: j.verification?.verdict ?? null, score: j.overallScore ?? null, renders: renders.length });
  if (e.status === 200) {
    if (res.status !== 200) problems.push(`${host}: HTTP ${res.status} ${j.code}, expected a report from the browser view`);
    else if (!j.access?.rankfixBlocked) problems.push(`${host}: report without the crawler-block note`);
  } else {
    if (res.status === 200) problems.push(`${host}: scored ${j.overallScore}`);
    if (j.code !== e.code) problems.push(`${host}: code ${j.code}, expected ${e.code}`);
    if ((j.verification?.verdict ?? null) !== e.verdict) problems.push(`${host}: verdict ${j.verification?.verdict}, expected ${e.verdict}`);
    if (e.code === "UNVERIFIED_NOT_FOUND" && /bestaat niet\b/i.test(j.error || "") && !/geen bewezen/i.test(j.error || "")) problems.push(`${host}: says the page does not exist`);
  }
  if (Boolean(renders.length) !== e.render) problems.push(`${host}: browser ${renders.length ? "used" : "not used"}`);
}
// A deep URL answering 404 is a missing page, not verified with a browser.
{
  renders.length = 0;
  const { res, j } = await scan("blockedroot.test", "/diep/pagina");
  rows.push({ host: "blockedroot.test/diep/pagina", http: res.status, code: j.code ?? null, renders: renders.length });
  if (j.code !== "HTTP_NOT_FOUND") problems.push(`deep 404: code ${j.code}`);
  if (renders.length) problems.push("deep 404: browser used");
}
for (const r of rows) console.log(JSON.stringify(r));
for (const p of problems) console.log(" - " + p);
console.log("SCAN_MATRIX_RESULT " + JSON.stringify({ total: rows.length, failed: problems.length, rows }));
process.exit(0);
