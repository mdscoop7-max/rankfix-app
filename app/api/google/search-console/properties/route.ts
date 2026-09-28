import {NextResponse} from "next/server";
import {getCurrentUser} from "@/lib/auth";
import {getDb} from "@/lib/db";
import {ensureDatabase} from "@/lib/db-init";
import {decryptGoogleToken,refreshGoogleAccessToken} from "@/lib/google";

async function googleProperties(userId:string){
 const c=await getDb().query("SELECT refresh_token_encrypted FROM google_connections WHERE user_id=$1",[userId]);
 if(!c.rows[0])return {connected:false as const,properties:[] as Array<{siteUrl:string;permissionLevel:string}>};
 const token=await refreshGoogleAccessToken(decryptGoogleToken(c.rows[0].refresh_token_encrypted));
 const r=await fetch("https://www.googleapis.com/webmasters/v3/sites",{headers:{Authorization:"Bearer "+token},cache:"no-store"});
 const d=await r.json();
 if(!r.ok)throw new Error("gsc");
 return {connected:true as const,properties:(d.siteEntry||[]).map((x:any)=>({siteUrl:String(x.siteUrl),permissionLevel:String(x.permissionLevel)}))};
}

export async function GET(){
 const user=await getCurrentUser();if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 await ensureDatabase();
 try{
  const google=await googleProperties(user.id);
  if(!google.connected)return NextResponse.json({connected:false,properties:[],selectedSiteUrl:null});
  const saved=await getDb().query("SELECT site_url FROM search_console_properties WHERE user_id=$1 AND selected=TRUE ORDER BY updated_at DESC LIMIT 1",[user.id]);
  const selectedSiteUrl=saved.rows[0]?.site_url||null;
  return NextResponse.json({connected:true,properties:google.properties.map(p=>({...p,selected:p.siteUrl===selectedSiteUrl})),selectedSiteUrl});
 }catch{return NextResponse.json({connected:true,error:"Search Console properties konden niet worden geladen.",properties:[],selectedSiteUrl:null},{status:502})}
}

export async function POST(request:Request){
 const user=await getCurrentUser();if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 await ensureDatabase();
 const body=await request.json().catch(()=>({})),siteUrl=String(body.siteUrl||"").slice(0,500);
 if(!siteUrl)return NextResponse.json({error:"siteUrl required"},{status:400});
 try{
  const google=await googleProperties(user.id);
  if(!google.connected)return NextResponse.json({error:"Google Search Console is niet gekoppeld."},{status:409});
  const property=google.properties.find(p=>p.siteUrl===siteUrl);
  if(!property)return NextResponse.json({error:"Deze Search Console-property is niet beschikbaar voor dit Google-account."},{status:403});
  const db=await getDb();
  await db.query("BEGIN");
  try{
   await db.query("UPDATE search_console_properties SET selected=FALSE,updated_at=NOW() WHERE user_id=$1",[user.id]);
   await db.query("INSERT INTO search_console_properties (user_id,site_url,permission_level,selected) VALUES ($1,$2,$3,TRUE) ON CONFLICT(user_id,site_url) DO UPDATE SET selected=TRUE,permission_level=EXCLUDED.permission_level,updated_at=NOW()",[user.id,property.siteUrl,property.permissionLevel]);
   await db.query("COMMIT");
  }catch(error){await db.query("ROLLBACK");throw error}
  return NextResponse.json({ok:true,siteUrl:property.siteUrl});
 }catch(error){
  if(error instanceof Error&&(error.message==="gsc"))return NextResponse.json({error:"Search Console-property kon niet worden gecontroleerd."},{status:502});
  return NextResponse.json({error:"Search Console-property kon niet worden opgeslagen."},{status:500});
 }
}
