"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { qaAuditFilename } from "@/lib/qa-audit-export";

type AuditCheck = { key?: string; title?: string; status?: string; message?: string; fix?: string; evidence?: unknown };
type AuditResult = {
  scannedUrl?: string; finalUrl?: string; scannedAt?: string; httpStatus?: number;
  overallScore?: number; grade?: string;
  scoreModel?: { version?: string };
  seo?: { score?: number; checks?: AuditCheck[] };
  geo?: { score?: number; checks?: AuditCheck[] };
  sectorProfile?: { label?: string; confidence?: string; confidenceScore?: number; evidence?: string[] };
  coverage?: { coveragePercent?: number; unableToConfirm?: number; confirmed?: number };
  multiPage?: { siteSampleCoverage?: { selected?: number; scored?: number; coveragePercent?: number; provisional?: boolean }; unscoredPages?: Array<{ url: string; httpStatus?: number | null; reasonCode: string; reason: string }> };
  selfCheck?: { consistent?: boolean; reliability?: string; reliabilityReasons?: string[] };
  deepDiagnosis?: { scope?: { sampled?: number; scored?: number; discovered?: number; fullSiteVerified?: boolean };
    evidence?: { unresolvedTemplateLinks?: number; unconfirmed?: number };
    fixReadiness?: { codeProposalCandidates?: number; manualOrAdviceOnly?: number; blockedByEvidence?: number; liveChangesAllowed?: boolean };
    rootCauseGroups?: Array<{ code: string; status: string; finding: string; nextStep: string; affectedRules: string[] }> };
  summary?: { issues?: number; unableToConfirm?: number };
  error?: string; code?: string;
};

