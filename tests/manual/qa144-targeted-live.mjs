#!/usr/bin/env node
// QA 144: targeted LIVE acceptance scans (read-only; public pages only).
// Run on the owner's laptop against a LOCAL build of one exact commit:
//
//   git fetch origin && git checkout --detach <SHA>
//   npm ci && npm run build
//   RF_QA_COMMIT_SHA=$(git rev-parse HEAD) npm run start -- -p 3000      (uses your local QA .env)
//   RF_SESSION=<QA-tester session cookie> node tests/manual/qa144-targeted-live.mjs
//
// Refuses to run unless the server reports exactly the checked-out commit and
// runs on localhost. 7 scans, one at a time, 8 s apart. Writes a JSON report.
// External blocks are reported as such and do not count as RankFix failures.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const base = process.env.RF_BASE_URL || "http://localhost:3000";
const u = new URL(base);
if (!["localhost", "127.0.0.1"].includes(u.hostname)) throw new Error("Alleen tegen een lokale server (localhost).");
if (!/^[a-f0-9]{64}$/.test(process.env.RF_SESSION || "")) throw new Error("RF_SESSION (QA-tester sessiecookie) ontbreekt.");
const sha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const headers = { "content-type": "application/json", cookie: "rankfix_session=" + process.env.RF_SESSION };
const get = async (p) => (await fetch(base + p, { headers })).json();
const version = await get("/api/scan/version");
if (version.commitSha !== sha) throw new Error(`Server meldt ${version.commitSha}, checkout is ${sha}. Start de server met RF_QA_COMMIT_SHA=$(git rev-parse HEAD).`);
const me = await get("/api/auth/me");
if (!me?.user) throw new Error("Niet ingelogd als QA-tester; geen scans gestart.");

const path = (x) => { try { return new URL(x).pathname.replace(/\/+$/, "") || "/"; } catch { return ""; } };
const CASES = [
  { id: "product-provenance", url: "https://www.mediamarkt.nl/nl/product/_samsung-ww90db7u34gw-7000-serie-bespoke-ai-wash-wasmachine-1807532.html",
    check: (j) => { const po = j.metrics?.productOptimizer; return [
      ["productdiagnose toont SKU van de ingevoerde pagina (of niet te bevestigen)", !po?.product?.sku || String(po.product.sku).includes("1807532") || po?.status === "page_product_not_confirmable", po?.product?.sku ?? po?.status],
      ["bron-URL van product = ingevoerde pagina", !po?.product || /1807532/.test(po?.sourceUrl || ""), po?.sourceUrl],
      ["geen productcheck met bewijs van ander product", ![...(j.seo?.checks || []), ...(j.geo?.checks || [])].some((c) => /product/.test(c.key) && /1807530/.test(c.evidence?.url || "")), "-"],
    ]; } },
  { id: "mediamarkt-sitewide", url: "https://www.mediamarkt.nl/",
    check: (j) => { const list = j.multiPage?.sitewideIssues || []; const cat = (j.multiPage?.pageAudits || []).find((p) => /overview\/categories/.test(p.url)); return [
      ["sitewideIssues aanwezig in rapport", Array.isArray(j.multiPage?.sitewideIssues), list.length],
      ["categoriepagina met ontbrekende metadata staat in de lijst (indien beoordeeld)", !cat || cat.status !== "audited" || list.some((i) => /overview\/categories/.test(i.url)), cat ? `${cat.status} ${cat.score}` : "niet in steekproef"],
      ["scoreModel.scope aanwezig", Boolean(j.scoreModel?.scope?.scoreAppliesTo), j.scoreModel?.scope?.caution || "-"],
    ]; } },
  { id: "werkenbij-sitewide", url: "https://www.werkenbijdecathlon.nl/",
    check: (j) => { const list = j.multiPage?.sitewideIssues || []; const audited = (j.multiPage?.pageAudits || []).filter((p) => p.status === "audited");
      const expectFor = (re, key) => { const p = audited.find((x) => re.test(path(x.url))); if (!p) return true; const warn = (p.evidenceChecks || []).some((c) => c.key === key && c.status === "WARNING"); return !warn || list.some((i) => re.test(path(i.url)) && i.check === key); };
      return [
        ["/job-alert lege description staat in verbeterpunten (indien gevonden)", expectFor(/\/job-alert$/, "description"), "-"],
        ["/privacy lege description staat in verbeterpunten (indien gevonden)", expectFor(/\/privacy$/, "description"), "-"],
        ["/veelgestelde-vragen zonder H1 staat in verbeterpunten (indien gevonden)", expectFor(/\/veelgestelde-vragen$/, "h1"), "-"],
        ["sector is recruitment/werken-bij of onbevestigd", ["recruitment", "unknown"].includes(j.sectorProfile?.sector), `${j.sectorProfile?.sector}/${j.sectorProfile?.key} ${j.sectorProfile?.confidenceScore}`],
      ]; } },
  { id: "werkenbij-vacature", url: "https://www.werkenbijdecathlon.nl/teams/teamleider-logistiek",
    check: (j) => [["vacature over logistiek wordt geen Transport & Logistiek", j.sectorProfile?.sector !== "transport_travel", `${j.sectorProfile?.sector}/${j.sectorProfile?.key} ${j.sectorProfile?.confidenceScore}`]] },
  { id: "subpage-start", url: "https://www.decathlon.nl/schoenen/fitness-en-dansschoenen",
    check: (j) => { const sa = j.multiPage?.siteAccess; return [
      ["siteAccess aanwezig", Boolean(sa), sa?.scanCoverage],
      ["homepage-uitkomst apart geregistreerd", Boolean(sa?.homepage?.access), `${sa?.homepage?.access} ${sa?.homepage?.httpStatus ?? ""}`],
      ["gedeeltelijk bij geweigerde pagina's", !sa || (sa.pages.refused + sa.pages.notRetrieved === 0) || sa.scanCoverage !== "complete", JSON.stringify(sa?.pages)],
    ]; } },
  { id: "hospitality-group", url: "https://group.accor.com/",
    check: (j) => [["hotelgroep wordt geen Beauty", j.sectorProfile?.sector !== "beauty", `${j.sectorProfile?.sector}/${j.sectorProfile?.key} ${j.sectorProfile?.confidenceScore}`]] },
  { id: "axe-real", url: "https://www.ikea.com/nl/nl/",
    check: (j) => { const a = j.accessibility || {}; return [
      ["axe-status gerapporteerd", typeof a.axeStatus === "string", a.axeStatus],
      ["geen toegankelijkheidsscore zonder voltooide axe-audit", a.axeStatus === "completed" || a.scoreShown === false, `scoreShown=${a.scoreShown}`],
      ["axe-core voltooid (doel van de fix)", a.axeStatus === "completed", a.axeStatus],
    ]; } },
];

