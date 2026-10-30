import test from "node:test";
import assert from "node:assert/strict";
import { detectEuPrimaryIdentity } from "../lib/eu-identity.ts";
const id = (input) => detectEuPrimaryIdentity({ homepage: true, ...input });

test("official statistics office and land registry are government, not a consultancy 'bureau'", () => {
  const cbs = id({ title: "Centraal Bureau voor de Statistiek", description: "Het CBS publiceert betrouwbare en samenhangende statistische informatie.", navLabels: ["Cijfers", "Nieuws", "Onze diensten", "Over ons"] });
  assert.equal(cbs?.sector, "government"); assert.equal(cbs?.confidence, "high");
  const land = id({ title: "Kadaster", description: "Het Kadaster registreert gegevens van onroerende zaken, zoals huizen en percelen.", navLabels: ["Particulier", "Zakelijk", "Eigendomsinformatie opvragen", "Kaarten"] });
  assert.equal(land?.sector, "government");
  assert.equal(id({ title: "Statistik Austria", description: "Die Bundesanstalt Statistik Österreich veröffentlicht Zahlen und Daten." })?.sector, "government");
});

test("mentioning a register or statistics office is not being one", () => {
  assert.notEqual(id({ title: "Woningwaarde Check | Makelaar Voorbeeld", description: "Bereken je woningwaarde op basis van Kadaster-gegevens en recente verkopen.", navLabels: ["Woningaanbod", "Verkopen", "Taxatie"] })?.sector, "government");
  assert.notEqual(id({ title: "Datavoorbeeld | Dashboards", description: "Wij analyseren cijfers van het Centraal Bureau voor de Statistiek voor gemeenten.", navLabels: ["Diensten", "Cases", "Contact"] })?.sector, "government");
  assert.notEqual(id({ title: "Adviesbureau Voorbeeld", description: "Ons bureau voor statistiek en data-analyse helpt bedrijven met onderzoek.", navLabels: ["Onze diensten", "Over ons"] })?.sector, "government");
});

test("semiconductor maker is manufacturing; listed markets in the title are not its sector", () => {
  const chip = id({ title: "NXP Semiconductors | Automotive, Security, IoT", description: "NXP is a global semiconductor company creating solutions that enable secure connections for a smarter world.", navLabels: ["Products", "Applications", "Design", "Support"] });
  assert.equal(chip?.sector, "manufacturing_industrial"); assert.equal(chip?.key, "semiconductors_electronics"); assert.equal(chip?.confidence, "high");
  assert.notEqual(id({ title: "FabSoft | Software for semiconductor fabs", description: "MES software platform for semiconductor manufacturing. Book a demo.", navLabels: ["Features", "Pricing", "Demo"] })?.key, "semiconductors_electronics");
  assert.notEqual(id({ title: "Chipshop | Microcontrollers online kopen", description: "Webshop voor microcontrollers en elektronische componenten. Bestel online.", navLabels: ["Winkelmand", "Arduino"] })?.key, "semiconductors_electronics");
});
