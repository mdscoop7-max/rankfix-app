import {NextResponse} from "next/server";
import {getCurrentUser} from "@/lib/auth";
import {getDb} from "@/lib/db";
import {ensureDatabase} from "@/lib/db-init";
import {decryptGoogleToken,refreshGoogleAccessToken} from "@/lib/google";

type GoogleProperty={siteUrl:string;permissionLevel:string};
type Lang="nl"|"en"|"de"|"fr"|"it"|"es";
function lang(request:Request):Lang{const q=new URL(request.url).searchParams.get("lang");if(q&&["nl","en","de","fr","it","es"].includes(q))return q as Lang;const a=(request.headers.get("accept-language")||"").toLowerCase();return (["nl","en","de","fr","it","es"].find(x=>a.startsWith(x))||"nl") as Lang}
const msg={
 nl:{login:"Login vereist.",load:"Search Console-properties konden niet worden geladen.",required:"Kies een Search Console-property.",connected:"Google Search Console is niet gekoppeld.",unavailable:"Deze Search Console-property is niet beschikbaar voor dit Google-account.",check:"Search Console-property kon niet worden gecontroleerd.",save:"Search Console-property kon niet worden opgeslagen."},
 en:{login:"Login required.",load:"Search Console properties could not be loaded.",required:"Choose a Search Console property.",connected:"Google Search Console is not connected.",unavailable:"This Search Console property is not available for this Google account.",check:"The Search Console property could not be verified.",save:"The Search Console property could not be saved."},
 de:{login:"Anmeldung erforderlich.",load:"Search-Console-Properties konnten nicht geladen werden.",required:"Wähle eine Search-Console-Property.",connected:"Google Search Console ist nicht verbunden.",unavailable:"Diese Search-Console-Property ist für dieses Google-Konto nicht verfügbar.",check:"Die Search-Console-Property konnte nicht geprüft werden.",save:"Die Search-Console-Property konnte nicht gespeichert werden."},
 fr:{login:"Connexion requise.",load:"Impossible de charger les propriétés Search Console.",required:"Choisissez une propriété Search Console.",connected:"Google Search Console n’est pas connecté.",unavailable:"Cette propriété Search Console n’est pas disponible pour ce compte Google.",check:"Impossible de vérifier la propriété Search Console.",save:"Impossible d’enregistrer la propriété Search Console."},
 it:{login:"Accesso richiesto.",load:"Impossibile caricare le proprietà Search Console.",required:"Scegli una proprietà Search Console.",connected:"Google Search Console non è collegato.",unavailable:"Questa proprietà Search Console non è disponibile per questo account Google.",check:"Impossibile verificare la proprietà Search Console.",save:"Impossibile salvare la proprietà Search Console."},
 es:{login:"Inicio de sesión requerido.",load:"No se pudieron cargar las propiedades de Search Console.",required:"Elige una propiedad de Search Console.",connected:"Google Search Console no está conectado.",unavailable:"Esta propiedad de Search Console no está disponible para esta cuenta de Google.",check:"No se pudo verificar la propiedad de Search Console.",save:"No se pudo guardar la propiedad de Search Console."}
} as const;

async function googleProperties(userId:string){
 const c=await getDb().query("SELECT refresh_token_encrypted FROM google_connections WHERE user_id=$1",[userId]);
 if(!c.rows[0])return {connected:false as const,properties:[] as GoogleProperty[]};
 const token=await refreshGoogleAccessToken(decryptGoogleToken(c.rows[0].refresh_token_encrypted));
 const r=await fetch("https://www.googleapis.com/webmasters/v3/sites",{headers:{Authorization:"Bearer "+token},cache:"no-store"});
 const d=await r.json();
 if(!r.ok)throw new Error("gsc");
 const raw=d&&typeof d==="object"?d as {siteEntry?:unknown}:{};
 const entries=Array.isArray(raw.siteEntry)?raw.siteEntry:[];
 const properties:GoogleProperty[]=entries.map((x:unknown)=>{const item=x&&typeof x==="object"?x as Record<string,unknown>:{};return {siteUrl:String(item.siteUrl||""),permissionLevel:String(item.permissionLevel||"")};});
 return {connected:true as const,properties};
}

export async function GET(request:Request){
 const m=msg[lang(request)];const user=await getCurrentUser();if(!user)return NextResponse.json({error:m.login},{status:401});
 await ensureDatabase();
 try{
  const google=await googleProperties(user.id);
  if(!google.connected)return NextResponse.json({connected:false,properties:[],selectedSiteUrl:null});
  const saved=await getDb().query("SELECT site_url FROM search_console_properties WHERE user_id=$1 AND selected=TRUE ORDER BY updated_at DESC LIMIT 1",[user.id]);
  const selectedSiteUrl=saved.rows[0]?.site_url||null;
  return NextResponse.json({connected:true,properties:google.properties.map((p:GoogleProperty)=>({...p,selected:p.siteUrl===selectedSiteUrl})),selectedSiteUrl});
 }catch{return NextResponse.json({connected:true,error:m.load,properties:[],selectedSiteUrl:null},{status:502})}
}

export async function POST(request:Request){
 const m=msg[lang(request)];const user=await getCurrentUser();if(!user)return NextResponse.json({error:m.login},{status:401});
 await ensureDatabase();
 const body=await request.json().catch(()=>({})),siteUrl=String(body.siteUrl||"").slice(0,500);
 if(!siteUrl)return NextResponse.json({error:m.required},{status:400});
 try{
  const google=await googleProperties(user.id);
  if(!google.connected)return NextResponse.json({error:m.connected},{status:409});
  const property=google.properties.find((p:GoogleProperty)=>p.siteUrl===siteUrl);
  if(!property)return NextResponse.json({error:m.unavailable},{status:403});
  const db=await getDb();
  await db.query("BEGIN");
  try{
   await db.query("UPDATE search_console_properties SET selected=FALSE,updated_at=NOW() WHERE user_id=$1",[user.id]);
   await db.query("INSERT INTO search_console_properties (user_id,site_url,permission_level,selected) VALUES ($1,$2,$3,TRUE) ON CONFLICT(user_id,site_url) DO UPDATE SET selected=TRUE,permission_level=EXCLUDED.permission_level,updated_at=NOW()",[user.id,property.siteUrl,property.permissionLevel]);
   await db.query("COMMIT");
  }catch(error){await db.query("ROLLBACK");throw error}
  return NextResponse.json({ok:true,siteUrl:property.siteUrl});
 }catch(error){
  if(error instanceof Error&&(error.message==="gsc"))return NextResponse.json({error:m.check},{status:502});
  return NextResponse.json({error:m.save},{status:500});
 }
}
