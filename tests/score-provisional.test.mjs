import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { provisionalScoreMessage } from "../lib/score-provisional.ts";

test("low evidence coverage is labelled provisional, not a definitive A",()=>{
  const label=provisionalScoreMessage({scoreModel:{provisional:true,range:{low:57,high:98}},coverage:{coveragePercent:59},summary:{unableToConfirm:24}},"nl");
  assert.match(label,/Voorlopige score/);
  assert.match(label,/59%/);
  assert.match(label,/24/);
  assert.match(label,/57–98/);
  assert.match(label,/niet definitief/);
});
test("high coverage scores need no provisional warning",()=>{
  assert.equal(provisionalScoreMessage({scoreModel:{provisional:false},coverage:{coveragePercent:91}},"nl"),null);
  assert.equal(provisionalScoreMessage(null,"nl"),null);
});
test("provisional warning is visible in free scan and saved audit views",async()=>{
  for(const path of ["app/[locale]/scan/scan-client.tsx","app/dashboard/audit/[id]/page.tsx","app/dashboard/audit/[id]/report/page.tsx"]){
    const source=await readFile(new URL("../"+path,import.meta.url),"utf8");
    assert.match(source,/provisionalScoreMessage\(/);
  }
});

test("country selection portal displays a scope-specific provisional warning",()=>{
  const report={classification:{websiteType:"Landkeuzeportaal",sector:{key:"market_selector"}},
    scoreModel:{provisional:true,range:{low:41,high:89}},
    coverage:{coveragePercent:51},summary:{unableToConfirm:28}};
  const dutch=provisionalScoreMessage(report,"nl");
  assert.match(dutch,/landkeuzeportaal/);
  assert.match(dutch,/niet de landspecifieke webshop/);
  assert.match(dutch,/51%/);
  assert.match(provisionalScoreMessage(report,"en"),/country selector/);
  assert.doesNotMatch(provisionalScoreMessage({scoreModel:{provisional:true}},"nl"),/landkeuzeportaal/);
});
