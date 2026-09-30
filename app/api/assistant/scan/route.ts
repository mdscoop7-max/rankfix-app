import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const supported = ["nl","en","de","fr","it","es"] as const;
  const requested = (requestUrl.searchParams.get("language") || request.headers.get("accept-language")?.split(",")[0]?.split("-")[0] || "nl").toLowerCase();
  const language = supported.includes(requested as (typeof supported)[number]) ? requested : "nl";
  const errors: Record<string,{login:string;scanId:string;notFound:string}> = {
    nl:{login:"Login vereist.",scanId:"scanId ontbreekt.",notFound:"Scan niet gevonden."},
    en:{login:"Login required.",scanId:"scanId is missing.",notFound:"Scan not found."},
    de:{login:"Anmeldung erforderlich.",scanId:"scanId fehlt.",notFound:"Scan nicht gefunden."},
    fr:{login:"Connexion requise.",scanId:"scanId est manquant.",notFound:"Analyse introuvable."},
    it:{login:"Accesso richiesto.",scanId:"scanId mancante.",notFound:"Scansione non trovata."},
    es:{login:"Inicio de sesión requerido.",scanId:"Falta scanId.",notFound:"Análisis no encontrado."}
  };
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: errors[language].login }, { status: 401 });

  const scanId = requestUrl.searchParams.get("scanId")?.trim();
  if (!scanId) return NextResponse.json({ error: errors[language].scanId }, { status: 400 });

  const result = await getDb().query(
    "SELECT id, scanned_url, final_url, result, created_at FROM scans WHERE id=$1 AND user_id=$2 LIMIT 1",
    [scanId, user.id]
  );
  if (!result.rowCount) return NextResponse.json({ error: errors[language].notFound }, { status: 404 });

  let parsed: any = {};
  try { parsed = typeof result.rows[0].result === "string" ? JSON.parse(result.rows[0].result) : (result.rows[0].result || {}); } catch {}

  const commerceAudits = Array.isArray(parsed?.commerceScope?.audits) ? parsed.commerceScope.audits : [];
  const commerceIssues = commerceAudits.flatMap((audit: any) => {
    if (!audit || audit.error || !audit.url || !["product","category"].includes(String(audit.kind))) return [];
    const url=String(audit.url);
    const kind=String(audit.kind);
    const issue=(suffix:string,title:string,message:string,fix:string,severity="medium")=>({
      category:"ecommerce", title, status:"FAIL", message, fix,
      issue_id:"COMMERCE_"+kind.toUpperCase()+"_"+suffix+"::"+url,
      severity, confidence:"high",
      evidence:{found:url,details:"Affected "+kind+" page: "+url}
    });
    const items:any[]=[];
    if(!audit.title) items.push(issue("TITLE_MISSING","Title ontbreekt op webshop-pagina","Deze "+kind+"pagina heeft geen bevestigde title.","Voeg een unieke title toe."));
    if(!audit.description) items.push(issue("DESCRIPTION_MISSING","Meta description ontbreekt op webshop-pagina","Deze "+kind+"pagina heeft geen bevestigde meta description.","Voeg een passende meta description toe."));
    if(!audit.h1) items.push(issue("H1_MISSING","H1 ontbreekt op webshop-pagina","Deze "+kind+"pagina heeft geen bevestigde H1.","Voeg één duidelijke H1 toe."));
    if(!audit.canonical) items.push(issue("CANONICAL_MISSING","Canonical ontbreekt op webshop-pagina","Deze "+kind+"pagina heeft geen bevestigde canonical.","Voeg een self-referencing canonical toe."));
    if(!audit.breadcrumbSchema) items.push(issue("BREADCRUMB_SCHEMA_MISSING","Breadcrumb schema ontbreekt","Deze "+kind+"pagina heeft geen bevestigde BreadcrumbList structured data.","Voeg correcte BreadcrumbList structured data toe."));
    if(!audit.imageSignal) items.push(issue("IMAGE_MISSING","Product- of categorieafbeelding niet bevestigd","RankFix kon op deze "+kind+"pagina geen afbeelding bevestigen.","Controleer of de pagina een relevante afbeelding bevat."));
    if(kind==="product"){
      if(!audit.productSchema) items.push(issue("PRODUCT_SCHEMA_MISSING","Product schema ontbreekt","Deze productpagina heeft geen bevestigd Product schema.","Voeg Product structured data toe.","high"));
      if(!audit.offerSchema) items.push(issue("OFFER_SCHEMA_MISSING","Offer schema ontbreekt","Deze productpagina heeft geen bevestigd Offer of AggregateOffer schema.","Voeg prijs en aanbod toe via Offer structured data.","high"));
      if(!audit.priceSignal) items.push(issue("PRICE_MISSING","Prijs niet bevestigd","RankFix kon geen prijs op deze productpagina bevestigen.","Controleer en voeg een zichtbare actuele prijs toe.","high"));
      if(!audit.availabilitySignal) items.push(issue("AVAILABILITY_MISSING","Voorraadstatus niet bevestigd","RankFix kon geen voorraadstatus op deze productpagina bevestigen.","Voeg een actuele voorraadstatus toe.","high"));
    }
    return items;
  });

  const checks = [...(parsed?.seo?.checks || []), ...(parsed?.geo?.checks || []), ...commerceIssues]
    .filter((x: any) => {
      const status=String(x?.issue_status||x?.status||"").toLowerCase();
      const confidence=String(x?.confidence||"").toLowerCase();
      const evidence=x?.evidence;
      const hasEvidence=!!evidence && evidence.found !== null && evidence.found !== undefined && evidence.found !== "";
      return (status === "fail" || status === "warning") && confidence !== "low" && hasEvidence;
    })
    .map((x: any) => ({
      category: x.category,
      title: x.title,
      status: x.issue_status || x.status,
      message: x.message,
      fix: x.fix,
      issue_id: x.issue_id,
      severity: x.severity,
      confidence: x.confidence,
      evidence: x.evidence,
    }))
    .slice(0, 30);

  return NextResponse.json({
    scan: {
      id: result.rows[0].id,
      scanned_url: result.rows[0].scanned_url,
      final_url: result.rows[0].final_url,
      created_at: result.rows[0].created_at,
    },
    issues: checks,
  });
}
