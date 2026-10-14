import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {canPromoteSectorSubtype} from "../lib/sector-subtype.ts";

const defaults={description:"",siteName:"",h1s:[],schemaTypes:[]};
test("NOS news identity can never be relabelled dentist even with dental samples",()=>{
  const nos={...defaults,subtype:"dentist",primarySector:"news_media",declaredSector:"news_media",
    title:"NOS.nl - Nieuws, Sport en Evenementen | Nederlandse Omroep Stichting",
    description:"NOS.nl - Nieuws, Sport en Evenementen op Radio, TV en Internet",
    h1s:["Blijf bij. NOS."]};
  assert.equal(canPromoteSectorSubtype(nos),false);
  assert.equal(canPromoteSectorSubtype({...nos,schemaTypes:["Dentist"]}),false);
  assert.equal(canPromoteSectorSubtype({...nos,primarySector:"health_wellness"}),false);
});
test("health information publisher is not a dental practice",()=>{
  assert.equal(canPromoteSectorSubtype({...defaults,subtype:"dentist",primarySector:"health_wellness",declaredSector:"health_wellness",
    title:"Thuisarts | Betrouwbare informatie over gezondheid en ziekte"}),false);
});
test("true dental practice keeps correct subtype",()=>{
  assert.equal(canPromoteSectorSubtype({...defaults,subtype:"dentist",primarySector:"health_wellness",declaredSector:null,
    title:"Tandarts Amsterdam - Tandartspraktijk Plantage Middenlaan"}),true);
  assert.equal(canPromoteSectorSubtype({...defaults,subtype:"dentist",primarySector:"health_wellness",schemaTypes:["Dentist"],title:"Onze praktijk"}),true);
});
test("legal subtype is restricted to its primary professional service family",()=>{
  const legal={...defaults,subtype:"legal",primarySector:"professional_services",declaredSector:null,title:"Advocatenkantoor | Juridische dienstverlening"};
  assert.equal(canPromoteSectorSubtype(legal),true);
  assert.equal(canPromoteSectorSubtype({...legal,primarySector:"news_media",declaredSector:"news_media"}),false);
  assert.equal(canPromoteSectorSubtype({...legal,declaredSector:"government"}),false);
});
test("the live scan route enforces both subtype guards",async()=>{
  const source=await readFile(new URL("../app/api/scan/route.ts",import.meta.url),"utf8");
  assert.match(source,/catalogTop\?\.key==="dentist" && multiPageCapabilities\.treatment && canPromoteSectorSubtype/);
  assert.match(source,/catalogTop\?\.key==="legal" && multiPageCapabilities\.professional && canPromoteSectorSubtype/);
});
