import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {commerceApplicability} from '../lib/commerce-applicability.ts';
import {readProcessResult} from './helpers/process-result.mjs';
const base={confirmed:false,primaryNonCommerceIdentity:true,commerceHints:true,thinShell:false,marketSelector:false,auditedRepresentativePages:4};

test('unexamined retail evidence is uncertainty even when a service identity is established',()=>{
 assert.deepEqual(commerceApplicability({...base,retailEvidenceIncomplete:true}),{state:'unconfirmed',reason:'low_coverage'});
 assert.equal(commerceApplicability({...base,retailEvidenceIncomplete:true,confirmed:true}).state,'confirmed','confirmed positive purchase evidence wins');
 assert.equal(commerceApplicability({...base,retailEvidenceIncomplete:false}).state,'absent','service without unexamined retail evidence retains its assessment');
 assert.deepEqual(commerceApplicability({...base,retailEvidenceIncomplete:true,refusedRetailPages:2}),{state:'unconfirmed',reason:'sample_refused'},'access refusal retains its specific reason');
});

test('real route agrees about unrendered H1 and never turns unexamined shop pages into absence',()=>{
 const out=spawnSync(process.execPath,['--experimental-strip-types','--no-warnings','--import','./tests/scan-matrix/register.mjs','tests/scan-matrix/run-incomplete-render.mjs'],{encoding:'utf8',cwd:new URL('../',import.meta.url),timeout:180000});
 const r=readProcessResult(out,'INCOMPLETE_RENDER_RESULT ','incomplete rendering');
 for(const x of Object.values(r)){assert.equal(x.success,true,JSON.stringify(x));assert.equal(x.sector,'optician','commerce uncertainty must not change the primary activity');}
 assert.equal(r.scripted.h1.status,'unable_to_confirm');
 assert.equal(r.scripted.h1.issue_status,'UNABLE_TO_CONFIRM');
 assert.equal(r.scripted.h1.points,0);
 assert.equal(r.scripted.sample.status,'UNABLE_TO_CONFIRM');
 assert.equal(r.scripted.commerce.state,'unconfirmed');
 for(const c of r.scripted.retailChecks)assert.equal(c.status,'unable_to_confirm',c.key+': '+c.message);
 assert.equal(r.positive.h1.status,'pass','positive raw H1 evidence is retained');
 assert.equal(r.positive.h1.points,8);
 assert.equal(r.static.h1.status,'warning','complete static absence remains a warning');
 assert.equal(r.static.sample.status,'WARNING');
 assert.equal(r.static.commerce.state,'absent','ordinary service remains non-retail');
 assert.equal(r.rendered.rendered,true);
 assert.equal(r.rendered.h1.status,'warning','rendered absence remains a proven observation');
});
