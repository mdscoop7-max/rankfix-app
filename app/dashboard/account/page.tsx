"use client";
import { useEffect, useState } from "react";
import { languageNames, type Locale } from "@/lib/locales";
import DashboardNav from "../nav";
import "../dashboard.css";
import "./account.css";
const ui: Record<Locale,{title:string;description:string;language:string;save:string;saving:string;saved:string;email:string;credits:string;security:string;password:string;logout:string}> = {
 nl:{title:"Accountinstellingen",description:"Beheer je profiel en dashboardtaal.",language:"Dashboardtaal",save:"Taal opslaan",saving:"Opslaan…",saved:"Taal opgeslagen.",email:"E-mailadres",credits:"Credits",security:"Beveiliging",password:"Wachtwoord opnieuw instellen",logout:"Uitloggen"},
 en:{title:"Account settings",description:"Manage your profile and dashboard language.",language:"Dashboard language",save:"Save language",saving:"Saving…",saved:"Language saved.",email:"Email address",credits:"Credits",security:"Security",password:"Reset password",logout:"Log out"},
 fr:{title:"Paramètres du compte",description:"Gérez votre profil et la langue du tableau de bord.",language:"Langue du tableau de bord",save:"Enregistrer la langue",saving:"Enregistrement…",saved:"Langue enregistrée.",email:"Adresse e-mail",credits:"Crédits",security:"Sécurité",password:"Réinitialiser le mot de passe",logout:"Se déconnecter"},
 es:{title:"Configuración de cuenta",description:"Gestiona tu perfil y el idioma del panel.",language:"Idioma del panel",save:"Guardar idioma",saving:"Guardando…",saved:"Idioma guardado.",email:"Correo electrónico",credits:"Créditos",security:"Seguridad",password:"Restablecer contraseña",logout:"Cerrar sesión"},
 it:{title:"Impostazioni account",description:"Gestisci profilo e lingua della dashboard.",language:"Lingua della dashboard",save:"Salva lingua",saving:"Salvataggio…",saved:"Lingua salvata.",email:"Indirizzo e-mail",credits:"Crediti",security:"Sicurezza",password:"Reimposta password",logout:"Esci"},
 de:{title:"Kontoeinstellungen",description:"Verwalte dein Profil und die Dashboard-Sprache.",language:"Dashboard-Sprache",save:"Sprache speichern",saving:"Speichern…",saved:"Sprache gespeichert.",email:"E-Mail-Adresse",credits:"Credits",security:"Sicherheit",password:"Passwort zurücksetzen",logout:"Abmelden"}
};
type User = { name:string; email:string; credits:number };
export default function AccountSettings() {
 const [user,setUser] = useState<User|null>(null), [language,setLanguage] = useState<Locale>("nl"), [busy,setBusy] = useState(false), [message,setMessage] = useState("");
 useEffect(() => { Promise.all([fetch("/api/auth/me").then(r => r.json()),fetch("/api/account/language").then(r => r.ok ? r.json() : null)]).then(([account,preferences]) => { if(!account.user){ location.href="/account"; return; } setUser(account.user); if(preferences?.language in ui) setLanguage(preferences.language); }).catch(() => setMessage("Account laden mislukt.")); },[]);
 async function save() { setBusy(true);setMessage("");try { const response=await fetch("/api/account/language",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({language})});if(!response.ok) throw new Error();setMessage(ui[language].saved); }catch{setMessage("Opslaan mislukt.");}finally{setBusy(false);} }
 async function logout() { await fetch("/api/auth/logout",{method:"POST"});location.href="/"; }
 const t=ui[language];
 return <main className="rf-page" lang={language}><div className="rf-shell"><header className="rf-header"><a href="/dashboard" className="rf-brand">RankFix <span>AI</span></a><a href="/dashboard" className="rf-back">← Dashboard</a></header><DashboardNav current={4}/><div className="rf-body"><div className="rf-heading"><h1>{t.title}</h1><p>{t.description}</p></div><div className="rf-account-grid"><section className="rf-card"><h2>{user?.name || "…"}</h2><p>{t.email}: {user?.email || "—"}</p><p>{t.credits}: {user?.credits ?? "—"}</p></section><section className="rf-card"><label htmlFor="dashboard-language">{t.language}</label><select id="dashboard-language" value={language} onChange={e => setLanguage(e.target.value as Locale)}>{Object.entries(languageNames).map(([code,name]) => <option key={code} value={code}>{name}</option>)}</select><button onClick={save} disabled={busy}>{busy ? t.saving : t.save}</button>{message && <p role="status">{message}</p>}</section><section className="rf-card"><h2>{t.security}</h2><a href={`/account/forgot-password?lang=${language}`}>{t.password} →</a><button onClick={logout}>{t.logout}</button></section></div></div></div></main>;
}
