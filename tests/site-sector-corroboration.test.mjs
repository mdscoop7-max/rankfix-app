import test from "node:test";
import assert from "node:assert/strict";
import {corroborateDeclaredIndustry, detectDeclaredIndustry} from "../lib/site-sector-corroboration.mjs";

const root="https://example.test/";
const page=(path,title,description,extra={})=>({url:new URL(path,root).toString(),type:"service",status:"audited",title,description,...extra});
const homepage=(title,description,extra={})=>page("/",title,description,{type:"homepage",...extra});
const decision=(home,internals)=>corroborateDeclaredIndustry(root,home,internals);
const fixtures=[
  ["cybersecurity","cybersecurity","Cybersecurity and incident response","Managed detection and threat intelligence","Cybersecurity services","Incident response for ransomware protection"],
  ["waste_recycling","waste_recycling","Waste management and recycling company","Resource recovery and circular waste services","Recycling services","Waste collection and resource recovery"],
  ["sports_organizations","sports_organizations","National football association","Sports federation, clubs, teams and competitions","Sports federation","Clubs, members and football competitions"],
  ["maritime_ports","maritime_ports","Port authority and maritime port","Shipping logistics, terminals and container infrastructure","Port operations","Maritime terminal cargo and harbor services"],
  ["airports","airports","International Airport","Flight departures and passenger terminals","Airport flight information","Terminal arrivals and departures"],
  ["legal","professional_services","Global law firm and legal counsel","Legal services, litigation and dispute resolution","Law firm services","Legal counsel and business litigation"],
  ["charities_nonprofits","nonprofit","Humanitarian charity organization","Volunteer for emergency relief and donate","Charitable organization","Our mission and humanitarian aid volunteers"],
  ["museum_culture","events_culture","Science Museum","Exhibitions, visitors and art collections","Museum exhibitions","Explore our museum collection and visitors"],
  ["architecture_design","professional_services","Architecture studio","Urban design and architectural building projects","Architecture firm","Building design and architecture projects"],
  ["veterinary","health_wellness","Veterinary clinic","Animal health treatment and veterinary care","Veterinary hospital","Care for pets and animals"],
  ["agriculture_horticulture","agriculture_horticulture","Horticultural cooperative","Our farmers and growers cultivate crops","Horticulture cooperative","Farmers, crops and land cultivation"],
];
for(const [key,sector,hTitle,hDescription,pTitle,pDescription] of fixtures){
  test("homepage and separate service page corroborate "+key,()=>{
    const r=decision(homepage(hTitle,hDescription),[page("/services",pTitle,pDescription)]);
    assert.equal(r.decision?.key,key);
    assert.equal(r.decision?.sector,sector);
    assert.equal(r.supportingPages,2);
    assert.equal(r.decision.evidence.length,2);
    assert.ok(r.decision.confidenceScore<=90);
  });
}
test("single homepage never proves a definitive sector",()=>{
  const r=decision(homepage("International Airport","Flight arrivals and passenger terminals"),[]);
  assert.equal(r.decision,null);
});
test("marketing/customer industry pages do not vote",()=>{
  const r=decision(homepage("Cloud software","Business dashboard and integrations"),[
    page("/industries/airports","International Airport","Flight departures, passengers and terminals"),
    page("/customers/legal","Global law firm","Litigation and legal counsel"),
  ]);
  assert.equal(r.decision,null);
});
test("duplicate page title/description never counts as independent source",()=>{
  const h=homepage("International Airport","Flight arrivals and passenger terminals");
  const r=decision(h,[page("/flights",h.title,h.description),page("/arrivals",h.title,h.description)]);
  assert.equal(r.decision,null);
});
test("different sector pages conflict and abstain",()=>{
  const r=decision(homepage("International Airport","Flight arrivals and passenger terminals"),[
    page("/services","International Airport","Flight information and terminal arrivals"),
    page("/legal","Global law firm and legal counsel","Legal services and litigation"),
  ]);
  assert.equal(r.decision,null); // a contradictory independent identity requires review
  const all=decision(homepage("International Airport","Flight arrivals and passenger terminals"),[
    page("/legal","Global law firm and legal counsel","Legal services and litigation"),
    page("/law","Law firm services","Litigation and legal counsel"),
  ]);
  assert.equal(all.decision,null);
});
test("shopping carts, product marketing and appointment widgets do not prove any extended industry",()=>{
  assert.equal(detectDeclaredIndustry(homepage("Online store for security cameras","Buy smart security cameras and alarm equipment")),null);
  assert.equal(detectDeclaredIndustry(homepage("Airport parking and shuttle","Reserve airport transfer and parking")),null);
  assert.equal(detectDeclaredIndustry(homepage("Cloud architecture platform","Software architecture for cloud data teams")),null);
  assert.equal(detectDeclaredIndustry(homepage("Tractor manufacturer","Agricultural equipment and farm machinery for farmers")),null);
});
test("industry-customer routes under composite market paths cannot vote",()=>{
  const home=homepage("Cloud consulting software","IT platforms for different business markets");
  const r=decision(home,[
    page("/markets-products/airports","International Airport","Flight departures and passenger terminals"),
    page("/industries-technology/legal","Global law firm","Legal services and litigation"),
  ]);
  assert.equal(r.decision,null);
});
test("legal software and museum merchandise are not organisational identity",()=>{
  assert.equal(detectDeclaredIndustry(homepage("Legal software for lawyers","Legal tech and legal automation platform for law firms")),null);
  assert.equal(detectDeclaredIndustry(homepage("Museum shop","Exhibition gifts and museum merchandise for visitors")),null);
});
test("failed/partial or outside-domain pages are excluded",()=>{
  const h=homepage("International Airport","Flight arrivals and passenger terminals");
  for(const x of [
    {...page("/flights","Airport flight information","Terminal arrivals and departures"),status:"blocked"},
    {...page("/flights","Airport flight information","Terminal arrivals and departures"),partialHead:true},
    {...page("/flights","Airport flight information","Terminal arrivals and departures"),url:"https://other.test/flights"},
    {...page("/flights","Airport flight information","Terminal arrivals and departures"),type:"article"},
  ])assert.equal(decision(h,[x]).decision,null);
});
test("ambiguous homepage with three independently named own pages can corroborate",()=>{
  const r=decision(homepage("Company","Welcome to our services"),[
    page("/fleet","Airport operator","Passenger terminals and arrivals"),
    page("/flights","International Airport","Flights, departures and passenger terminals"),
    page("/services","Airport services","Airlines, airport terminal and runway services"),
  ]);
  assert.equal(r.decision?.key,"airports");
  assert.equal(r.reason,"corroborated_homepage_and_pages");
});
