import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { ensureDatabase } from "@/lib/db-init";
import { auditSite } from "@/lib/site-audit";
import { normalizePlan, planLimits } from "@/lib/plans";

export async function POST(request: Request) {
  const body = await request.json().catch(()=>({}));
  const language = typeof body?.language==="string"&&["nl","en","de","fr","it","es"].includes(body.language)?body.language:"nl";
  const tr=(v:Record<string,string>)=>v[language]||v.nl;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error:tr({nl:"Log in om websites te vergelijken.",en:"Log in to compare websites.",de:"Melde dich an, um Websites zu vergleichen.",fr:"Connectez-vous pour comparer des sites.",it:"Accedi per confrontare i siti.",es:"Inicia sesión para comparar sitios web."}) }, { status: 401 });
  await ensureDatabase();
  const planResult = await getDb().query("SELECT plan_code FROM users WHERE id=$1 LIMIT 1", [user.id]);
  const plan=normalizePlan(planResult.rows[0]?.plan_code); const limits=planLimits(plan);
  if (limits.competitorScans === 0) {
    return NextResponse.json({ error:tr({nl:"Concurrentanalyse is beschikbaar met een betaald abonnement.",en:"Competitor analysis is available with a paid plan.",de:"Die Konkurrenzanalyse ist mit einem kostenpflichtigen Tarif verfügbar.",fr:"L’analyse concurrentielle est disponible avec une offre payante.",it:"L’analisi concorrente è disponibile con un piano a pagamento.",es:"El análisis de competencia está disponible con un plan de pago."}), code:"PAID_PLAN_REQUIRED" }, { status:403 });
  }
  try {
    const monthStart=new Date(); monthStart.setUTCDate(1); monthStart.setUTCHours(0,0,0,0);
    const usageResult=await getDb().query("SELECT COUNT(*)::int AS count FROM usage_events WHERE user_id=$1 AND event_type='COMPETITOR_SCAN' AND created_at >= $2",[user.id,monthStart.toISOString()]);
    const used=Number(usageResult.rows[0]?.count||0);
    if(used>=limits.competitorScans) return NextResponse.json({error:tr({nl:"Je maandelijkse limiet voor concurrentanalyses is bereikt.",en:"You have reached your monthly competitor analysis limit.",de:"Du hast dein monatliches Limit für Konkurrenzanalysen erreicht.",fr:"Vous avez atteint votre limite mensuelle d’analyses concurrentielles.",it:"Hai raggiunto il limite mensile di analisi concorrenti.",es:"Has alcanzado tu límite mensual de análisis de competencia."}),code:"COMPETITOR_SCAN_LIMIT",usage:{plan,used,limit:limits.competitorScans}},{status:429});
    const website = typeof body?.website === "string" ? body.website.trim() : "";
    const competitor = typeof body?.competitor === "string" ? body.competitor.trim() : "";
    if (!website || !competitor) return NextResponse.json({ error:tr({nl:"Vul je website en een concurrent in.",en:"Enter your website and a competitor.",de:"Gib deine Website und einen Konkurrenten ein.",fr:"Saisissez votre site et un concurrent.",it:"Inserisci il tuo sito e un concorrente.",es:"Introduce tu web y un competidor."}) }, { status: 400 });
    const [own, other] = await Promise.all([auditSite(website, "QUICK"), auditSite(competitor, "QUICK")]);
    const active = (a: typeof own) => a.issues.filter(i => i.status === "FAIL" || i.status === "WARNING");
    const ownIssues = active(own), competitorIssues = active(other);
    const competitorPasses = new Set(other.issues.filter(i => i.status === "PASS").map(i => i.rule_id));
    const opportunities = ownIssues.filter(i => competitorPasses.has(i.rule_id)).slice(0, 8).map(i => ({
      rule_id:i.rule_id,title:i.title,severity:i.severity,recommendation:i.recommendation
    }));
    await getDb().query("INSERT INTO usage_events (user_id,website_host,event_type) VALUES ($1,$2,'COMPETITOR_SCAN')",[user.id,new URL(own.finalUrl).hostname.toLowerCase().replace(/^www\./,"")]);
    return NextResponse.json({
      website:{url:own.finalUrl,scores:own.scores,issues:ownIssues.length,pages:own.crawl.pages},
      competitor:{url:other.finalUrl,scores:other.scores,issues:competitorIssues.length,pages:other.crawl.pages},
      opportunities
    });
  } catch (error) {
    return NextResponse.json({ error:tr({nl:"De vergelijking kon niet worden uitgevoerd.",en:"The comparison could not be completed.",de:"Der Vergleich konnte nicht durchgeführt werden.",fr:"La comparaison n’a pas pu être effectuée.",it:"Non è stato possibile completare il confronto.",es:"No se pudo completar la comparación."}), code:error instanceof Error?error.message:"COMPARE_FAILED" }, { status:502 });
  }
}
