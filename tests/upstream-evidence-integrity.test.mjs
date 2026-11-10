import test from 'node:test';
import assert from 'node:assert/strict';
import {assertScanEgressAvailable,isScanEgressFailure} from '../lib/scan-egress.ts';
import {fetchFailureCode} from '../lib/scan-attempts.ts';
import {attributeIncident} from '../lib/scan-incident.ts';
// Exact public transport error observed across independent destinations on 9 Nov.
const body='upstream connect error or disconnect/reset before headers. reset reason: remote connection failure';
test('an upstream connection refusal is not evidence that the target website served an error',async()=>{
 assert.equal(isScanEgressFailure(503,body),false,'generic gateway wording does not prove a RankFix-specific outage');
 await assert.rejects(assertScanEgressAvailable(new Response(body,{status:503,headers:{'content-type':'text/plain'}})),e=>{
  assert.equal(e.message,'UPSTREAM_RESPONSE_UNCONFIRMED');
  assert.equal(e.cause.observedHttpStatus,503);
  assert.equal(fetchFailureCode(e),'FETCH_UPSTREAM_UNCONFIRMED');
  assert.equal(attributeIncident(502,fetchFailureCode(e)),'network');return true;
 });
});
test('ordinary origin maintenance and server responses retain their original status and body',async()=>{
 const r=new Response('Maintenance: please retry later',{status:503,headers:{'content-type':'text/plain','retry-after':'60'}});
 await assertScanEgressAvailable(r);assert.equal(r.status,503);assert.equal(await r.text(),'Maintenance: please retry later');
});
