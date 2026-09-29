const base=(process.env.LOAD_TEST_URL||"http://127.0.0.1:3000").replace(/\/$/,"");
const path=process.env.LOAD_TEST_PATH||"/";
const total=Math.min(1000,Math.max(1,Number(process.env.LOAD_TEST_REQUESTS||50)));
const concurrency=Math.min(50,Math.max(1,Number(process.env.LOAD_TEST_CONCURRENCY||5)));
const timeout=Math.min(30000,Math.max(1000,Number(process.env.LOAD_TEST_TIMEOUT_MS||10000)));
if(base.includes("rankfix-app.onrender.com")&&process.env.ALLOW_PRODUCTION_LOAD_TEST!=="YES"){
  console.error("Production load test blocked. Set ALLOW_PRODUCTION_LOAD_TEST=YES only after explicit approval.");
  process.exit(2);
}
let next=0,ok=0,failed=0;const times=[];
async function worker(){
 while(true){
  const i=next++;if(i>=total)return;const start=Date.now();
  try{const r=await fetch(base+path,{signal:AbortSignal.timeout(timeout),headers:{"user-agent":"RankFixLoadTest/1.0"}});times.push(Date.now()-start);if(r.ok)ok++;else failed++;}
  catch{times.push(Date.now()-start);failed++;}
 }
}
const started=Date.now();await Promise.all(Array.from({length:Math.min(concurrency,total)},()=>worker()));
times.sort((a,b)=>a-b);const percentile=p=>times[Math.min(times.length-1,Math.floor(times.length*p))]??0;
console.log(JSON.stringify({url:base+path,total,concurrency,ok,failed,durationMs:Date.now()-started,p50Ms:percentile(.5),p95Ms:percentile(.95),p99Ms:percentile(.99)},null,2));
if(failed>0)process.exitCode=1;
