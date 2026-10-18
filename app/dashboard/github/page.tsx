"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import DashboardNav from "../nav";
import AiAssistant from "@/components/ai-assistant";
import type { Locale } from "@/lib/locales";
import "../dashboard.css";

type Repo = { full_name: string; default_branch: string; private: boolean };
type Check = { title?: string; message?: string; fix?: string; status?: string; issue_id?: string; rule_id?: string };
type ScanData = { scanned_url: string; final_url?: string | null; result?: { seo?: { checks?: Check[] }; geo?: { checks?: Check[] }; metrics?: Record<string, unknown> } };
type Preview = { startLine: number; before: string[]; after: string[]; truncated?: boolean; changedLines?: number; summary?: string };
type Stage = "preparing" | "executing" | "updating" | "checking" | "confirmed" | "manual";
type FixView = { issue_id: string; status: string; stage: Stage; stage_label: string; reason_code: string | null; reason: string | null; ready_for_scan: boolean; review?: {proposal_id:string;proposal_hash:string;scan_id:string;expected_value:string;summary:string}|null; technical: { repository: string | null; file: string | null; branch: string | null; pr_number: number | null; pr_url: string | null; merge_commit: string | null; deployment: string | null; verification_attempts: number } };
type Plan = { proposalId: string; proposalHash: string; text: string; summary: string; preview: Preview | null; publishable: boolean; siteConsent: boolean; level: string; path: string };

const STAGES: Stage[] = ["preparing", "executing", "updating", "checking", "confirmed"];
const STAGE_LABELS: Record<Locale, Record<Stage, string>> = {
  nl: { preparing: "Oplossing voorbereiden", executing: "Fix veilig uitvoeren", updating: "Website wordt bijgewerkt", checking: "Live resultaat controleren", confirmed: "Fix bevestigd", manual: "Handmatige actie nodig" },
  en: { preparing: "Preparing the fix", executing: "Applying the fix safely", updating: "Updating your website", checking: "Checking the live result", confirmed: "Fix confirmed", manual: "Manual action needed" },
  de: { preparing: "Lösung wird vorbereitet", executing: "Fix wird sicher ausgeführt", updating: "Website wird aktualisiert", checking: "Live-Ergebnis wird geprüft", confirmed: "Fix bestätigt", manual: "Manuelle Aktion nötig" },
  fr: { preparing: "Préparation de la correction", executing: "Correction appliquée en sécurité", updating: "Mise à jour du site", checking: "Vérification du résultat en ligne", confirmed: "Correction confirmée", manual: "Action manuelle requise" },
  it: { preparing: "Preparazione della correzione", executing: "Correzione applicata in sicurezza", updating: "Aggiornamento del sito", checking: "Verifica del risultato live", confirmed: "Correzione confermata", manual: "Azione manuale necessaria" },
  es: { preparing: "Preparando la corrección", executing: "Aplicando la corrección de forma segura", updating: "Actualizando tu web", checking: "Comprobando el resultado en vivo", confirmed: "Corrección confirmada", manual: "Se necesita una acción manual" },
};
const FIX_BUTTON: Record<Locale, string> = { nl: "Fix probleem", en: "Fix issue", de: "Problem beheben", fr: "Corriger le problème", it: "Correggi problema", es: "Corregir problema" };
const META_DESCRIPTION = /^(?:META|SITE)_DESCRIPTION_(?:GUIDANCE|MISSING)$/i;
const ACTIVE_POLL = new Set(["preparing", "executing", "updating", "checking"]);

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- API payloads are validated field by field below
async function readJson(response: Response): Promise<Json> {
  const raw = await response.text();
  if (!raw.trim()) return {};
  try { return JSON.parse(raw); } catch { return { error: "De server gaf een ongeldig antwoord. Probeer het opnieuw." }; }
}

