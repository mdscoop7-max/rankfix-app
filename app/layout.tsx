import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";
import { SITE_URL } from "@/lib/site-url";

const geistSans=Geist({variable:"--font-geist-sans",subsets:["latin"]});
const geistMono=Geist_Mono({variable:"--font-geist-mono",subsets:["latin"]});
type Locale="nl"|"en"|"de"|"fr"|"it"|"es";
const meta:Record<Locale,{title:string;description:string;locale:string}>={
 nl:{title:"RankFix AI — SEO & GEO Audit met concrete fixes",description:"Scan je website op technische SEO, content, structured data en AI-search readiness. Krijg duidelijke verbeterpunten en concrete AI-fixvoorstellen.",locale:"nl_NL"},
 en:{title:"RankFix AI — SEO & GEO Audit with concrete fixes",description:"Audit your website for technical SEO, content, structured data and AI-search readiness. Get clear action points and concrete AI-powered fix proposals.",locale:"en_GB"},
 de:{title:"RankFix AI — SEO & GEO Audit mit konkreten Fixes",description:"Prüfe deine Website auf technisches SEO, Inhalte, strukturierte Daten und AI-Search-Bereitschaft. Erhalte klare Maßnahmen und konkrete AI-Fixvorschläge.",locale:"de_DE"},
 fr:{title:"RankFix AI — Audit SEO & GEO avec correctifs concrets",description:"Analysez votre site pour le SEO technique, le contenu, les données structurées et la recherche IA. Obtenez des actions claires et des correctifs IA concrets.",locale:"fr_FR"},
 it:{title:"RankFix AI — Audit SEO & GEO con correzioni concrete",description:"Analizza il sito per SEO tecnico, contenuti, dati strutturati e ricerca AI. Ottieni interventi chiari e proposte concrete di correzione con AI.",locale:"it_IT"},
 es:{title:"RankFix AI — Auditoría SEO & GEO con mejoras concretas",description:"Analiza tu web para SEO técnico, contenido, datos estructurados y búsquedas con IA. Obtén acciones claras y propuestas concretas de mejora con IA.",locale:"es_ES"}
};
export async function generateMetadata():Promise<Metadata>{
 const raw=(await headers()).get("x-rankfix-language")||"nl";
 const language:Locale=/^(nl|en|de|fr|it|es)$/.test(raw)?raw as Locale:"nl";
 const m=meta[language];
 const requestHeaders=await headers();
 const pathnameHint=requestHeaders.get("x-rankfix-pathname")||"";
 // Canonical and hreflang belong to the root homepage only. Every other page sets
 // its own (locale pages) or is private (noindex); inheriting "/nl" here made all
 // of them canonicalise to the Dutch homepage.
 const isRootHome=pathnameHint==="/";
 return {metadataBase:new URL(SITE_URL),title:m.title,description:m.description,
  ...(isRootHome?{alternates:{canonical:"/",languages:{nl:"/nl",en:"/en",de:"/de",fr:"/fr",it:"/it",es:"/es","x-default":"/nl"}}}:{}),
  openGraph:{type:"website",...(isRootHome?{url:"/"}:{}),siteName:"RankFix AI",locale:m.locale,title:m.title,description:m.description,images:[{url:"/opengraph-image",width:1200,height:630,alt:m.title}]},
  twitter:{card:"summary_large_image",title:m.title,description:m.description,images:["/opengraph-image"]}
 };
}
export default async function RootLayout({children}:LayoutProps<"/">){
 const raw=(await headers()).get("x-rankfix-language")||"nl";const language=/^(nl|en|fr|es|it|de)$/.test(raw)?raw:"nl";
 return <html lang={language} className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}><body className="min-h-full flex flex-col"><script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify({"@context":"https://schema.org","@graph":[{"@type":"Organization","@id":`${SITE_URL}/#organization`,name:"RankFix AI",url:`${SITE_URL}/`},{"@type":"WebSite","@id":`${SITE_URL}/#website`,url:`${SITE_URL}/`,name:"RankFix AI",publisher:{"@id":`${SITE_URL}/#organization`},inLanguage:["nl","en","de","fr","es","it"]}]})}}/>{children}</body></html>;
}