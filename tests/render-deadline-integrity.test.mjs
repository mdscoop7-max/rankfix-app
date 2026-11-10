import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readProcessResult} from './helpers/process-result.mjs';
// Controlled browser/clock regression. No recorded website data or accuracy claim.
test('expired render deadline must not start a browser promise that later rejects unhandled',()=>{
 const source=`
 import {registerHooks} from 'node:module';
 import {EventEmitter} from 'node:events';
 const rendererUrl=new URL('./lib/headless-render.ts',import.meta.url).href;
 const safeUrl=new URL('./lib/safe-fetch.ts',import.meta.url).href;
 registerHooks({resolve(spec,ctx,next){
  if(ctx.parentURL===rendererUrl&&spec==='@/lib/safe-fetch')return{url:safeUrl,shortCircuit:true};
  if(ctx.parentURL===rendererUrl&&spec==='@/lib/render-limits')return{url:new URL('./lib/render-limits.ts',import.meta.url).href,shortCircuit:true};
  if(spec==='puppeteer-core')return{url:'data:text/javascript,export default globalThis.__DEADLINE_BROWSER',shortCircuit:true};
  return next(spec,ctx);
 },load(url,ctx,next){if(url===safeUrl)return{format:'module',source:'export function validatePublicHttpUrl(v){return new URL(v)} export async function assertPublicDns(){}',shortCircuit:true};return next(url,ctx);}});
 process.env.PUPPETEER_EXECUTABLE_PATH=process.execPath;delete process.env.VERCEL;
 let now=0,contentCalls=0,closed=0;const unhandled=[];const realNow=Date.now;Date.now=()=>now;
 process.on('unhandledRejection',e=>unhandled.push(String(e.message)));
 class Page extends EventEmitter{
  async setUserAgent(){}async setRequestInterception(){}setDefaultNavigationTimeout(){} mainFrame(){return this;}
  async goto(){}async waitForNetworkIdle(){}
  url(){now=100000;return 'https://deadline.test/';}
  content(){contentCalls++;return new Promise((_,reject)=>setImmediate(()=>reject(new Error('Target closed'))));}
  async evaluate(){return {};}
 }
 globalThis.__DEADLINE_BROWSER={launch:async()=>({userAgent:async()=> 'Chrome',newPage:async()=>new Page(),close:async()=>{closed++;}})};
 const {renderPublicPage}=await import(rendererUrl);let error=null;
 try{await renderPublicPage('https://deadline.test/',12000,undefined,{mode:'structured_data',settleMs:0});}catch(e){error=e.message;}
 Date.now=realNow;await new Promise(resolve=>setTimeout(resolve,30));
 console.log('DEADLINE_RESULT '+JSON.stringify({error,contentCalls,unhandled,closed}));
 `;
 const p=spawnSync(process.execPath,['--experimental-strip-types','--no-warnings','--input-type=module','-e',source],{cwd:new URL('../',import.meta.url),encoding:'utf8',timeout:20000});
 const r=readProcessResult(p,'DEADLINE_RESULT ','real renderer deadline');
 assert.equal(r.error,'RENDER_TIMEOUT');assert.equal(r.closed,1);
 assert.equal(r.contentCalls,0,'expired deadline must be checked before starting page.content');
 assert.deepEqual(r.unhandled,[]);
});