export default function DatabaseFreeQaDashboard() {
  const [url, setUrl] = useState("");
  const [mode, setMode] = useState<"seo" | "geo" | "both">("both");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<AuditResult | null>(null);
  const [json, setJson] = useState("");
  const [downloadHref, setDownloadHref] = useState("");
  const [exportMessage, setExportMessage] = useState("");
  const [sectorCorrection, setSectorCorrection] = useState("");

  // Keep the URL alive while the report is on screen, instead of revoking it
  // immediately after a click (which may cancel the download on Android).
  useEffect(() => {
    if (!json) { setDownloadHref(""); return; }
    const href = URL.createObjectURL(new Blob([json], { type: "application/json;charset=utf-8" }));
    setDownloadHref(href);
    return () => URL.revokeObjectURL(href);
  }, [json]);

  const exportFilename = qaAuditFilename(result?.finalUrl || result?.scannedUrl, result?.scannedAt);


  async function scan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setResult(null);
    setJson("");
    setExportMessage("");
    setSectorCorrection("");
    try {
      const response = await fetch("/api/scan", {
        method: "POST", headers: { "Content-Type": "application/json" },
        cache: "no-store", body: JSON.stringify({ url: url.trim(), mode, language: "nl" }),
      });
      const body = await response.text();
      let audit: AuditResult;
      try { audit = JSON.parse(body) as AuditResult; }
      catch { throw new Error(`Scan gaf geen geldig JSON-rapport terug (HTTP ${response.status}).`); }
      if (!response.ok || audit.error) {
        throw new Error([audit.error || "Scan mislukt.", audit.code ? `(${audit.code})` : ""].filter(Boolean).join(" "));
      }
      if (typeof audit.overallScore !== "number" || (mode !== "geo" && !audit.seo) || (mode !== "seo" && !audit.geo)) {
        throw new Error("De scan leverde geen volledig SEO/GEO-rapport op.");
      }
      setResult(audit);
      setJson(body);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "De scan kon niet worden voltooid.");
    } finally { setBusy(false); }
  }

  async function shareJson() {
    if (!json || !result) return;
    if (typeof navigator.share !== "function") {
      setExportMessage("Delen wordt niet ondersteund door deze browser. Gebruik Download JSON of Kopieer volledig rapport.");
      return;
    }
    try {
      const file = new File([json], exportFilename, { type: "application/json" });
      if (navigator.canShare && !navigator.canShare({ files: [file] })) {
        setExportMessage("Je browser kan dit bestand niet delen. Gebruik Download JSON of Kopieer volledig rapport.");
        return;
      }
      await navigator.share({ title: "RankFix volledig auditrapport", files: [file] });
      setExportMessage("Je audit is aangeboden aan het deelmenu van je apparaat.");
    } catch (cause) {
      if (cause instanceof Error && cause.name === "AbortError") return;
      setExportMessage("Bestand delen lukte niet. Gebruik Download JSON of Kopieer volledig rapport.");
    }
  }

  async function copyText(content: string, name: string) {
    if (!content) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard API niet beschikbaar");
      await navigator.clipboard.writeText(content);
      setExportMessage(`${name} gekopieerd. Je kunt de tekst nu plakken.`);
    } catch {
      // Fallback for mobile browsers where the modern clipboard API is blocked.
      const textarea = document.createElement("textarea");
      textarea.value = content;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      try {
        textarea.focus();
        textarea.select();
        if (!document.execCommand("copy")) throw new Error("Kopiëren geblokkeerd");
        setExportMessage(`${name} gekopieerd. Je kunt de tekst nu plakken.`);
      } catch {
        setExportMessage("Automatisch kopiëren is geblokkeerd. Open 'Bekijk korte samenvatting' of 'Bekijk audit-JSON' en selecteer de tekst handmatig.");
      } finally {
        textarea.remove();
      }
    }
  }

  const checks = result ? [...(result.seo?.checks || []), ...(result.geo?.checks || [])] : [];
  const issues = checks.filter(check => check.status === "fail" || check.status === "warning");
  const unknown = checks.filter(check => check.status === "unable_to_confirm");
  const summaryText = result ? [
    "RankFix · korte QA-samenvatting",
    `Website: ${result.finalUrl || result.scannedUrl || "Niet bekend"}`,
    `Scanmoment: ${result.scannedAt ? new Date(result.scannedAt).toLocaleString("nl-NL") : "Niet vermeld"}`,
    `HTTP: ${result.httpStatus ?? "niet bekend"}`,
    `Totaal: ${result.overallScore ?? "n.b."}/100`,
    `SEO: ${result.seo?.score ?? "niet getest"}`,
    `GEO: ${result.geo?.score ?? "niet getest"}`,
    `Bewijsdekking: ${result.coverage?.coveragePercent == null ? "n.b." : `${result.coverage.coveragePercent}%`}`,
    `Sector: ${result.sectorProfile?.label || "Niet bevestigd"}${typeof result.sectorProfile?.confidenceScore === "number" ? ` (${result.sectorProfile.confidenceScore}% zekerheid)` : ""}`,
    ...(sectorCorrection.trim() ? [`Gebruikersvoorstel sector (niet door RankFix bevestigd): ${sectorCorrection.trim()}`] : []),
    ...(result.deepDiagnosis?.scope ? [`Scanbereik: representatieve steekproef; ${result.deepDiagnosis.scope.scored ?? 0} scorende van ${result.deepDiagnosis.scope.sampled ?? 0} geselecteerde pagina\u0027s. Geen volledige sitecrawl.`] : []),
    ...(result.deepDiagnosis?.evidence?.unresolvedTemplateLinks ? [`Linkbewijs: ${result.deepDiagnosis.evidence.unresolvedTemplateLinks} technische template-href(s) niet als bewezen broken links meegerekend.`] : []),
    ...(result.multiPage?.siteSampleCoverage?.provisional ? [`Site-steekproef voorlopig (${result.multiPage.siteSampleCoverage.scored ?? 0}/${result.multiPage.siteSampleCoverage.selected ?? 0} pagina\u0027s); de totaalscore betreft gecontroleerde SEO/GEO-signalen, geen gehele site.`] : []),
    ...((result.multiPage?.unscoredPages || []).length ? ["Niet volledig gescoorde steekproefpagina\u0027s:",...(result.multiPage?.unscoredPages || []).slice(0, 12).map((page)=>`- ${page.url} — ${page.reasonCode}: ${page.reason}`)] : []),
    `Aandachtspunten: ${issues.length} · Niet bevestigd: ${unknown.length}`,
    "",
    "Belangrijkste aandachtspunten:",
    ...(issues.length
      ? issues.slice(0, 5).map(check => `- ${check.title || check.key || "Controle"} (${check.status})${check.message ? `: ${check.message}` : ""}`)
      : ["- Geen bewezen fouten of waarschuwingen in deze scan."]),
    ...(issues.length > 5 ? [`- En nog ${issues.length - 5} aandachtspunten (zie volledig rapport).`] : []),
    "",
    "Niet bevestigd (geen bewezen fouten):",
    ...(unknown.length
      ? unknown.slice(0, 6).map(check => `- ${check.title || check.key || "Controle"}`)
      : ["- Geen in dit rapport."]),
    ...(unknown.length > 6 ? [`- En nog ${unknown.length - 6} onbevestigde controles (zie volledig rapport).`] : []),
    "",
    "Let op: een hoge score bevestigt niet dat alle controles zijn uitgevoerd.",
    "Volledige technische details staan in het JSON-rapport.",
  ].join("\n") : "";

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 text-slate-900">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-teal-700">RankFix · besloten QA-test</p>
          <h1 className="mt-2 text-3xl font-bold">SEO/GEO-testdashboard</h1>
          <p className="mt-2 text-slate-600">Echte RankFix-scanmotor · zonder inloggen of database · geen permanente opslag</p>
        </div>
        <Link href="/" className="rounded-xl border border-slate-300 bg-white px-4 py-2 font-semibold hover:bg-slate-50">Terug naar website</Link>
      </div>

      <form onSubmit={scan} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <label htmlFor="qa-url" className="block text-sm font-semibold">Website die je wilt testen</label>
        <input id="qa-url" type="text" inputMode="url" autoComplete="url" placeholder="https://www.monumenten.nl/" required
          value={url} onChange={event => setUrl(event.target.value)}
          className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-offset-2" />
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label htmlFor="qa-mode" className="text-sm font-semibold">Controle</label>
          <select id="qa-mode" value={mode} onChange={e => setMode(e.target.value as "seo" | "geo" | "both")}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2">
            <option value="both">SEO + GEO</option><option value="seo">SEO</option><option value="geo">GEO</option>
          </select>
          <button type="submit" disabled={busy} className="rounded-xl bg-teal-700 px-6 py-3 font-semibold text-white hover:bg-teal-800 disabled:opacity-60">
            {busy ? "Website wordt echt gescand…" : "Start echte scan"}
          </button>
        </div>
        <p className="mt-4 text-sm text-slate-500">Geen demoresultaten. Testlimiet: maximaal 8 verzoeken per uur per netwerk (per serverinstantie, indicatief). Live websites blijven ongewijzigd.</p>
      </form>

      {error && <div role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-red-900"><strong>Scan niet gelukt.</strong><p className="mt-1">{error}</p></div>}
      {result && <section aria-label="Echt scanresultaat" className="mt-7 space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div><h2 className="text-xl font-bold break-all">{result.finalUrl || result.scannedUrl}</h2>
              <p className="mt-1 text-sm text-slate-500">HTTP {result.httpStatus ?? "onbekend"} · {result.scannedAt ? new Date(result.scannedAt).toLocaleString("nl-NL") : "Live scan"}</p></div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void copyText(summaryText, "Korte samenvatting")}
                className="rounded-xl bg-teal-700 px-4 py-3 font-semibold text-white hover:bg-teal-800">Kopieer samenvatting</button>
              <button type="button" onClick={() => void copyText(json, "Volledig rapport")}
                className="rounded-xl border border-teal-700 px-4 py-3 font-semibold text-teal-800 hover:bg-teal-50">Kopieer volledig rapport</button>
              <a href={downloadHref || undefined} download={exportFilename}
                aria-disabled={!downloadHref} onClick={event => { if (!downloadHref) event.preventDefault(); }}
                className="rounded-xl border border-slate-300 px-4 py-3 font-semibold hover:bg-slate-50">
                Download JSON
              </a>
              <button type="button" onClick={shareJson} className="rounded-xl border border-slate-300 px-4 py-3 font-semibold hover:bg-slate-50">Deel auditbestand</button>
            </div>
          </div>
          {exportMessage && <p role="status" className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{exportMessage}</p>}
          <details className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <summary className="cursor-pointer font-semibold">Bekijk korte samenvatting (ook handmatig te kopiëren)</summary>
            <textarea readOnly value={summaryText} aria-label="Korte QA-samenvatting" rows={12}
              onFocus={event => event.currentTarget.select()}
              className="mt-3 w-full resize-y rounded-lg border border-slate-300 bg-white p-3 font-mono text-sm" />
          </details>
          <p className="mt-3 text-xs text-slate-600">Volledige export: {exportFilename} · {Math.max(1, Math.round(new Blob([json]).size / 1024))} kB. Bij problemen in een mobiele browser kun je ook delen of kopiëren.</p>
          <p className="mt-1 text-xs text-slate-600">Motor: {result.scoreModel?.version || "versie niet vermeld"} · echte RankFix-scanroute, geen demonstratiescore.</p>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Totaal", result.overallScore], ["SEO", result.seo?.score], ["GEO", result.geo?.score],
              ["Bewijsdekking", result.coverage?.coveragePercent == null ? "n.b." : `${result.coverage.coveragePercent}%`],
            ].map(([label, value]) => <div key={String(label)} className="rounded-xl bg-slate-50 p-4">
              <p className="text-sm text-slate-500">{label}</p><p className="mt-1 text-3xl font-bold">{value ?? "—"}</p>
            </div>)}
          </div>
          <p className="mt-4"><strong>Herkende sector:</strong> {result.sectorProfile?.label || "Niet bevestigd"}
            {typeof result.sectorProfile?.confidenceScore === "number" ? ` (${result.sectorProfile.confidenceScore}% zekerheid)` : ""}
          </p>
          {result.multiPage?.siteSampleCoverage?.provisional && <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><strong>Voorlopige site-steekproef:</strong> {result.multiPage.siteSampleCoverage.scored ?? 0} van {result.multiPage.siteSampleCoverage.selected ?? 0} geselecteerde pagina's volledig gescoord. De SEO/GEO-score is geen oordeel over de ontbrekende pagina's.</p>}
          {result.sectorProfile?.confidenceScore != null && result.sectorProfile.confidenceScore < 75 && <div className="mt-3 rounded-xl border border-slate-200 p-3">
            <p className="text-sm font-semibold">Sector niet bevestigd — stel een correctie voor</p>
            <label htmlFor="qa-sector-correction" className="mt-2 block text-sm">Welke sector past volgens jou beter?</label>
            <input id="qa-sector-correction" value={sectorCorrection} onChange={event=>setSectorCorrection(event.target.value)} maxLength={100} placeholder="Bijv. woningverhuurder of betaalplatform" className="mt-1 w-full rounded-lg border border-slate-300 p-2" />
            <p className="mt-2 text-xs text-slate-600">Dit is alleen jouw voorstel en wordt niet automatisch door RankFix overgenomen of opgeslagen. Kopieer de korte samenvatting om de correctie door te geven.</p>
          </div>}
          {(result.multiPage?.unscoredPages?.length || 0) > 0 && <details className="mt-3 rounded-xl border border-slate-200 p-3">
            <summary className="cursor-pointer font-semibold">Niet gescoorde steekproefpagina's ({result.multiPage?.unscoredPages?.length})</summary>
            <ul className="mt-2 space-y-2 text-sm">{result.multiPage?.unscoredPages?.map((page,i)=><li key={page.url + i} className="break-all"><strong>{page.url}</strong><span className="block text-slate-600">{page.reasonCode}: {page.reason}</span></li>)}</ul>
          </details>}
          <p className="mt-2 text-sm text-slate-600">{issues.length} aandachtspunten · {unknown.length} onbevestigde controles. Een hoge score is geen bewijs dat alle controles zijn uitgevoerd.</p>
          {result.selfCheck?.consistent === false && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-amber-900">Let op: de interne consistentiecontrole van het rapport is niet geslaagd.</p>}
          {result.deepDiagnosis && <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <h3 className="font-bold">Diepe controle · bewijs, oorzaakgroepen en herstelbaarheid</h3>
            <p className="mt-2 text-sm text-slate-700">Van één domeinnaam tot een representatieve steekproef: {result.deepDiagnosis.scope?.scored ?? 0} scorende pagina's van {result.deepDiagnosis.scope?.sampled ?? 0} geselecteerd. {result.deepDiagnosis.scope?.discovered ?? 0} interne URL's ontdekt. Dit is geen volledige sitecrawl.</p>
            <p className="mt-2 text-sm text-slate-700">Fix-check: {result.deepDiagnosis.fixReadiness?.codeProposalCandidates ?? 0} kandidaat/kandidaten voor een gecontroleerd codevoorstel; {result.deepDiagnosis.fixReadiness?.blockedByEvidence ?? 0} waarschuwing(en) blokkeren wegens ontbrekend bewijs. RankFix past niets automatisch live aan.</p>
            {(result.deepDiagnosis.rootCauseGroups?.length || 0) > 0 && <ul className="mt-3 list-inside list-disc space-y-2 text-sm text-slate-700">{result.deepDiagnosis.rootCauseGroups?.slice(0, 8).map(group => <li key={group.code}><strong>{group.finding}</strong> {group.nextStep}</li>)}</ul>}
          </div>}
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-xl font-bold">Geconstateerde aandachtspunten</h2>
          {issues.length === 0 ? <p className="mt-3 text-slate-600">Geen bewezen waarschuwingen of fouten in deze scan. Bekijk ook de onbevestigde controles.</p> :
          <ul className="mt-4 space-y-3">{issues.slice(0, 20).map((check, i) => <li key={`${check.key || "check"}-${i}`} className="rounded-xl border border-slate-200 p-4">
            <p className="font-semibold">{check.title || check.key || "Controle"} <span className="text-xs font-normal uppercase text-amber-700">({check.status})</span></p>
            {check.message && <p className="mt-1 text-sm text-slate-700">{check.message}</p>}
            {check.fix && <p className="mt-2 text-sm text-teal-800">Advies: {check.fix}</p>}
          </li>)}</ul>}
          {issues.length > 20 && <p className="mt-3 text-sm text-slate-500">Nog {issues.length - 20} aandachtspunten staan in de JSON-download.</p>}
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <details>
            <summary className="cursor-pointer font-semibold">Bekijk audit-JSON (alternatief voor downloaden)</summary>
            <p className="mt-2 text-sm text-slate-600">Het volledige, ongewijzigde JSON-antwoord van de echte scanner. Je kunt de tekst selecteren en opslaan.</p>
            <textarea readOnly value={json} aria-label="Volledig JSON-auditrapport" rows={12}
              className="mt-3 w-full resize-y rounded-lg border border-slate-300 p-3 font-mono text-xs" />
          </details>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-xl font-bold">Niet bevestigd</h2>
          <p className="mt-2 text-sm text-slate-600">Deze controles zijn geen bewezen fouten.</p>
          <ul className="mt-3 list-inside list-disc space-y-1 text-sm">{unknown.slice(0, 12).map((c, i) => <li key={`${c.key}-${i}`}>{c.title || c.key}</li>)}</ul>
          {unknown.length > 12 && <p className="mt-2 text-sm text-slate-500">Overige onbevestigde controles staan in de JSON-download.</p>}
        </div>
      </section>}
    </main>
  );
}
