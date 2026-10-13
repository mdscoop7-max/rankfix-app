#!/usr/bin/env node
// Runs ONLY a disposable localhost RankFix instance. No git writes or client data.
import {mkdir,writeFile,readFile,appendFile} from 'node:fs/promises';
import {SHIFTS,pickSites,validateMatrix} from './sector-matrix.mjs';
import {assessPilotResult} from './quality-gate.mjs';
const shift=process.argv[2];
if(!SHIFTS[shift])throw Error('Use: run-pilot.mjs night|day|evening');
const BASE='http://127.0.0.1:3100';
if(process.env.PILOT_BASE_URL!==BASE)throw Error('QA must use isolated localhost:3100');
if(process.env.DATABASE_URL!=='postgresql://rankfix:rankfix-pilot@127.0.0.1:5432/rankfix_pilot')throw Error('Disposable local database is required');
const catalog=await readFile('lib/sector-catalog.ts','utf8');
validateMatrix([...catalog.matchAll(/\{key:"([^"]+)",label:/g)].map(x=>x[1]));
const at=new Date().toISOString(), chosen=pickSites(shift), output='qa-results/'+shift;
const newsRegressionSites=[
  {kind:'news_media (NOS regression)',expectedSector:'news_media',url:'https://nos.nl/',country:'NL'},
  {kind:'news_media (BBC regression)',expectedSector:'news_media',url:'https://www.bbc.com/news',country:'GB'},
  {kind:'news_media (CNN regression)',expectedSector:'news_media',url:'https://www.cnn.com/',country:'US'},
  {kind:'news_media (Spiegel regression)',expectedSector:'news_media',url:'https://www.spiegel.de/',country:'DE'},
  {kind:'news_media (Le Monde regression)',expectedSector:'news_media',url:'https://www.lemonde.fr/',country:'FR'}
];
const sites=shift==='evening'
  ? [...chosen,...newsRegressionSites.filter(s=>!chosen.some(c=>c.url===s.url))]
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
  // Watch for the broken CNN template expression being accepted as a valid H1.
  // This is a QA observation; it does not rewrite customer-facing scores.
  const checks=Array.isArray(body?.checks)?body.checks:[];
  const headingEvidence=checks.filter(c=>/h1|heading/i.test(String(c.rule_id||c.key||'')))
    .map(c=>JSON.stringify(c)).join(' ').slice(0,4000);
  const suspiciousHeading=scanned && (/componentVariation|headline_underscored|null\s*!=|p\(e,/.test(headingEvidence));
  const verdict=assessPilotResult({site,httpStatus,body,error:error??body?.code});
  const row={
    ...site,scanned,httpStatus,error:error??(scanned?null:body?.code??'SCAN_UNAVAILABLE'),
    actualSector:sector,sectorMatches:scanned&&sector===site.expectedSector,
    overallScore:scanned?body.overallScore:null,coveragePercent:coverage,
    provisional:scanned?(body?.scoreModel?.provisional ?? (coverage !== null && coverage < 70)):null,
    pageType:scanned?(body?.classification?.pageType?.type??null):null,
    issues,suspiciousHeading,pilotVerdict:verdict.state,qaBlockers:verdict.blockers,qaNotices:verdict.notices,
    scoreExplanation:scanned?body?.scoreModel?.headline??null:null,
    durationSeconds:Math.round((Date.now()-started)/1000)
  };
  results.push(row);
  await writeFile(output+'/results.json',JSON.stringify({shift,runAt:at,sha:process.env.GITHUB_SHA||null,results},null,2));
  console.log(shift+' '+(index+1)+'/'+sites.length+' '+site.expectedSector+' HTTP '+httpStatus+' '+verdict.state.toUpperCase()+' '+row.durationSeconds+'s');
  for(const blocker of verdict.blockers) console.error('QA BLOCKER '+site.url+' '+blocker.code+': '+blocker.details);
  if(index<sites.length-1)await new Promise(r=>setTimeout(r,15000));
}
const lines=['# RankFix '+shift+' pilot — '+at,'',
  'Actual localhost RankFix scans with a disposable database. Site blocks are not SEO defects.','',
  '| Expected sector | URL | Result | Detected | Score | Coverage |',
  '|---|---|---|---|---:|---:|'];
for(const r of results){
  lines.push('| '+r.expectedSector+' | '+r.url+' | '+r.pilotVerdict.toUpperCase() +
    ' | '+(r.actualSector||'—')+' | '+(r.overallScore??'—')+' | '+(r.coveragePercent===null?'—':r.coveragePercent+'%')+' |');
}
lines.push('','## Findings and proposed generic fixes');
for(const r of results){
  for(const blocker of r.qaBlockers)lines.push('- **QA BLOCKER** '+r.url+': '+blocker.code+' — '+blocker.details);
  if(!r.scanned){lines.push('- '+r.url+': not scanned (HTTP '+r.httpStatus+', '+r.error+'); do not assign an SEO grade or release approval.');continue}
  if(r.suspiciousHeading)lines.push('- '+r.url+': suspect JavaScript/template source was present in heading checks. Proposed fix: reject template code as a valid H1; add a CNN regression test.');
  if(!r.sectorMatches)lines.push('- '+r.url+': expected '+r.expectedSector+', got '+(r.actualSector||'unknown')+
    '. Proposed fix: review declared site identity priority and independent sector evidence; add regression fixture.');
  if(r.coveragePercent!==null&&r.coveragePercent<70)lines.push('- '+r.url+': coverage '+r.coveragePercent+
    '%. Proposed fix: label score provisional and avoid false certainty.');
  if(r.issues.length)lines.push('- '+r.url+': '+r.issues.map(x=>x.rule+' ('+x.status+')').join(', ')+
    '. Proposed fix: inspect raw evidence before accepting a rule fault.');
}
lines.push('','## International news regression checklist',
  '- CNN: H1 must be human-readable, never unrendered JavaScript/Handlebars; do not award a heading pass to template code.',
  '- BBC: H1 rule and heading-structure narrative must agree on the same DOM snapshot.',
  '- Der Spiegel: booking / lead_conversion modules must only activate with strong functional evidence, not incidental subscription or newsletter words.',
  '- Le Monde: article/product schema relevance and reciprocal hreflang must be verified using direct evidence before applying warnings.',
  '- NOS and all four international sites: classify as news_media and apply news_media rules; other modules require independent proof.',
  '- Mark missing/blocked/partially rendered evidence unable-to-confirm rather than pass/fail; report coverage and provisional scores.',
  '- Fail a future release gate on confirmed sector regression or false-positive QA assertions, but never automatically patch code or deploy.',
  '','No git commits, code fixes, merges or production deployments. Artifacts expire on the workflow retention schedule.');
const passed=results.filter(r=>r.pilotVerdict==='pass').length;
const unavailable=results.filter(r=>r.pilotVerdict==='unavailable').length;
const review=results.filter(r=>r.pilotVerdict==='review').length;
lines.push('','## Strict release decision','',
  '**'+(passed===results.length?'READY':'NOT READY')+'** — '+passed+'/'+results.length+' validated, '+review+' need correction, '+unavailable+' unavailable.',
  'An unavailable site is not a RankFix defect, but it cannot count as passing. QA stays red until all selected scans meet the gate.',
  'Each shift covers 3 of its 19 sector fixtures. The 57-sector matrix rotates over seven days: a single green run never certifies all 57 sectors.');
await writeFile(output+'/report.md',lines.join('\n')+'\n');
if(process.env.GITHUB_STEP_SUMMARY)await appendFile(process.env.GITHUB_STEP_SUMMARY,lines.join('\n')+'\n');
console.log('Completed '+shift+': '+passed+'/'+results.length+' QA PASS; '+review+' REVIEW; '+unavailable+' UNAVAILABLE');
if(passed!==results.length)process.exitCode=1;
