import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Fresh144 / MKB-48, 6 Nov 2026. 32 REAL stored /api/scan responses (runs on
// 6b741e96, 0de08357 and the 8751558d diagnostics, archived under docs/qa/)
// reconstructed by scripts/testlab/audits-to-replay.mjs and replayed through the
// real /api/scan route. No network. Fidelity before this repair: 28 of 32 replays
// reproduced the stored live sector exactly; the 4 others are listed as such.
//
// Catalog labels are proposed_not_independently_verified. Assertions below are
// only made where the site's own homepage evidence decides the case.
const root = fileURLToPath(new URL("..", import.meta.url));

function replay() {
  const out = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", "--import", "./tests/scan-matrix/register.mjs", "tests/scan-matrix/run-route-replay.mjs", "--json"], {
    cwd: root, encoding: "utf8", timeout: 580000,
    env: { ...process.env, ROUTE_FIXTURE: `${root}/tests/fixtures/stored-live-replay/route.json.gz` },
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
