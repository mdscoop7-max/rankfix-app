#!/usr/bin/env node
// Assess existing files only. Never starts a scan or fetches a URL.
import {readFile,writeFile,realpath} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {assessReportQuality} from '../../lib/report-quality-gate.mjs';
const args=process.argv.slice(2),opt=k=>{const i=args.indexOf('--'+k);return i<0?null:args[i+1]};
for(const flag of ['manifest','baseline','candidate','artifacts','out'])if(!opt(flag))throw new Error('Required --'+flag);
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const manifest=await read(opt('manifest')),baseline=await read(opt('baseline')),candidate=await read(opt('candidate'));
const rawManifest={...manifest};delete rawManifest.planSha256;
const planSha256=createHash('sha256').update(JSON.stringify(rawManifest)).digest('hex');
if(manifest.planSha256!==planSha256)throw new Error('Manifest hash mismatch; the reviewed plan changed.');
const root=await realpath(resolve(opt('artifacts'))),verified=[];
for(const input of manifest.artifacts||[]){
 try{
  if(!input.file?.endsWith('.json'))continue;
  const path=await realpath(resolve(root,input.file));if(!path.startsWith(root+sep))continue;
  const hash=createHash('sha256').update(await readFile(path)).digest('hex');if(hash===input.sha256)verified.push(hash);
 }catch{ /* A missing audit remains missing in the assessment, never a pass. */ }
}
const result=assessReportQuality(manifest,baseline,candidate,verified);
await writeFile(opt('out'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({qualityScore:result.qualityScore,accepted:result.accepted,blocked:result.blocked}));
process.exitCode=result.accepted?0:1;
