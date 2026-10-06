import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { runHealthGuard } from "@/app/api/internal/health/run/route";
import { consumeRateLimit } from "@/lib/rate-limit";

function isHealthAdmin(email:string){
 const configured=(process.env.HEALTH_ADMIN_EMAILS||process.env.ADMIN_EMAIL||"")
  .split(",").map(v=>v.trim().toLowerCase()).filter(Boolean);
 return configured.length>0&&configured.includes(email.trim().toLowerCase());
}
export async function POST(){
 const user=await getCurrentUser();
 if(!user)return NextResponse.json({error:"Niet ingelogd."},{status:401});
 if(!isHealthAdmin(String(user.email||"")))return NextResponse.json({error:"Niet toegestaan."},{status:403});
 if(!await consumeRateLimit("health-run-now",String(user.id),6,3600))return NextResponse.json({error:"Te veel handmatige controles. Probeer later opnieuw."},{status:429});
 try{return runHealthGuard()}
 catch(error){console.error("Manual admin health run failed",error);return NextResponse.json({error:"Health-controle mislukt."},{status:500})}
}
