#!/usr/bin/env node
// P5 priority 4 (1 Nov 2026): the REAL scan route on the local QA server (same as
// TestLab). Read-only: POST /api/scan only; no fixes, no writes to external sites.
// Stores the full audit per site plus a summary of the structured-data probe.
//   node scripts/testlab/run-probe-route.mjs --sites nu.nl,alternate.nl,ns.nl,charite.de,uzleuven.be
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const args = process.argv.slice(2);
const opt = (n, f = null) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : f; };
const sites = String(opt("sites", "nu.nl,alternate.nl,ns.nl,charite.de,uzleuven.be")).split(",").map((s) => s.trim()).filter(Boolean);
const out = resolve(opt("out", "qa-results/probe-route"));
mkdirSync(out, { recursive: true });
const log = []; const note = (m) => { const l = `${new Date().toISOString()} ${m}`; console.log(l); log.push(l); writeFileSync(join(out, "run-log.txt"), log.join("\n") + "\n"); };
const stop = (m) => { note("GESTOPT: " + m); process.exit(1); };
const sha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
if (execFileSync("git", ["status", "--porcelain", "--untracked-files=no"], { encoding: "utf8" }).trim()) stop("lokale codewijzigingen aanwezig; niet uitgevoerd.");
const tokenPath = join(process.env.LOCALAPPDATA || "", "RankFix-QA", "local-session-token.txt");
if (!existsSync(tokenPath)) stop("lokale QA-token ontbreekt. Start eerst Start-RankFix-TestLab.cmd en laat het servervenster open.");
const headers = { cookie: "rankfix_local_qa=" + readFileSync(tokenPath, "utf8").trim(), "content-type": "application/json" };
const base = "http://127.0.0.1:3002";
const request = async (path, body, timeout = 25000) => { const r = await fetch(base + path, { method: body ? "POST" : "GET", headers, signal: AbortSignal.timeout(timeout), ...(body ? { body: JSON.stringify(body) } : {}) }); const raw = await r.text(); let data = null; try { data = JSON.parse(raw); } catch {} return { status: r.status, data, raw: data ? null : raw.slice(0, 1000) }; };
try { const v = await request("/api/scan/version"); if (v.status !== 200 || v.data?.environment !== "local" || v.data?.commitSha !== sha) stop(`QA-server draait niet op ${sha.slice(0, 12)} (server ${String(v.data?.commitSha || "?").slice(0, 12)}). Herstart Start-RankFix-TestLab.cmd.`); } catch (e) { stop("server niet bereikbaar: " + e.message); }
note(`Start: ${sites.length} websites via de echte scanroute | commit ${sha.slice(0, 12)}`);
const rows = []; let failures = 0;
for (const host of sites) {
  const t = Date.now(); let res;
  try { res = await request("/api/scan", { url: `https://${host}/`, mode: "both", dashboard: true, language: "nl" }, 330000); } catch (e) { res = { status: 0, data: null, raw: String(e.message || e) }; }
  writeFileSync(join(out, `${host}.json`), JSON.stringify({ host, commitSha: sha, httpStatus: res.status, elapsedMs: Date.now() - t, response: res.data, rawError: res.raw }, null, 1));
  const j = res.data || {};
  const geo = j.geo?.checks || [];
  const c = (k) => geo.find((x) => x.key === k) || {};
  const row = { host, http: res.status, success: j.success === true, elapsedMs: Date.now() - t, probe: j.rendering?.structuredDataProbe || null, javascriptExecuted: j.rendering?.javascriptExecuted ?? null,
    schema: `${c("schema").status} ${c("schema").points}/${c("schema").maxPoints}`, organizationWebsite: `${c("organization_website").status} ${c("organization_website").points}/${c("organization_website").maxPoints}`,
    schemaEvidence: c("schema").evidence?.found ?? null, score: j.overallScore ?? null, geo: j.geo?.score ?? null, coverage: j.coverage?.coveragePercent ?? null, evidenceLevel: j.scoreModel?.evidenceLevel ?? j.scoreEvidence?.level ?? null };
  rows.push(row);
  note(`${host}: HTTP ${res.status} | probe ${row.probe ? (row.probe.attempted ? (row.probe.ok ? `voltooid, ${row.probe.addedBlocks} blok(ken), ${row.probe.elapsedMs} ms, ${row.probe.window}` : `onvolledig: ${row.probe.error}`) : "niet nodig") : "—"} | schema ${row.schema} | score ${row.score} | dekking ${row.coverage}%`);
  writeFileSync(join(out, "summary.json"), JSON.stringify({ commitSha: sha, rows }, null, 1));
  failures = res.status === 0 || (res.status >= 500 && !j.code) ? failures + 1 : 0;
  if (failures >= 2) stop("twee opeenvolgende server-/netwerkfouten; resultaten tot nu toe bewaard.");
}
note(`Klaar: ${join(out, "summary.json")}`);
