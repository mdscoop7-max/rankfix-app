#!/usr/bin/env node
// Operator tool using the existing crawler and site-audit rules. No network
// unless explicitly enabled; resumable evidence stays in operator-owned files.
import {readFile,writeFile,rename,open,unlink} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
export async function runInventoryBatch({url,mode='DEEP',statePath,outPath,maxPages=100,maxRequests=120,batchPages=10,maxDurationMs=30000}) {
 if(resolve(statePath)===resolve(outPath))throw new Error('State and report must use different files.');
 const {crawlSite}=await import('../lib/crawler.ts');
 const {auditCrawlResult}=await import('../lib/site-audit.ts');
 const lock=await open(statePath+'.lock','wx',0o600);
 try {
  let checkpoint;
  try {checkpoint=JSON.parse(await readFile(statePath,'utf8'));} catch(error) {if(error.code!=='ENOENT')throw error;}
  const result=await crawlSite(url,mode,{checkpoint,maxPages,maxRequests,batchPages,maxDurationMs});
  const audit=auditCrawlResult(result);
  const suffix='.tmp-'+randomUUID();
  await writeFile(outPath+suffix,JSON.stringify({audit,coverage:result.coverage,urls:result.checkpoint.entries},null,2),{mode:0o600,flag:"wx"});
  await writeFile(statePath+suffix,JSON.stringify(result.checkpoint),{mode:0o600,flag:"wx"});
  await rename(outPath+suffix,outPath);
  await rename(statePath+suffix,statePath);
  return result.coverage;
 } finally {await lock.close();await unlink(statePath+'.lock');}
}
if(import.meta.url===pathToFileURL(process.argv[1]||'').href) {
 const args=process.argv.slice(2);const opt=(k,f)=>{const i=args.indexOf('--'+k);return i<0?f:args[i+1];};
 if(!args.includes('--allow-network')) throw new Error('Explicit --allow-network required. No scan was started.');
 const url=opt('url');if(!url||!opt('state')||!opt('out'))throw new Error('Required: --url, --state, --out. Resume with the same URL/mode and state file.');
 if(resolve(opt('state'))===resolve(opt('out')))throw new Error('State and report must use different files.');
 const result=await runInventoryBatch({url,mode:opt('mode','DEEP'),statePath:resolve(opt('state')),outPath:resolve(opt('out')),maxPages:Number(opt('max-pages',100)),maxRequests:Number(opt('max-requests',120)),batchPages:Number(opt('batch-pages',10)),maxDurationMs:Number(opt('max-ms',30000))});
 console.log(JSON.stringify(result,null,2));
}
