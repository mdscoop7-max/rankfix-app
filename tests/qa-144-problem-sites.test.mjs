import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// QA-144: the problem websites of the 144-site TestLab run (QA 5da81ee4, 24 Oct
// 2026). "before" is the recorded live result; "after" is required now. Each site
// is replayed through the real /api/scan route from what TestLab stored (identity,
// first 3000 characters, sampled pages, commerce evidence). Three commerce cases
// whose live path the reconstruction cannot reproduce (technology-only commerce)
// are covered by tests/scan-matrix/run-commerce-channel.mjs; Big.dk (no answer
// after 300 s) by tests/scan-matrix/run-hard-limit.mjs.
const root = fileURLToPath(new URL("..", import.meta.url));
const CASES = [
  { host: "bakermckenzie.com", before: "food_local_retail 90 (brand name 'Baker')", sector: "professional_services", key: "legal" },
  { host: "heathrow.com", before: "automotive 90 ('Treats for every occasion')", sector: "airports" },
  { host: "mvrdv.com", before: "events_culture 95 ('museum' in a project heading)", sector: "professional_services", key: "architecture_design" },
  { host: "sophos.com", before: "ecommerce 92 (store pages)", sector: "cybersecurity" },
  { host: "enterprise.com", before: "ecommerce 92 (rental rates)", sector: "automotive", key: "car_rental" },
  { host: "nandos.co.uk", before: "ecommerce 88 (menu prices, FastFoodRestaurant schema)", sector: "hospitality" },
  { host: "gymshark.com", before: "fitness_sports 90 ('Gym Clothes' in an official store)", sector: "ecommerce" },
  { host: "homewizard.com", before: "energy_utilities 90 (energy-monitoring devices)", notSector: "energy_utilities" },
  { host: "frankfurt-airport.com", before: "transport_travel 90", sector: "airports" },
  { host: "changiairport.com", before: "transport_travel 90", sector: "airports" },
  { host: "sentinelone.com", before: "saas_b2b 78", sector: "cybersecurity" },
  { host: "knvb.nl", before: "ecommerce 88 (shop sub-page)", sector: "sports_organizations" },
  { host: "rodekruis.nl", before: "ecommerce 88 (donation amounts)", notSector: "ecommerce" },
  { host: "loetje.com", before: "ecommerce 88 (WooCommerce plugin, menu prices)", notSector: "ecommerce" },
];

test("QA-144 problem websites: correct sector now, never a wrong sector at high certainty", { timeout: 600000 }, () => {
  const out = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", "--import", "./tests/scan-matrix/register.mjs", "tests/scan-matrix/run-route-replay.mjs", "--json"], {
    cwd: root, encoding: "utf8", timeout: 580000,
    env: { ...process.env, ROUTE_FIXTURE: `${root}/tests/fixtures/testlab-144-replay/route.json.gz`, ONLY: CASES.map((c) => c.host).join(",") },
  });
  const line = (out.stdout || "").split("\n").find((l) => l.startsWith("ROUTE_REPLAY "));
  assert.ok(line, (out.stderr || "").slice(-1500));
  const rows = new Map(JSON.parse(line.slice("ROUTE_REPLAY ".length)).map((r) => [r.host, r]));
  const problems = [];
  for (const c of CASES) {
    const r = rows.get(c.host);
    if (!r) { problems.push(`${c.host}: not replayed`); continue; }
    const now = `${r.sector}/${r.key} ${r.confidence}`;
    if (c.sector && r.sector !== c.sector) problems.push(`${c.host}: before ${c.before}, now ${now}, expected ${c.sector}`);
    if (c.key && r.key !== c.key) problems.push(`${c.host}: subtype ${r.key}, expected ${c.key}`);
    if (c.notSector && r.sector === c.notSector) problems.push(`${c.host}: still ${now}`);
    // A primary sector that only rests on a homepage declaration is "probable".
    if (r.sector === "unknown" && (r.confidence ?? 0) > 0) problems.push(`${c.host}: unknown with confidence ${r.confidence}`);
  }
  assert.deepEqual(problems, []);
});
