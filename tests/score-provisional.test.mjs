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
