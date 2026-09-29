import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { runHealthGuard } from "@/app/api/internal/health/run/route";

function isHealthAdmin(email:string){
 const configured=(process.env.HEALTH_ADMIN_EMAILS||process.env.ADMIN_EMAIL||"")
  .split(",").map(v=>v.trim().toLowerCase()).filter(Boolean);
 return configured.length>0&&configured.includes(email.trim().toLowerCase());
}
export async function POST(){
 const user=await getCurrentUser();
 if(!user)return NextResponse.json({error:"Niet ingelogd."},{status:401});
 if(!isHealthAdmin(String(user.email||"")))return NextResponse.json({error:"Niet toegestaan."},{status:403});
 try{return NextResponse.json(await runHealthGuard())}
 catch(error){console.error("Manual admin health run failed",error);return NextResponse.json({error:"Health-controle mislukt."},{status:500})}
}
