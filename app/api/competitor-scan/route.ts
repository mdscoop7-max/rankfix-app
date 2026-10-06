import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { ensureDatabase } from "@/lib/db-init";
import { auditSite } from "@/lib/site-audit";
import { normalizePlan, planLimits } from "@/lib/plans";
import { consumeRateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const body = await request.json().catch(()=>({}));
  const language = typeof body?.language==="string"&&["nl","en","de","fr","it","es"].includes(body.language)?body.language:"nl";
  const tr=(v:Record<string,string>)=>v[language]||v.nl;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error:tr({nl:"Log in om websites te vergelijken.",en:"Log in to compare websites.",de:"Melde dich an, um Websites zu vergleichen.",fr:"Connectez-vous pour comparer des sites.",it:"Accedi per confrontare i siti.",es:"Inicia sesión para comparar sitios web."}) }, { status: 401 });
  await ensureDatabase();
  if(!await consumeRateLimit("competitor-scan",String(user.id),4,600)) return NextResponse.json({error:tr({nl:"Te veel concurrentanalyses kort na elkaar. Probeer later opnieuw.",en:"Too many competitor analyses in a short period. Try again later.",de:"Zu viele Konkurrenzanalysen in kurzer Zeit. Versuche es später erneut.",fr:"Trop d’analyses concurrentielles en peu de temps. Réessayez plus tard.",it:"Troppe analisi concorrenti in poco tempo. Riprova più tardi.",es:"Demasiados análisis de competencia en poco tiempo. Inténtalo más tarde."}),code:"RATE_LIMITED"},{status:429});
  const planResult = await getDb().query("SELECT plan_code FROM users WHERE id=$1 LIMIT 1", [user.id]);
  const plan=normalizePlan(planResult.rows[0]?.plan_code); const limits=planLimits(plan);
  const internalTestAccount = process.env.RANKFIX_INTERNAL_TEST_USER_ID === user.id || process.env.RANKFIX_INTERNAL_TEST_EMAIL?.toLowerCase() === String(user.email||"").toLowerCase();
  if (!internalTestAccount && limits.competitorScans === 0) {
    return NextResponse.json({ error:tr({nl:"Concurrentanalyse is beschikbaar met een betaald abonnement.",en:"Competitor analysis is available with a paid plan.",de:"Die Konkurrenzanalyse ist mit einem kostenpflichtigen Tarif verfügbar.",fr:"L’analyse concurrentielle est disponible avec une offre payante.",it:"L’analisi concorrente è disponibile con un piano a pagamento.",es:"El análisis de competencia está disponible con un plan de pago."}), code:"PAID_PLAN_REQUIRED" }, { status:403 });
  }
  try {
    const monthStart=new Date(); monthStart.setUTCDate(1); monthStart.setUTCHours(0,0,0,0);
    const usageResult=await getDb().query("SELECT COUNT(*)::int AS count FROM usage_events WHERE user_id=$1 AND event_type='COMPETITOR_SCAN' AND created_at >= $2",[user.id,monthStart.toISOString()]);
    const used=Number(usageResult.rows[0]?.count||0);
    if(!internalTestAccount&&used>=limits.competitorScans) return NextResponse.json({error:tr({nl:"Je maandelijkse limiet voor concurrentanalyses is bereikt.",en:"You have reached your monthly competitor analysis limit.",de:"Du hast dein monatliches Limit für Konkurrenzanalysen erreicht.",fr:"Vous avez atteint votre limite mensuelle d’analyses concurrentielles.",it:"Hai raggiunto il limite mensile di analisi concorrenti.",es:"Has alcanzado tu límite mensual de análisis de competencia."}),code:"COMPETITOR_SCAN_LIMIT",usage:{plan,used,limit:limits.competitorScans}},{status:429});
    const website = typeof body?.website === "string" ? body.website.trim() : "";
    const competitor = typeof body?.competitor === "string" ? body.competitor.trim() : "";
    if (!website || !competitor) return NextResponse.json({ error:tr({nl:"Vul je website en een concurrent in.",en:"Enter your website and a competitor.",de:"Gib deine Website und einen Konkurrenten ein.",fr:"Saisissez votre site et un concurrent.",it:"Inserisci il tuo sito e un concorrente.",es:"Introduce tu web y un competidor."}) }, { status: 400 });
    const [own, other] = await Promise.all([auditSite(website, "QUICK"), auditSite(competitor, "QUICK")]);
    const active = (a: typeof own) => a.issues.filter(i => i.status === "FAIL" || i.status === "WARNING");
    const ownIssues = active(own), competitorIssues = active(other);
    const competitorPasses = new Set(other.issues.filter(i => i.status === "PASS" && i.confidence !== "low" && i.evidence?.examples?.length > 0).map(i => i.rule_id));
    const opportunityCopy=(ruleId:string)=> {
      const known:Record<string,Record<string,{title:string;recommendation:string}>>={
        SITE_TITLE_MISSING:{
          nl:{title:"Paginatitel",recommendation:"Voeg een duidelijke, unieke paginatitel toe."},en:{title:"Page title",recommendation:"Add a clear, unique page title."},de:{title:"Seitentitel",recommendation:"Füge einen klaren, eindeutigen Seitentitel hinzu."},fr:{title:"Titre de page",recommendation:"Ajoutez un titre de page clair et unique."},it:{title:"Titolo pagina",recommendation:"Aggiungi un titolo di pagina chiaro e univoco."},es:{title:"Título de página",recommendation:"Añade un título de página claro y único."}
        },
        SITE_DESCRIPTION_MISSING:{
          nl:{title:"Meta description",recommendation:"Voeg een relevante meta description toe."},en:{title:"Meta description",recommendation:"Add a relevant meta description."},de:{title:"Meta-Beschreibung",recommendation:"Füge eine relevante Meta-Beschreibung hinzu."},fr:{title:"Méta-description",recommendation:"Ajoutez une méta-description pertinente."},it:{title:"Meta description",recommendation:"Aggiungi una meta description pertinente."},es:{title:"Meta description",recommendation:"Añade una meta description relevante."}
        },
        SITE_H1_MISSING:{
          nl:{title:"H1-kop",recommendation:"Voeg één duidelijke hoofdheading toe."},en:{title:"H1 heading",recommendation:"Add one clear main heading."},de:{title:"H1-Überschrift",recommendation:"Füge eine klare Hauptüberschrift hinzu."},fr:{title:"Titre H1",recommendation:"Ajoutez un titre principal clair."},it:{title:"Titolo H1",recommendation:"Aggiungi un titolo principale chiaro."},es:{title:"Encabezado H1",recommendation:"Añade un encabezado principal claro."}
        }
      };
      return known[ruleId]?.[language]||{
        title:tr({nl:"Bevestigde verbeterkans",en:"Confirmed improvement opportunity",de:"Bestätigte Verbesserungsmöglichkeit",fr:"Opportunité d’amélioration confirmée",it:"Opportunità di miglioramento confermata",es:"Oportunidad de mejora confirmada"}),
        recommendation:tr({nl:"Bekijk het bewijs uit je eigen scan en verbeter dit onderdeel.",en:"Review the evidence from your own scan and improve this area.",de:"Prüfe die Nachweise aus deinem eigenen Scan und verbessere diesen Bereich.",fr:"Consultez les preuves de votre propre analyse et améliorez ce point.",it:"Controlla le prove della tua scansione e migliora quest’area.",es:"Revisa la evidencia de tu propio análisis y mejora este punto."})
      };
    };
    const opportunities = ownIssues.filter(i => i.status !== "UNABLE_TO_CONFIRM" && i.status !== "NOT_APPLICABLE" && i.confidence !== "low" && i.evidence?.examples?.length > 0 && competitorPasses.has(i.rule_id)).slice(0, 8).map(i => {
      const copy=opportunityCopy(i.rule_id);
      return {rule_id:i.rule_id,title:copy.title,severity:i.severity,recommendation:copy.recommendation,evidence_count:i.evidence.examples.length};
    });
    await getDb().query("INSERT INTO usage_events (user_id,website_host,event_type) VALUES ($1,$2,'COMPETITOR_SCAN')",[user.id,new URL(own.finalUrl).hostname.toLowerCase().replace(/^www\./,"")]);
    return NextResponse.json({
      website:{url:own.finalUrl,scores:own.scores,issues:ownIssues.length,pages:own.crawl.pages},
      competitor:{url:other.finalUrl,scores:other.scores,issues:competitorIssues.length,pages:other.crawl.pages},
      opportunities,
      scope:{mode:"QUICK",website:own.crawl.scope,competitor:other.crawl.scope},
      notice:tr({nl:"Vergelijking op basis van dezelfde bevestigde QUICK-steekproef. Niet bevestigde of niet-toepasselijke controles worden niet als kans getoond.",en:"Comparison uses the same confirmed QUICK sample. Unconfirmed or non-applicable checks are not shown as opportunities.",de:"Der Vergleich basiert auf derselben bestätigten QUICK-Stichprobe. Nicht bestätigte oder nicht anwendbare Prüfungen werden nicht als Chance angezeigt.",fr:"La comparaison utilise le même échantillon QUICK confirmé. Les contrôles non confirmés ou non applicables ne sont pas présentés comme opportunités.",it:"Il confronto usa lo stesso campione QUICK confermato. I controlli non confermati o non applicabili non vengono mostrati come opportunità.",es:"La comparación usa la misma muestra QUICK confirmada. Las comprobaciones no confirmadas o no aplicables no se muestran como oportunidades."})
    });
  } catch (error) {
    return NextResponse.json({ error:tr({nl:"De vergelijking kon niet worden uitgevoerd.",en:"The comparison could not be completed.",de:"Der Vergleich konnte nicht durchgeführt werden.",fr:"La comparaison n’a pas pu être effectuée.",it:"Non è stato possibile completare il confronto.",es:"No se pudo completar la comparación."}), code:error instanceof Error?error.message:"COMPARE_FAILED" }, { status:502 });
  }
}
