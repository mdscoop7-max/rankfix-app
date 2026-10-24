// Runs the local-business sector profiles through the REAL /api/scan route
// (no network, no browser) and checks sector, subtype, sales channel and
// abstention. Prints a table and SCAN_MATRIX_RESULT for the test harness.
// PROFILES=qa144 runs the QA 144 sector-class profiles instead (same checks).
const LOCAL_SITES = process.env.PROFILES === "qa144"
  ? (await import("./qa144-sector-profiles.mjs")).QA144_SITES
  : (await import("./local-business-profiles.mjs")).LOCAL_SITES;
const ROOT = new URL("../../", import.meta.url).pathname.replace(/\/$/, "");
globalThis.fetch = async (input) => {
  const u = new URL(typeof input === "string" ? input : input.url);
  const site = LOCAL_SITES[u.host.replace(/^www\./, "")];
  const raw = site?.pages[u.pathname.replace(/\/$/, "") || "/"];
  if (!raw) return new Response("nf", { status: 404, headers: { "content-type": "text/html" } });
  const html = raw.replaceAll("__URL__", u.origin + u.pathname).replaceAll("__HOST__", u.host);
  return new Response(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
};
globalThis.__RF_RENDER = async () => { throw new Error("RENDER_UNAVAILABLE_IN_TEST"); };
const { POST } = await import(ROOT + "/app/api/scan/route.ts");
const quiet = !process.env.DEBUG_LOCAL;
if (quiet) { console.info = () => {}; console.warn = () => {}; console.error = () => {}; }
const only = process.env.ONLY ? new Set(process.env.ONLY.split(",")) : null;
const rows = [];
const problems = [];
for (const [host, site] of Object.entries(LOCAL_SITES)) {
  if (only && !only.has(host)) continue;
  const res = await POST(new Request("http://localhost/api/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: `https://${host}${site.startPath || "/"}`, mode: "both", language: "nl" }) }));
  const j = await res.json();
  const sp = j.sectorProfile || {};
  const row = { host, group: site.group, status: res.status, sector: sp.sector, key: sp.key, label: sp.label, confidence: sp.confidenceScore, decision: sp.decisionStatus, channel: sp.salesChannel?.channel ?? null, secondary: (sp.secondaryActivities || []).map((a) => a.sector), commerce: j.commerceApplicability?.state, evidence: (sp.evidence || []).slice(0, 3), selfCheck: j.selfCheck?.corrections?.length || 0 };
  rows.push(row);
  const e = site.expect;
  const fail = (msg) => problems.push(`${host}: ${msg}`);
  if (res.status !== 200) { fail(`HTTP ${res.status} ${j.code || ""}`); continue; }
  if (e.sector && !e.sector.includes(sp.sector)) fail(`sector ${sp.sector}/${sp.key} (${sp.confidenceScore}), expected ${e.sector.join("|")}`);
  if (e.notSector?.includes(sp.sector)) fail(`forbidden sector ${sp.sector}/${sp.key} (${sp.confidenceScore})`);
  if (e.key && !e.key.includes(sp.key)) fail(`subtype ${sp.key}, expected ${e.key.join("|")}`);
  if (e.channel && !e.channel.includes(sp.salesChannel?.channel)) fail(`channel ${sp.salesChannel?.channel ?? "none"}, expected ${e.channel.join("|")}`);
  if (e.maxConfidence != null && (sp.confidenceScore || 0) > e.maxConfidence) fail(`confidence ${sp.confidenceScore} above ${e.maxConfidence} without evidence`);
  // Never a high-confidence wrong answer: a forbidden sector at ≥75 is the worst class.
  if (sp.sector === "unknown" && sp.decisionStatus !== "unconfirmed") fail(`unknown sector with decisionStatus ${sp.decisionStatus}`);
  if (row.selfCheck) fail(`self-check corrected ${row.selfCheck} item(s)`);
}
for (const r of rows) console.log(`${r.host.padEnd(24)} ${String(r.group).padEnd(18)} ${String(r.sector).padEnd(18)} ${String(r.key).padEnd(16)} ${String(r.confidence).padEnd(4)} ch=${String(r.channel).padEnd(15)} sec=${r.secondary.join(",") || "-"} shop=${r.commerce}`);
for (const p of problems) console.log(" - " + p);
console.log("SCAN_MATRIX_RESULT " + JSON.stringify({ total: rows.length, failed: problems.length, problems, rows }));
process.exit(0);
