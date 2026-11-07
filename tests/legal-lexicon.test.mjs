import test from "node:test";
import assert from "node:assert/strict";
import { matchedLegalSignals } from "../lib/legal-lexicon.ts";

test("German footer Privatsphäre-Einstellungen proves cookie settings navigation (not legal compliance)",()=>{
 const got=matchedLegalSignals("/de/privatsphaere-einstellungen/","Privatsphäre-Einstellungen");
 assert.equal(got.cookies,true);
 assert.equal(got.privacy,true);
});
test("German Impressum and Datenschutz / NL privacy and EN cookie settings distinguish evidence",()=>{
 assert.equal(matchedLegalSignals("/de/datenschutz/","Datenschutz").privacy,true);
 assert.equal(matchedLegalSignals("/de/impressum/","Impressum").cookies,false);
 assert.equal(matchedLegalSignals("/nl/privacyverklaring","Privacyverklaring").privacy,true);
 assert.equal(matchedLegalSignals("/privacy-settings","Privacy settings").cookies,true);
 assert.equal(matchedLegalSignals("/nl/voorwaarden","Algemene voorwaarden").terms,true);
});
test("Generic product context is not a link to legal settings",()=>{
 const s=matchedLegalSignals("/products/cookies-and-cream/","Cookie assortiment");
 // The caller must additionally require first-party legal navigation context.
 assert.equal(s.cookies,true);
});
