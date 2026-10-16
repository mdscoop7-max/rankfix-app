// Isolation and determinism under load: runs many different sites through the
// REAL scan route at the same time and checks that evidence of site A never
// lands in the report of site B, and that a parallel scan gives exactly the
// same decisions and scores as the same scan run alone.
import { PROFILES, installMatrixFetch2 } from "./profiles.mjs";
installMatrixFetch2();
const ROOT = new URL("../../", import.meta.url).pathname.replace(/\/$/, "");
const { POST } = await import(ROOT + "/app/api/scan/route.ts");
const saved = [console.info, console.warn, console.log, console.error];
console.info = () => {}; console.warn = () => {}; console.error = () => {};

const ids = ["payments-en", "telecom-nl", "shop-nl", "hotel-nl", "dentist-nl", "gov-nl", "saas-en", "logistics-nl", "report-broadcaster-news", "report-leading-separator-title", "bank-nl", "school-nl"];
const profiles = ids.map((id) => PROFILES.find((p) => p.id === id)).filter(Boolean);
const scan = async (p) => {
  const res = await POST(new Request("http://localhost/api/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: `https://${p.host}${p.path || "/"}`, mode: "both", language: "nl" }) }));
  return res.json();
};
const site = (host) => host.toLowerCase().replace(/^www\./, "");
const fingerprint = (j) => JSON.stringify({ sector: j.sectorProfile?.sector, label: j.sectorProfile?.label, modules: [...(j.sectorProfile?.applicableModules || [])].sort(), page: j.pageTypeEvidence?.type, overall: j.overallScore, seo: j.seo?.score, geo: j.geo?.score, statuses: [...(j.seo?.checks || []), ...(j.geo?.checks || [])].map((c) => `${c.key}:${c.status}:${c.points}`).sort() });

const problems = [];
const alone = new Map();
for (const p of profiles) alone.set(p.id, fingerprint(await scan(p)));
for (let round = 0; round < 2; round++) {
  // Same site set twice in one burst, shuffled, so equal hosts also overlap.
  const burst = [...profiles, ...profiles].sort(() => Math.random() - 0.5);
  const results = await Promise.all(burst.map(async (p) => ({ p, j: await scan(p) })));
  for (const { p, j } of results) {
    if (!j.success) { problems.push(`${p.id}: scan failed ${j.error || ""}`); continue; }
    const own = site(p.host);
    if (site(new URL(j.finalUrl).hostname) !== own) problems.push(`${p.id}: finalUrl ${j.finalUrl} belongs to another site`);
    for (const c of [...j.seo.checks, ...j.geo.checks]) {
      const url = c.evidence?.url;
      if (url && site(new URL(url).hostname) !== own) problems.push(`${p.id}: ${c.key} evidence from ${url}`);
      for (const other of profiles) if (site(other.host) !== own && !own.endsWith(site(other.host)) && (c.message || "").includes(other.host)) problems.push(`${p.id}: ${c.key} mentions ${other.host}`);
    }
    if (p.expect && !p.expect.includes(j.sectorProfile.sector)) problems.push(`${p.id}: sector ${j.sectorProfile.sector} under load`);
    if (fingerprint(j) !== alone.get(p.id)) problems.push(`${p.id}: parallel result differs from a single scan`);
  }
}
[console.info, console.warn, console.log, console.error] = saved;
for (const line of problems.slice(0, 40)) console.log("  - " + line);
console.log("SCAN_MATRIX_RESULT " + JSON.stringify({ total: profiles.length * 4, failed: problems.length }));
