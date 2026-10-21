import test from "node:test";
import assert from "node:assert/strict";
import { SOFTWARE_PRODUCT_IDENTITY, SOFTWARE_PRODUCT_CAPABILITIES } from "../lib/software-business-evidence.ts";
import { inferSectorFromIndependentSources } from "../lib/sector-evidence-arbiter.ts";

const catalogue = [
  { sector: "saas_b2b", label: "SaaS / B2B", primary: SOFTWARE_PRODUCT_IDENTITY,
    support: [SOFTWARE_PRODUCT_CAPABILITIES], modules: ["saas_b2b"] },
  { sector: "financial_services", label: "Financiële dienstverlening",
    primary: /\b(?:financial infrastructure|payment processing|betalingsverkeer)\b/i,
    support: [/\b(?:money transfers|payouts|betalingen verwerken)\b/i], modules: ["financial_services"] },
];

test("generic site intro: salesfunnel software + separate product capabilities is a SaaS identity", () => {
  const profiles = [
    { title: "Het beste AI salesfunnel systeem | Voorbeeld", h1s: ["In vijf minuten een winstgevende website online"],
      navLabels: ["Website (met AI)", "Betaalpagina's", "Funnels", "Probeer gratis"] },
    { title: "Verkoopfunnel software voor online ondernemers", h1s: ["Verkoop meer met je eigen funnel"],
      navLabels: ["Functies", "Integraties", "Proefaccount"] },
    { title: "No-code checkout software", description: "Make checkout pages for your customers",
      navLabels: ["Features", "Free trial", "Integrations"] },
    { title: "Website builder voor dienstverleners", h1s: ["Bouw een website zonder code"],
      navLabels: ["Integraties", "Dashboard", "Probeer gratis"] },
    { title: "Payment page builder for online businesses", h1s: ["Launch pages in minutes"],
      navLabels: ["Payment pages", "Free trial", "Login"] },
  ];
  for (const input of profiles) {
    const result = inferSectorFromIndependentSources(input, catalogue);
    assert.equal(result?.sector, "saas_b2b", JSON.stringify(input));
    assert.equal(result?.confidence, "medium");
    assert.ok(result.confidenceScore < 80);
    assert.ok(result.sourceIds.length >= 2);
  }
});

test("a SaaS company selling checkout technology is not automatically a financial institution", () => {
  const result = inferSectorFromIndependentSources({
    title:"Checkout software for small businesses",navLabels:["Free trial","Dashboard"]
  }, catalogue);
  assert.equal(result?.sector,"saas_b2b");
});

test("a real payments infrastructure homepage remains financial, not software merely from checkout vocabulary", () => {
  const result = inferSectorFromIndependentSources({
    title:"Financial infrastructure for growing businesses",
    description:"Payment processing and payouts for merchants",
    navLabels:["Checkout","API","Login"],
  }, catalogue);
  assert.equal(result?.sector,"financial_services");
});

test("software mentioned as course topic or a product for sale does not prove the publisher is a SaaS provider", () => {
  const profiles=[
    {title:"Cursus: een salesfunnel systeem bouwen",description:"Leer je verkooptechnieken met een training",
      navLabels:["Lessen","Boek direct","Over de docent"]},
    {title:"Online winkel voor checkout software licenties",description:"Koop licenties en producten in onze webshop",
      navLabels:["Winkelwagen","Bestellen"]},
    {title:"Onze blog over website builders",description:"Nieuws en tips over software",
      navLabels:["Blog","Artikelen"]},
    {title:"Welkom bij onze agency",description:"Wij helpen onze klanten met verkoopsystemen",
      navLabels:["Contact","Projecten","Cases"]},
  ];
  for(const input of profiles) {
    const result=inferSectorFromIndependentSources(input,catalogue);
    assert.notEqual(result?.sector,"saas_b2b",JSON.stringify(input));
  }
});

test("generic terms 'checkout', 'payments' or 'platform' alone do not establish SaaS", () => {
  for(const word of ["checkout","payments","platform","Webshop", "API","softwarelicentie"]) {
    assert.equal(SOFTWARE_PRODUCT_IDENTITY.test(word),false,word);
  }
});

test("runtime sector path uses shared independent offering signals, not a brand list",async()=>{
  const { readFile } = await import("node:fs/promises");
  const route=await readFile(new URL("../app/api/scan/route.ts",import.meta.url),"utf8");
  assert.match(route,/sector:"saas_b2b",label:"SaaS \/ B2B",patterns:\[SOFTWARE_PRODUCT_IDENTITY,SOFTWARE_PRODUCT_CAPABILITIES\]/);
  assert.match(route,/inferSectorFromIndependentSources/);
});
