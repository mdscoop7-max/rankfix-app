import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { paymentProviderPrimaryIdentity, primaryLodgingIdentity } from "../lib/sector-identity.ts";

test("payment platform homepage is fintech, not a hotel or a retail shop",()=>{
  const identity="Mollie – the platform for online and in-person payments One platform to accept payments, manage money, and access funding. Eliminate financial friction and grow your business with Mollie. Mollie – Platform for every payment";
  assert.equal(paymentProviderPrimaryIdentity(identity),true);
  assert.equal(primaryLodgingIdentity(identity,["WebSite","SearchAction","Organization"]),false);
  assert.equal(primaryLodgingIdentity("arrival departure guests book now",[]),false);
  assert.equal(primaryLodgingIdentity("Our payment gateway supports hotel bookings and guest checkout",[]),true,"a hotel mentioned in page identity needs business-context gating before override");
});
test("payment integrations do not imply payment provider as business identity",()=>{
  assert.equal(paymentProviderPrimaryIdentity("Fashion webshop: buy clothes online. Checkout accepts payments by card, Klarna and iDEAL"),false);
  assert.equal(paymentProviderPrimaryIdentity("Family hotel with rooms: pay online and check out with credit card"),false);
  assert.equal(paymentProviderPrimaryIdentity("Online betaalplatform voor zakelijke betalingen en betaalmethoden"),true);
});
test("real hotels and holiday accommodations retain the sector",()=>{
  assert.equal(primaryLodgingIdentity("Boutique Hotel Amsterdam – reserve a room",[]),true);
  assert.equal(primaryLodgingIdentity("Unique holiday home with overnight stay",[]),true);
  assert.equal(primaryLodgingIdentity("Our rooms are bookable",["Hotel"]),true);
  assert.equal(primaryLodgingIdentity("Platform for every payment",["Organization"]),false);
});
test("scan ties hotel and commerce to primary business identity, not stray words",async()=>{
  const route=await readFile(new URL("../app/api/scan/route.ts",import.meta.url),"utf8");
  assert.match(route,/financialServicePrimaryIdentity\(\{title,description,headings:h1s,schemaTypes\}\)/);
  assert.match(route,/!paymentServicesPrimaryIdentity && siteRole\.key !== "software" && primaryLodgingIdentity/);
  assert.match(route,/!paymentServicesPrimaryIdentity && !shortStayIdentity/);
  assert.match(route,/confirmedRetailSamples = auditedMultiPages.filter/);
  assert.match(route,/!paymentServicesPrimaryIdentity \|\| explicitRetailIdentity/);
  assert.match(route,/!paymentServicesPrimaryIdentity && !retailPrimaryIdentity && !finalCommerceDecision.confirmed/);
  assert.match(route,/sectorProfile.key === "finance" && paymentServicesPrimaryIdentity/);
});
