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

  const checks = [...(parsed?.seo?.checks || []), ...(parsed?.geo?.checks || [])]
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
    .slice(0, 10);

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
