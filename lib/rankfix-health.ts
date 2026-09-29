import { getDb } from "@/lib/db";

export type HealthLevel="green"|"orange"|"red";
export type HealthCheck={key:string;label:string;level:HealthLevel;message:string;latencyMs?:number};

async function timed<T>(fn:()=>Promise<T>){const start=Date.now();try{return {ok:true as const,value:await fn(),latencyMs:Date.now()-start}}catch(error){return {ok:false as const,error:error instanceof Error?error.message:"CHECK_FAILED",latencyMs:Date.now()-start}}}

export async function runRankFixHealthChecks():Promise<HealthCheck[]>{
 const checks:HealthCheck[]=[];
 const db=await timed(async()=>{await getDb().query("SELECT 1");return true});
 checks.push({key:"database",label:"Database",level:db.ok?"green":"red",message:db.ok?"Database bereikbaar.":"Database niet bereikbaar.",latencyMs:db.latencyMs});
 const appUrl=(process.env.APP_URL||"https://rankfix-app.onrender.com").replace(/\/$/,"");
 const app=await timed(async()=>{const r=await fetch(appUrl,{cache:"no-store",signal:AbortSignal.timeout(12000)});if(!r.ok)throw new Error("HTTP "+r.status);return r.status});
 checks.push({key:"app",label:"RankFix app",level:app.ok?"green":"red",message:app.ok?"Productie-app bereikbaar.":"Productie-app niet normaal bereikbaar.",latencyMs:app.latencyMs});
 checks.push({key:"email",label:"E-mail",level:process.env.RESEND_API_KEY&&(process.env.SCAN_REPORT_FROM||process.env.RESEND_FROM)?"green":"orange",message:process.env.RESEND_API_KEY&&(process.env.SCAN_REPORT_FROM||process.env.RESEND_FROM)?"Resend-configuratie aanwezig.":"E-mailconfiguratie is onvolledig."});
 checks.push({key:"github",label:"GitHub",level:process.env.GITHUB_CLIENT_ID&&process.env.GITHUB_CLIENT_SECRET?"green":"orange",message:process.env.GITHUB_CLIENT_ID&&process.env.GITHUB_CLIENT_SECRET?"GitHub OAuth-configuratie aanwezig.":"GitHub OAuth-configuratie is onvolledig."});
 checks.push({key:"google",label:"Search Console",level:process.env.GOOGLE_CLIENT_ID&&process.env.GOOGLE_CLIENT_SECRET?"green":"orange",message:process.env.GOOGLE_CLIENT_ID&&process.env.GOOGLE_CLIENT_SECRET?"Google OAuth-configuratie aanwezig.":"Google OAuth-configuratie is onvolledig."});
 return checks;
}
export function overallHealth(checks:HealthCheck[]):HealthLevel{return checks.some(c=>c.level==="red")?"red":checks.some(c=>c.level==="orange")?"orange":"green"}
