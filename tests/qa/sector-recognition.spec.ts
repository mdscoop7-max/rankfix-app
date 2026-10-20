import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { detectEuPrimaryIdentity } from "../../lib/eu-identity";
import { detectPrimaryBusinessIdentity, isSiteHomepagePath } from "../../lib/primary-business-identity";
import { retailIdentityLanguage, newsMediaIdentity } from "../../lib/sector-identity";
import { sectorMetrics, calibration } from "../../scripts/engine-benchmark/metrics.mjs";

// Metamorphic QA: change incidental site content while preserving independently
// verified primary identity. This exercises Claude's EXISTING sector motor,
// never replaces it, and never scans or edits a customer website.
const unrelatedNavigation = [
  "Home", "Contact", "Nieuws", "Tarieven", "Shop", "Vacatures",
  "Nieuwsbrief", "Privacy", "TV", "Tickets", "Internet", "Winkelwagen"
];

describe("Sector Motor: independent metamorphic quality controls", () => {
  it("does not turn a Polish news publisher into a shop or travel operator when the navigation changes", () => {
    const base = {
      title: "Wiadomości z kraju i ze świata | Portal",
      description: "Najnowsze wiadomości, redakcja portalu informacyjnego.",
      homepage: true,
    };
    expect(detectEuPrimaryIdentity(base)?.sector).toBe("news_media");
    fc.assert(fc.property(fc.array(fc.constantFrom(...unrelatedNavigation), {maxLength: 20}), (navLabels) => {
      const result = detectEuPrimaryIdentity({...base, navLabels});
      expect(result?.sector).toBe("news_media");
    }), {seed: 20261020, numRuns: 100});
  });

  it("does not mistake an Italian university for commerce because it has shop/booking links", () => {
    const base = {
      title: "Università degli Studi – corsi di laurea",
      description: "Facoltà, studenti e ricerca.",
      homepage: true,
    };
    expect(detectEuPrimaryIdentity(base)?.sector).toBe("education");
    fc.assert(fc.property(fc.array(fc.constantFrom("Book", "Shop", "Tickets", "Contact", "Careers", "Store"), {maxLength: 18}), (navLabels) => {
      expect(detectEuPrimaryIdentity({...base, navLabels})?.sector).toBe("education");
    }), {seed: 20261020, numRuns: 100});
  });

  it("a real payment processor remains financial even if headings mention hotel guests and travel", () => {
    const base = {
      title: "FlowPay – the platform for online and in-person payments",
      description: "One platform to accept payments, manage money and access funding.",
      schemaTypes: ["WebSite", "Organization"],
    };
    expect(detectPrimaryBusinessIdentity({...base, headings:["Payments made simple"]}).sector).toBe("financial_services");
    fc.assert(fc.property(fc.array(fc.constantFrom("Guests", "Hotel clients", "Reservations", "Checkout", "Booking", "Guest payments"), {maxLength: 10}), (headingExtras) => {
      const result = detectPrimaryBusinessIdentity({...base, headings: ["Payments made simple", ...headingExtras]});
      expect(result.sector).toBe("financial_services");
      expect(result.confidenceScore).toBeGreaterThanOrEqual(85);
    }), {seed: 20261020, numRuns: 100});
  });

  it("selling luggage stays retail-oriented rather than being treated as a hotel", () => {
    const base = {
      title: "Online store for luggage",
      description: "Shop bags, travel accessories and suitcases.",
    };
    fc.assert(fc.property(fc.array(fc.constantFrom("Guests", "Hotels", "Travel tickets", "Check-in", "Book", "Accommodation"), {maxLength: 6}), (headings) => {
      const result = detectPrimaryBusinessIdentity({...base, headings});
      expect(result.sector).not.toBe("hospitality");
    }), {seed: 20261020, numRuns: 100});
  });

  it("generic own-news or retail-cart language alone is not sector identity", () => {
    expect(newsMediaIdentity({
      title: "Nieuws van ons bedrijf",
      description: "Nieuws van ons bedrijf over projecten",
      h1: "Bedrijfsnieuws", homepage: false,
    })).toBe(false);
    fc.assert(fc.property(fc.constantFrom("Bekijk", "Ontdek", "Open", "Gebruik"), (verb) => {
      expect(retailIdentityLanguage(`${verb} je winkelwagen`).store).toBe(false);
    }), {seed: 20261020, numRuns: 60});
  });

  it("market homepage URLs never turn /products/home into a homepage", () => {
    fc.assert(fc.property(fc.constantFrom("nl", "de", "fr", "it", "es", "en-us"), (market) => {
      expect(isSiteHomepagePath(`/${market}/home`)).toBe(true);
      expect(isSiteHomepagePath(`/products/home`)).toBe(false);
    }), {seed: 20261020, numRuns: 60});
  });
});

describe("Sector Motor: independent metric and confidence truthfulness", () => {
  const rows = [
    {id:"publisher",scanned:true,expected:"news_media",predicted:"news_media",confidence:95},
    {id:"bank",scanned:true,expected:"financial_services",predicted:"ecommerce",confidence:94},
    {id:"unresolved",scanned:true,expected:"education",predicted:"unknown",confidence:0},
  ];

  it("does NOT count abstention as correct classification", () => {
    const m = sectorMetrics(rows);
    expect(m.scanned).toBe(3);
    expect(m.correct).toBe(1);
    expect(m.wrong).toBe(1);
    expect(m.abstained).toBe(1);
    expect(m.accuracyPct).toBeCloseTo(33.3, 1);
    expect(m.highConfidenceWrong).toBe(1);
  });

  it("confidence calibration exposes confident misclassifications", () => {
    const high = calibration(rows).find((bin) => bin.bin === "90–100");
    expect(high?.n).toBe(2);
    expect(high?.observedAccuracyPct).toBe(50);
  });
});
