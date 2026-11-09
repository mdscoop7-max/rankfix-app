import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('A/B replay never invents an HTTP response for unrecorded input',()=>{
 const source=readFileSync(new URL('../scripts/testlab/ab-replay.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(source,/new Response\("not recorded", \{ status: 599/);
});
import {createNetworkTape} from '../scripts/testlab/network-tape.mjs';
test('raw replay preserves bytes, query, headers, repeated responses and transport failures',async()=>{
 let n=0;const raw=Buffer.from([0,128,255,65]);
 const recorded=createNetworkTape({mode:'record',fetcher:async()=>{
  n++;if(n===2)throw new TypeError('fetch failed',{cause:{code:'ECONNRESET'}});
  return new Response(raw,{status:n===1?503:404,headers:{'content-type':'application/octet-stream','retry-after':'7'}});
 }});
 const u='https://public.test/path?q=one';
 await recorded.fetch(u);await assert.rejects(recorded.fetch(u));await recorded.fetch(u);
 const replay=createNetworkTape({mode:'replay',tape:recorded.tape,fetcher:()=>{throw Error('network forbidden');}});
 const first=await replay.fetch(u);assert.equal(first.status,503);assert.equal(first.headers.get('retry-after'),'7');assert.deepEqual(Buffer.from(await first.arrayBuffer()),raw);
 await assert.rejects(replay.fetch(u),e=>e.cause?.code==='ECONNRESET');
 assert.equal((await replay.fetch(u)).status,404);
 await assert.rejects(replay.fetch(u),e=>e.cause?.code==='REPLAY_NOT_RECORDED');
 await assert.rejects(replay.fetch('https://public.test/path?q=two'),e=>e.cause?.code==='REPLAY_NOT_RECORDED');
 assert.equal(replay.misses.length,2);
});
test('raw replay refuses modified bytes and lossy historical projections',async()=>{
 assert.throws(()=>createNetworkTape({mode:'replay',tape:{'GET https://public.test':{status:200,body:'projection'}}}),/RAW_TAPE_REQUIRED/);
 const record=createNetworkTape({mode:'record',fetcher:async()=>new Response('real bytes')});await record.fetch('https://public.test/');
 record.tape.entries[0].bodyBase64=Buffer.from('changed').toString('base64');
 await assert.rejects(createNetworkTape({mode:'replay',tape:record.tape}).fetch('https://public.test/'),/HASH_MISMATCH/);
});
