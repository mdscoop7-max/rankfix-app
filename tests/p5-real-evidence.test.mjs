// P5 re-run on 1 Nov 2026 (commit 7ee6ad5): the decisions on the REAL evidence of
// the five audited sites, stored compactly in tests/fixtures/p5-real-7ee6ad5.json.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hasTransportRetailChain, commerceApplicability } from "../lib/commerce-applicability.ts";

const real = JSON.parse(readFileSync(new URL("./fixtures/p5-real-7ee6ad5.json", import.meta.url), "utf8")).sites;

test("P5 real NS: no sampled page shows a retail purchase chain, so retail checks are not applicable", () => {
  const ns = real["ns.nl"];
  assert.equal(ns.key, "passenger_transport");
  assert.equal(ns.sitewideCommerceEvidence.sampleCount, 2);
  const chains = ns.sitewideCommerceEvidence.evidence.filter(hasTransportRetailChain).length;
  assert.equal(chains, 0);
  const state = commerceApplicability({ confirmed: false, primaryNonCommerceIdentity: true, commerceHints: true, thinShell: false, marketSelector: false, auditedRepresentativePages: 14, verifiedSecondaryCommerce: chains >= 1 });
  assert.equal(state.state, "absent");
});

test("P5 real controls: the transport rule does not touch the other four sites", () => {
  assert.deepEqual([real["alternate.nl"].sector, real["alternate.nl"].commerce, real["alternate.nl"].classification], ["ecommerce", "confirmed", "Webshop"]);
  assert.deepEqual([real["nu.nl"].sector, real["nu.nl"].salesChannel, real["nu.nl"].commerce], ["news_media", "unknown", "absent"]);
  assert.deepEqual([real["charite.de"].key, real["charite.de"].classification, real["charite.de"].websiteProfile], ["healthcare_academic", "Website", "Dienstverlener / organisatie"]);
  assert.deepEqual([real["uzleuven.be"].key, real["uzleuven.be"].salesChannel], ["healthcare_academic", "service_location"]);
  assert.match(real["uzleuven.be"].physicalEvidence.join(" "), /\/nl\/vestigingen/);
  // A real webshop's samples (Alternate) do show the purchase chain: a carrier
  // with a shop like that keeps its webshop checks.
  assert.ok(real["alternate.nl"].sitewideCommerceEvidence.evidence.filter(hasTransportRetailChain).length >= 2);
  for (const host of ["alternate.nl", "nu.nl", "charite.de", "uzleuven.be"]) assert.notEqual(real[host].sector, "transport_travel", host);
});
