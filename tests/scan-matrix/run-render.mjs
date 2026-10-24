// Rendering scenarios through the real scan route with a controllable browser stub.
const shellHtml = (title) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="__next"></div>${Array.from({length:6},(_,i)=>`<script src="/_next/static/chunks/${i}.js"></script>`).join("")}<script id="__NEXT_DATA__" type="application/json">{"props":{}}</script></body></html>`;
const fullHtml = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Acme – project management software for teams</title><meta name="description" content="SaaS platform with integrations and dashboards. Start a free trial or book a demo today."><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="canonical" href="https://spa-rich.test/"><meta property="og:title" content="Acme"><meta property="og:description" content="Project software"><meta property="og:image" content="https://spa-rich.test/og.jpg"><script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"Acme","url":"https://spa-rich.test/"}</script><script type="application/ld+json">{"@context":"https://schema.org","@type":"WebSite","name":"Acme","url":"https://spa-rich.test/"}</script></head><body><div id="__next"><header><a href="/">Home</a> <a href="/pricing">Pricing</a> <a href="/contact">Contact</a> <a href="/privacy">Privacy</a></header><main><h1>Project management software</h1><p>${"Plan projects, track tasks and collaborate with your team. ".repeat(30)}</p><img src="/a.jpg" alt="Dashboard"></main><footer>Acme Inc. · hello@spa-rich.test · <a href="/cookies">Cookies</a></footer></div></body></html>`;
const ssrNuxt = `<!doctype html><html lang="nl"><head><meta charset="utf-8"><title>Glasvezel internet en tv | Telco</title><meta name="description" content="Snel glasvezel internet, tv en mobiel. Sim only abonnementen en 5G netwerk met dekking in heel Nederland."><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="canonical" href="https://nuxt.test/"></head><body><div id="__nuxt"><header><a href="/">Home</a> <a href="/contact">Contact</a></header><main><h1>Het netwerk van Nederland</h1><p>${"Internet, tv en mobiel abonnementen met glasvezel. ".repeat(40)}</p></main><footer>Telco B.V. · <a href="/privacy">Privacy</a></footer></div><script>window.__NUXT__={}</script>${Array.from({length:5},(_,i)=>`<script src="/_nuxt/${i}.js"></script>`).join("")}</body></html>`;
const ssrRich = `<!doctype html><html lang="lb"><head><meta charset="utf-8"><title>Den Noriichteportal fir Lëtzebuerg</title><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="canonical" href="https://ssr-news.test/"></head><body><div id="__next"><header><a href="/">Home</a> <a href="/news">News</a> <a href="/contact">Contact</a></header><main><p>Aktuell Noriichten zu a vu Lëtzebuerg. Eis Redaktioun schafft zouverlässeg.</p><h2>National</h2><p>${"Aktuell Noriichten aus Politik, Gesellschaft, Sport a Kultur fir Lëtzebuerg an d'Groussregioun. ".repeat(30)}</p><img src="/a.jpg" alt="Noriichten"></main><footer>RTL · <a href="/privacy">Privacy</a> <a href="/cookies">Cookies</a></footer></div>${Array.from({length:5},(_,i)=>`<script src="/_next/static/chunks/${i}.js"></script>`).join("")}</body></html>`;
const SCEN = [
  { id: "spa-rich-render", host: "spa-rich.test", raw: shellHtml("React App"), render: () => fullHtml, expect: { js: true, sector: ["saas_b2b"], titleStatus: ["pass"] } },
  // QA-144: an unexplained RENDER_FAILED (18 of 93 sites) now names the error class.
  { id: "spa-render-crashes", host: "spa-crash.test", raw: shellHtml("React App"), render: () => { throw new Error("Protocol error (Target.createTarget): Target closed at https://spa-crash.test/app /var/task/node_modules/x.js"); }, expect: { js: false, sector: ["unknown"], titleStatus: ["unable_to_confirm"] }, extra: (j) => [j.rendering.fallbackReason !== "BROWSER_CRASHED" && `fallbackReason ${j.rendering.fallbackReason}`, (!j.rendering.fallbackDetail || /https?:|\/var\//.test(j.rendering.fallbackDetail)) && `fallbackDetail ${j.rendering.fallbackDetail}`].filter(Boolean) },
  { id: "spa-render-fails", host: "spa-fail.test", raw: shellHtml("React App"), render: () => { throw new Error("TimeoutError: Navigation timeout of 12000 ms exceeded"); }, expect: { js: false, sector: ["unknown"], titleStatus: ["unable_to_confirm"] } },
  // A challenge page instead of the site must abstain (no score), never be audited as the site.
  { id: "spa-render-challenge", host: "spa-chal.test", raw: shellHtml("App"), render: () => `<html><head><title>Just a moment...</title></head><body>Checking your browser. Enable JavaScript and cookies to continue.</body></html>`, expect: { http: 422 } },
  { id: "ssr-render-poorer", host: "nuxt.test", raw: ssrNuxt, render: () => `<html><head><title>Glasvezel internet en tv | Telco</title></head><body><div id="__nuxt"><p>Laden...</p></div></body></html>`, expect: { js: false, sector: ["telecom_technology"], titleStatus: ["pass"], rejected: true } },
  // Issue #151 (RTL-like): rich server HTML (SSR) but the browser snapshot has far
  // less content. Raw HTML stays the evidence; body structure is proven from it,
  // client-injectable head metadata stays unconfirmed, nothing scores 100.
  { id: "ssr-degraded-render", host: "ssr-news.test", raw: ssrRich, render: () => `<html><head><title>Portal</title></head><body><div id="__next"><p>Maacht äre Choix</p></div></body></html>`,
    expect: { js: false, sector: ["news_media"], titleStatus: ["pass"], rejected: true },
    extra: (j) => [
      j.rendering.completeness !== "ssr_without_render" && `completeness ${j.rendering.completeness}`,
      !["warning", "fail"].includes(j.checks.find((c) => c.key === "h1")?.status) && `h1 should stay a proven issue from SSR HTML, got ${j.checks.find((c) => c.key === "h1")?.status}`,
      j.checks.find((c) => c.key === "description")?.status !== "unable_to_confirm" && `description ${j.checks.find((c) => c.key === "description")?.status} (client-injectable, must be unconfirmed)`,
      j.overallScore >= 100 && "100 with incomplete evidence",
    ].filter(Boolean) },
  // Issue #151 (Orange-like): thin page with one script bundle, invisible title,
  // no description, render unavailable. Missing metadata is NOT a proven defect.
  { id: "thin-shell-few-scripts", host: "thin.test", raw: `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>\u200b</title><script type="module" src="/app.js"></script></head><body><div id="main"></div><noscript>Activez JavaScript</noscript></body></html>`, render: () => { throw new Error("TimeoutError: Navigation timeout"); },
    expect: { js: false, sector: ["unknown"], titleStatus: ["unable_to_confirm"] },
    extra: (j) => [
      j.rendering.completeness !== "render_incomplete" && `completeness ${j.rendering.completeness}`,
      ["fail", "warning"].includes(j.checks.find((c) => c.key === "description")?.status) && "description proven missing on an unrendered shell",
      j.scoreModel.evidenceLevel === "complete" && "evidence level complete on unrendered shell",
      j.overallScore >= 100 && "100 on unrendered shell",
    ].filter(Boolean) },
  // QA #186: a 403 whose browser recovery shows a block page, or an error page, is not the website.
  { id: "refused-render-antibot", host: "antibot.test", rawStatus: 405, raw: "<html><head><title>Denied</title></head><body>Denied</body></html>", render: () => `<html><head><title>Shop | AntiBot</title></head><body><p>${"Please wait while we check your request. ".repeat(12)}</p></body></html>`, expect: { http: 422, code: "HTTP_BLOCKED" } },
  { id: "refused-render-error", host: "errpage.test", rawStatus: 403, raw: "<html><head><title>403</title></head><body>Forbidden</body></html>", render: () => `<html><head><title>Sorry! The connection was interrupted due to an error, but we can take you to the homepage.</title></head><body><p>${"Sorry, the connection was interrupted due to an error. ".repeat(8)}</p></body></html>`, expect: { http: 422, code: "HTTP_BLOCKED" } },
  // TestLab 23-10 evening: a retailer answered 403 and the browser got an "IP address is
  // blocked" page; a manufacturer's homepage rendered as an image CAPTCHA. Both were scored.
  { id: "refused-render-ip-block", host: "ipblock.test", rawStatus: 403, raw: "<html><head><title>403</title></head><body>Forbidden</body></html>", render: () => `<html><head><title>shop</title></head><body><h1>IP address is blocked</h1><h1>IP adres is geblokkeerd</h1><p>Your access to shop has been temporarily blocked due to possible abuse from this IP address. This may be caused by several factors, including: Use of a VPN. Outdated browser or browser extensions. Automated scripts. ${"For more information, contact our customer service. ".repeat(8)}</p></body></html>`, expect: { http: 422, code: "HTTP_BLOCKED" } },
  { id: "render-image-captcha", host: "captcha.test", raw: shellHtml(""), render: () => `<html><head></head><body><p>This question is for testing whether you are a human visitor and to prevent automated spam submission.</p><p>What code is in the image?</p><button>submit</button><p>Your support ID is: 699070390611420714 .</p></body></html>`, expect: { http: 422, code: "CHALLENGE_OR_INTERSTITIAL" } },
  { id: "maintenance-page", host: "maint.test", raw: `<!doctype html><html lang="en"><head><title>Our site is currently undergoing maintenance</title></head><body><h1>We'll be back soon</h1><p>Our site is currently undergoing maintenance. Please come back later.</p></body></html>`, render: () => { throw new Error("not needed"); }, expect: { http: 422, code: "SITE_ERROR_PAGE" } },
  // Negative control: a long article ABOUT errors and maintenance is a normal page.
  { id: "article-about-errors", host: "errblog.test", raw: `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Something went wrong? How to plan website maintenance</title><meta name="description" content="A practical guide to planning maintenance windows and handling errors on business websites."><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="canonical" href="https://errblog.test/"></head><body><h1>Planning website maintenance</h1><p>${"Schedule maintenance outside peak hours, communicate early and test rollbacks so errors stay rare. ".repeat(40)}</p></body></html>`, render: () => { throw new Error("not needed"); }, expect: { js: false, sector: ["unknown", "saas_b2b", "professional_services", "news_media"], titleStatus: ["pass", "warning"] } },
  // A site that never answers a plain request but serves the browser: one bounded visit, honest note.
  { id: "timeout-browser-recovery", host: "slowgate.test", rawThrow: "timeout", raw: "", render: () => fullHtml.replaceAll("spa-rich.test", "slowgate.test"), expect: { js: true, sector: ["saas_b2b"], titleStatus: ["pass"] },
    extra: (j) => [
      !j.access?.rankfixBlocked && "access.rankfixBlocked missing",
      !/tijdslimiet|time-out/.test(j.access?.note || "") && `access note ${j.access?.note}`,
      j.checks.find((c) => c.key === "status")?.status !== "unable_to_confirm" && "status check must stay unconfirmed",
      /HTTP 504/.test(JSON.stringify(j.checks)) && "synthetic 504 leaked into a check",
    ].filter(Boolean) },
  // A timeout whose browser visit is a challenge stays a failed fetch (no score).
  { id: "timeout-render-challenge", host: "slowchal.test", rawThrow: "timeout", raw: "", render: () => `<html><head><title>Just a moment...</title></head><body>${"Checking your browser before accessing. ".repeat(12)}</body></html>`, expect: { http: 502, code: "FETCH_TIMEOUT" } },
  // QA #186: the browser follows a JavaScript redirect from the apex to www; sub-pages
  // exist only on www. Links must resolve against the URL the browser ended on.
  { id: "render-redirect-apex-www", host: "apexsite.test", altHost: "www.apexsite.test", subpagesOnlyOnAlt: true, raw: shellHtml("App"),
    render: () => fullHtml.replaceAll("spa-rich.test", "www.apexsite.test"), renderFinalUrl: "https://www.apexsite.test/",
    expect: { js: true, sector: ["saas_b2b"], titleStatus: ["pass"] },
    extra: (j) => { const pages = (j.multiPage?.pageAudits || []).filter((p) => new URL(p.url).pathname !== "/"); const ok = pages.filter((p) => p.status === "audited"); return [ok.length < 2 && `only ${ok.length} sampled pages audited: ${JSON.stringify(pages.map((p) => [p.url, p.httpStatus]))}`, new URL(j.finalUrl).host !== "www.apexsite.test" && `finalUrl ${j.finalUrl}`].filter(Boolean); } },
  // A browser redirect to ANOTHER site is not adopted.
  { id: "render-redirect-other-site", host: "origin.test", raw: shellHtml("App"), render: () => fullHtml.replaceAll("spa-rich.test", "origin.test"), renderFinalUrl: "https://elsewhere.test/landing",
    expect: { js: true, sector: ["saas_b2b"], titleStatus: ["pass"] }, extra: (j) => [new URL(j.finalUrl).host !== "origin.test" && `adopted foreign URL ${j.finalUrl}`].filter(Boolean) },
];
const sub = (host, path) => `<!doctype html><html lang="en"><head><title>${path} | Site</title><meta name="description" content="Information about ${path} from this website, contact us for details."></head><body><h1>${path}</h1><p>Info.</p></body></html>`;
globalThis.fetch = async (input) => {
  const u = new URL(typeof input === "string" ? input : input.url);
  const sc = SCEN.find((s) => s.host === u.host || s.altHost === u.host);
  const h = (b, st = 200) => new Response(b, { status: st, headers: { "content-type": "text/html; charset=utf-8" } });
  if (u.pathname === "/robots.txt") return new Response("User-agent: *\nAllow: /\n", { status: 200, headers: { "content-type": "text/plain" } });
  if (/\.(js|jpg|png|css)$/.test(u.pathname)) return new Response("x", { status: 200, headers: { "content-type": "application/javascript" } });
  if (!sc) return h("nf", 404);
  if (sc.subpagesOnlyOnAlt && u.host === sc.host && u.pathname !== "/") return h("nf", 404);
  if (u.pathname === "/" && sc.rawThrow) { const e = new Error("The operation was aborted due to timeout"); e.name = "TimeoutError"; throw e; }
  if (u.pathname === "/") return h(sc.raw, sc.rawStatus || 200);
  return h(sub(u.host, u.pathname));
};
globalThis.__RF_RENDER = async (url) => {
  const u = new URL(url); const sc = SCEN.find((s) => s.host === u.host || s.altHost === u.host);
  if (!sc || u.pathname !== "/") return { html: sub(u.host, u.pathname), finalUrl: url, elapsedMs: 50, requests: 3, titlePixelWidth: 300, domAccessibility: { controls: 0, unnamedButtons: 0, unlabeledControls: 0 }, axeReport: null };
  const html = sc.render();
  return { html, finalUrl: sc.renderFinalUrl || url, elapsedMs: 800, requests: 12, titlePixelWidth: 410, domAccessibility: { controls: 4, unnamedButtons: 0, unlabeledControls: 0 }, axeReport: { violations: [], passes: 20, incomplete: 0, scope: "hydrated_wcag_a_aa" } };
};
const ROOT = new URL("../../", import.meta.url).pathname.replace(/\/$/, "");
const { POST } = await import(ROOT + "/app/api/scan/route.ts");
console.info = () => {}; console.warn = () => {};
let bad = 0;
for (const sc of SCEN) {
  const errs = []; const ce = console.error; console.error = (...a) => errs.push(a);
  const res = await POST(new Request("http://localhost/api/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: `https://${sc.host}/`, mode: "both", language: "nl" }) }));
  const j = await res.json(); console.error = ce;
  const p = [];
  if (sc.expect.http) { if (res.status !== sc.expect.http) p.push(`HTTP ${res.status} != ${sc.expect.http} (${j.code}: ${String(j.error).slice(0, 120)})`); if (sc.expect.code && j.code !== sc.expect.code) p.push(`code ${j.code} != ${sc.expect.code}`); if (typeof j.overallScore === "number") p.push(`score ${j.overallScore} on a page that is not the website`); }
  else if (res.status !== 200) p.push(`HTTP ${res.status} ${j.error} ${JSON.stringify(errs.find(e=>/scan failed/i.test(String(e[0])))?.[1]||"").slice(0,600)}`);
  else {
    const t = j.checks.find((c) => c.key === "title");
    if (j.rendering.javascriptExecuted !== sc.expect.js) p.push(`javascriptExecuted ${j.rendering.javascriptExecuted}`);
    if (!sc.expect.sector.includes(j.sectorProfile.sector)) p.push(`sector ${j.sectorProfile.sector}`);
    if (!sc.expect.titleStatus.includes(t?.status)) p.push(`title ${t?.status}: ${t?.message?.slice(0,120)}`);
    if (sc.expect.rejected && !j.rendering.rejectedBrowserSnapshot) p.push(`no rejectedBrowserSnapshot`);
    if (!sc.expect.js && j.rendering.evidenceSource !== "raw_html") p.push(`evidenceSource ${j.rendering.evidenceSource}`);
    const s = j.summary; if (s.passed + s.issues + s.notApplicable + s.unableToConfirm !== j.checks.length) p.push("summary mismatch");
    if (!sc.expect.js && j.overallScore === 100 && j.scoreModel.provisional !== true) p.push("100 not provisional");
    if (sc.extra) p.push(...sc.extra(j));
  }
  if (p.length) bad++;
  console.log(`${p.length ? "✗" : "✓"} ${sc.id.padEnd(22)} js=${j.rendering?.javascriptExecuted} src=${j.rendering?.evidenceSource} rej=${j.rendering?.rejectedBrowserSnapshot?.reason||"-"} sector=${j.sectorProfile?.sector} score=${j.overallScore} cov=${j.coverage?.coveragePercent}% prov=${j.scoreModel?.provisional} access=${j.accessibility?.mode}`);
  for (const x of p) console.log("    - " + x);
}
console.log(`${SCEN.length - bad}/${SCEN.length} renderscenario's correct`);
console.log("SCAN_MATRIX_RESULT " + JSON.stringify({ total: SCEN.length, failed: bad }));
process.exit(0);
