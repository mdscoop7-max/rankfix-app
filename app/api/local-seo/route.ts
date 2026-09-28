import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { ensureDatabase } from "@/lib/db-init";
import { auditSite } from "@/lib/site-audit";

export async function POST(request: Request) {
 const body=await request.json().catch(()=>({}));
 const language=typeof body?.language==="string"&&["nl","en","de","fr","it","es"].includes(body.language)?body.language:"nl";
 const tr=(v:Record<string,string>)=>v[language]||v.nl;
 const user=await getCurrentUser();
 if(!user)return NextResponse.json({error:tr({nl:"Log in om een Local SEO scan uit te voeren.",en:"Log in to run a Local SEO scan.",de:"Melde dich an, um einen Local-SEO-Scan auszuführen.",fr:"Connectez-vous pour lancer une analyse SEO local.",it:"Accedi per eseguire una scansione SEO locale.",es:"Inicia sesión para ejecutar un análisis SEO local."})},{status:401});
 await ensureDatabase();
 const planResult=await getDb().query("SELECT plan_code FROM users WHERE id=$1 LIMIT 1",[user.id]);
 if(String(planResult.rows[0]?.plan_code||"free").toLowerCase()==="free")return NextResponse.json({error:tr({nl:"Geavanceerde Local SEO is beschikbaar met een betaald abonnement.",en:"Advanced Local SEO is available with a paid plan.",de:"Erweiterte Local SEO ist mit einem kostenpflichtigen Tarif verfügbar.",fr:"Le SEO local avancé est disponible avec une offre payante.",it:"La SEO locale avanzata è disponibile con un piano a pagamento.",es:"El SEO local avanzado está disponible con un plan de pago."}),code:"PAID_PLAN_REQUIRED"},{status:403});
 try{
  const url=typeof body?.url==="string"?body.url.trim():"";
  if(!url)return NextResponse.json({error:tr({nl:"Vul een website-URL in.",en:"Enter a website URL.",de:"Gib eine Website-URL ein.",fr:"Saisissez l’URL d’un site.",it:"Inserisci l’URL di un sito.",es:"Introduce la URL de un sitio web."})},{status:400});
  const audit=await auditSite(url,"QUICK");
  const localPages=audit.page_types.local_business||0;
  const localRule=audit.issues.find(i=>i.rule_id==="SITE_LOCAL_BUSINESS_IDENTITY");
  const schemaRule=audit.issues.find(i=>i.rule_id==="SITE_STRUCTURED_DATA_MISSING");
  const na=tr({nl:"Niet van toepassing.",en:"Not applicable.",de:"Nicht zutreffend.",fr:"Non applicable.",it:"Non applicabile.",es:"No aplicable."});
  const checks=[
   {id:"local-signals",title:tr({nl:"Lokale bedrijfssignalen",en:"Local business signals",de:"Lokale Unternehmenssignale",fr:"Signaux d’entreprise locale",it:"Segnali dell’attività locale",es:"Señales de negocio local"}),status:localPages>0?"PASS":"WARNING",detail:localPages>0?tr({nl:`${localPages} lokale bedrijfspagina('s) herkend.`,en:`${localPages} local business page(s) detected.`,de:`${localPages} lokale Unternehmensseite(n) erkannt.`,fr:`${localPages} page(s) d’entreprise locale détectée(s).`,it:`${localPages} pagina/e di attività locale rilevata/e.`,es:`${localPages} página(s) de negocio local detectada(s).`}):tr({nl:"Geen pagina met voldoende lokale bedrijfssignalen herkend. Controleer of naam, locatie en contactinformatie duidelijk zichtbaar zijn.",en:"No page with sufficient local business signals was detected. Check that the business name, location and contact details are clearly visible.",de:"Keine Seite mit ausreichenden lokalen Unternehmenssignalen erkannt. Prüfe, ob Name, Standort und Kontaktdaten klar sichtbar sind.",fr:"Aucune page avec suffisamment de signaux d’entreprise locale n’a été détectée. Vérifiez que le nom, l’emplacement et les coordonnées sont clairement visibles.",it:"Nessuna pagina con segnali locali sufficienti è stata rilevata. Verifica che nome, posizione e contatti siano chiaramente visibili.",es:"No se detectó ninguna página con suficientes señales de negocio local. Comprueba que el nombre, la ubicación y los datos de contacto sean claramente visibles."})},
   {id:"local-schema",title:"LocalBusiness structured data",status:localRule?.status||"NOT_APPLICABLE",detail:localRule?.evidence.examples[0]?.details||localRule?.description||na},
   {id:"structured-data",title:"Structured data",status:schemaRule?.status||"NOT_APPLICABLE",detail:schemaRule?.evidence.examples[0]?.details||schemaRule?.description||na}
  ];
  const penalties=checks.reduce((n,c)=>n+(c.status==="FAIL"?30:c.status==="WARNING"?15:0),0);
  return NextResponse.json({url:audit.finalUrl,score:Math.max(0,100-penalties),checks,crawl:audit.crawl,notice:tr({nl:"RankFix beoordeelt alleen signalen die op de website zelf aantoonbaar zijn. Google Business Profile, reviews en externe directories zijn nog niet gekoppeld.",en:"RankFix only evaluates signals that can be verified on the website itself. Google Business Profile, reviews and external directories are not connected yet.",de:"RankFix bewertet nur Signale, die auf der Website selbst nachweisbar sind. Google Business Profile, Bewertungen und externe Verzeichnisse sind noch nicht verbunden.",fr:"RankFix évalue uniquement les signaux vérifiables sur le site lui-même. Google Business Profile, les avis et les annuaires externes ne sont pas encore connectés.",it:"RankFix valuta solo i segnali verificabili sul sito stesso. Google Business Profile, recensioni e directory esterne non sono ancora collegati.",es:"RankFix solo evalúa señales verificables en el propio sitio web. Google Business Profile, las reseñas y los directorios externos aún no están conectados."})});
 }catch(error){return NextResponse.json({error:tr({nl:"De Local SEO scan kon niet worden uitgevoerd.",en:"The Local SEO scan could not be completed.",de:"Der Local-SEO-Scan konnte nicht durchgeführt werden.",fr:"L’analyse SEO local n’a pas pu être effectuée.",it:"Non è stato possibile completare la scansione SEO locale.",es:"No se pudo completar el análisis SEO local."}),code:error instanceof Error?error.message:"LOCAL_SCAN_FAILED"},{status:502})}
}
