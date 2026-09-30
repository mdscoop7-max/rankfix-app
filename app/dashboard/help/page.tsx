"use client";
import { useEffect, useState } from "react";
import AiAssistant from "@/components/ai-assistant";
import DashboardNav from "../nav";
import type { Locale } from "@/lib/locales";
import "../dashboard.css";

type Topic={id:string;title:string;body:string;video?:boolean;href?:string};
const labels:Record<Locale,{title:string;intro:string;ai:string;aiBody:string;read:string;video:string;videoSoon:string;open:string;topics:Topic[]}>={
nl:{title:"Helpcentrum",intro:"Alle uitleg voor RankFix op één plek. Begin met de korte uitleg, vraag AI om hulp en gebruik alleen bij moeilijke handelingen een korte video.",ai:"🤖 Vraag RankFix AI",aiBody:"AI kan je scan en het gekozen probleem uitleggen en vertelt precies wat je volgende stap is.",read:"Uitleg",video:"Korte video",videoSoon:"Video wordt toegevoegd",open:"Open",topics:[
{id:"getting-started",title:"Starten met RankFix",body:"Voer je website in, start een scan en open daarna de verbeterpunten. RankFix laat per probleem zien wat er mis is, waarom het belangrijk is en hoe je verdergaat."},
{id:"scans",title:"Scans en scores",body:"Een score is een momentopname. Alleen bewezen en toepasselijke controles tellen mee. Een fix is pas opgelost wanneer een nieuwe live scan dit bevestigt."},
{id:"problem-solving",title:"Problemen oplossen",body:"Ieder probleem krijgt een route: AI-fix, GitHub-fix, koppeling, klantgegevens of begeleide stappen. Geen probleem hoort zonder vervolgstap te eindigen."},
{id:"ai-fixes",title:"AI-fixes",body:"AI maakt een voorstel dat je eerst kunt bekijken. RankFix verandert niet stilletjes je live website. Na publicatie controleert een nieuwe scan het resultaat."},
{id:"github-connect",title:"GitHub koppelen",body:"Koppel GitHub, kies één keer de repository van je website en laat RankFix daarna branch, bestand en technische context bepalen.",video:true,href:"/dashboard/github"},
{id:"github-pr",title:"GitHub-fix en Pull Request",body:"Bekijk eerst de diff-preview. Na jouw goedkeuring maakt RankFix een aparte Pull Request. Er wordt niets automatisch naar productie gemerged.",video:true,href:"/dashboard/github"},
{id:"search-console",title:"Google Search Console",body:"Koppel Search Console om beschikbare zoekprestatiegegevens in RankFix te gebruiken. AI helpt daarna de gegevens in gewone taal te begrijpen.",video:true,href:"/dashboard/search-console"},
{id:"merchant-center",title:"Merchant Center en Google-koppelingen",body:"Voor webshops toont RankFix alleen de koppeling wanneer die nodig is. De klant krijgt dan korte stappen en waar nodig een video.",video:true},
{id:"shops",title:"Shopify, WooCommerce en webshops",body:"RankFix herkent waar mogelijk het platform. Als externe autorisatie nodig is, krijg je begeleide stappen; ingewikkelde koppelingen krijgen een korte video.",video:true},
{id:"seo-geo",title:"SEO, GEO en content",body:"Voor titles, descriptions, headings, alt-tekst, structured data en AI-search signalen krijg je korte uitleg en waar veilig een directe fixroute."},
{id:"links",title:"Broken links, redirects en techniek",body:"RankFix toont het bewijs, de aanbevolen wijziging en hoe je daarna opnieuw controleert. AI kan de technische uitleg vereenvoudigen."},
{id:"account",title:"Account, historie en problemen",body:"Gebruik historie om scans te vergelijken. Bij een fout vertelt RankFix of het om je account, RankFix, GitHub of een blokkade van de gescande website gaat."}
]},
en:{title:"Help center",intro:"All RankFix help in one place. Read the short explanation, ask AI, and use a short video only for difficult actions.",ai:"🤖 Ask RankFix AI",aiBody:"AI can explain your scan and selected issue and tell you the exact next step.",read:"Explanation",video:"Short video",videoSoon:"Video will be added",open:"Open",topics:[]},
de:{title:"Hilfe-Center",intro:"Alle RankFix-Hilfe an einem Ort. Kurze Erklärung lesen, AI fragen und Videos nur für schwierige Schritte nutzen.",ai:"🤖 RankFix AI fragen",aiBody:"AI erklärt Scan und Problem und nennt den nächsten Schritt.",read:"Erklärung",video:"Kurzes Video",videoSoon:"Video wird hinzugefügt",open:"Öffnen",topics:[]},
fr:{title:"Centre d’aide",intro:"Toute l’aide RankFix au même endroit. Lisez l’explication, demandez à l’IA et utilisez une vidéo seulement pour les étapes difficiles.",ai:"🤖 Demander à RankFix AI",aiBody:"L’IA explique l’analyse et le problème sélectionné puis indique l’étape suivante.",read:"Explication",video:"Vidéo courte",videoSoon:"Vidéo à venir",open:"Ouvrir",topics:[]},
it:{title:"Centro assistenza",intro:"Tutto l’aiuto RankFix in un unico posto. Leggi la spiegazione, chiedi all’AI e usa i video solo per i passaggi difficili.",ai:"🤖 Chiedi a RankFix AI",aiBody:"L’AI spiega scansione e problema e indica il prossimo passo.",read:"Spiegazione",video:"Video breve",videoSoon:"Video in arrivo",open:"Apri",topics:[]},
es:{title:"Centro de ayuda",intro:"Toda la ayuda de RankFix en un solo lugar. Lee la explicación, pregunta a la IA y usa vídeo solo para pasos difíciles.",ai:"🤖 Pregunta a RankFix AI",aiBody:"La IA explica el análisis y el problema y te indica el siguiente paso.",read:"Explicación",video:"Vídeo corto",videoSoon:"Vídeo próximamente",open:"Abrir",topics:[]}
};
const fallbackTitles:Record<Exclude<Locale,"nl">,string[]>={
en:["Getting started with RankFix","Scans and scores","Fixing problems","AI fixes","Connect GitHub","GitHub fix and Pull Request","Google Search Console","Merchant Center and Google connections","Shopify, WooCommerce and stores","SEO, GEO and content","Broken links, redirects and technical","Account, history and troubleshooting"],
de:["Mit RankFix starten","Scans und Scores","Probleme beheben","AI-Fixes","GitHub verbinden","GitHub-Fix und Pull Request","Google Search Console","Merchant Center und Google-Verbindungen","Shopify, WooCommerce und Shops","SEO, GEO und Inhalte","Defekte Links, Weiterleitungen und Technik","Konto, Verlauf und Fehlerbehebung"],
fr:["Bien démarrer avec RankFix","Analyses et scores","Corriger les problèmes","Correctifs IA","Connecter GitHub","Correctif GitHub et Pull Request","Google Search Console","Merchant Center et connexions Google","Shopify, WooCommerce et boutiques","SEO, GEO et contenu","Liens cassés, redirections et technique","Compte, historique et dépannage"],
it:["Iniziare con RankFix","Scansioni e punteggi","Risolvere i problemi","Fix AI","Collega GitHub","Fix GitHub e Pull Request","Google Search Console","Merchant Center e collegamenti Google","Shopify, WooCommerce e negozi","SEO, GEO e contenuti","Link interrotti, redirect e tecnica","Account, cronologia e problemi"],
es:["Empezar con RankFix","Análisis y puntuaciones","Resolver problemas","Correcciones con IA","Conectar GitHub","Corrección GitHub y Pull Request","Google Search Console","Merchant Center y conexiones de Google","Shopify, WooCommerce y tiendas","SEO, GEO y contenido","Enlaces rotos, redirecciones y técnica","Cuenta, historial y problemas"]
};
function localizedTopics(language:Locale):Topic[]{
 const base=labels.nl.topics;
 if(language==="nl") return base;
 const titles=fallbackTitles[language];
 return base.map((x,i)=>({...x,title:titles[i]}));
}
export default function HelpPage(){
 const [open,setOpen]=useState<string>("getting-started"); const [language,setLanguage]=useState<Locale>("nl");
 useEffect(()=>{fetch("/api/account/language").then(r=>r.ok?r.json():null).then(d=>{if(d?.language&&d.language in labels)setLanguage(d.language)}).catch(()=>{})},[]);
 useEffect(()=>{const id=location.hash.slice(1);if(id)setOpen(id)},[]);
 const t=labels[language]; const topics=localizedTopics(language);
 return <main className="rf-page" lang={language}><div className="rf-shell"><header className="rf-header"><a href="/" className="rf-brand">RankFix <span>AI</span></a></header><DashboardNav/><div className="rf-body">
 <div className="rf-heading"><h1>{t.title}</h1><p>{t.intro}</p></div>
 <section className="rf-help-ai"><strong>{t.ai}</strong><p>{t.aiBody}</p></section>
 <div className="rf-help-grid">{topics.map(topic=><section id={topic.id} key={topic.id} className="rf-help-topic"><button type="button" onClick={()=>setOpen(open===topic.id?"":topic.id)} aria-expanded={open===topic.id}><span><b>{topic.title}</b><em>{open===topic.id?"−":"+"}</em></span></button>{open===topic.id&&<div><p>{topic.body}</p><div className="mt-3 flex flex-wrap gap-2">{topic.href&&<a className="rf-primary-link" href={topic.href}>{t.open} →</a>}{topic.video&&<span className="rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-400">▶ {t.video} · {t.videoSoon}</span>}</div></div>}</section>)}</div>
 </div></div><AiAssistant dashboard/></main>
}
