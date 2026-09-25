import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { ensureDatabase } from "@/lib/db-init";
import { consumeRateLimit, requestIp } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    await ensureDatabase();
    if(!await consumeRateLimit("assistant",requestIp(request),30,3600)) return NextResponse.json({error:"Te veel AI-verzoeken. Probeer later opnieuw."},{status:429});
    const body = await request.json();
    const message = typeof body?.message === "string" ? body.message.trim() : "";
    const dashboard = body?.dashboard === true;
    const scanId = typeof body?.scanId === "string" ? body.scanId.trim() : "";
    const requestedLanguage = typeof body?.language === "string" ? body.language.toLowerCase() : "";

    if (!message) {
      return NextResponse.json({ error: "Stel eerst een vraag." }, { status: 400 });
    }

    if (message.length > 1200) {
      return NextResponse.json({ error: "De vraag is te lang." }, { status: 400 });
    }

    const user = await getCurrentUser();
    let customerContext = "";
    let selectedScanContext = "";
    let githubContext = "";
    let preferredLanguage = requestedLanguage;

    if (user) {
      if (!preferredLanguage) {
        const pref = await getDb().query("SELECT language FROM user_preferences WHERE user_id=$1 LIMIT 1",[user.id]);
        preferredLanguage = pref.rows[0]?.language || "nl";
      }
      const scans = await getDb().query(
        "SELECT scanned_url, overall_score, seo_score, geo_score, created_at FROM scans WHERE user_id=$1 ORDER BY created_at DESC LIMIT 10",
        [user.id]
      );

      const githubConnection = await getDb().query(
        "SELECT 1 FROM github_connections WHERE user_id=$1 LIMIT 1",
        [user.id]
      );

      customerContext = JSON.stringify({
        name: user.name,
        scans: scans.rows,
      });
      githubContext = JSON.stringify({
        connected: Boolean(githubConnection.rowCount),
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
          "Beantwoord technische vragen over SEO, GEO, AI Search, scans, scores, fixes, GitHub Fix Engine, abonnementen en het Dashboard.",
          "Gebruik klantgegevens alleen uit de meegeleverde context. Verzin nooit scanresultaten, scores, abonnementen, URLs, technische fouten of uitgevoerde acties.",
          "Als de context onvoldoende is, zeg dat duidelijk en geef algemene technische uitleg.",
          "Zeg nooit dat je een wijziging hebt uitgevoerd als dat niet in de context staat.",
          "Geef praktische, korte stappen. Antwoord in de gekozen dashboardtaal: " + (preferredLanguage || "nl") + ". Alleen als de gebruiker expliciet in een andere taal vraagt, mag je die taal volgen.",
          "Klantcontext: " + (customerContext || "Geen ingelogde klantcontext beschikbaar."),
          "Geselecteerde scan: " + (selectedScanContext || "Geen specifieke scan geselecteerd."),
          "GitHub Fix Engine-context: " + (githubContext || "Geen GitHub-context beschikbaar."),
        ].join("\n")
      : [
          "Je bent RankFix AI, de publieke informatie-assistent van RankFix.",
          "Leg uit hoe RankFix werkt, wat SEO en GEO zijn, hoe audits, AI-fixes, abonnementen, Dashboard en GitHub Fix Engine werken.",
          "Actuele publieke prijsinformatie van RankFix: Free € 0,00; Start € 24,95 per maand; Business € 44,95 per maand; E-commerce € 64,95 per maand; Pro € 94,95 per maand; Agency € 159,95 per maand. AI-fixes zijn binnen de betaalde pakketten inbegrepen; presenteer geen credits aan klanten.",
          "Business is bedoeld voor MKB en meerdere websites. E-commerce is specifiek voor Shopify, WooCommerce en Next.js/custom webshops en bevat gespecialiseerde product-, categorie- en structured-data controles. Pro biedt meer capaciteit en automatisering. Agency is voor bureaus met veel klantwebsites, white-label rapporten, API en team/workflow.",
          "Als iemand naar abonnementen of prijzen vraagt, gebruik alleen deze actuele bedragen. Noem dat de betaalde abonnementen op de prijspagina momenteel nog als 'Binnenkort beschikbaar' staan zolang facturatie niet live is.",
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
