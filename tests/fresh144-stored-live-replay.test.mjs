import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { evidenceGradeBasis } from "../lib/audit-score.ts";

// Fresh144 / MKB-48, 6 Nov 2026. 32 REAL stored /api/scan responses (runs on
// 6b741e96, 0de08357 and the 8751558d diagnostics, archived under docs/qa/)
// reconstructed by scripts/testlab/audits-to-replay.mjs and replayed through the
// real /api/scan route. No network. Fidelity before this repair: 28 of 32 replays
// reproduced the stored live sector exactly; the 4 others are listed as such.
//
// Catalog labels are proposed_not_independently_verified. Assertions below are
// only made where the site's own homepage evidence decides the case.
const root = fileURLToPath(new URL("..", import.meta.url));

const dumpDir = mkdtempSync(join(tmpdir(), "rf-replay-"));
function replay() {
  const out = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", "--import", "./tests/scan-matrix/register.mjs", "tests/scan-matrix/run-route-replay.mjs", "--json"], {
    cwd: root, encoding: "utf8", timeout: 580000,
    env: { ...process.env, DUMP_DIR: dumpDir, ROUTE_FIXTURE: `${root}/tests/fixtures/stored-live-replay/route.json.gz` },
  });
  const line = (out.stdout || "").split("\n").find((l) => l.startsWith("ROUTE_REPLAY "));
  assert.ok(line, (out.stderr || "").slice(-1500));
  return new Map(JSON.parse(line.slice("ROUTE_REPLAY ".length)).map((r) => [r.host, r]));
}

// Correct before this repair and must stay correct (regression guard).
const KEEP = {
  "nxp.com": "manufacturing_industrial", "abb.com": "manufacturing_industrial",
  "autoriteitpersoonsgegevens.nl": "government", "eea.europa.eu": "government", "ema.europa.eu": "government",
  "kadaster.nl": "government", "nationaleombudsman.nl": "government", "rijkswaterstaat.nl": "government",
  "concertgebouw.nl": "events_culture", "mauritshuis.nl": "events_culture", "musee-orsay.fr": "events_culture",
  "cz.nl": "financial_services", "lezen.nl": "nonprofit", "natuurmonumenten.nl": "nonprofit", "oxfam.org.uk": "nonprofit",
  "mumc.nl": "health_wellness", "umcutrecht.nl": "health_wellness",
  "nsinternational.com": "transport_travel", "prorail.nl": "transport_travel",
  "ox.ac.uk": "education", "tudelft.nl": "education", "wur.nl": "education",
  "feenstra.com": "home_services", "treatwell.nl": "service_marketplace",
  // Repaired in round 2: own self-description as optics technology enterprise /
  // engineering group with products (unknown before).
  "zeiss.com": "manufacturing_industrial", "sandvik.com": "manufacturing_industrial",
};

test("stored live Fresh144/MKB48 replays: repaired cases and no regressions", { timeout: 600000 }, () => {
  const rows = replay();
  const problems = [];
  // Repaired: a heart-disease charity ("Hartstichting", doneren, nalaten,
  // collectant) was read as health care because its compound name was not seen.
  const hart = rows.get("hartstichting.nl");
  if (hart?.sector !== "nonprofit") problems.push(`hartstichting.nl: ${hart?.sector}/${hart?.key}, expected nonprofit`);
  for (const [host, sector] of Object.entries(KEEP)) {
    const r = rows.get(host);
    if (!r) problems.push(`${host}: not replayed`);
    else if (r.sector !== sector) problems.push(`${host}: ${r.sector}/${r.key}, was ${sector}`);
  }
  // Never a wrong sector presented with certainty when the evidence is missing.
  for (const r of rows.values()) if (r.sector === "unknown" && (r.confidence ?? 0) > 0) problems.push(`${r.host}: unknown with confidence ${r.confidence}`);
  assert.deepEqual(problems, []);
});

// Owner, 6 Nov: "de score moet kloppen met de scan". Every replayed report's
// numbers must agree with its own findings and evidence (no hidden adjustments).
const gradeOf = (score) => score >= 90 ? "A" : score >= 75 ? "B" : score >= 60 ? "C" : score >= 45 ? "D" : "E";
test("every report's score agrees with its own checks, range, grade and findings", { timeout: 600000 }, () => {
  const files = readdirSync(dumpDir).filter((f) => f.endsWith(".json"));
  assert.ok(files.length >= 30, `only ${files.length} reports dumped`);
  const problems = [];
  for (const f of files) {
    const d = JSON.parse(readFileSync(join(dumpDir, f), "utf8"));
    if (!d.success) continue;
    const o = d.overallScore, seo = d.seo?.score, geo = d.geo?.score, sm = d.scoreModel || {};
    // The total never exceeds its parts (corrections may only lower it).
    if (o > Math.round(seo * 0.6 + geo * 0.4)) problems.push(`${f}: overall ${o} above 0.6×${seo}+0.4×${geo}`);
    if (sm.range && (o < sm.range.low || o > sm.range.high)) problems.push(`${f}: ${o} outside ${sm.range.low}–${sm.range.high}`);
    if (d.grade !== gradeOf(evidenceGradeBasis(o, sm.range, sm.evidenceLevel))) problems.push(`${f}: grade ${d.grade} does not match ${o} (${sm.evidenceLevel})`);
    if (o === 100 && (d.coverage?.unableToConfirm || 0) > 0) problems.push(`${f}: 100 with unconfirmed checks`);
    if (o >= 90 && (d.summary?.critical || 0) > 0) problems.push(`${f}: ${o} with ${d.summary.critical} critical findings`);
    if (sm.evidenceLevel === "insufficient" && sm.headline?.indication !== true) problems.push(`${f}: insufficient evidence not marked as indication`);
    const s = d.summary || {};
    if (s.passed + s.issues + s.notApplicable + s.unableToConfirm === 0) problems.push(`${f}: empty summary`);
  }
  rmSync(dumpDir, { recursive: true, force: true });
  assert.deepEqual(problems, []);
});
