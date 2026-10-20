import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { heritageKnowledgeIdentity } from "../lib/heritage-identity.ts";
import { buildScanEvidence } from "../lib/scan-evidence.ts";
import { rankSectorCandidates } from "../lib/sector-catalog.ts";

const monumentenIdentity = {
  title: "Monumenten.nl | Wegwijs in monumentenland",
  description: "Alles over Monumenten. U vindt hier informatie over de financiering en het bezit van een monument, over onderhoud en restauratie, en verhalen uit de praktijk.",
  headings: ["Monumenten.nl", "Alles over monumenten onder één dak", "Inspiratie voor monumenteigenaren"],
  homepage: true,
};

test("real heritage information homepage gets a clear primary identity", () => {
  const identity = heritageKnowledgeIdentity(monumentenIdentity);
  assert.equal(identity?.key, "heritage_information");
  assert.equal(identity?.label, "Erfgoed & monumenteninformatie");
  assert.equal(identity?.evidence.length, 3);
});

test("articles, construction companies, hotels and generic marketing do not become heritage portals", () => {
  assert.equal(heritageKnowledgeIdentity({...monumentenIdentity, homepage: false}), null);
  assert.equal(heritageKnowledgeIdentity({
    title:"Restauratiebedrijf De Monumenten", description:"Informatie over restauratie en monumenten.",headings:["Restauratiebedrijf De Monumenten"],homepage:true,
  }), null);
  assert.equal(heritageKnowledgeIdentity({
    title:"Hotel Het Monument", description:"Informatie voor gasten bij ons historische erfgoed.",headings:["Hotel Het Monument"],homepage:true,
  }), null);
  assert.equal(heritageKnowledgeIdentity({
    title:"Fietsenwinkel Amsterdam", description:"Een artikel met informatie over een monument.",headings:["Fietsenwinkel"],homepage:true,
  }), null);
});

test("non-retail heritage content cannot impersonate a checkout or automotive garage", () => {
  const evidence=buildScanEvidence({
    url:"https://www.monumenten.nl/",
    title:monumentenIdentity.title,
    html:'<html><head><title>Monumenten.nl</title><script type="application/ld+json">{"@type":"GovernmentOrganization"}</script></head><body><h1>Alles over monumenten onder één dak</h1><div class="checkout" data-checkout-stage="info">Restauratie en onderhoud van monumenten</div><p>Tips voor onderhoud en reparatie van monumentale gebouwen</p><a href="/disclaimer">Disclaimer</a></body></html>'
  });
  assert.equal(evidence.commerce.checkout.value, false);
  assert.equal(evidence.sectorDetails.automotive.service.value, false);
  assert.equal(rankSectorCandidates(evidence, "Restauratie onderhoud monumenten").some(x=>x.key==="car_repair"), false);
});

test("genuine checkout links and vehicle maintenance remain recognisable",()=>{
  const commerce=buildScanEvidence({url:"https://shop.example/",html:'<a href="/checkout">Afrekenen</a>'});
  const garage=buildScanEvidence({url:"https://garage.example/",html:"<p>APK, auto-onderhoud en autobanden.</p>"});
  assert.equal(commerce.commerce.checkout.value,true);
  assert.equal(garage.sectorDetails.automotive.service.value,true);
});

test("scanner wires heritage identity and does not mix unrelated sitewide sector hints",async()=>{
  const source=await readFile(new URL("../app/api/scan/route.ts",import.meta.url),"utf8");
  assert.match(source,/heritageKnowledgeIdentity\(\{ title, description, headings:identityH1s/);
  assert.match(source,/\{sector:"heritage_information",key:heritagePortalIdentity\.key/);
  assert.match(source,/hospitality: \(sectorProfile\.sector==="unknown" \|\| sectorProfile\.sector==="hospitality"\)/);
  assert.match(source,/automotiveService: \(sectorProfile\.sector==="unknown" \|\| sectorProfile\.sector==="automotive"\)/);
  assert.match(source,/properties: \(sectorProfile\.sector==="unknown" \|\| sectorProfile\.sector==="real_estate"\)/);
});
