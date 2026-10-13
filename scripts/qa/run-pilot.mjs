#!/usr/bin/env node
// Runs ONLY a disposable localhost RankFix instance. No git writes or client data.
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {SHIFTS,pickSites,validateMatrix} from './sector-matrix.mjs';
const shift=process.argv[2];
if(!SHIFTS[shift])throw Error('Use: run-pilot.mjs night|day|evening');
const BASE='http://127.0.0.1:3100';
if(process.env.PILOT_BASE_URL!==BASE)throw Error('QA must use isolated localhost:3100');
if(process.env.DATABASE_URL!=='postgresql://rankfix:rankfix-pilot@127.0.0.1:5432/rankfix_pilot')throw Error('Disposable local database is required');
const catalog=await readFile('lib/sector-catalog.ts','utf8');
validateMatrix([...catalog.matchAll(/\{key:"([^"]+)",label:/g)].map(x=>x[1]));
const at=new Date().toISOString(), chosen=pickSites(shift), output='qa-results/'+shift;
const nosSentinel={kind:'news_media (regression)',expectedSector:'news_media',url:'https://nos.nl/',country:'NL'};
const sites=shift==='evening' && !chosen.some(site=>site.url===nosSentinel.url)
  ? [...chosen,nosSentinel]
  : chosen;
await mkdir(output,{recursive:true});
const results=[];
for(const [index,site] of sites.entries()){
  const started=Date.now();let httpStatus=0,body=null,error=null;
  try{
    const response=await fetch(BASE+'/api/scan',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({url:site.url,mode:'both',language:'nl'}),
      signal:AbortSignal.timeout(240000)
    });
    httpStatus=response.status;body=await response.json().catch(()=>null);
  }catch(e){error=e instanceof Error?e.name:'NETWORK_ERROR'}
  const scanned=httpStatus===200&&body?.success===true;
  const sector=scanned?(body?.classification?.sector?.key??body?.sectorProfile?.key??null):null;
  const coverage=scanned?(body?.coverage?.coveragePercent??null):null;
  const issues=(Array.isArray(body?.checks)?body.checks:[])
    .filter(c=>c.issue_status==='FAIL'||c.issue_status==='WARNING')
    .map(c=>({rule:c.rule_id||c.key,status:c.issue_status,confidence:c.confidence}));
  const row={
    ...site,scanned,httpStatus,error:error??(scanned?null:body?.code??'SCAN_UNAVAILABLE'),
    actualSector:sector,sectorMatches:scanned&&sector===site.expectedSector,
    overallScore:scanned?body.overallScore:null,coveragePercent:coverage,
    provisional:scanned?(body?.scoreModel?.provisional ?? (coverage !== null && coverage < 70)):null,
    pageType:scanned?(body?.classification?.pageType?.type??null):null,
    issues,durationSeconds:Math.round((Date.now()-started)/1000)
  };
  results.push(row);
  await writeFile(output+'/results.json',JSON.stringify({shift,runAt:at,sha:process.env.GITHUB_SHA||null,results},null,2));
  console.log(shift+' '+(index+1)+'/'+sites.length+' '+site.expectedSector+' HTTP '+httpStatus+' '+(scanned?'scanned':'blocked/error')+' '+row.durationSeconds+'s');
  if(index<sites.length-1)await new Promise(r=>setTimeout(r,15000));
}
const lines=['# RankFix '+shift+' pilot — '+at,'',
  'Actual localhost RankFix scans with a disposable database. Site blocks are not SEO defects.','',
  '| Expected sector | URL | Result | Detected | Score | Coverage |',
  '|---|---|---|---|---:|---:|'];
for(const r of results){
  lines.push('| '+r.expectedSector+' | '+r.url+' | '+(r.scanned?(r.sectorMatches?'OK':'REVIEW MISMATCH'):'UNAVAILABLE')+
    ' | '+(r.actualSector||'—')+' | '+(r.overallScore??'—')+' | '+(r.coveragePercent===null?'—':r.coveragePercent+'%')+' |');
}
lines.push('','## Findings and proposed generic fixes');
for(const r of results){
  if(!r.scanned){lines.push('- '+r.url+': not scanned (HTTP '+r.httpStatus+', '+r.error+'); do not assign an SEO grade.');continue}
  if(!r.sectorMatches)lines.push('- '+r.url+': expected '+r.expectedSector+', got '+(r.actualSector||'unknown')+
    '. Proposed fix: review declared site identity priority and independent sector evidence; add regression fixture.');
  if(r.coveragePercent!==null&&r.coveragePercent<70)lines.push('- '+r.url+': coverage '+r.coveragePercent+
    '%. Proposed fix: label score provisional and avoid false certainty.');
  if(r.issues.length)lines.push('- '+r.url+': '+r.issues.map(x=>x.rule+' ('+x.status+')').join(', ')+
    '. Proposed fix: inspect raw evidence before accepting a rule fault.');
}
lines.push('','No git commits, code fixes, merges or production deployments. Artifacts expire on the workflow retention schedule.');
await writeFile(output+'/report.md',lines.join('\n')+'\n');
console.log('Completed '+shift+': '+results.filter(r=>r.scanned).length+'/'+results.length+' successful scans');
