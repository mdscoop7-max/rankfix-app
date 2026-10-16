#!/usr/bin/env node
// READ ONLY: build a sanitized Claude <-> Codex EU-81 pilot report from local JSON exports.
// node scripts/pilot-handoff.mjs --scans scans.json --attempts attempts.json --since 2026-10-17T00:00:00Z --deployment VERIFIED_SHA --output handoff.md
import {readFileSync,writeFileSync} from "node:fs";
const argv=process.argv.slice(2), args={};
for(let i=0;i<argv.length;i+=2){if(!argv[i]?.startsWith("--")||!argv[i+1])throw Error("Pass --key value pairs");args[argv[i]]=argv[i+1]}
for(const k of ["--scans","--attempts","--since","--output"])if(!args[k])throw Error("Missing "+k);
const start=Date.parse(args["--since"]);if(!Number.isFinite(start))throw Error("Invalid --since");
const load=p=>JSON.parse(readFileSync(p,"utf8"));
const plan=load(args["--plan"]||"tests/fixtures/eu81/plan.json").sites;
const scans=load(args["--scans"]), attempts=load(args["--attempts"]);
if(![plan,scans,attempts].every(Array.isArray))throw Error("Invalid JSON array");
const host=u=>{try{return new URL(/^https?:\/\//i.test(String(u))?String(u):"https://"+u).hostname.toLowerCase().replace(/^www\./,"")}catch{return ""}};
const newEnough=x=>Number.isFinite(Date.parse(x.created_at))&&Date.parse(x.created_at)>=start;
const newest=arr=>arr.sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at))[0];
const noSector=s=>!s||["unknown","general_business"].includes(s);
const esc=s=>String(s??"—").replace(/[|\r\n<>]/g," ").slice(0,100);
const rows=plan.map(s=>{
 const hs=new Set(s.hosts.map(host));
 const scan=newest(scans.filter(x=>newEnough(x)&&hs.has(host(x.scanned_url))));
 const tries=attempts.filter(x=>newEnough(x)&&hs.has(host(x.requested_url)));
 const latestTry=newest(tries);
 const expected=Array.isArray(s.expected)?s.expected:[s.expected];
 const sector=scan?.result?.sectorProfile?.sector??scan?.result?.metrics?.sector?.key??"unknown";
 const hasTruth=expected.some(x=>!noSector(x));
 const status=!scan?(tries.length?"NO_REPORT":"NOT_ATTEMPTED"):!hasTruth?"NO_TRUTH":noSector(sector)?"UNKNOWN":expected.includes(sector)?"CORRECT":"WRONG";
 return {site:s.country+" "+s.name,expected:expected.join(","),sector:scan?sector:"—",status,confidence:scan?.result?.sectorProfile?.confidenceScore??scan?.result?.metrics?.sector?.confidenceScore,score:scan?.overall_score,coverage:scan?.result?.coverage?.coveragePercent,reliability:scan?.result?.selfCheck?.reliability,tries:tries.length,lastError:latestTry?.error_code??(latestTry?.outcome==="failed"?latestTry.category:null)};
});
const c=x=>rows.filter(r=>r.status===x).length;
const total=c("CORRECT")+c("WRONG")+c("UNKNOWN");
const pct=(n,d)=>d?(100*n/d).toFixed(1)+"%":"n.v.t.";
const cols=["Site","Status","Verwacht","Gevonden","Sectorzekerheid","Score","Bewijsdekking","Betrouwbaarheid","Pogingen","Laatste fout"];
const table=arr=>["|"+cols.join("|")+"|","|"+cols.map(()=>"---").join("|")+"|",...arr.map(r=>"|"+[r.site,r.status,r.expected,r.sector,r.confidence,r.score,r.coverage,r.reliability,r.tries,r.lastError].map(esc).join("|")+"|")].join("\n");
const bad=rows.filter(r=>["WRONG","UNKNOWN","NO_REPORT"].includes(r.status)||(r.coverage!=null&&r.coverage<70));
const out=[
 "# RankFix EU-81 — overdracht Claude en Codex","",
 "Pilot start UTC: "+esc(args["--since"]),
 "Vercel deployment SHA: "+esc(args["--deployment"]||"NIET BEVESTIGD"),
 "**Scoremodelnaam is geen motorversie. Pilotresultaten zijn ongeldig voor versie 3.5 totdat SHA is bevestigd.**","",
 "## Samenvatting",
 "- Gepland "+rows.length+", geslaagd "+(rows.length-c("NOT_ATTEMPTED")-c("NO_REPORT"))+" ("+pct(rows.length-c("NOT_ATTEMPTED")-c("NO_REPORT"),rows.length)+")",
 "- Correct "+c("CORRECT")+", verkeerd "+c("WRONG")+", onbekend "+c("UNKNOWN")+", niet geprobeerd "+c("NOT_ATTEMPTED")+", geen rapport "+c("NO_REPORT"),
 "- Strenge sector-accuracy "+pct(c("CORRECT"),total)+"; onbekend is nooit goed.",
 "- Hoogzekere verkeerde sectoren (>=80%): "+rows.filter(r=>r.status==="WRONG"&&r.confidence>=80).length,"",
 "## P0/P1 gevallen",table(bad),"",
 "## Alle 81 websites",table(rows),"",
 "## Regels",
 "- Geen exceptions per domein; geen botbeveiliging omzeilen; alleen testproject gebruiken.",
 "- Deel geen raw scanexports, cookies, tokens of klantgegevens in openbare GitHub issues.",
 "- Geen 9/10 claim zonder vooraf vastgelegde, onafhankelijk ongeziene tweede testset.",
 "- Geen auto-merge of deploy naar productie."
].join("\n")+"\n";
writeFileSync(args["--output"],out,"utf8");
console.log(JSON.stringify({sites:rows.length,correct:c("CORRECT"),wrong:c("WRONG"),unknown:c("UNKNOWN"),scanned:rows.length-c("NOT_ATTEMPTED")-c("NO_REPORT")}));