const report = { commitSha: sha, base, startedAt: new Date().toISOString(), cases: [] };
for (const c of CASES) {
  const t0 = Date.now();
  let status = 0, j = {};
  try { const r = await fetch(base + "/api/scan", { method: "POST", headers, body: JSON.stringify({ url: c.url, mode: "both", language: "nl", dashboard: true }), signal: AbortSignal.timeout(330000) }); status = r.status; j = await r.json(); }
  catch (e) { j = { code: "CLIENT_ERROR", error: String(e.message || e) }; }
  if (j.success && j.runtime?.commitSha !== sha) throw new Error("Server is tijdens de test gewijzigd.");
  const row = { id: c.id, url: c.url, apiStatus: status, elapsedMs: Date.now() - t0, scanId: j.scanId || null, traceId: j.traceId || null };
  if (!j.success) {
    const external = j.incident?.attribution === "target_site" || j.incident?.attribution === "network";
    Object.assign(row, { result: external ? "EXTERN_GEBLOKKEERD" : "RANKFIX_FOUT", incident: j.incident || { code: j.code, error: j.error } });
  } else {
    const checks = c.check(j).map(([name, pass, observed]) => ({ name, pass: Boolean(pass), observed }));
    Object.assign(row, { result: checks.every((x) => x.pass) ? "GESLAAGD" : "MISLUKT", checks });
  }
  report.cases.push(row);
  console.log(`${row.result.padEnd(18)} ${c.id}  (${Math.round(row.elapsedMs / 1000)} s)`);
  for (const x of row.checks || []) console.log(`   ${x.pass ? "✓" : "✗"} ${x.name} — ${x.observed}`);
  await new Promise((r) => setTimeout(r, 8000));
}
report.finishedAt = new Date().toISOString();
report.summary = Object.fromEntries(["GESLAAGD", "MISLUKT", "EXTERN_GEBLOKKEERD", "RANKFIX_FOUT"].map((k) => [k, report.cases.filter((x) => x.result === k).length]));
const file = `rankfix-qa144-targeted-${sha.slice(0, 8)}.json`;
writeFileSync(file, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.summary), "→", file);
