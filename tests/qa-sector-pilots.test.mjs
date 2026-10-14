import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {SHIFTS,pickSites,validateMatrix} from '../scripts/qa/sector-matrix.mjs';
test('all 57 RankFix sectors assigned exactly once',async()=>{
  const content=await readFile('lib/sector-catalog.ts','utf8');
  const actual=[...content.matchAll(/\{key:"([^"]+)",label:/g)].map(x=>x[1]);
  assert.equal(actual.length,57);
  assert.equal(validateMatrix(actual),true);
});
test('each shift covers its own 19 sectors in seven days',()=>{
  for(const shift of Object.keys(SHIFTS)){
    const covered=new Set();
    for(let day=20940;day<20947;day++){
      const sites=pickSites(shift,day);
      assert.equal(sites.length,3);
      for(const s of sites){
        assert.ok(SHIFTS[shift].some(row=>row[0]===s.expectedSector));
        covered.add(s.expectedSector);
      }
    }
    assert.equal(covered.size,19);
  }
});
test('QA fixture URLs all safe HTTPS',()=>{
  for(const r of Object.values(SHIFTS).flat()){
    const u=new URL(r[1]);assert.equal(u.protocol,'https:');
    assert.equal(u.username,'');assert.equal(u.password,'');
  }
});

import {execFileSync} from 'node:child_process';
test('QA runner is valid JavaScript on Node', () => {
  assert.doesNotThrow(() => execFileSync(process.execPath, ['--check', 'scripts/qa/run-pilot.mjs']));
});
