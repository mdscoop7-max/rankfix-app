import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

function isHealthAdmin(email:string){
 const configured=(process.env.HEALTH_ADMIN_EMAILS||process.env.ADMIN_EMAIL||"")
  .split(",").map(v=>v.trim().toLowerCase()).filter(Boolean);
 return configured.length>0&&configured.includes(email.trim().toLowerCase());
}
export async function GET(){
 const user=await getCurrentUser();
 if(!user)return NextResponse.json({admin:false},{status:401});
 return NextResponse.json({admin:isHealthAdmin(String(user.email||""))});
}
