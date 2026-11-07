import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {assertScanEgressAvailable, isScanEgressFailure, SCAN_EGRESS_ERROR} from '../lib/scan-egress.ts';
import {safePublicFetch} from '../lib/safe-fetch.ts';
import {fetchFailureCode, classifyScanOutcome} from '../lib/scan-attempts.ts';
import {classifyScanInfrastructureFailure} from '../lib/scan-runtime-errors.ts';
import {attributeIncident} from '../lib/scan-incident.ts';
import {classifyScanAnswer, stopsRun} from '../lib/testlab-outcome.mjs';
import {readProcessResult} from './helpers/process-result.mjs';

const failure='upstream connect error or disconnect/reset before headers. reset reason: remote connection failure, transport failure reason: immediate connect error: Invalid argument|remote address:envoy://cloudflare_https_tunnel/';
test('only the evidenced scan-tunnel signature is infrastructure, never a generic website Envoy error',()=>{
 assert.equal(isScanEgressFailure(503,failure),true);
 for(const [status,body] of [[200,failure],[429,failure],[503,'Service Unavailable'],[503,'upstream connect error or disconnect/reset before headers. reset reason: connection failure'],[503,'<title>Just a moment</title>']])assert.equal(isScanEgressFailure(status,body),false);
});
test('safe fetch rejects the proxy outage before reporting a website HTTP status',async t=>{
 const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});let calls=0;
 globalThis.fetch=async()=>{calls++;return new Response(failure,{status:503,headers:{'content-type':'text/plain','server':'envoy'}});};
 await assert.rejects(safePublicFetch('https://203.0.113.30/'),{message:SCAN_EGRESS_ERROR});
 assert.equal(calls,1);
});
test('ordinary plaintext 503 responses retain their exact readable body, headers and object identity',async t=>{
 const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});
 const body='Maintenance: retry later. '.repeat(10000);
 const response=new Response(body,{status:503,headers:{'content-type':'text/plain','server':'envoy','retry-after':'120'}});
 globalThis.fetch=async()=>response;
 const result=await safePublicFetch('https://203.0.113.30/');
 assert.equal(result.response,response);assert.equal(result.response.headers.get('retry-after'),'120');assert.equal(await result.response.text(),body);
});
test('a stalled 503 signature probe stays bounded and tee cancellation does not deadlock the caller',{timeout:5000},async()=>{
 const response=new Response(new ReadableStream({start(){}}),{status:503,headers:{'content-type':'text/plain'}});
 const start=Date.now();await assertScanEgressAvailable(response);await response.body.cancel();
 assert.ok(Date.now()-start<4000);
});
test('the outage is retryable RankFix infrastructure in persistence, incident and TestLab, without charging',()=>{
 const error=new Error(SCAN_EGRESS_ERROR);assert.equal(fetchFailureCode(error),SCAN_EGRESS_ERROR);
 assert.equal(classifyScanOutcome(503,SCAN_EGRESS_ERROR),'infrastructure');
 assert.equal(attributeIncident(503,SCAN_EGRESS_ERROR),'rankfix_infrastructure');
 const answer=classifyScanInfrastructureFailure(error);assert.equal(answer.retryable,true);assert.equal(answer.charged,false);
 assert.equal(stopsRun(classifyScanAnswer({ok:false,status:503,data:{code:SCAN_EGRESS_ERROR,incident:{attribution:'rankfix_infrastructure'}}})),true);
 for(const message of Object.values(answer.message))assert.ok(!message.includes('envoy://'));
});
for(const mode of ['primary','sample'])test(`real scan route: ${mode} proxy outage never becomes a proven website or broken-link fault`,()=>{
 const source=`
  const mode=${JSON.stringify(mode)},failure=${JSON.stringify(failure)};
  const html='<html lang="en"><head><title>Advice for small businesses</title><meta name="description" content="Independent advice for small businesses and entrepreneurs"></head><body><h1>Advice for small businesses</h1><p>'+ 'We support businesses with advice. '.repeat(80)+'</p><a href="/contact">Contact</a></body></html>';
  globalThis.fetch=async input=>{const u=new URL(typeof input==='string'?input:input.url);return mode==='sample'&&u.pathname==='/'?new Response(html,{status:200,headers:{'content-type':'text/html'}}):new Response(failure,{status:503,headers:{'content-type':'text/plain','server':'envoy'}});};
  globalThis.__RF_RENDER=async()=>{throw new Error('RENDER_UNAVAILABLE_IN_TEST');};
  const {POST}=await import(${JSON.stringify(new URL('../app/api/scan/route.ts',import.meta.url).href)});console.info=console.warn=console.error=()=>{};
  const res=await POST(new Request('http://localhost/api/scan',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url:'https://scan-egress.test/',mode:'both',language:'en'})}));const data=await res.json();
  console.log('EGRESS_RESULT '+JSON.stringify({status:res.status,code:data.code,success:data.success,charged:data.charged,retryable:data.retryable,incident:data.incident,score:data.overallScore,broken:data.seo?.checks?.find(c=>c.key==='broken_links')}));process.exit(0);
 `;
 const out=spawnSync(process.execPath,['--experimental-strip-types','--no-warnings','--import','./tests/scan-matrix/register.mjs','--input-type=module','-e',source],{cwd:fileURLToPath(new URL('../',import.meta.url)),env:{...process.env,NODE_ENV:'development',DATABASE_URL:'',RF_REAL_DB:'',RF_LOCAL_QA_TOKEN:''},encoding:'utf8',timeout:20000});
 const row=readProcessResult(out,'EGRESS_RESULT ',mode);
 if(mode==='primary'){
  assert.equal(row.status,503);assert.equal(row.code,SCAN_EGRESS_ERROR);assert.equal(row.charged,false);assert.equal(row.retryable,true);assert.equal(row.score,undefined);
  assert.equal(row.incident.attribution,'rankfix_infrastructure');assert.equal(row.incident.originHttpStatus,null);assert.equal(row.incident.retrySameSite,true);
 }else{assert.equal(row.status,200);assert.equal(row.success,true);assert.equal(row.broken.status,'unable_to_confirm');}
});
