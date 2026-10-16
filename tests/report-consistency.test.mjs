import test from "node:test";
import assert from "node:assert/strict";
import { applyEvidenceBasedScoreCap, combinedScoreRange, scoreApplicableChecks, scoreRange } from "../lib/audit-score.ts";
import { hasDanglingTitleSeparator, assessPageTitle } from "../lib/report-quality.ts";
import { buildScanEvidence } from "../lib/scan-evidence.ts";

// Deterministic pseudo-random generator so failures are reproducible.
function rng(seed) { return () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }; }

test("score always lies inside its own 'mogelijk bereik' (2000 random reports)", () => {
  const r = rng(42);
  const statuses = ["PASS", "WARNING", "FAIL", "NOT_APPLICABLE", "UNABLE_TO_CONFIRM"];
  const sev = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
  for (let run = 0; run < 2000; run++) {
    const items = Array.from({ length: 5 + Math.floor(r() * 25) }, (_, i) => {
      const issue_status = statuses[Math.floor(r() * statuses.length)];
      const maxPoints = 1 + Math.floor(r() * 12);
      const points = issue_status === "PASS" ? maxPoints : issue_status === "WARNING" ? Math.floor(r() * maxPoints) : 0;
      return { issue_status, maxPoints, points, severity: sev[Math.floor(r() * 4)], confidence: r() > 0.2 ? "high" : "medium", rootCause: r() > 0.8 ? `rc${i % 3}` : undefined };
    });
    if (!items.some((x) => x.issue_status !== "NOT_APPLICABLE" && x.issue_status !== "UNABLE_TO_CONFIRM")) continue;
    const score = applyEvidenceBasedScoreCap(scoreApplicableChecks(items), items);
    const range = scoreRange(items);
    const low = applyEvidenceBasedScoreCap(range.low, items), high = applyEvidenceBasedScoreCap(range.high, items);
    assert.ok(score >= low - 1 && score <= high + 1, `run ${run}: score ${score} outside ${low}-${high}`);
  }
});

test("combined range uses the same 0.6/0.4 weighting as the overall score", () => {
  const c = combinedScoreRange({ low: 90, high: 100, assessedWeight: 1, unverifiedWeight: 1, applicableWeight: 2 }, { low: 60, high: 70, assessedWeight: 1, unverifiedWeight: 0, applicableWeight: 1 });
  assert.deepEqual([c.low, c.high], [78, 88]);
});

test("a report with any open warning or failure never shows 100", () => {
  assert.equal(applyEvidenceBasedScoreCap(100, [{ issue_status: "PASS" }, { issue_status: "WARNING" }]), 99);
  assert.equal(applyEvidenceBasedScoreCap(100, [{ issue_status: "PASS" }, { issue_status: "UNABLE_TO_CONFIRM" }]), 100);
  assert.equal(applyEvidenceBasedScoreCap(95, [{ issue_status: "WARNING" }]), 95);
});

test("titles with an empty template part are flagged; brand-only stays brand-only", () => {
  for (const t of ["| Time Trans | specialist in bloemen", "Contact | ", "Home – – Merk", ": Onderwerp"]) assert.equal(hasDanglingTitleSeparator(t), true, t);
  for (const t of ["Contact | Merk", "Wi-Fi-router kopen – Merk", "Coolblue - Alles voor een glimlach"]) assert.equal(hasDanglingTitleSeparator(t), false, t);
  assert.equal(assessPageTitle("| Time Trans | specialist in bloemen en planten", "www.timetrans.nl").flag, "dangling_separator");
  assert.equal(assessPageTitle("| Expert.nl", "www.expert.nl").flag, "brand_only");
});

test("'book a demo' and sales calls are leads, not bookings", () => {
  const demo = buildScanEvidence({ url: "https://saas.example/", html: "<html><body><p>Book a demo or schedule a call with sales. Plan een gesprek.</p><a href='/book-a-demo'>Book a demo</a></body></html>" });
  assert.equal(demo.appointments.booking.value, false);
  const hotel = buildScanEvidence({ url: "https://hotel.example/", html: "<html><body><p>Boek nu je kamer.</p><a href='/booking'>Book now</a></body></html>" });
  assert.equal(hotel.appointments.booking.value, true);
});