export default function GithubPage() {
  const searchParams = useSearchParams();
  const scanId = searchParams.get("scan_id") || "";
  const issueId = searchParams.get("issue_id") || "";
  const [language, setLanguage] = useState<Locale>("nl");
  const nl = language === "nl";
  const tx = (nlText: string, enText: string) => (nl ? nlText : enText);

  const [plan, setPlanCode] = useState("");
  const [scan, setScan] = useState<ScanData | null>(null);
  const [check, setCheck] = useState<Check | null>(null);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [githubSetupRequired, setGithubSetupRequired] = useState(false);
  const [login, setLogin] = useState("");
  const [repos, setRepos] = useState<Repo[]>([]);
  const [repo, setRepo] = useState("");
  const [baseBranch, setBaseBranch] = useState("main");
  const [mapped, setMapped] = useState(false);
  const [autofix, setAutofix] = useState(false);
  const [consentOpen, setConsentOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [fixPlan, setFixPlan] = useState<Plan | null>(null);
  const [fix, setFix] = useState<FixView | null>(null);
  const [latestScanInfo,setLatestScanInfo] = useState<{id:string;created_at:string|null;issue_status:string|null}|null>(null);
  const [scanBusy, setScanBusy] = useState(false);
  const [contextLoading, setContextLoading] = useState(true);
  const [mappingWarning, setMappingWarning] = useState("");
  const scanRunning = useRef(false);

  const siteUrl = scan?.final_url || scan?.scanned_url || "";
  const host = (() => { try { return new URL(siteUrl).hostname.replace(/^www\./, ""); } catch { return ""; } })();

  const refreshStatus = useCallback(async (url: string) => {
    if (!url || !issueId) return null;
    try {
      const r = await fetch(`/api/fixes/status?url=${encodeURIComponent(url)}&issue_id=${encodeURIComponent(issueId)}&scan_id=${encodeURIComponent(scanId)}`, { cache: "no-store" });
      const d = await readJson(r);
      const current: FixView | null = r.ok && Array.isArray(d.fixes) ? (d.fixes as FixView[]).find((f) => f.issue_id === issueId) || null : null;
      if(r.ok) { setFix(current); setLatestScanInfo(d.latest_scan||null); }
      else setError(d.error || "De huidige Fix-status kon niet worden geladen.");
      return current;
    } catch { return null; }
  }, [issueId,scanId]);

  // Load the saved website mapping and existing Fix status FIRST. A slow or
  // failing GitHub repository enumeration must not hide an already linked site.
  // Neither loading nor inspecting status grants publishing consent.
  useEffect(() => {
    let active = true;
    setContextLoading(true);
    setMappingWarning("");
    fetch("/api/account/language").then((r) => (r.ok ? readJson(r) : null)).then((d) => { if (active && d?.language && d.language in STAGE_LABELS) setLanguage(d.language as Locale); }).catch(() => {});
    fetch("/api/auth/me", { cache: "no-store" }).then((r) => (r.ok ? readJson(r) : null)).then((d) => { if (active && d?.user?.plan_code) setPlanCode(String(d.user.plan_code)); }).catch(() => {});
    (async () => {
      if (!scanId || !issueId) {
        setError("Open deze Fix via een opgeslagen scan en een gekozen probleem.");
        return;
      }
      const sr = await fetch("/api/history/" + encodeURIComponent(scanId), { cache: "no-store" });
      const sd = await readJson(sr);
      if (sr.status === 401) { window.location.replace("/account?next=" + encodeURIComponent(window.location.pathname + window.location.search)); return; }
      if (!sr.ok || !sd.scan) throw new Error(sd.error || "Deze opgeslagen scan kon niet worden geladen.");
      if (!active) return;
      setScan(sd.scan);
      const url = String(sd.scan.final_url || sd.scan.scanned_url || "");
      const all: Check[] = [...(sd.scan.result?.seo?.checks || []), ...(sd.scan.result?.geo?.checks || [])];
      setCheck(all.find((c) => String(c.issue_id || c.rule_id || "").toUpperCase() === issueId.toUpperCase()) || null);

      // These calls are deliberately independent of GitHub /user/repos.
      const [mr, gs, existing] = await Promise.allSettled([
        fetch("/api/github/site-repository?url=" + encodeURIComponent(url), { cache: "no-store" }),
        fetch("/api/github/status", { cache: "no-store" }),
        refreshStatus(url),
      ]);
      if (!active) return;
      let mappedRepository = "";
      if (mr.status === "fulfilled") {
        const md = await readJson(mr.value);
        if (mr.value.ok && md.mapped && typeof md.repository === "string" && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(md.repository)) {
          mappedRepository = md.repository;
          setRepo(md.repository);
          setBaseBranch(md.baseBranch || "main");
          setMapped(true);
          setAutofix(Boolean(md.autofix?.enabled));
        } else if (!mr.value.ok) {
          setMappingWarning(md.error || "De bestaande websitekoppeling kon niet worden geladen. Probeer de pagina opnieuw te openen.");
        }
      } else {
        setMappingWarning("De bestaande websitekoppeling is tijdelijk niet bereikbaar. Probeer het opnieuw.");
      }
      if (existing.status === "rejected") setError("De huidige Fix-status kon niet worden gecontroleerd. Probeer het opnieuw.");
      if (gs.status !== "fulfilled") {
        setConnected(false);
        setError("De GitHub-verbinding kon niet worden gecontroleerd. Probeer de pagina opnieuw te openen.");
        return;
      }
      const gd = await readJson(gs.value);
      if (!active) return;
      if (!gs.value.ok && gs.value.status === 401) {
        window.location.replace("/account?next=" + encodeURIComponent(window.location.pathname + window.location.search));
        return;
      }
      if (gd.connected) {
        setConnected(true);
        setLogin(gd.connection?.github_login || "");
        // Repo discovery is convenience only: it never overrides the saved mapping.
        void fetch("/api/github/repos", { cache: "no-store" }).then(async rr => {
          const rd = await readJson(rr);
          if (!active || !rr.ok) return;
          const available: Repo[] = Array.isArray(rd.repos) ? rd.repos : [];
          setRepos(available);
          if (!mappedRepository && available.length === 1) {
            setRepo(available[0].full_name);
            setBaseBranch(available[0].default_branch || "main");
          }
        }).catch(() => {});
      } else {
        setConnected(false);
        if (gd.setupRequired) setGithubSetupRequired(true);
        if (gd.reauthorize || gd.error) setError(gd.error || "De GitHub-koppeling moet opnieuw worden gecontroleerd.");
      }
    })().catch(e => {
      if (active) setError(e instanceof Error ? e.message : "RankFix kon je bestaande Fix niet laden.");
    }).finally(() => { if (active) setContextLoading(false); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanId, issueId]);


  // Follow the persisted lifecycle; run the live rescan once the change is visibly live.
  useEffect(() => {
    if (!siteUrl || !fix || !ACTIVE_POLL.has(fix.stage)) return;
    const timer = window.setTimeout(async () => {
      if (fix.ready_for_scan && !scanRunning.current) {
        scanRunning.current = true; setScanBusy(true);
        try {
          await fetch("/api/scan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: siteUrl, mode: "both", dashboard: true, language }) });
        } catch { /* the next poll shows the persisted state */ }
        finally { scanRunning.current = false; setScanBusy(false); }
      }
      await refreshStatus(siteUrl);
    }, fix.ready_for_scan ? 1500 : 7000);
    return () => window.clearTimeout(timer);
  }, [fix, siteUrl, language, refreshStatus]);

  async function ensureRepositoryChoice(): Promise<boolean> {
    if (repo && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) return true;
    setError(tx("Kies eenmalig de GitHub-repository van deze website.", "Choose this website’s GitHub repository once."));
    return false;
  }

  async function prepare(): Promise<Plan | null> {
    // One authoritative proposal path. The server reads the selected safe source
    // file and its page copy; no separate AI provider call may block this button.
    const pr = await fetch("/api/github/fix", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ repo, baseBranch, scan_id: scanId, issue_id: issueId, preview: true, language }) });
    const pd = await readJson(pr);
    if (!pr.ok) {
      if (/bad credentials|GitHub-token|opnieuw verbinden/i.test(String(pd.error || ""))) setConnected(false);
      const detailedReason=Array.isArray(pd.validation?.errors)
        ? pd.validation.errors.filter((value:unknown)=>typeof value==="string").slice(0,3).join(" · ")
        : "";
      throw new Error([pd.error,detailedReason].filter(Boolean).join(" — ") || tx("De oplossing kon niet veilig worden voorbereid. Er is niets gewijzigd.", "The fix could not be prepared safely. Nothing was changed."));
    }
    if (pd.alreadyApplied) {
      setNotice(tx("Deze verbetering staat al in de broncode. RankFix controleert nu de live pagina.", "This improvement is already in the source code. RankFix is now checking the live page."));
      return null;
    }
    if (!pd.proposal_id) throw new Error(tx("De oplossing kon niet worden voorbereid.", "The fix could not be prepared."));
    return { proposalId: String(pd.proposal_id), proposalHash: String(pd.proposal_hash), text: String(pd.expected_value || ""), summary: String(pd.summary || ""), preview: pd.preview || null, publishable: Boolean(pd.autofix?.publishable), siteConsent: Boolean(pd.autofix?.siteConsent), level: String(pd.autofix?.level || "review"), path: String(pd.path || "") };
  }

  async function publish(p: Plan, mode: "auto" | "publish" | "pr_only") {
    const r = await fetch("/api/github/fix", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ repo, baseBranch, scan_id: scanId, issue_id: issueId, preview: false, proposal_id: p.proposalId, proposal_hash: p.proposalHash, publish_mode: mode, language }) });
    const d = await readJson(r);
    if (!r.ok) throw new Error(d.error || tx("Publiceren is niet gelukt. Er is niets live gewijzigd.", "Publishing failed. Nothing changed live."));
    if (d.fix) setFix(d.fix as FixView);
    setFixPlan(null);
  }

  async function runFix() {
    if (busy || contextLoading) return;
    setError(""); setNotice("");
    if (!(await ensureRepositoryChoice())) return;
    setBusy(true);
    try {
      setFix((f) => f || { issue_id: issueId, status: "PREPARED", stage: "preparing", stage_label: STAGE_LABELS[language].preparing, reason_code: null, reason: null, ready_for_scan: false, technical: { repository: repo, file: null, branch: null, pr_number: null, pr_url: null, merge_commit: null, deployment: null, verification_attempts: 0 } });
      const p = await prepare();
      if (!p) { setFix(null); await refreshStatus(siteUrl); return; }
      setMapped(true);
      if (p.publishable && p.siteConsent) { await publish(p, "auto"); return; }
      setFix(null);
      setFixPlan(p);
    } catch (e) {
      setFix(null);
      setError(e instanceof Error ? e.message : tx("Er ging iets mis. Er is niets gewijzigd.", "Something went wrong. Nothing was changed."));
    } finally { setBusy(false); }
  }

  async function approve(mode: "publish" | "pr_only") {
    if (!fixPlan || busy) return;
    setBusy(true); setError("");
    try { await publish(fixPlan, mode); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  async function approveExisting() {
    if(busy||!fix?.review||fix.reason_code!=="PR_AWAITING_OWNER") return;
    setBusy(true);setError("");
    try {
      const review=fix.review;
      const r=await fetch("/api/github/fix",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
        repo:fix.technical.repository||repo,baseBranch,scan_id:review.scan_id,issue_id:fix.issue_id,
        preview:false,proposal_id:review.proposal_id,proposal_hash:review.proposal_hash,publish_mode:"publish",language
      })});
      const d=await readJson(r);
      if(!r.ok) throw new Error(d.error||tx("Deze bestaande fix kan niet veilig worden gepubliceerd.","The existing fix could not be safely published."));
      if(d.fix) setFix(d.fix as FixView);
      await refreshStatus(siteUrl);
    }catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{setBusy(false);}
  }

  async function setAutofixConsent(enable: boolean) {
    if (!siteUrl) return;
    setBusy(true); setError("");
    try {
      const r = await fetch("/api/github/site-repository", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: siteUrl, autofix_publish: enable, confirm: enable ? "AUTOFIX_PUBLISH_CONSENT" : undefined }) });
      const d = await readJson(r);
      if (!r.ok) throw new Error(d.error || tx("De instelling kon niet worden opgeslagen.", "The setting could not be saved."));
      setAutofix(Boolean(d.autofix?.enabled)); setConsentOpen(false);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  async function releaseMapping() {
    if (!siteUrl || busy) return;
    setBusy(true);
    try {
      const r = await fetch("/api/github/site-repository", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: siteUrl }) });
      if (r.ok) { setMapped(false); setRepo(""); setAutofix(false); setFixPlan(null); }
    } finally { setBusy(false); }
  }

  const stageLabels = STAGE_LABELS[language];
  const activeStage: Stage | null = fix?.stage || null;
  const stageIndex = activeStage ? STAGES.indexOf(activeStage) : -1;
  const isMeta = META_DESCRIPTION.test(issueId);
  const metrics=scan?.result?.metrics;
  const og=metrics?.openGraph as {image?:unknown}|undefined;
  const imageCandidates=metrics?.imageAltCandidates;
  const imageEvidence=[og?.image,...(Array.isArray(imageCandidates)?imageCandidates.map((x:{src?:unknown})=>x?.src):[])];
  const hasTrustedSocialImage=imageEvidence.some((v:unknown)=>typeof v==="string" && Boolean(v.trim()) && !/(?:favicon|touch-icon|apple-touch-icon|mask-icon|site-icon|browserconfig)/i.test(v));
  const socialImageMissing=issueId==="SOCIAL_METADATA_INCOMPLETE" && !hasTrustedSocialImage;
  const historicalScan=Boolean(latestScanInfo?.id && latestScanInfo.id!==scanId);

  return <main className="rf-page" lang={language}>
    <div className="rf-shell">
      <header className="rf-header"><Link href="/dashboard" className="rf-brand">RankFix <span>AI</span></Link></header>
      <DashboardNav current={2} />
      <section className="rf-body rf-fix-engine">
        <div className="text-xs font-bold uppercase tracking-widest text-emerald-300">RankFix AutoFix</div>
        <h1 className="mt-2 text-2xl font-black leading-tight sm:text-3xl">{check?.title || tx("Probleem oplossen", "Fix an issue")}</h1>
        {check?.message && <p className="mt-2 text-sm leading-6 text-slate-300">{check.message}</p>}
        {siteUrl && <p className="mt-1 break-all text-xs text-slate-500">{siteUrl}</p>}
        {historicalScan && latestScanInfo && <div role="status" className="rf-fix-alert mt-4 rounded-xl border border-amber-300/30 bg-amber-300/[0.08] p-4 text-sm text-amber-100">
          <strong>{tx("Je bekijkt een oudere scan", "You are viewing an older scan")}</strong>
          <p className="mt-2">{latestScanInfo.issue_status==="PASS"
            ? tx("Deze melding komt uit een oude meting. In de nieuwste scan slaagt deze controle. Gebruik die meting voor de actuele status.", "This warning is from an older scan. The check passes in the latest scan. Use that report for the current status.")
            : tx("De website is daarna opnieuw gescand. Deze oude uitslag kan afwijken van de huidige situatie. Gebruik de nieuwste scan voordat je een Fix start.", "The website was scanned again after this report. Open the latest scan before starting a Fix.")}</p>
          <Link href={"/dashboard/audit/"+encodeURIComponent(latestScanInfo.id)} className="mt-3 inline-flex min-h-11 items-center rounded-lg border border-amber-200/30 px-4 font-semibold text-white">{tx("Bekijk nieuwste scan →","View latest scan →")}</Link>
        </div>}

        {/* Progress — one place for status; no duplicate success messages. */}
        {!contextLoading && fix && <section aria-live="polite" className="rf-fix-status-panel mt-6 rounded-2xl border border-white/10 bg-white/[0.04] p-4 sm:p-6">
          <h2 className="text-lg font-bold">{fix.reason_code === "PR_AWAITING_OWNER" ? tx("Jouw akkoord is nodig", "Your approval is required") : fix.stage === "confirmed" ? (historicalScan ? tx("✓ Eerdere Fix bevestigd", "✓ Previous Fix confirmed") : "✓ " + stageLabels.confirmed) : fix.stage === "manual" ? stageLabels.manual : stageLabels[fix.stage]}</h2>
          <ol className="mt-4 grid gap-2">
            {STAGES.map((stage, i) => {
              const done = fix.stage === "confirmed" ? true : stageIndex > i;
              const current = stageIndex === i && fix.stage !== "confirmed";
              return <li key={stage} data-done={done ? "true" : "false"} data-current={current ? "true" : "false"} className={`rf-fix-progress-step flex items-center gap-3 rounded-xl border px-3 py-2 text-sm ${current ? "border-emerald-300/40 bg-emerald-400/[0.08] text-white" : done ? "border-white/10 text-emerald-200" : "border-white/5 text-slate-500"}`}>
                <span aria-hidden="true" className="w-5 text-center">{done ? "✓" : current ? "●" : "○"}</span>
                <span>{stageLabels[stage]}</span>
                {current && (stage === "checking" && scanBusy ? <span className="ml-auto text-xs text-emerald-200">{tx("scan loopt…", "scanning…")}</span> : <span className="ml-auto text-xs text-emerald-200">{tx("bezig…", "in progress…")}</span>)}
              </li>;
            })}
          </ol>
          {fix.stage === "updating" && <p className="mt-3 text-sm text-slate-400">{tx("De wijziging is samengevoegd. RankFix wacht tot de nieuwe versie van je website live staat; dit duurt meestal enkele minuten. Je kunt deze pagina sluiten — de voortgang blijft bewaard.", "The change was merged. RankFix waits until the new version of your site is live, usually a few minutes. You can close this page — progress is saved.")}</p>}
          {fix.stage === "confirmed" && <p className="rf-fix-confirmed-copy mt-3 text-sm text-emerald-100">{historicalScan
            ? tx("Deze bevestiging hoort bij de Fix-geschiedenis. Bekijk de nieuwste scan hierboven voor de actuele staat van je website.", "This is a historic Fix confirmation. See the latest scan above for the current website status.")
            : tx("Een nieuwe live scan heeft bevestigd dat dit probleem is opgelost.", "A fresh live scan confirmed that this issue is resolved.")}</p>}
          {fix.reason && <p className={`mt-3 rounded-xl p-3 text-sm ${fix.stage === "manual" ? "bg-amber-300/10 text-amber-100" : "bg-white/5 text-slate-300"}`}>{fix.reason}</p>}
          <details className="mt-4 text-sm text-slate-400">
            <summary className="cursor-pointer select-none">{tx("Technische details", "Technical details")}</summary>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 break-all text-xs">
              {fix.technical.repository && <><dt>Repository</dt><dd>{fix.technical.repository}</dd></>}
              {fix.technical.file && <><dt>{tx("Bestand", "File")}</dt><dd>{fix.technical.file}</dd></>}
              {fix.technical.branch && <><dt>Branch</dt><dd>{fix.technical.branch}</dd></>}
              {fix.technical.pr_url && <><dt>Pull Request</dt><dd><a className="underline" href={fix.technical.pr_url} target="_blank" rel="noreferrer">#{fix.technical.pr_number}</a></dd></>}
              {fix.technical.merge_commit && <><dt>Merge</dt><dd>{fix.technical.merge_commit.slice(0, 10)}</dd></>}
              {fix.technical.deployment && <><dt>Deployment</dt><dd>{fix.technical.deployment}</dd></>}
              <dt>Status</dt><dd>{fix.status}{fix.reason_code ? ` · ${fix.reason_code}` : ""}</dd>
            </dl>
          </details>
          {fix.reason_code === "PR_AWAITING_OWNER" && <div className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/[0.06] p-4">
             {fix.review
               ? <><p className="text-sm font-semibold text-white">{tx("Bestaande oplossing controleren","Review the existing fix")}</p>
                   <p className="mt-2 text-sm text-slate-300">{tx("Deze wijziging staat klaar, maar is nog niet live. Dit is de tekst die RankFix heeft voorbereid:","This change is ready but is not live yet. Here is the text RankFix prepared:")}</p>
                   <blockquote className="mt-3 whitespace-pre-wrap rounded-lg border border-white/10 bg-black/20 p-3 text-sm text-white">{fix.review.expected_value}</blockquote>
                   <p className="mt-2 text-xs text-amber-100">{tx("Met jouw akkoord controleert RankFix opnieuw de Pull Request en publiceert alleen als alle veiligheidscontroles slagen.","With your approval RankFix rechecks the Pull Request and publishes only if all safety checks pass.")}</p>
                   <button type="button" disabled={busy} onClick={() => void approveExisting()} className="mt-4 min-h-12 w-full rounded-xl bg-[#5DCAA5] px-5 py-3 font-bold text-[#04342C] disabled:opacity-50">{busy?tx("Bezig…","Working…"):tx("Goedkeuren en live zetten","Approve and publish")}</button>
                 </>
               : <><p className="text-sm text-amber-100">{tx("De oude Fix heeft geen geldig opgeslagen voorstel meer. De Pull Request is niet samengevoegd. Je kunt een nieuw voorstel maken en dat binnen RankFix beoordelen; de oude PR wordt nooit automatisch gepubliceerd.","The old fix no longer has a valid saved proposal. The Pull Request has not been merged. You can prepare a fresh proposal and review it inside RankFix; the old PR is never silently published.")}</p>
                   <button type="button" disabled={busy || contextLoading || !repo || connected!==true || !check} onClick={() => { setFix(null); setFixPlan(null); void runFix(); }} className="mt-4 min-h-12 w-full rounded-xl bg-[#5DCAA5] px-4 py-3 font-bold text-[#04342C] disabled:opacity-50">{tx("Nieuw veilig voorstel maken","Prepare a new safe proposal")}</button>
                 </>}
           </div>}
           {fix.stage === "manual" && fix.reason_code !== "PR_AWAITING_OWNER" && <button type="button" disabled={busy} onClick={() => { setFix(null); void runFix(); }} className="mt-4 min-h-11 w-full rounded-xl border border-white/15 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{tx("Nieuwe controle proberen", "Try checking again")}</button>}
        </section>}

        {contextLoading && <p role="status" className="mt-5 rounded-xl border border-cyan-300/20 bg-cyan-300/5 p-4 text-sm text-cyan-100">RankFix haalt je opgeslagen scan, websitekoppeling en bestaande Fix-status op…</p>}
        {mappingWarning && <p role="alert" className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/10 p-3 text-sm text-amber-100">{mappingWarning}</p>}
        {error && <div role="alert" className="mt-5 rounded-xl bg-red-500/10 p-4 text-sm text-red-200">{error}</div>}
        {notice && !fix && <div role="status" className="mt-5 rounded-xl bg-emerald-500/10 p-4 text-sm text-emerald-100">{notice}</div>}

        {/* Approval inside RankFix — no GitHub knowledge needed. */}
        {fixPlan && !fix && <section className="mt-6 rounded-2xl border border-cyan-300/20 bg-cyan-400/[0.05] p-4 sm:p-6">
          <h2 className="text-lg font-bold">{tx("Wat RankFix gaat aanpassen", "What RankFix will change")}</h2>
          {isMeta && fixPlan.text
            ? <><p className="mt-1 text-sm text-slate-400">{tx("Nieuwe meta description", "New meta description")} ({fixPlan.text.length} {tx("tekens", "characters")})</p><blockquote className="mt-3 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.06] p-4 text-base leading-7 text-white">{fixPlan.text}</blockquote></>
            : <p className="mt-2 text-sm text-slate-300">{fixPlan.summary}</p>}
          {fixPlan.publishable
            ? <>
                <p className="mt-3 text-sm text-slate-400">{tx("Alleen dit onderdeel verandert. RankFix controleert vóór publicatie automatisch dat er niets anders wijzigt, en bevestigt het resultaat daarna met een nieuwe live scan.", "Only this item changes. Before publishing RankFix verifies nothing else changes, and afterwards confirms the result with a fresh live scan.")}</p>
                <button type="button" disabled={busy} onClick={() => void approve("publish")} className="mt-4 min-h-12 w-full rounded-xl bg-[#5DCAA5] px-5 py-3 font-bold text-[#04342C] disabled:opacity-50">{busy ? tx("Bezig…", "Working…") : tx("Goedkeuren en live zetten", "Approve and publish")}</button>
              </>
            : <>
                <p className="mt-3 rounded-xl bg-amber-300/10 p-3 text-sm text-amber-100">{tx("Handmatige controle nodig: dit type wijziging publiceert RankFix niet automatisch. RankFix kan een Pull Request voorbereiden die een ontwikkelaar controleert.", "Manual review needed: RankFix does not publish this type of change automatically. RankFix can prepare a Pull Request for a developer to review.")}</p>
                <button type="button" disabled={busy} onClick={() => void approve("pr_only")} className="mt-4 min-h-12 w-full rounded-xl border border-white/15 px-5 py-3 font-bold text-white disabled:opacity-50">{tx("Pull Request voorbereiden voor controle", "Prepare a Pull Request for review")}</button>
              </>}
          <details className="mt-4 text-sm text-slate-400">
            <summary className="cursor-pointer select-none">{tx("Technische details", "Technical details")}</summary>
            <p className="mt-2 text-xs">{tx("Bestand", "File")}: {fixPlan.path}</p>
            {fixPlan.preview && <div className="mt-2 grid gap-2 lg:grid-cols-2"><pre className="max-h-60 overflow-auto whitespace-pre-wrap rounded-lg bg-red-500/5 p-2 text-xs text-red-100">{fixPlan.preview.before.map((l) => "- " + l).join("\n")}</pre><pre className="max-h-60 overflow-auto whitespace-pre-wrap rounded-lg bg-emerald-500/5 p-2 text-xs text-emerald-100">{fixPlan.preview.after.map((l) => "+ " + l).join("\n")}</pre></div>}
            {fixPlan.publishable && <button type="button" disabled={busy} onClick={() => void approve("pr_only")} className="mt-3 text-xs underline">{tx("Alleen een Pull Request maken (ik publiceer zelf)", "Only create a Pull Request (I publish myself)")}</button>}
          </details>
          <button type="button" onClick={() => setFixPlan(null)} className="mt-3 text-xs text-slate-400 underline">{tx("Annuleren", "Cancel")}</button>
        </section>}

        {/* Start */}
        {!contextLoading && !fix && !fixPlan && <section className="mt-6">
          {plan === "free"
            ? <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.06] p-5"><p className="text-sm text-emerald-100">{tx("Automatisch oplossen is beschikbaar met een abonnement.", "Automatic fixing is available with a subscription.")}</p><Link href={`/checkout?plan=start&lang=${language}`} className="mt-3 inline-flex rounded-xl bg-emerald-400 px-5 py-3 font-bold text-slate-950">{tx("Bekijk abonnementen", "View plans")}</Link></div>
            : connected === false
              ? <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5"><h2 className="font-bold">{tx("Eenmalig: verbind GitHub", "One-time: connect GitHub")}</h2><p className="mt-1 text-sm text-slate-400">{tx("RankFix past je website aan via de GitHub-repository waar de code staat. Je keurt de toegang zelf goed bij GitHub.", "RankFix updates your site through the GitHub repository holding its code. You approve access on GitHub yourself.")}</p>{githubSetupRequired ? <p className="mt-3 rounded-xl bg-amber-300/10 p-3 text-sm text-amber-100">{tx("GitHub is in deze omgeving nog niet ingesteld.", "GitHub is not configured in this environment yet.")}</p> : <button type="button" onClick={() => window.location.assign("/api/github/connect")} className="mt-3 inline-flex rounded-xl bg-white px-5 py-3 font-bold text-slate-950">{tx("Verbind GitHub", "Connect GitHub")} →</button>}</div>
              : <>
                  {connected && !mapped && !mappingWarning && repos.length > 1 && <label className="mb-4 block text-sm"><span className="font-semibold">{tx("Eenmalig: in welke repository staat deze website?", "One-time: which repository holds this website?")}</span><select value={repo} onChange={(e) => { setRepo(e.target.value); const r = repos.find((x) => x.full_name === e.target.value); if (r) setBaseBranch(r.default_branch || "main"); }} className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3"><option value="">{tx("Kies repository", "Choose repository")}</option>{repos.map((r) => <option key={r.full_name} value={r.full_name}>{r.full_name}</option>)}</select></label>}
                  {historicalScan
                    ? <p role="status" className="rf-fix-alert rounded-xl border border-amber-300/25 bg-amber-300/[0.08] p-4 text-sm text-amber-100">{tx("Start geen Fix vanuit deze oude scan. Open eerst de nieuwste scan hierboven.", "Do not start a Fix from this old scan. Open the latest scan above.")}</p>
                    : socialImageMissing
                    ? <div role="status" className="rf-fix-alert rounded-xl border border-amber-300/25 bg-amber-300/[0.08] p-4 text-sm leading-6 text-amber-100">
                        <strong>{tx("Voor deze Fix ontbreekt een echte afbeelding", "An existing image is required for this Fix")}</strong>
                        <p className="mt-2">{tx("RankFix heeft geen betrouwbare afbeelding gevonden voor og:image. De titel en beschrijving zijn bekend, maar zonder echte afbeelding kan de volledige Social metadata-fix niet veilig worden gepubliceerd. Zet eerst een geschikte afbeelding op je website en scan opnieuw. Er is nu niets veranderd.", "RankFix could not verify an image for og:image. The title and description are available, but a complete Social metadata fix cannot safely publish without a real image. Add a suitable image to your site and scan again. Nothing changed.")}</p>
                      </div>
                    : <button type="button" disabled={busy || Boolean(mappingWarning) || !repo || connected !== true || !check} onClick={() => void runFix()} className="min-h-12 w-full rounded-xl bg-[#5DCAA5] px-5 py-3 text-base font-bold text-[#04342C] disabled:opacity-50">{busy ? stageLabels.preparing + "…" : FIX_BUTTON[language]}</button>}
                  {connected && !repo && !mappingWarning && <p className="mt-2 text-xs text-amber-200">RankFix zoekt je repository. Als die niet verschijnt, controleer dan je GitHub-koppeling; er is niets gepubliceerd.</p>}
                  {!check && scan && <p className="mt-2 text-xs text-amber-200">{tx("Dit verbeterpunt staat niet (meer) in deze scan.", "This issue is not (or no longer) in this scan.")}</p>}
                  <p className="mt-2 text-center text-xs text-slate-500">{historicalScan
                    ? tx("Automatisch publiceren wordt niet gestart vanuit een oudere scan.", "Automatic publishing is not started from an older scan.")
                    : socialImageMissing
                    ? tx("Deze Fix is geblokkeerd wegens ontbrekend bewijs. Automatisch publiceren wordt niet gestart.", "This Fix is blocked because image evidence is missing. Automatic publishing will not start.")
                    : autofix ? tx("Automatisch publiceren staat aan: ondersteunde, veilige fixes worden na alle controles direct live gezet.", "Automatic publishing is on: supported, safe fixes go live right after all checks.")
                    : tx("Je ziet eerst wat RankFix verandert en keurt het daarna met één klik goed.", "You first see what RankFix changes, then approve it with one click.")}</p>
                </>}
        </section>}

        {/* Per-website AutoFix setting — explicit, bound to this repository and branch. */}
        {connected && mapped && plan !== "free" && <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><strong>{tx("Automatisch publiceren", "Automatic publishing")}</strong><div className="text-xs text-slate-400">{host} · {repo} · {baseBranch}</div></div>
            {autofix
              ? <button type="button" disabled={busy} onClick={() => void setAutofixConsent(false)} className="rounded-lg border border-white/15 px-3 py-2 text-xs">{tx("Uitzetten", "Turn off")}</button>
              : <button type="button" disabled={busy} onClick={() => setConsentOpen(true)} className="rounded-lg border border-emerald-300/30 px-3 py-2 text-xs text-emerald-100">{tx("Aanzetten…", "Turn on…")}</button>}
          </div>
          {consentOpen && !autofix && <div className="mt-3 rounded-xl border border-amber-300/25 bg-amber-300/10 p-3 text-amber-50">
            <p>{tx(`Hiermee geef je RankFix toestemming om voor ${host} ondersteunde, veilige fixes (zoals een meta description) zonder extra klik samen te voegen in ${repo} (${baseBranch}). RankFix doet dit alleen als precies één verwacht bestand met een kleine wijziging verandert, de broncode niet intussen is gewijzigd en GitHub-controles slagen. Andere problemen blijven handmatige controle vragen. Je kunt dit altijd uitzetten.`, `This allows RankFix to merge supported, safe fixes (such as a meta description) for ${host} into ${repo} (${baseBranch}) without an extra click — only when exactly one expected file changes by a small amount, the source has not changed meanwhile and GitHub checks pass. Other issues still require manual review. You can turn this off at any time.`)}</p>
            <div className="mt-3 flex gap-2"><button type="button" disabled={busy} onClick={() => void setAutofixConsent(true)} className="rounded-lg bg-emerald-400 px-3 py-2 text-xs font-bold text-slate-950">{tx("Ja, ik geef toestemming", "Yes, I consent")}</button><button type="button" onClick={() => setConsentOpen(false)} className="rounded-lg border border-white/15 px-3 py-2 text-xs">{tx("Annuleren", "Cancel")}</button></div>
          </div>}
          <details className="mt-3 text-xs text-slate-500"><summary className="cursor-pointer">{tx("GitHub-koppeling", "GitHub link")}</summary><p className="mt-2">{tx("Verbonden als", "Connected as")} {login}. <button type="button" onClick={() => void releaseMapping()} className="underline">{tx("Andere repository kiezen", "Choose another repository")}</button> · <button type="button" onClick={() => window.location.assign("/api/github/connect")} className="underline">{tx("GitHub opnieuw verbinden", "Reconnect GitHub")}</button></p></details>
        </section>}

        {scanId && <Link href={`/dashboard/audit/${encodeURIComponent(scanId)}`} className="mt-6 inline-flex rounded-xl border border-white/10 px-4 py-2 text-sm font-bold text-slate-200">← {tx("Terug naar audit", "Back to audit")}</Link>}
      </section>
    </div>
    <AiAssistant dashboard scanId={scanId || null} errorContext={error || fix?.reason || null} />
  </main>;
}
