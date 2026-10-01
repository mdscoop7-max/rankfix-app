import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { ensureDatabase } from "@/lib/db-init";
import { auditSite } from "@/lib/site-audit";

// Deployment marker: customer-flow i18n bundle.
import { normalizePlan, planLimits } from "@/lib/plans";

export async function POST(request: Request) {
 const body=await request.json().catch(()=>({}));
 const language=typeof body?.language==="string"&&["nl","en","de","fr","it","es"].includes(body.language)?body.language:"nl";
 const tr=(v:Record<string,string>)=>v[language]||v.nl;
 const user=await getCurrentUser();
 if(!user)return NextResponse.json({error:tr({nl:"Log in om een Local SEO scan uit te voeren.",en:"Log in to run a Local SEO scan.",de:"Melde dich an, um einen Local-SEO-Scan auszuführen.",fr:"Connectez-vous pour lancer une analyse SEO local.",it:"Accedi per eseguire una scansione SEO locale.",es:"Inicia sesión para ejecutar un análisis SEO local."})},{status:401});
 await ensureDatabase();
 const planResult=await getDb().query("SELECT plan_code FROM users WHERE id=$1 LIMIT 1",[user.id]);
 const plan=normalizePlan(planResult.rows[0]?.plan_code); const limits=planLimits(plan);
 if(limits.localSeo===0)return NextResponse.json({error:tr({nl:"Geavanceerde Local SEO is beschikbaar met een betaald abonnement.",en:"Advanced Local SEO is available with a paid plan.",de:"Erweiterte Local SEO ist mit einem kostenpflichtigen Tarif verfügbar.",fr:"Le SEO local avancé est disponible avec une offre payante.",it:"La SEO locale avanzata è disponibile con un piano a pagamento.",es:"El SEO local avanzado está disponible con un plan de pago."}),code:"PAID_PLAN_REQUIRED"},{status:403});
 try{
  const monthStart=new Date();monthStart.setUTCDate(1);monthStart.setUTCHours(0,0,0,0);
  const usageResult=await getDb().query("SELECT COUNT(*)::int AS count FROM usage_events WHERE user_id=$1 AND event_type='LOCAL_SEO' AND created_at >= $2",[user.id,monthStart.toISOString()]);
  const used=Number(usageResult.rows[0]?.count||0);
  if(used>=limits.localSeo)return NextResponse.json({error:tr({nl:"Je maandelijkse limiet voor Local SEO-scans is bereikt.",en:"You have reached your monthly Local SEO scan limit.",de:"Du hast dein monatliches Limit für Local-SEO-Scans erreicht.",fr:"Vous avez atteint votre limite mensuelle d’analyses SEO local.",it:"Hai raggiunto il limite mensile di scansioni SEO locale.",es:"Has alcanzado tu límite mensual de análisis SEO local."}),code:"LOCAL_SEO_LIMIT",usage:{plan,used,limit:limits.localSeo}},{status:429});
  const url=typeof body?.url==="string"?body.url.trim():"";
  if(!url)return NextResponse.json({error:tr({nl:"Vul een website-URL in.",en:"Enter a website URL.",de:"Gib eine Website-URL ein.",fr:"Saisissez l’URL d’un site.",it:"Inserisci l’URL di un sito.",es:"Introduce la URL de un sitio web."})},{status:400});
  const audit=await auditSite(url,"QUICK");
  const localPages=audit.page_types.local_business||0;
  // The site-audit rule itself is only applicable to pages confidently classified as local_business.
  // Do not turn absence of local signals on a generic website into a Local SEO warning.
  const localApplicability = localPages > 0;
  const localRule=audit.issues.find(i=>i.rule_id==="SITE_LOCAL_BUSINESS_IDENTITY");
  const schemaRule=audit.issues.find(i=>i.rule_id==="SITE_STRUCTURED_DATA_MISSING");
  const na=tr({nl:"Niet van toepassing.",en:"Not applicable.",de:"Nicht zutreffend.",fr:"Non applicable.",it:"Non applicabile.",es:"No aplicable."});
  const localizedRuleDetail=(rule:typeof localRule)=>{
   if(!rule)return na;
   const count=Array.isArray(rule?.evidence?.examples)?rule.evidence.examples.length:0;
   if(rule.status==="PASS")return tr({nl:"Controle bevestigd met bewijs uit de gescande website.",en:"Check confirmed with evidence from the scanned website.",de:"Prüfung mit Nachweisen aus der gescannten Website bestätigt.",fr:"Contrôle confirmé avec des preuves du site analysé.",it:"Controllo confermato con prove dal sito analizzato.",es:"Comprobación confirmada con evidencia del sitio analizado."});
   if(rule.status==="UNABLE_TO_CONFIRM")return tr({nl:"Deze controle kon met de beschikbare websitegegevens niet worden bevestigd.",en:"This check could not be confirmed with the available website data.",de:"Diese Prüfung konnte mit den verfügbaren Website-Daten nicht bestätigt werden.",fr:"Ce contrôle n’a pas pu être confirmé avec les données disponibles du site.",it:"Questo controllo non è stato confermato con i dati disponibili del sito.",es:"Esta comprobación no pudo confirmarse con los datos disponibles del sitio."});
   return tr({nl:"Aandacht nodig op basis van "+count+" bewijsvoorbeeld(en) uit de scan.",en:"Attention needed based on "+count+" evidence example(s) from the scan.",de:"Aufmerksamkeit erforderlich, basierend auf "+count+" Nachweisbeispiel(en) aus dem Scan.",fr:"Attention requise sur la base de "+count+" exemple(s) de preuve de l’analyse.",it:"Richiede attenzione in base a "+count+" esempio/i di prova della scansione.",es:"Requiere atención según "+count+" ejemplo(s) de evidencia del análisis."});
  };
  const checks=[
   {id:"local-signals",title:tr({nl:"Lokale bedrijfssignalen",en:"Local business signals",de:"Lokale Unternehmenssignale",fr:"Signaux d’entreprise locale",it:"Segnali dell’attività locale",es:"Señales de negocio local"}),status:localApplicability?"PASS":"NOT_APPLICABLE",detail:localPages>0?tr({nl:`${localPages} lokale bedrijfspagina('s) herkend.`,en:`${localPages} local business page(s) detected.`,de:`${localPages} lokale Unternehmensseite(n) erkannt.`,fr:`${localPages} page(s) d’entreprise locale détectée(s).`,it:`${localPages} pagina/e di attività locale rilevata/e.`,es:`${localPages} página(s) de negocio local detectada(s).`}):tr({nl:"Geen pagina met voldoende lokale bedrijfssignalen herkend. Controleer of naam, locatie en contactinformatie duidelijk zichtbaar zijn.",en:"No page with sufficient local business signals was detected. Check that the business name, location and contact details are clearly visible.",de:"Keine Seite mit ausreichenden lokalen Unternehmenssignalen erkannt. Prüfe, ob Name, Standort und Kontaktdaten klar sichtbar sind.",fr:"Aucune page avec suffisamment de signaux d’entreprise locale n’a été détectée. Vérifiez que le nom, l’emplacement et les coordonnées sont clairement visibles.",it:"Nessuna pagina con segnali locali sufficienti è stata rilevata. Verifica che nome, posizione e contatti siano chiaramente visibili.",es:"No se detectó ninguna página con suficientes señales de negocio local. Comprueba que el nombre, la ubicación y los datos de contacto sean claramente visibles."})},
   {id:"local-schema",title:"LocalBusiness structured data",status:localRule?.status||"NOT_APPLICABLE",detail:localizedRuleDetail(localRule)},
   {id:"structured-data",title:"Structured data",status:schemaRule?.status||"NOT_APPLICABLE",detail:localizedRuleDetail(schemaRule)}
  ];
  const applicable=checks.filter(c=>c.status!=="NOT_APPLICABLE"&&c.status!=="UNABLE_TO_CONFIRM");
  const earned=applicable.reduce((n,c)=>n+(c.status==="PASS"?1:c.status==="WARNING"?0.5:0),0);
  const score=applicable.length?Math.round((earned/applicable.length)*100):0;
  await getDb().query("INSERT INTO usage_events (user_id,website_host,event_type) VALUES ($1,$2,'LOCAL_SEO')",[user.id,new URL(audit.finalUrl).hostname.toLowerCase().replace(/^www\./,"")]);
  return NextResponse.json({url:audit.finalUrl,score,checks,crawl:audit.crawl,scope:audit.crawl.scope,coverage:{applicable:applicable.length,total:checks.length},notice:tr({nl:"RankFix beoordeelt alleen signalen die op de website zelf aantoonbaar zijn. Google Business Profile, reviews en externe directories zijn nog niet gekoppeld.",en:"RankFix only evaluates signals that can be verified on the website itself. Google Business Profile, reviews and external directories are not connected yet.",de:"RankFix bewertet nur Signale, die auf der Website selbst nachweisbar sind. Google Business Profile, Bewertungen und externe Verzeichnisse sind noch nicht verbunden.",fr:"RankFix évalue uniquement les signaux vérifiables sur le site lui-même. Google Business Profile, les avis et les annuaires externes ne sont pas encore connectés.",it:"RankFix valuta solo i segnali verificabili sul sito stesso. Google Business Profile, recensioni e directory esterne non sono ancora collegati.",es:"RankFix solo evalúa señales verificables en el propio sitio web. Google Business Profile, las reseñas y los directorios externos aún no están conectados."})});
 }catch(error){return NextResponse.json({error:tr({nl:"De Local SEO scan kon niet worden uitgevoerd.",en:"The Local SEO scan could not be completed.",de:"Der Local-SEO-Scan konnte nicht durchgeführt werden.",fr:"L’analyse SEO local n’a pas pu être effectuée.",it:"Non è stato possibile completare la scansione SEO locale.",es:"No se pudo completar el análisis SEO local."}),code:error instanceof Error?error.message:"LOCAL_SCAN_FAILED"},{status:502})}
}
