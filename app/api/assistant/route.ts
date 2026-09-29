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
    const supportedLanguages = ["nl","en","de","fr","it","es"] as const;
    const rawRequestedLanguage = typeof body?.language === "string" ? body.language.toLowerCase() : "";
    const requestedLanguage = supportedLanguages.includes(rawRequestedLanguage as (typeof supportedLanguages)[number]) ? rawRequestedLanguage : "";
    const errorContext = typeof body?.errorContext === "string" ? body.errorContext.trim().slice(0, 2000) : "";

    responseLanguage = (requestedLanguage || "nl") as keyof typeof errors;
    if(!await consumeRateLimit("assistant",requestIp(request),30,3600)) return NextResponse.json({error:errors[responseLanguage].rate},{status:429});
    if (!message) return NextResponse.json({ error: errors[responseLanguage].empty }, { status: 400 });
    if (message.length > 1200) return NextResponse.json({ error: errors[responseLanguage].long }, { status: 400 });

    const user = await getCurrentUser();
    let customerContext = "";
    let selectedScanContext = "";
    let githubContext = "";
    let searchConsoleContext = "";
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

      if (dashboard) {
        const gscProperty = await getDb().query(
          "SELECT id,site_url,last_sync_at FROM search_console_properties WHERE user_id=$1 AND selected=TRUE ORDER BY updated_at DESC LIMIT 1",
          [user.id]
        );
        if (gscProperty.rows[0]) {
          const property = gscProperty.rows[0];
          const metrics = await getDb().query(
            "SELECT metric_date,page,query,clicks,impressions,ctr,position FROM search_console_metrics WHERE property_id=$1 ORDER BY metric_date DESC, impressions DESC LIMIT 80",
            [property.id]
          );
          const rows = metrics.rows.map((row:any)=>({
            date: row.metric_date,
            page: row.page || null,
            query: row.query || null,
            clicks: Number(row.clicks || 0),
            impressions: Number(row.impressions || 0),
            ctr: Number(row.ctr || 0),
            position: Number(row.position || 0),
          }));
          const queries = rows.filter((row:any)=>row.query).slice(0,25);
          const pages = rows.filter((row:any)=>row.page).slice(0,25);
          const opportunities = queries
            .filter((row:any)=>row.impressions >= 10 && row.position >= 6 && row.position <= 20 && row.ctr < 0.03)
            .sort((a:any,b:any)=>b.impressions-a.impressions)
            .slice(0,10);
          searchConsoleContext = JSON.stringify({
            connected: true,
            site_url: property.site_url,
            last_sync_at: property.last_sync_at,
            queries,
            pages,
            opportunities,
          });
        } else {
          searchConsoleContext = JSON.stringify({connected:false});
        }
      }

      if (dashboard) {
        const selected = scanId
          ? await getDb().query(
              "SELECT id, scanned_url, final_url, overall_score, seo_score, geo_score, result, created_at FROM scans WHERE id=$1 AND user_id=$2 LIMIT 1",
              [scanId, user.id]
            )
          : await getDb().query(
              "SELECT id, scanned_url, final_url, overall_score, seo_score, geo_score, result, created_at FROM scans WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1",
              [user.id]
            );

        if (selected.rows[0]) {
          const row = selected.rows[0];
          const result = typeof row.result === "string" ? JSON.parse(row.result) : row.result;
          const checks = [
            ...(Array.isArray(result?.seo?.checks) ? result.seo.checks : []),
            ...(Array.isArray(result?.geo?.checks) ? result.geo.checks : []),
          ];
          const serializeCheck = (check: any) => ({
            category: check.category,
            title: check.title,
            status: check.status,
            message: check.message,
            fix: check.fix,
            score: check.score,
            maxScore: check.maxScore,
            issue_id: check.issue_id,
            severity: check.severity,
            confidence: check.confidence,
            evidence: check.evidence,
          });

          selectedScanContext = JSON.stringify({
            id: row.id,
            scanned_url: row.scanned_url,
            final_url: row.final_url,
            overall_score: row.overall_score,
            seo_score: row.seo_score,
            geo_score: row.geo_score,
            created_at: row.created_at,
            page_type: result?.pageType || result?.page_type || null,
            page_type_confidence: result?.pageTypeConfidence || result?.page_type_confidence || null,
            website_profile: result?.websiteProfile || result?.website_profile || result?.technologyProfile || result?.technology_profile || null,
            metrics: result?.metrics || {},
            structured_data: result?.structuredData || result?.structured_data || null,
            improvements: result?.improvements || result?.issues || [],
            fixes: result?.fixes || result?.fix_proposals || result?.fixProposals || [],
            ecommerce: result?.ecommerce || result?.webshop || result?.commerce || null,
            seo_summary: result?.seo ? {
              score: result.seo.score,
              coverage: result.seo.coverage,
            } : null,
            geo_summary: result?.geo ? {
              score: result.geo.score,
              coverage: result.geo.coverage,
            } : null,
            checks: checks.map(serializeCheck),
            problems: checks.filter((check: any) => check?.status === "fail" || check?.status === "warning").map(serializeCheck),
            uncertain: checks.filter((check: any) => check?.status === "unable_to_confirm").map(serializeCheck),
            not_applicable: checks.filter((check: any) => check?.status === "not_applicable").map(serializeCheck),
            passed: checks.filter((check: any) => check?.status === "pass").map(serializeCheck),
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
          "Wanneer geen specifieke audit is geopend, is de meest recente scan automatisch de actieve scancontext. Behandel die actieve scan als bron van waarheid. Maak altijd onderscheid tussen pass, warning, fail, unable_to_confirm (Niet te bevestigen) en not_applicable (N.v.t.).",
          "Noem unable_to_confirm nooit een fout en presenteer ontbrekend bewijs nooit als bewezen afwezigheid. Noem not_applicable nooit een probleem. Baseer prioriteiten alleen op aantoonbare fail/warning-controles en leg onzekerheid apart uit.",
          "Adviseer een AI- of GitHub-fix alleen wanneer de actieve scan een fail/warning voor exact die issue_id bevat, confidence niet low is en concreet evidence aanwezig is. Bij low confidence, ontbrekend bewijs, unable_to_confirm of not_applicable: adviseer eerst controle of een nieuwe scan, nooit een automatische fix.",
          "Als de context onvoldoende is, zeg dat duidelijk en geef algemene technische uitleg.",
          "Zeg nooit dat je een wijziging hebt uitgevoerd als dat niet in de context staat.",
          "Geef praktische, korte stappen. Antwoord in de gekozen dashboardtaal: " + (preferredLanguage || "nl") + ". Alleen als de gebruiker expliciet in een andere taal vraagt, mag je die taal volgen.",
          "Klantcontext: " + (customerContext || "Geen ingelogde klantcontext beschikbaar."),
          "Geselecteerde scan: " + (selectedScanContext || "Geen specifieke scan geselecteerd."),
          "GitHub Fix Engine-context: " + (githubContext || "Geen GitHub-context beschikbaar."),
          "Google Search Console-context: " + (searchConsoleContext || "Geen Search Console-data beschikbaar.").replace(/\n/g, " "),
          "Gebruik Search Console-data alleen wanneer die in deze context staat. Leg hoge vertoningen/lage CTR, posities en pagina-/querykansen feitelijk uit. Verzin geen Google-data. Koppel een kans alleen aan een RankFix-fix wanneer de actieve scancontext daar aantoonbaar een passende fail/warning voor bevat.",
          "Actuele dashboardfout/blokkade: " + (errorContext || "Geen actuele dashboardfout meegegeven."),
          errorContext ? "Als er een actuele dashboardfout is meegegeven, behandel die letterlijk als de bekende oorzaak van deze interactie. Zeg niet dat de foutmelding ontbreekt en verzin geen andere blokkade." : "",
        ].join("\n")
      : [
          "Je bent RankFix AI, de publieke informatie-assistent van RankFix.",
          "Leg uit hoe RankFix werkt, wat SEO en GEO zijn, hoe audits, AI-fixes, abonnementen, Dashboard en GitHub Fix Engine werken.",
          "Actuele publieke prijsinformatie van RankFix: Free € 0,00; Start € 24,95 per maand; Business € 44,95 per maand; E-commerce € 64,95 per maand; Pro € 94,95 per maand; Agency € 159,95 per maand. AI-fixes zijn binnen de betaalde pakketten inbegrepen; presenteer geen credits aan klanten.",
          "Business is bedoeld voor MKB en meerdere websites. E-commerce is specifiek voor Shopify, WooCommerce en Next.js/custom webshops en bevat gespecialiseerde product-, categorie- en structured-data controles. Pro biedt meer capaciteit en automatisering. Agency is voor bureaus met veel klantwebsites, white-label rapporten, API en team/workflow.",
          "Als iemand naar abonnementen of prijzen vraagt, gebruik alleen deze actuele bedragen. Noem dat de betaalde abonnementen op de prijspagina momenteel nog als 'Binnenkort beschikbaar' staan zolang facturatie niet live is.",
          "Doe geen uitspraken over persoonlijke klantdata. Als iemand naar een eigen scan vraagt, adviseer in te loggen op het Dashboard.",
          "Verzin geen functies die niet bekend zijn. Maak duidelijk wanneer iets nog niet beschikbaar is.",
          "Antwoord in de gekozen taal van de publieke website: " + (preferredLanguage || "nl") + ". Blijf in die taal, tenzij de gebruiker expliciet om een andere taal vraagt.",
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
      { error: errors[responseLanguage].failed },
      { status: 500 }
    );
  }
}
