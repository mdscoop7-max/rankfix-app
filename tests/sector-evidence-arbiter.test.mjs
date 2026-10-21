import test from "node:test";
import assert from "node:assert/strict";
import { inferSectorFromIndependentSources } from "../lib/sector-evidence-arbiter.ts";

const definitions = [
  { sector:"events_culture", label:"Evenementen & Cultuur", primary:/\b(?:museum|theater|schouwburg|expositiecentrum)\b/i, support:[/\b(?:tentoonstelling|expositie|tickets|programma|voorstelling|agenda)\b/i], modules:["events_culture"] },
  { sector:"hospitality", label:"Horeca", primary:/\b(?:restaurant|hotel)\b/i, support:[/\b(?:menu|reserveren|kamers|overnachten)\b/i], modules:["hospitality"] },
  { sector:"saas_b2b", label:"SaaS", primary:/\b(?:saas|softwareplatform)\b/i, support:[/\b(?:integratie|dashboard|demo)\b/i], modules:["saas_b2b"] },
];

test("identical sector across different first-party title and heading structures", () => {
  const variants = [
    {title:"Het museum",description:"Kom de tentoonstelling bekijken",h1s:["Welkom bij het museum"]},
    {title:"Kunst en verhalen",description:"Een museum voor alle bezoekers",h1s:["Ontdek de collectie"],navLabels:["Tentoonstelling","Tickets"]},
    {title:"Cultureel bezoek",h1s:["Museum van kunst en geschiedenis"],navLabels:["Agenda","Tickets"]},
  ];
  for(const input of variants) {
    const id = inferSectorFromIndependentSources(input,definitions);
    assert.equal(id?.sector,"events_culture",JSON.stringify(input));
    assert.equal(id?.confidence,"medium");
    assert.ok(id.confidenceScore < 80);
  }
});

test("a single repeated phrase in the metadata is not independent corroboration",()=>{
  assert.equal(inferSectorFromIndependentSources({
    title:"museum museum museum",description:"Welkom",h1s:["Hallo"],
    navLabels:["Contact"],h2s:["Bezoek ons"]
  },definitions),null);
});

test("customer sector in a software case study does not hijack primary sector",()=>{
  const result=inferSectorFromIndependentSources({
    title:"Softwareplatform voor teams",description:"Wij leveren SaaS aan hotels en restaurants",
    h1s:["Ons softwareplatform"],navLabels:["Demo","Dashboard"],
  },definitions);
  assert.equal(result,null);
});

test("equally plausible conflicting identities abstain",()=>{
  const result=inferSectorFromIndependentSources({
    title:"Museum en restaurant",description:"Het museum heeft een restaurant",
    h1s:["Museum en restaurant"],navLabels:["Tickets","Menu"],
  },definitions);
  assert.equal(result,null);
});

test("no match on a single navigation item alone",()=>{
  assert.equal(inferSectorFromIndependentSources({
    title:"Over ons", description:"Welkom",navLabels:["Museum","Tickets"]
  },definitions),null);
});
