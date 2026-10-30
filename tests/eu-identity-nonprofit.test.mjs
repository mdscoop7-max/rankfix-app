import test from "node:test";
import assert from "node:assert/strict";
import { detectEuPrimaryIdentity } from "../lib/eu-identity.ts";

const id = (input) => detectEuPrimaryIdentity({ homepage: true, ...input });

test("charity: fundraising action + registration or own cause → probable non-profit", () => {
  const redCross = id({ title: "Het Nederlandse Hulpverlening | Zie je ons, zie je hulp", description: "Wij staan wereldwijd klaar voor mensen in nood. Bij een natuurramp of conflict helpen we de slachtoffers. Help je mee?", h1s: ["In 5 stappen jouw testament goed geregeld"], navLabels: ["Nieuws", "Steun met geld", "Doe een donatie", "Meer contactgegevens RSIN / fiscaal nummer: 003014022"] });
  assert.equal(redCross?.sector, "nonprofit"); assert.equal(redCross?.confidence, "medium"); assert.ok(redCross.confidenceScore < 80);
  const rights = id({ title: "Example International", description: "We are a global movement of millions of people who campaign for a world where human rights are enjoyed by all.", navLabels: ["Get involved", "Take Action", "Donate Now"] });
  assert.equal(rights?.sector, "nonprofit");
  const de = id({ title: "Beispiel Hilfe", description: "Wir helfen Kindern in großer Not weltweit.", navLabels: ["Über uns", "Jetzt spenden", "Gemeinnützige Organisation"] });
  assert.equal(de?.sector, "nonprofit");
});

test("no charity without both signals, and never for software, shops or publications", () => {
  // Donation link alone, no cause, no registration.
  assert.notEqual(id({ title: "Voorbeeld", description: "Welkom op onze website.", navLabels: ["Over ons", "Doneer"] })?.sector, "nonprofit");
  // Cause wording alone, no fundraising action.
  assert.notEqual(id({ title: "Voorbeeld", description: "Wij zetten ons in voor mensen in nood.", navLabels: ["Over ons", "Contact"] })?.sector, "nonprofit");
  // Fundraising software for charities.
  assert.notEqual(id({ title: "GiveSoft | Fundraising software for charities", description: "Collect donations online and manage donors. Start your free trial.", navLabels: ["Features", "Pricing", "Book a demo", "Donations"] })?.sector, "nonprofit");
  // Retailer with round-up donation.
  assert.notEqual(id({ title: "Shopvoorbeeld | Kleding online kopen", description: "Bestel kleding en schoenen online. Gratis verzending.", navLabels: ["Dames", "Heren", "Winkelwagen", "Doneer je wisselgeld aan het goede doel"] })?.sector, "nonprofit");
  // Publication writing about charities.
  assert.notEqual(id({ title: "Goede Doelen Blog | Nieuws over liefdadigheid", description: "Het magazine over goede doelen en mensen in nood.", navLabels: ["Artikelen", "Doneren tips"] })?.sector, "nonprofit");
});
