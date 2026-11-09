import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {classifyNonContentPage} from '../lib/page-gate.ts';
import {linkOutcome} from '../lib/link-status.ts';
import {readProcessResult} from './helpers/process-result.mjs';

test('response evidence, never a redirect path, determines whether a destination is missing',()=>{
 assert.equal(linkOutcome({url:'https://site.test/help',finalUrl:'https://site.test/support/error',status:200,error:false,softNotFound:false}),'ok');
 assert.equal(linkOutcome({url:'https://site.test/404',finalUrl:'https://site.test/404',status:200,error:false,softNotFound:true}),'missing');
});
test('one failed connection followed by one HTTP 500 is not two server-error responses',()=>{
 assert.equal(linkOutcome({url:'https://site.test/a',status:500,error:false,attempts:2,measurements:[{status:null,error:true},{status:500,error:false}]}),'temporary');
});
test('real route: probe and sample apply the same content and measurement rules',()=>{
 const out=spawnSync(process.execPath,['--experimental-strip-types','--no-warnings','--import','./tests/scan-matrix/register.mjs','tests/scan-matrix/run-evidence-integrity.mjs'],{encoding:'utf8',cwd:new URL('../',import.meta.url),timeout:180000});
 const r=readProcessResult(out,'INTEGRITY_RESULT ','response integrity route');
 assert.equal(r.sampleChallenge?.nonContent,'challenge','sample must inspect a refused response before returning');
 assert.notEqual(r.sampleChallenge?.status,'audited');
 assert.notEqual(r.links['/sample-challenge']?.outcome,'missing','challenge HTTP 404 must never become a broken link');
 assert.equal(r.links['/unstable']?.outcome,'temporary');
 assert.equal(r.links['/soft-server']?.outcome,'temporary','an error page is not necessarily a not-found page');
 assert.equal(r.links['/missing']?.outcome,'missing','real missing pages remain actionable');
});

test('a maintenance service document is not a website-maintenance response based on its bare title',()=>{
 const text='Tekst over banden en onderhoud. '.repeat(30);
 assert.equal(classifyNonContentPage({title:'Onderhoud',text,words:150}),null);
 assert.equal(classifyNonContentPage({title:'Website in onderhoud',text:'We zijn zo snel mogelijk weer terug.'})?.kind,'maintenance');
});
