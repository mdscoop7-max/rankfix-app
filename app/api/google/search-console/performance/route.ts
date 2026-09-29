import {NextResponse} from "next/server";
import {getCurrentUser} from "@/lib/auth";
import {getDb} from "@/lib/db";
import {ensureDatabase} from "@/lib/db-init";
import {decryptGoogleToken,refreshGoogleAccessToken} from "@/lib/google";

type GscRow={keys?:string[];clicks?:number;impressions?:number;ctr?:number;position?:number};
type Metric={name:string;clicks:number;impressions:number;ctr:number;position:number};
type Summary={clicks:number;impressions:number;ctr:number;position:number};
type Lang="nl"|"en"|"de"|"fr"|"it"|"es";
function lang(request:Request):Lang{const q=new URL(request.url).searchParams.get("lang");if(q&&["nl","en","de","fr","it","es"].includes(q))return q as Lang;const a=(request.headers.get("accept-language")||"").toLowerCase();return (["nl","en","de","fr","it","es"].find(x=>a.startsWith(x))||"nl") as Lang}
const messages={
 nl:["Login vereist.","Google Search Console is niet gekoppeld.","Kies eerst een Search Console-property.","Google Search Console-data kon niet worden opgehaald.","Search Console-synchronisatie is mislukt."],
 en:["Login required.","Google Search Console is not connected.","Choose a Search Console property first.","Google Search Console data could not be retrieved.","Search Console synchronization failed."],
 de:["Anmeldung erforderlich.","Google Search Console ist nicht verbunden.","Wähle zuerst eine Search-Console-Property.","Google-Search-Console-Daten konnten nicht abgerufen werden.","Search-Console-Synchronisierung fehlgeschlagen."],
 fr:["Connexion requise.","Google Search Console n’est pas connecté.","Choisissez d’abord une propriété Search Console.","Impossible de récupérer les données Google Search Console.","La synchronisation Search Console a échoué."],
 it:["Accesso richiesto.","Google Search Console non è collegato.","Scegli prima una proprietà Search Console.","Impossibile recuperare i dati di Google Search Console.","Sincronizzazione Search Console non riuscita."],
 es:["Inicio de sesión requerido.","Google Search Console no está conectado.","Elige primero una propiedad de Search Console.","No se pudieron obtener los datos de Google Search Console.","La sincronización de Search Console falló."]
} as const;
function isoDate(date:Date){return date.toISOString().slice(0,10)}
function mapRows(rows:GscRow[]):Metric[]{return rows.map(row=>({name:String(row.keys?.[0]||""),clicks:Number(row.clicks||0),impressions:Number(row.impressions||0),ctr:Number(row.ctr||0),position:Number(row.position||0)}))}
function summary(row:GscRow|undefined):Summary{return {clicks:Number(row?.clicks||0),impressions:Number(row?.impressions||0),ctr:Number(row?.ctr||0),position:Number(row?.position||0)}}
function delta(current:number,previous:number){return previous===0?(current===0?0:null):((current-previous)/previous)*100}
async function queryGsc(accessToken:string,siteUrl:string,startDate:string,endDate:string,dimensions:string[],rowLimit=10){
 const r=await fetch("https://www.googleapis.com/webmasters/v3/sites/"+encodeURIComponent(siteUrl)+"/searchAnalytics/query",{method:"POST",headers:{Authorization:"Bearer "+accessToken,"Content-Type":"application/json"},body:JSON.stringify({startDate,endDate,dimensions,rowLimit,startRow:0,dataState:"final"}),cache:"no-store"});
 const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error("gsc_query");return (Array.isArray(data.rows)?data.rows:[]) as GscRow[];
}
export async function GET(request:Request){
 const m=messages[lang(request)];const user=await getCurrentUser();if(!user)return NextResponse.json({error:m[0]},{status:401});await ensureDatabase();const db=getDb();let propertyId:string|null=null;
 try{
  const connection=await db.query("SELECT refresh_token_encrypted FROM google_connections WHERE user_id=$1",[user.id]);if(!connection.rows[0])return NextResponse.json({error:m[1]},{status:409});
  const property=await db.query("SELECT id,site_url FROM search_console_properties WHERE user_id=$1 AND selected=TRUE ORDER BY updated_at DESC LIMIT 1",[user.id]);if(!property.rows[0])return NextResponse.json({error:m[2]},{status:409});
  propertyId=String(property.rows[0].id);const siteUrl=String(property.rows[0].site_url);const accessToken=await refreshGoogleAccessToken(decryptGoogleToken(connection.rows[0].refresh_token_encrypted));
  const end=new Date();end.setUTCDate(end.getUTCDate()-1);const start=new Date(end);start.setUTCDate(start.getUTCDate()-27);const prevEnd=new Date(start);prevEnd.setUTCDate(prevEnd.getUTCDate()-1);const prevStart=new Date(prevEnd);prevStart.setUTCDate(prevStart.getUTCDate()-27);
  const startDate=isoDate(start),endDate=isoDate(end),previousStartDate=isoDate(prevStart),previousEndDate=isoDate(prevEnd);
  const [summaryRows,queryRows,pageRows,previousSummaryRows,previousQueryRows]=await Promise.all([queryGsc(accessToken,siteUrl,startDate,endDate,[],1),queryGsc(accessToken,siteUrl,startDate,endDate,["query"],100),queryGsc(accessToken,siteUrl,startDate,endDate,["page"],100),queryGsc(accessToken,siteUrl,previousStartDate,previousEndDate,[],1),queryGsc(accessToken,siteUrl,previousStartDate,previousEndDate,["query"],100)]);
  const current=summary(summaryRows[0]),previous=summary(previousSummaryRows[0]);const queries=mapRows(queryRows),pages=mapRows(pageRows),previousQueries=mapRows(previousQueryRows);const previousByName=new Map(previousQueries.map(row=>[row.name,row]));
  const opportunities=queries.filter(row=>row.impressions>=10&&row.position>=6&&row.position<=20&&row.ctr<0.03).sort((a,b)=>b.impressions-a.impressions).slice(0,10);
  const movers=queries.map(row=>{const old=previousByName.get(row.name);return {...row,previousPosition:old?.position??null,positionChange:old?old.position-row.position:null,clickChange:old?row.clicks-old.clicks:null}}).filter(row=>row.positionChange!==null&&Math.abs(row.positionChange)>=1).sort((a,b)=>Math.abs(b.positionChange||0)-Math.abs(a.positionChange||0)).slice(0,10);
  const run=await db.query("INSERT INTO search_console_sync_runs (property_id,status) VALUES ($1,'RUNNING') RETURNING id",[propertyId]);
  try{
   await db.query("INSERT INTO search_console_metrics (property_id,metric_date,page,query,clicks,impressions,ctr,position) VALUES ($1,$2,'','',$3,$4,$5,$6) ON CONFLICT(property_id,metric_date,page,query) DO UPDATE SET clicks=EXCLUDED.clicks,impressions=EXCLUDED.impressions,ctr=EXCLUDED.ctr,position=EXCLUDED.position",[propertyId,endDate,current.clicks,current.impressions,current.ctr,current.position]);
   for(const row of queries.slice(0,25))await db.query("INSERT INTO search_console_metrics (property_id,metric_date,page,query,clicks,impressions,ctr,position) VALUES ($1,$2,'',$3,$4,$5,$6,$7) ON CONFLICT(property_id,metric_date,page,query) DO UPDATE SET clicks=EXCLUDED.clicks,impressions=EXCLUDED.impressions,ctr=EXCLUDED.ctr,position=EXCLUDED.position",[propertyId,endDate,row.name,row.clicks,row.impressions,row.ctr,row.position]);
   for(const row of pages.slice(0,25))await db.query("INSERT INTO search_console_metrics (property_id,metric_date,page,query,clicks,impressions,ctr,position) VALUES ($1,$2,$3,'',$4,$5,$6,$7) ON CONFLICT(property_id,metric_date,page,query) DO UPDATE SET clicks=EXCLUDED.clicks,impressions=EXCLUDED.impressions,ctr=EXCLUDED.ctr,position=EXCLUDED.position",[propertyId,endDate,row.name,row.clicks,row.impressions,row.ctr,row.position]);
   await db.query("UPDATE search_console_sync_runs SET status='SUCCESS',finished_at=NOW() WHERE id=$1",[run.rows[0].id]);
  }catch(syncError){await db.query("UPDATE search_console_sync_runs SET status='ERROR',finished_at=NOW(),error_message=$2 WHERE id=$1",[run.rows[0].id,syncError instanceof Error?syncError.message:"sync_error"])}
  await db.query("UPDATE search_console_properties SET last_sync_at=NOW(),updated_at=NOW() WHERE id=$1",[propertyId]);
  return NextResponse.json({siteUrl,startDate,endDate,previousStartDate,previousEndDate,summary:current,previousSummary:previous,deltas:{clicks:delta(current.clicks,previous.clicks),impressions:delta(current.impressions,previous.impressions),ctr:delta(current.ctr,previous.ctr),position:previous.position&&current.position?previous.position-current.position:null},queries:queries.slice(0,10),pages:pages.slice(0,10),opportunities,movers,syncedAt:new Date().toISOString()});
 }catch(error){if(propertyId)await db.query("INSERT INTO search_console_sync_runs (property_id,status,finished_at,error_message) VALUES ($1,'ERROR',NOW(),$2)",[propertyId,error instanceof Error?error.message:"sync_error"]).catch(()=>{});const message=error instanceof Error&&error.message==="gsc_query"?m[3]:m[4];return NextResponse.json({error:message},{status:502})}
}
