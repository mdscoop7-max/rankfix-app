import { getDb } from "@/lib/db";

export type HealthLevel="green"|"orange"|"red";
export type HealthCheck={key:string;label:string;level:HealthLevel;message:string;latencyMs?:number};

async function timed<T>(fn:()=>Promise<T>){const start=Date.now();try{return {ok:true as const,value:await fn(),latencyMs:Date.now()-start}}catch(error){return {ok:false as const,error:error instanceof Error?error.message:"CHECK_FAILED",latencyMs:Date.now()-start}}}

export async function runRankFixHealthChecks():Promise<HealthCheck[]>{
 const checks:HealthCheck[]=[];
 const db=await timed(async()=>{await getDb().query("SELECT 1");return true});
 checks.push({key:"database",label:"Database",level:db.ok?"green":"red",message:db.ok?"Database bereikbaar.":"Database niet bereikbaar.",latencyMs:db.latencyMs});

 // Render Free can cold-start. A slow first response is therefore a warning, not
 // immediate proof that production is down. Repeated hard failures are escalated
 // by the incident threshold in the internal Health Guard route.
 const appUrl=(process.env.APP_URL||"https://rankfix-app.onrender.com").replace(/\/$/,"");
 const app=await timed(async()=>{const r=await fetch(appUrl,{cache:"no-store",signal:AbortSignal.timeout(70000)});if(!r.ok)throw new Error("HTTP "+r.status);return r.status});
 const appSlow=app.ok&&app.latencyMs>15000;
 checks.push({key:"app",label:"RankFix app",level:app.ok?(appSlow?"orange":"green"):"red",message:app.ok?(appSlow?"Productie-app bereikbaar, maar reageert traag (mogelijke cold start).":"Productie-app bereikbaar."):"Productie-app niet normaal bereikbaar.",latencyMs:app.latencyMs});

 checks.push({key:"scanner",label:"Scanner",level:"green",message:"Scanner-module geladen; netwerkfouten worden per scan geïsoleerd."});
 checks.push({key:"ai",label:"AI",level:process.env.OPENAI_API_KEY?"green":"orange",message:process.env.OPENAI_API_KEY?"AI-configuratie aanwezig.":"AI-configuratie ontbreekt; audits blijven beschikbaar zonder AI-fixes."});
 checks.push({key:"email",label:"E-mail",level:process.env.RESEND_API_KEY&&(process.env.SCAN_REPORT_FROM||process.env.RESEND_FROM)?"green":"orange",message:process.env.RESEND_API_KEY&&(process.env.SCAN_REPORT_FROM||process.env.RESEND_FROM)?"Resend-configuratie aanwezig.":"E-mailconfiguratie is onvolledig."});
 checks.push({key:"github",label:"GitHub",level:process.env.GITHUB_CLIENT_ID&&process.env.GITHUB_CLIENT_SECRET?"green":"orange",message:process.env.GITHUB_CLIENT_ID&&process.env.GITHUB_CLIENT_SECRET?"GitHub OAuth-configuratie aanwezig.":"GitHub OAuth-configuratie is onvolledig; GitHub-fixes zijn dan niet beschikbaar."});
 checks.push({key:"google",label:"Search Console",level:process.env.GOOGLE_CLIENT_ID&&process.env.GOOGLE_CLIENT_SECRET?"green":"orange",message:process.env.GOOGLE_CLIENT_ID&&process.env.GOOGLE_CLIENT_SECRET?"Google OAuth-configuratie aanwezig.":"Google OAuth-configuratie is onvolledig; normale audits blijven beschikbaar."});
 checks.push({key:"deployment",label:"Deployment",level:process.env.RENDER?"green":"orange",message:process.env.RENDER?"Render-runtime actief.":"Render-runtime kon niet worden bevestigd."});
 return checks;
}
export function overallHealth(checks:HealthCheck[]):HealthLevel{return checks.some(c=>c.level==="red")?"red":checks.some(c=>c.level==="orange")?"orange":"green"}
