import { ImageResponse } from "next/og";

const copy={
 nl:{line1:"Jouw website.",line2:"Meer zichtbaarheid.",desc:"SEO & GEO audits voor Google en AI-search met concrete fixes.",result:"Jouw RankFix resultaat",overall:"Totaal",grade:"Score A",reports:"Rapporten"},
 en:{line1:"Your website.",line2:"More visibility.",desc:"SEO & GEO audits for Google and AI search with concrete fixes.",result:"Your RankFix result",overall:"Overall",grade:"Grade A",reports:"Reports"},
 de:{line1:"Deine Website.",line2:"Mehr Sichtbarkeit.",desc:"SEO- & GEO-Audits für Google und AI Search mit konkreten Fixes.",result:"Dein RankFix-Ergebnis",overall:"Gesamt",grade:"Note A",reports:"Berichte"},
 fr:{line1:"Votre site.",line2:"Plus de visibilité.",desc:"Audits SEO & GEO pour Google et la recherche IA avec des correctifs concrets.",result:"Votre résultat RankFix",overall:"Global",grade:"Note A",reports:"Rapports"},
 it:{line1:"Il tuo sito.",line2:"Più visibilità.",desc:"Audit SEO & GEO per Google e ricerca AI con fix concreti.",result:"Il tuo risultato RankFix",overall:"Totale",grade:"Voto A",reports:"Report"},
 es:{line1:"Tu web.",line2:"Más visibilidad.",desc:"Auditorías SEO & GEO para Google y búsqueda con IA con mejoras concretas.",result:"Tu resultado RankFix",overall:"Total",grade:"Nota A",reports:"Informes"}
} as const;

export async function GET(request:Request){
 const lang=new URL(request.url).searchParams.get("lang")||"nl";
 const t=copy[lang as keyof typeof copy]||copy.nl;
 return new ImageResponse(<div style={{width:"100%",height:"100%",display:"flex",background:"linear-gradient(135deg,#07111f 0%,#0b1d3a 48%,#34206f 100%)",color:"white",padding:"64px",fontFamily:"Arial,sans-serif"}}>
  <div style={{display:"flex",flexDirection:"column",width:"58%",justifyContent:"space-between"}}>
   <div style={{display:"flex",fontSize:48,fontWeight:800}}><span>Rank</span><span style={{color:"#27a7ff"}}>Fix</span></div>
   <div style={{display:"flex",flexDirection:"column"}}><div style={{fontSize:66,lineHeight:1.02,fontWeight:800}}>{t.line1}</div><div style={{fontSize:66,lineHeight:1.02,fontWeight:800,color:"#55b8ff"}}>{t.line2}</div><div style={{marginTop:26,fontSize:28,color:"#c5d4ea",lineHeight:1.35}}>{t.desc}</div></div>
   <div style={{display:"flex",gap:16,fontSize:22,color:"#d9e7f7"}}><span>SEO</span><span>•</span><span>GEO</span><span>•</span><span>Fix</span><span>•</span><span>{t.reports}</span></div>
  </div>
  <div style={{display:"flex",width:"42%",alignItems:"center",justifyContent:"center"}}><div style={{width:390,height:390,borderRadius:36,background:"rgba(7,17,31,.78)",border:"2px solid rgba(76,180,255,.5)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
   <div style={{fontSize:24,color:"#9fb4cf"}}>{t.result}</div><div style={{marginTop:22,width:190,height:190,borderRadius:"50%",border:"18px solid #35e58a",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}><div style={{fontSize:64,fontWeight:800}}>98</div><div style={{fontSize:22}}>{t.overall}</div></div><div style={{marginTop:20,fontSize:22,color:"#35e58a",fontWeight:700}}>{t.grade}</div>
  </div></div>
 </div>,{width:1200,height:630});
}