// Isolated GitHub Actions pilot health. Read-only; never dispatches workflows,
// writes repositories, scans customer sites, or accesses production scan data.
const OWNER_REPO = "mdscoop7-max/rankfix-app";
const BRANCH = "fix/review-12-punten-20261012";
const ACTIONS = "https://github.com/"+OWNER_REPO+"/actions/workflows/qa-sector-pilots.yml";
const API = "https://api.github.com/repos/"+OWNER_REPO;
const MAX_RUNNING_MS = 3 * 60 * 60 * 1000;
const WARN_STALE_MS = 36 * 60 * 60 * 1000;
const FAIL_STALE_MS = 72 * 60 * 60 * 1000;

export type GithubPilotRun = {
 id:number; name:string; status:string; conclusion:string|null;
 created_at:string; updated_at:string; head_sha:string; html_url:string;
};
export type GithubPilotJob = {name:string;status:string;conclusion:string|null};
export type PilotHealth = {key:"qa_pilot";label:string;level:"green"|"orange"|"red";message:string;runUrl:string};

function validTime(value:string, now:number) {
 const parsed=Date.parse(value);return Number.isFinite(parsed)?Math.max(0,now-parsed):Number.POSITIVE_INFINITY;
}
export function evaluateQaPilot(runs:GithubPilotRun[],jobs:GithubPilotJob[],now=Date.now()):PilotHealth {
 const named = runs.filter(r=>r.name==="RankFix Sector QA - three isolated shifts");
 const qa = named[0];
 const ci = runs.find(r=>r.name==="RankFix CI");
 const base={key:"qa_pilot" as const,label:"Testpilot QA (dag, avond, nacht)",runUrl:qa?.html_url||ACTIONS};
 if(!qa) return {...base,level:"red",message:"Er is geen QA-testpilotrun gevonden; controleer de GitHub-workflow."};
 const age = validTime(qa.created_at,now);
 const days = Math.floor(age/86400000);
 const shiftJobs=jobs.filter(job=>/^scan \((night|day|evening)\)$/.test(job.name));
 const failed=shiftJobs.filter(job=>job.conclusion==="failure"||job.conclusion==="timed_out");
 const names=(xs:GithubPilotJob[])=>xs.map(j=>j.name.replace(/^scan \(|\)$/g,"")).join(", ");
 if(failed.length) return {...base,level:"red",message:"QA-pilot mislukt in: "+names(failed)+". Bekijk de checks en het rapport: "+base.runUrl};
 if(qa.status==="completed" && qa.conclusion!=="success") {
  return {...base,level:"red",message:"QA-pilot is afgerond met "+String(qa.conclusion||"onbekend")+". Geen vrijgave: "+base.runUrl};
 }
 if(qa.status!=="completed") return {...base,level:age>MAX_RUNNING_MS?"red":"orange",
  message:age>MAX_RUNNING_MS?"QA-pilot staat langer dan 3 uur vast ("+qa.status+"): "+base.runUrl
  :"QA-pilot loopt of wacht op een runner ("+qa.status+"): "+base.runUrl};
 if(shiftJobs.length!==3 || shiftJobs.some(j=>j.conclusion!=="success")) {
  return {...base,level:"red",message:"QA-pilot meldt success zonder drie geslaagde shifts; controleer resultaten: "+base.runUrl};
 }
 if(!ci) return {...base,level:"red",message:"Geen CI- of buildcontrole gevonden voor de QA-branch: "+base.runUrl};
 if(ci.status==="completed"&&ci.conclusion!=="success") return {...base,level:"red",
  message:"Code/buildcontrole mislukt ("+ci.conclusion+"): "+base.runUrl};
 if(ci.head_sha!==qa.head_sha) return {...base,level:"orange",
  message:"QA-pilot en nieuwste CI draaien op verschillende commits; nieuwe pilot nodig: "+base.runUrl};
 if(ci.status!=="completed") return {...base,level:"orange",
  message:"QA-pilot klaar, maar nieuwste CI nog niet klaar: "+base.runUrl};
 if(age>FAIL_STALE_MS) return {...base,level:"red",message:"Al "+days+" dagen geen nieuwe QA-pilot. De branchpilot heeft mogelijk geen actieve planning. Start of herstel de geplande tests: "+base.runUrl};
 if(age>WARN_STALE_MS) return {...base,level:"orange",message:"QA-pilot "+days+" dag(en) niet vernieuwd. Bewaak de planning: "+base.runUrl};
 return {...base,level:"green",message:"Drie shifts en CI geslaagd op dezelfde commit. Dit bevestigt de pilot, niet de productie-deployment: "+base.runUrl};
}

async function githubJson(url:string):Promise<any> {
 const token=(process.env.RANKFIX_QA_GITHUB_TOKEN||"").trim();
 const headers:Record<string,string>={"Accept":"application/vnd.github+json","User-Agent":"RankFix-Health-Guard","X-GitHub-Api-Version":"2022-11-28"};
 if(token) headers.Authorization="Bearer "+token;
 const r=await fetch(url,{headers,cache:"no-store",signal:AbortSignal.timeout(10000)});
 if(!r.ok) throw new Error("GitHub QA status: HTTP "+r.status);
 return r.json();
}
export async function checkQaPilot():Promise<PilotHealth>{
 try{
  const data=await githubJson(API+"/actions/runs?branch="+encodeURIComponent(BRANCH)+"&per_page=20");
  const runs=Array.isArray(data.workflow_runs)?data.workflow_runs as GithubPilotRun[]:[];
  const qa=runs.find(r=>r.name==="RankFix Sector QA - three isolated shifts");
  const jobs=qa?await githubJson(API+"/actions/runs/"+qa.id+"/jobs?per_page=30"):null;
  return evaluateQaPilot(runs,Array.isArray(jobs?.jobs)?jobs.jobs as GithubPilotJob[]:[]);
 }catch(error){
  return {key:"qa_pilot",label:"Testpilot QA (dag, avond, nacht)",level:"red",
   message:"QA-status niet opvraagbaar: "+(error instanceof Error?error.message:"ONBEKEND")+
     ". Dit bewijst geen productiestoring. Controleer GitHub: "+ACTIONS,
   runUrl:ACTIONS};
 }
}
