// Offline replay of recorded TestLab identity evidence through the CURRENT
// sector identity layer (no network, no scanning). It measures the identity
// decision only: homepage title/description/H1/schema plus sampled-page
// identities. Navigation, H2 and commerce evidence are not recorded in the
// TestLab scans, so this is a lower bound for the full route, not a substitute
// for a live TestLab run.
//
// Usage: node --experimental-strip-types scripts/testlab/replay-identity.mjs [fixture.json] [--json]
import { readFileSync } from "node:fs";
import { detectEuPrimaryIdentity } from "../../lib/eu-identity.ts";
import { detectPrimaryBusinessIdentity } from "../../lib/primary-business-identity.ts";
import { sectorPageEvidence } from "../../lib/sector-page-evidence.ts";
import { compareSector } from "./labels.mjs";

export function replayDecision(site) {
  // The route decides on the scanned page (the first audit), also after a redirect.
  const home = site.pages[0] || {};
  const url = new URL(site.finalUrl);
  const input = { title: home.title || "", description: home.description || "", h1s: home.identityHeadings || [], schemaTypes: home.schemaTypes || [] };
  const primary = detectPrimaryBusinessIdentity({ ...input, headings: input.h1s });
  if (primary.sector !== "unknown") return { sector: primary.sector, key: primary.financialKind ? `financial_${primary.financialKind}` : primary.sector, source: "homepage_primary" };
  const eu = detectEuPrimaryIdentity({ ...input, hostname: url.hostname, homepage: true });
  if (eu) return { sector: eu.sector, key: eu.key, source: `homepage_eu_${eu.confidence}` };
  const pages = sectorPageEvidence(site.finalUrl, site.pages);
  if (pages.decision) return { sector: pages.decision.sector, key: pages.decision.key, source: `pages_${pages.reason}` };
  return { sector: "unknown", key: "unknown", source: pages.reason };
}

export function replayAll(fixture) {
  return fixture.sites.map((site) => {
    const decision = replayDecision(site);
    const comparison = compareSector(site.expected, decision);
    const verdict = decision.sector === "unknown" ? "unknown" : comparison.sectorMatch ? "compatible" : "wrong";
    return { host: site.host, expected: site.expected, decision, verdict };
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const path = process.argv.slice(2).find((a) => !a.startsWith("--")) || new URL("../../tests/fixtures/testlab-96-replay/identity.json", import.meta.url);
  const rows = replayAll(JSON.parse(readFileSync(path, "utf8")));
  if (process.argv.includes("--json")) { console.log(JSON.stringify(rows)); process.exit(0); }
  const count = (v) => rows.filter((r) => r.verdict === v).length;
  for (const r of rows) console.log(`${r.verdict.padEnd(10)} ${r.host.padEnd(24)} expected=${String(r.expected).padEnd(24)} got=${r.decision.sector}/${r.decision.key} (${r.decision.source})`);
  console.log(`\ncompatible ${count("compatible")} · unknown ${count("unknown")} · wrong ${count("wrong")} · total ${rows.length}`);
}
