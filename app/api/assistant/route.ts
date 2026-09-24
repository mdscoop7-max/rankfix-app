import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const message = typeof body?.message === "string" ? body.message.trim() : "";
    const dashboard = body?.dashboard === true;
    const scanId = typeof body?.scanId === "string" ? body.scanId.trim() : "";

    if (!message) {
      return NextResponse.json({ error: "Stel eerst een vraag." }, { status: 400 });
    }

    if (message.length > 1200) {
      return NextResponse.json({ error: "De vraag is te lang." }, { status: 400 });
    }

    const user = await getCurrentUser();
    let customerContext = "";
    let selectedScanContext = "";

    if (user) {
      const scans = await getDb().query(
        "SELECT scanned_url, overall_score, seo_score, geo_score, created_at FROM scans WHERE user_id=$1 ORDER BY created_at DESC LIMIT 10",
        [user.id]
      );

      customerContext = JSON.stringify({
        name: user.name,
        credits: user.credits,
        scans: scans.rows,
      });

      if (dashboard && scanId) {
        const selected = await getDb().query(
          "SELECT id, scanned_url, final_url, overall_score, seo_score, geo_score, result, created_at FROM scans WHERE id=$1 AND user_id=$2 LIMIT 1",
          [scanId, user.id]
        );

        if (selected.rows[0]) {
          const row = selected.rows[0];
          const result = typeof row.result === "string" ? JSON.parse(row.result) : row.result;
          const checks = [
            ...(Array.isArray(result?.seo?.checks) ? result.seo.checks : []),
            ...(Array.isArray(result?.geo?.checks) ? result.geo.checks : []),
          ].filter((check: any) => check?.status === "fail" || check?.status === "warning");

          selectedScanContext = JSON.stringify({
            id: row.id,
            scanned_url: row.scanned_url,
            final_url: row.final_url,
            overall_score: row.overall_score,
            seo_score: row.seo_score,
            geo_score: row.geo_score,
            created_at: row.created_at,
            metrics: result?.metrics || {},
            problems: checks.map((check: any) => ({
              category: check.category,
              title: check.title,
              status: check.status,
              message: check.message,
              fix: check.fix,
              issue_id: check.issue_id,
              severity: check.severity,
              confidence: check.confidence,
              evidence: check.evidence,
            })),
          });
        }
      }
    }

    const key = process.env.OPENAI_API_KEY;

    if (!key) {
      return NextResponse.json(
        { error: "AI-assistent is tijdelijk niet beschikbaar." },
        { status: 503 }
      );
    }

    const system = dashboard
      ? [
          "Je bent RankFix AI, de technische assistent van RankFix.",
          "Beantwoord technische vragen over SEO, GEO, AI Search, scans, scores, fixes, GitHub Fix Engine, credits en het Dashboard.",
          "Gebruik klantgegevens alleen uit de meegeleverde context. Verzin nooit scanresultaten, scores, credits, URLs, technische fouten of uitgevoerde acties.",
          "Als de context onvoldoende is, zeg dat duidelijk en geef algemene technische uitleg.",
          "Zeg nooit dat je een wijziging hebt uitgevoerd als dat niet in de context staat.",
          "Geef praktische, korte stappen. Antwoord in het Nederlands tenzij de gebruiker een andere taal gebruikt.",
          "Klantcontext: " + (customerContext || "Geen ingelogde klantcontext beschikbaar."),
          "Geselecteerde scan: " + (selectedScanContext || "Geen specifieke scan geselecteerd."),
        ].join("\n")
      : [
          "Je bent RankFix AI, de publieke informatie-assistent van RankFix.",
          "Leg uit hoe RankFix werkt, wat SEO en GEO zijn, hoe audits, AI-fixes, credits, Dashboard en GitHub Fix Engine werken.",
          "Actuele publieke prijsinformatie van RankFix: Free €0, met 1 gratis audit, SEO + GEO score, actiepunten en geen creditcard; Pro €19 per maand, met meer scans, AI fixes, scan history en PDF rapporten; Agency €49 per maand, met meerdere klanten, white-label reports, credits voor AI en team & dashboard.",
          "Als iemand vraagt wat een maandabonnement kost, noem de relevante betaalde abonnementen: Pro €19 per maand en Agency €49 per maand. Noem ook dat Free €0 is als gratis optie. Zeg niet dat deze abonnementen al direct beschikbaar zijn: op de prijspagina staat momenteel 'Binnenkort beschikbaar'.",
          "Doe geen uitspraken over persoonlijke klantdata. Als iemand naar een eigen scan vraagt, adviseer in te loggen op het Dashboard.",
          "Verzin geen functies die niet bekend zijn. Maak duidelijk wanneer iets nog niet beschikbaar is.",
          "Antwoord in het Nederlands tenzij de gebruiker een andere taal gebruikt.",
        ].join("\n");

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + key,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
        instructions: system,
        input: message,
        max_output_tokens: 700,
      }),
    });

    if (!response.ok) {
      throw new Error("AI-provider gaf geen geldige response.");
    }

    const data = await response.json();
    const answer =
      typeof data?.output_text === "string"
        ? data.output_text
        : data?.output
            ?.flatMap((item: any) => item?.content || [])
            .map((item: any) => item?.text || "")
            .join("") || "";

    if (!answer.trim()) {
      throw new Error("AI gaf geen antwoord.");
    }

    return NextResponse.json({ answer: answer.trim() });
  } catch (error) {
    console.error("Assistant error:", error);
    return NextResponse.json(
      { error: "De AI-assistent kon nu geen antwoord geven." },
      { status: 500 }
    );
  }
}
