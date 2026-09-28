import {NextResponse} from "next/server";
import {getCurrentUser} from "@/lib/auth";
import {getDb} from "@/lib/db";
import {ensureDatabase} from "@/lib/db-init";
import {decryptGoogleToken,refreshGoogleAccessToken} from "@/lib/google";

type GscRow={keys?:string[];clicks?:number;impressions?:number;ctr?:number;position?:number};

function isoDate(date:Date){return date.toISOString().slice(0,10)}
async function queryGsc(accessToken:string,siteUrl:string,startDate:string,endDate:string,dimensions:string[],rowLimit=10){
 const r=await fetch("https://www.googleapis.com/webmasters/v3/sites/"+encodeURIComponent(siteUrl)+"/searchAnalytics/query",{
  method:"POST",headers:{Authorization:"Bearer "+accessToken,"Content-Type":"application/json"},
  body:JSON.stringify({startDate,endDate,dimensions,rowLimit,startRow:0,dataState:"final"}),cache:"no-store"
 });
 const data=await r.json().catch(()=>({}));
 if(!r.ok)throw new Error("gsc_query");
 return (Array.isArray(data.rows)?data.rows:[]) as GscRow[];
}

export async function GET(){
 const user=await getCurrentUser();
 if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 await ensureDatabase();
 try{
  const db=getDb();
  const connection=await db.query("SELECT refresh_token_encrypted FROM google_connections WHERE user_id=$1",[user.id]);
  if(!connection.rows[0])return NextResponse.json({error:"Google Search Console is niet gekoppeld."},{status:409});
  const property=await db.query("SELECT id,site_url FROM search_console_properties WHERE user_id=$1 AND selected=TRUE ORDER BY updated_at DESC LIMIT 1",[user.id]);
  if(!property.rows[0])return NextResponse.json({error:"Kies eerst een Search Console-property."},{status:409});
  const siteUrl=String(property.rows[0].site_url);
  const accessToken=await refreshGoogleAccessToken(decryptGoogleToken(connection.rows[0].refresh_token_encrypted));
  const end=new Date();end.setUTCDate(end.getUTCDate()-1);
  const start=new Date(end);start.setUTCDate(start.getUTCDate()-27);
  const startDate=isoDate(start),endDate=isoDate(end);
  const [summaryRows,queryRows,pageRows]=await Promise.all([
   queryGsc(accessToken,siteUrl,startDate,endDate,[],1),
   queryGsc(accessToken,siteUrl,startDate,endDate,["query"],10),
   queryGsc(accessToken,siteUrl,startDate,endDate,["page"],10)
  ]);
  const s=summaryRows[0]||{};
  const map=(rows:GscRow[])=>rows.map(row=>({name:String(row.keys?.[0]||""),clicks:Number(row.clicks||0),impressions:Number(row.impressions||0),ctr:Number(row.ctr||0),position:Number(row.position||0)}));
  await db.query("UPDATE search_console_properties SET last_sync_at=NOW(),updated_at=NOW() WHERE id=$1",[property.rows[0].id]);
  return NextResponse.json({siteUrl,startDate,endDate,summary:{clicks:Number(s.clicks||0),impressions:Number(s.impressions||0),ctr:Number(s.ctr||0),position:Number(s.position||0)},queries:map(queryRows),pages:map(pageRows),syncedAt:new Date().toISOString()});
 }catch(error){
  const message=error instanceof Error&&error.message==="gsc_query"?"Google Search Console-data kon niet worden opgehaald.":"Search Console synchronisatie is mislukt.";
  return NextResponse.json({error:message},{status:502});
 }
}
