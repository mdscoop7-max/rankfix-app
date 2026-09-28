"use client";
import {useEffect,useState} from "react";
import DashboardNav from "../nav";
import type {Locale} from "@/lib/locales";
import "../dashboard.css";

type Property={siteUrl:string;permissionLevel:string;selected?:boolean};
type PropertiesResponse={connected:boolean;properties:Property[];selectedSiteUrl?:string|null;error?:string};

const copy={
nl:["Google Search Console","Koppel RankFix veilig en alleen-lezen aan Google Search Console.","Google koppelen","Kies een property","Opslaan","Nog geen koppeling.","RankFix vraagt alleen leesrechten. Je Search Console-instellingen worden niet gewijzigd.","Opgeslagen.","Opslaan mislukt.","Bezig…"],
en:["Google Search Console","Connect RankFix securely with read-only Google Search Console access.","Connect Google","Choose a property","Save","Not connected yet.","RankFix requests read-only access. Your Search Console settings are not changed.","Saved.","Could not save.","Saving…"],
de:["Google Search Console","RankFix sicher und nur lesend mit der Google Search Console verbinden.","Google verbinden","Property wählen","Speichern","Noch nicht verbunden.","RankFix fordert nur Lesezugriff an. Deine Search-Console-Einstellungen werden nicht geändert.","Gespeichert.","Speichern fehlgeschlagen.","Speichern…"],
fr:["Google Search Console","Connectez RankFix à Google Search Console en lecture seule.","Connecter Google","Choisir une propriété","Enregistrer","Pas encore connecté.","RankFix demande uniquement un accès en lecture. Vos paramètres Search Console ne sont pas modifiés.","Enregistré.","Échec de l’enregistrement.","Enregistrement…"],
it:["Google Search Console","Collega RankFix a Google Search Console con accesso in sola lettura.","Collega Google","Scegli una proprietà","Salva","Non ancora collegato.","RankFix richiede solo accesso in lettura. Le impostazioni Search Console non vengono modificate.","Salvato.","Salvataggio non riuscito.","Salvataggio…"],
es:["Google Search Console","Conecta RankFix a Google Search Console con acceso de solo lectura.","Conectar Google","Elegir propiedad","Guardar","Aún no conectado.","RankFix solicita solo acceso de lectura. No modifica la configuración de Search Console.","Guardado.","No se pudo guardar.","Guardando…"]
} as const;

export default function Page(){
 const[l,setL]=useState<Locale>("nl");
 const[data,setData]=useState<PropertiesResponse|null>(null);
 const[selected,setSelected]=useState("");
 const[busy,setBusy]=useState(false);
 const[message,setMessage]=useState("");
 useEffect(()=>{
  fetch("/api/account/language").then(r=>r.ok?r.json():null).then(d=>{if(d?.language)setL(d.language)});
  fetch("/api/google/search-console/properties",{cache:"no-store"}).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d?.error||"load");return d as PropertiesResponse}).then(d=>{setData(d);const initial=d.selectedSiteUrl||(d.properties?.length===1?d.properties[0].siteUrl:"");setSelected(initial)}).catch(()=>setData({connected:false,properties:[]}))
 },[]);
 const t=copy[l];
 async function save(){
  const p=data?.properties?.find(x=>x.siteUrl===selected);
  if(!p||busy)return;
  setBusy(true);setMessage("");
  try{
   const r=await fetch("/api/google/search-console/properties",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({siteUrl:p.siteUrl,permissionLevel:p.permissionLevel})});
   const d=await r.json().catch(()=>({}));
   if(!r.ok)throw new Error(d?.error||t[8]);
   setData(current=>current?{...current,selectedSiteUrl:p.siteUrl,properties:current.properties.map(x=>({...x,selected:x.siteUrl===p.siteUrl}))}:current);
   setSelected(p.siteUrl);setMessage(t[7]);
  }catch(cause){setMessage(cause instanceof Error?cause.message:t[8])}finally{setBusy(false)}
 }
 return <main className="rf-page" lang={l}><div className="rf-shell"><header className="rf-header"><a href="/dashboard" className="rf-brand">RankFix <span>AI</span></a></header><DashboardNav/><div className="rf-body"><div className="rf-heading"><h1>{t[0]}</h1><p>{t[1]}</p></div><section className="rounded-2xl border border-blue-400/20 bg-blue-400/[0.06] p-5"><p className="text-sm text-slate-400">{t[6]}</p>{!data?.connected?<><p className="mt-4 text-slate-300">{t[5]}</p><a className="rf-primary-link mt-4 inline-flex" href="/api/google/search-console/connect">{t[2]}</a></>:<div className="mt-4"><label className="block text-sm font-bold text-white">{t[3]}</label><select className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 p-3" value={selected} onChange={e=>{setSelected(e.target.value);setMessage("")}}><option value="">—</option>{data.properties?.map(p=><option key={p.siteUrl} value={p.siteUrl}>{p.siteUrl}</option>)}</select><button type="button" className="rf-primary-link mt-3" disabled={!selected||busy} onClick={save}>{busy?t[9]:t[4]}</button>{message&&<p className="mt-3 text-sm text-slate-300" role="status">{message}</p>}</div>}</section></div></div></main>
}
