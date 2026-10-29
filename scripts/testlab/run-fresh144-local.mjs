#!/usr/bin/env node
// Local-only, read-only QA runner for the fresh144 catalog. Requires the existing local QA server.
import {readFileSync,writeFileSync,renameSync,mkdirSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
const base='http://127.0.0.1:3002';
const sha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const tokenPath=join(process.env.LOCALAPPDATA||'', 'RankFix-QA','local-session-token.txt');
if(!existsSync(tokenPath))throw Error('Lokale QA-token ontbreekt. Start eerst Start-RankFix-TestLab.cmd (servervenster open laten).');
const token=readFileSync(tokenPath,'utf8').trim();
if(!/^[a-f0-9]{64}$/i.test(token))throw Error('Ongeldige lokale QA-token.');
const headers={cookie:'rankfix_local_qa='+token,'content-type':'application/json'};
async function request(path,body,timeout=25000){
 const res=await fetch(base+path,{method:body?'POST':'GET',headers,signal:AbortSignal.timeout(timeout),...(body?{body:JSON.stringify(body)}:{})});
 const raw=await res.text();let data;try{data=JSON.parse(raw)}catch{throw Error('Geen JSON van lokale RankFix-server (HTTP '+res.status+')')}
 return {status:res.status,data};
}
const version=await request('/api/scan/version');
if(version.status!==200||version.data.environment!=='local'||version.data.commitSha!==sha)throw Error('QA-server draait niet op deze commit. Sluit oude server af en start de launcher opnieuw.');
const catalog=await request('/api/testlab/catalog?catalog=fresh144');
if(catalog.status!==200||catalog.data.catalogId!=='fresh144'||catalog.data.sites?.length!==144)throw Error('Geen toegang tot de juiste fresh144-catalogus.');
const output=resolve('qa-results',sha.slice(0,12));mkdirSync(output,{recursive:true});
const file=join(output,'fresh144.json');
const report=existsSync(file)?JSON.parse(readFileSync(file,'utf8')):{commitSha:sha,catalogId:'fresh144',startedAt:new Date().toISOString(),results:[]};
if(report.commitSha!==sha||report.catalogId!=='fresh144')throw Error('Resultaten horen bij een andere QA-versie.');
const save=()=>{writeFileSync(file+'.tmp',JSON.stringify(report,null,2));renameSync(file+'.tmp',file)};
console.log('RankFix QA: 144 websites | versie '+sha.slice(0,12)+' | resultaten: '+file);
for(const [index,site] of catalog.data.sites.entries()){
 if(report.results.some(x=>x.host===site.host&&x.status==='success'))continue;
 console.log((index+1)+'/144 '+site.host);
 const started=Date.now();let row;
 try{
  const response=await request('/api/scan',{url:'https://'+site.host+'/',mode:'both',dashboard:true,language:'nl'},330000);
  const d=response.data;
  const success=response.status===200&&d.success===true;
  row={host:site.host,expected:site.expected,status:success?'success':'api_error',apiStatus:response.status,reason:success?null:(d.code||d.error||'UNKNOWN'),scanId:d.scanId||null,sector:d.sectorProfile?.primarySector||d.sectorProfile?.sector||null,score:d.overallScore??null,seo:d.seo?.score??null,geo:d.geo?.score??null,elapsedMs:Date.now()-started,at:new Date().toISOString(),pending:!success};
 }catch(e){
  row={host:site.host,expected:site.expected,status:'connection_error',reason:String(e.message||e),scanId:null,elapsedMs:Date.now()-started,at:new Date().toISOString(),pending:true};
 }
 report.results=report.results.filter(x=>x.host!==site.host);report.results.push(row);save();
 if(row.pending){
  console.error('Scan onderbroken bij '+site.host+': '+row.reason+'. Voortgang bewaard. Herstart pas nadat de server gezond is.');
  process.exitCode=1;break;
 }
 await new Promise(r=>setTimeout(r,8000));
}
console.log('Resultaten: '+file);
