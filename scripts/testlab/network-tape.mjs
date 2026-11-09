// QA recording only. Never synthesises website content or HTTP failures.
import {createHash} from 'node:crypto';
export const TAPE_FORMAT='rankfix-network-tape-v1';
export const NOT_RECORDED='REPLAY_NOT_RECORDED';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const keyOf=(input,init={})=>{
 const req=new Request(input,init);
 // All caller-supplied headers matter, including cookies and request variants.
 return JSON.stringify([req.method,req.url,[...req.headers].sort(([a],[b])=>a.localeCompare(b))]);
};
export function createNetworkTape({mode,tape={format:TAPE_FORMAT,entries:[]},fetcher=globalThis.fetch}){
 if(tape.format!==TAPE_FORMAT||!Array.isArray(tape.entries))throw Error('RAW_TAPE_REQUIRED: legacy projections cannot serve as strict input');
 const positions=new Map(),misses=[],captureErrors=[];
 const queues=new Map();
 for(const e of tape.entries){if(!queues.has(e.key))queues.set(e.key,[]);queues.get(e.key).push(e);}
 const fetch=async(input,init={})=>{
  const key=keyOf(input,init);
  if(!['GET','HEAD'].includes(new Request(input,init).method))throw Error('QA_TAPE_READ_ONLY_METHOD_REQUIRED');
  if(mode==='replay'){
   const index=positions.get(key)||0,e=queues.get(key)?.[index];positions.set(key,index+1);
   if(!e){misses.push(key);throw new TypeError('fetch failed',{cause:{code:NOT_RECORDED,message:key}});}
   await new Promise(resolve=>setTimeout(resolve,e.elapsedMs||0));
   if(e.captureError){captureErrors.push({key,error:e.captureError});throw Error("INCOMPLETE_RAW_RECORDING");}
   if(e.error)throw Object.assign(new TypeError(e.error.message),{cause:e.error.cause});
   const bytes=Buffer.from(e.bodyBase64,'base64');
   if(sha(bytes)!==e.sha256)throw Error('RAW_TAPE_HASH_MISMATCH');
   // Measured network delay is replayed above, including failed requests.
   return new Response([204,205,304].includes(e.status)?null:bytes,{status:e.status,headers:e.headers});
  }
  if(mode!=='record')throw Error('UNKNOWN_TAPE_MODE');
  const start=Date.now(),entry={key,url:new Request(input,init).url,at:new Date().toISOString()};
  // Reserve before awaiting: repeated concurrent requests retain invocation order.
  tape.entries.push(entry);
  let response;
  try{response=await fetcher(input,init);}catch(error){entry.elapsedMs=Date.now()-start;entry.error={message:String(error.message),cause:{code:error.cause?.code||null,message:String(error.cause?.message||'')}};throw error;}
  entry.status=response.status;entry.headers=[...response.headers];
  if(typeof response.headers.getSetCookie==='function'){
   entry.headers=entry.headers.filter(([k])=>k!=='set-cookie');
   for(const cookie of response.headers.getSetCookie())entry.headers.push(['set-cookie',cookie]);
  }
  try{const bytes=Buffer.from(await response.clone().arrayBuffer());entry.bodyBase64=bytes.toString('base64');entry.sha256=sha(bytes);}catch(error){captureErrors.push({key,error:String(error)});entry.captureError=String(error);}
  entry.elapsedMs=Date.now()-start;
  return response;
 };
 return {fetch,tape,misses,captureErrors};
}
