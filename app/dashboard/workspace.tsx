"use client";

import Link from "next/link";
import AiAssistant from "@/components/ai-assistant";
import { getFixPolicy } from "@/lib/fix-policy";
import { issueAnchor, safeGithubFixHref } from "@/lib/dashboard-fix-action";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import type { Locale } from "@/lib/locales";
import { headlineDisplay, scoreQualifier } from "@/lib/score-qualifier";
import DashboardNav, { LanguageSelect } from "./nav";
import { workspaceCopy } from "./workspace-copy";
import { WorkspaceIcon, type WorkspaceIconName } from "./workspace-icons";
import { comparableScans, priorityChecks, remaining, websiteHost, type AuditCheck, type WebsiteScan, type WorkspaceAudit, type WorkspaceHistory } from "./workspace-model";
import "./workspace.css";

type View = "overview" | "websites" | "improvements" | "tools" | "connections" | "more";
type AuditState = { id: string; result: WorkspaceAudit | null; error: boolean };
type User = { name: string; email: string };
const emptyData: WorkspaceHistory = { scans: [], history: [], fixes: {}, usage: { plan: "free", used: 0, limit: 2 } };

function issueTone(check: AuditCheck): { icon: WorkspaceIconName; color: string } {
  const key = `${check.rule_id || check.key || ""} ${check.category || ""} ${check.title}`.toLowerCase();
  if (/security|header|ssl|beveilig|veilig/.test(key)) return { icon: "lock", color: "pink" };
  if (/schema|structured|json/.test(key)) return { icon: "code", color: "purple" };
  if (/image|afbeeld|alt/.test(key)) return { icon: "image", color: "amber" };
  if (/speed|performance|laad|lcp|cls|snel/.test(key)) return { icon: "bolt", color: "green" };
  return { icon: "issue", color: "red" };
}

function ScoreChart({ scans, language }: { scans: WebsiteScan[]; language: Locale }) {
  const t = workspaceCopy[language];
  const gradient = `rx-trend-${useId().replace(/:/g, "")}`;
  if (scans.length < 2) return <div className="rx-chart-empty"><WorkspaceIcon name="tools" /><p>{t.trendEmpty}</p></div>;
  const firstTime = Date.parse(scans[0].created_at);
  const duration = Date.parse(scans[scans.length - 1].created_at) - firstTime;
  const points = scans.map((scan, index) => ({ x: 36 + (duration ? (Date.parse(scan.created_at) - firstTime) / duration : index / (scans.length - 1)) * 334, y: 180 - Math.max(0, Math.min(100, scan.overall_score)) * 1.5 }));
  const line = points.map(point => `${point.x},${point.y}`).join(" ");
  const date = (value: string) => new Date(value).toLocaleDateString(language, { day: "numeric", month: "short" });
  return <><svg className="rx-chart" viewBox="0 0 390 220" role="img" aria-label={`${t.trend}: ${scans[0].overall_score} → ${scans[scans.length - 1].overall_score}`}><defs><linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#00b88b" stopOpacity=".24" /><stop offset="100%" stopColor="#00b88b" stopOpacity="0" /></linearGradient></defs>{[0, 50, 100].map(value => <g key={value}><line x1="36" x2="370" y1={180 - value * 1.5} y2={180 - value * 1.5} stroke="#edf1f6" /><text x="26" y={184 - value * 1.5} textAnchor="end">{value}</text></g>)}<polygon points={`36,180 ${line} 370,180`} fill={`url(#${gradient})`} /><polyline points={line} fill="none" stroke="#00b88b" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" />{points.map((point, index) => <circle key={scans[index].id} cx={point.x} cy={point.y} r={index === points.length - 1 ? 6 : 3} fill="#00b88b" stroke="white" strokeWidth="2"><title>{date(scans[index].created_at)}: {scans[index].overall_score}/100</title></circle>)}<text x="36" y="210">{date(scans[0].created_at)}</text><text x="370" y="210" textAnchor="end">{date(scans[scans.length - 1].created_at)}</text></svg><details className="rx-chart-data"><summary>{t.chartTable}</summary><table><thead><tr><th>{t.date}</th><th>{t.score}</th></tr></thead><tbody>{scans.map(scan => <tr key={scan.id}><td>{new Date(scan.created_at).toLocaleString(language)}</td><td>{scan.overall_score}/100</td></tr>)}</tbody></table></details></>;
}

export default function DashboardWorkspace({ view = "overview" }: { view?: View }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [data, setData] = useState<WorkspaceHistory>(emptyData);
  const [language, setLanguage] = useState<Locale>("nl");
  const [selectedId, setSelectedId] = useState("");
  const [auditState, setAuditState] = useState<AuditState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [notifications, setNotifications] = useState(false);
  const [greeting, setGreeting] = useState<"hello" | "morning" | "afternoon" | "evening">("hello");
  const searchBox = useRef<HTMLDivElement>(null);
  const notificationBox = useRef<HTMLDivElement>(null);
  const t = workspaceCopy[language];
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      if (window.location.hash === "#websites") { router.replace("/dashboard/websites"); return; }
      setLoading(true); setError("");
      try {
        const [meResponse, preferenceResponse, historyResponse] = await Promise.all([fetch("/api/auth/me", { signal: controller.signal, cache: "no-store" }), fetch("/api/account/language", { signal: controller.signal }), fetch("/api/history", { signal: controller.signal, cache: "no-store" })]);
        const me = await meResponse.json();
        if (meResponse.status === 401 || (meResponse.ok && !me.user)) { router.replace("/account"); return; }
        if (!meResponse.ok || !me.user) throw new Error("dashboard");
        // A history/database outage must not prevent an authenticated user from opening the dashboard.
        const [preference, history] = await Promise.all([
          preferenceResponse.ok ? preferenceResponse.json().catch(() => null) : null,
          historyResponse.ok ? historyResponse.json().catch(() => emptyData) : emptyData,
        ]);
        if (controller.signal.aborted) return;
        if (preference?.language in workspaceCopy) setLanguage(preference.language);
        setUser(me.user); setData(history);
        try { setSelectedId(sessionStorage.getItem("rankfix:selected-scan") || ""); } catch {}
        const hour = new Date().getHours(); setGreeting(hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening");
      } catch { if (!controller.signal.aborted) setError("dashboard"); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load();
    return () => controller.abort();
  }, [attempt, router]);
  const selected = data.scans.find(scan => scan.id === selectedId) || data.scans[0];
  const selectedScanId = selected?.id;
  useEffect(() => {
    if (!selectedScanId) return;
    const controller = new AbortController();
    fetch(`/api/history/${encodeURIComponent(selectedScanId)}`, { signal: controller.signal, cache: "no-store" }).then(async response => {
      if (!response.ok) throw new Error("audit");
      const result = await response.json();
      const raw = result.scan?.result;
      const audit: WorkspaceAudit = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (!audit || typeof audit !== "object") throw new Error("audit");
      if (!controller.signal.aborted) setAuditState({ id: selectedScanId, result: audit, error: false });
    }).catch(() => { if (!controller.signal.aborted) setAuditState({ id: selectedScanId, result: null, error: true }); });
    return () => controller.abort();
  }, [selectedScanId, attempt]);
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (!searchBox.current?.contains(event.target as Node)) setSearchOpen(false);
      if (!notificationBox.current?.contains(event.target as Node)) setNotifications(false);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setSearchOpen(false); setNotifications(false); } };
    document.addEventListener("pointerdown", dismiss); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", dismiss); document.removeEventListener("keydown", escape); };
  }, []);
  const audit = auditState && auditState.id === selectedScanId ? auditState.result : null;
  const auditLoading = !!selected && auditState?.id !== selectedScanId;
  const auditError = auditState && auditState.id === selectedScanId && auditState.error;
  const issues = priorityChecks(audit);
  const query = search.trim().toLocaleLowerCase(language);
  const matchingSites = data.scans.filter(scan => websiteHost(scan).toLocaleLowerCase(language).includes(query));
  const matchingIssues = issues.filter(check => `${check.title} ${check.message || ""}`.toLocaleLowerCase(language).includes(query));
  const scans = comparableScans(data.usage.plan === "free" ? data.history.slice(0, 1) : data.history, selected);
  const change = scans.length > 1 ? scans[scans.length - 1].overall_score - scans[scans.length - 2].overall_score : null;
  const initials = (user?.name || user?.email || "?").trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase();
  const auditHref = selected ? `/dashboard/audit/${encodeURIComponent(selected.id)}` : "/dashboard/scan";
  const issueHref = `${auditHref}#rankfix-priorities`;
  const usage = loading || error ? undefined : data.usage;
  const aiUsage = usage?.actions?.aiFixes;
  const aiRemaining = aiUsage ? remaining(aiUsage.limit, aiUsage.used) : undefined;
  const scansRemaining = usage ? remaining(usage.limit, usage.used) : undefined;
  const score = selected?.overall_score;
  const displayScore = audit ? headlineDisplay(audit) : score == null ? "—" : String(score);
  const hasRange = audit?.scoreModel?.headline?.kind === "range";
  const heading = view === "overview" ? `${t[greeting]}${user?.name ? `, ${user.name.split(" ")[0]}` : ""}` : t[view];

  function renderIssues(limit?: number) {
    if (!selected) return <div className="rx-empty"><p>{t.emptyHint}</p><Link href="/dashboard/scan" className="rx-primary">{t.scan}</Link></div>;
    if (auditLoading) return <p className="rx-empty" role="status">{t.loading}</p>;
    if (auditError) return <div className="rx-empty" role="alert"><p>{t.issuesError}</p><button className="rx-text-link" onClick={() => setAttempt(value => value + 1)}>{t.retry}</button></div>;
    const visible = query && view === "improvements" ? matchingIssues : issues;
    if (!visible.length) return <div className="rx-empty"><WorkspaceIcon name={query ? "scan" : "check"} /><h3>{query ? t.noResults : t.noIssues}</h3><p>{t.noIssuesHint}</p><Link className="rx-text-link" href={auditHref}>{t.audit} →</Link></div>;
    return <div className="rx-issue-list">{visible.slice(0, limit).map((check, index) => {
      const tone = issueTone(check);
      const fixTarget = safeGithubFixHref(check, selected.id, getFixPolicy(check.issue_id || check.rule_id || check.key || ""));
      const target = fixTarget || `${auditHref}?focus_issue=${encodeURIComponent(issueAnchor(check))}#${issueAnchor(check)}`;
      const label = fixTarget ? ({ nl: "Fix maken", en: "Create fix", de: "Fix erstellen", fr: "Corriger", it: "Crea fix", es: "Crear fix" })[language] : t.solve;
      const severity = check.severity?.toUpperCase();
      const impact = severity === "CRITICAL" || severity === "HIGH" ? "high" : severity === "LOW" ? "low" : "medium";
      return <article className="rx-issue-row" key={`${check.category}:${check.rule_id || check.issue_id || check.key || check.title}:${index}`}><span className={`rx-issue-icon rx-${tone.color}`}><WorkspaceIcon name={tone.icon} /></span><div className="rx-issue-copy"><h3>{check.title}</h3><p>{check.message || t.details}</p></div><span className={`rx-impact rx-impact-${impact}`}>{t[impact]}</span><Link className="rx-resolve" href={target} aria-label={`${label}: ${check.title}`}>{label}</Link></article>;
    })}</div>;
  }

  const toolCards: Array<{ title: string; body: string; icon: WorkspaceIconName; href: string; premium?: boolean }> = [
    { title: t.competitor, body: t.competitorHint, icon: "tools", href: `/dashboard/competitor${selected ? `?url=${encodeURIComponent(selected.scanned_url)}` : ""}`, premium: true },
    { title: t.local, body: t.localHint, icon: "websites", href: `/dashboard/local-seo${selected ? `?url=${encodeURIComponent(selected.scanned_url)}` : ""}`, premium: true }
  ];
  const connectionCards = [
    { title: "Google Search Console", body: t.googleHint, icon: "tools" as const, href: "/dashboard/search-console" },
    { title: "GitHub", body: t.githubHint, icon: "code" as const, href: "/dashboard/github", premium: true }
  ];
  const serviceCards = [
    { title: t.help, body: t.helpHint, icon: "help" as const, href: "/dashboard/help" },
    { title: t.how, body: t.howHint, icon: "brand" as const, href: "/dashboard/how" },
    { title: t.contact, body: t.contactHint, icon: "contact" as const, href: "/dashboard/contact" },
    { title: t.review, body: t.reviewHint, icon: "review" as const, href: "/dashboard/reviews" },
    { title: t.account, body: t.accountHint, icon: "account" as const, href: "/dashboard/account" }
  ];
  const cards = view === "tools" ? toolCards : view === "connections" ? connectionCards : [...toolCards, ...connectionCards, ...serviceCards];
  return <main className="rx-page" lang={language}>
    <a className="rx-skip-link" href="#rx-content">{t.overview}</a>
    <AiAssistant dashboard scanId={selectedScanId || null} />
    <DashboardNav loadSummary={false} language={language} usage={usage} issues={selected?.open_issues} />
    <div className="rx-workspace">
      <header className="rx-topbar">
        <button type="button" className="rx-menu-toggle" aria-label={t.menu} onClick={() => window.dispatchEvent(new Event("rankfix:open-menu"))}><WorkspaceIcon name="menu" /></button>
        <Link href="/dashboard" className="rx-mobile-brand"><WorkspaceIcon name="brand" /><b>RankFix</b></Link>
        <div className="rx-search" ref={searchBox}><WorkspaceIcon name="scan" /><input type="search" placeholder={t.search} aria-label={t.searchLabel} value={search} onFocus={() => setSearchOpen(true)} onChange={event => { setSearch(event.target.value); setSearchOpen(true); }} />{searchOpen && query && <div className="rx-search-results"><p>{t.searchHint}</p>{matchingSites.slice(0, 5).map(scan => <Link href={`/dashboard/audit/${encodeURIComponent(scan.id)}`} key={scan.id} onClick={() => setSearchOpen(false)}><WorkspaceIcon name="websites" /><span>{websiteHost(scan)}</span><b>{scan.overall_score}</b></Link>)}{matchingIssues.slice(0, 4).map((check, index) => <Link href={issueHref} key={`${check.title}:${index}`} onClick={() => setSearchOpen(false)}><WorkspaceIcon name="improvements" /><span>{check.title}</span></Link>)}{!matchingSites.length && !matchingIssues.length && <p>{t.noResults}</p>}</div>}</div>
        <div className="rx-notification-box" ref={notificationBox}><button className="rx-notification" type="button" aria-label={t.activity} aria-expanded={notifications} onClick={() => setNotifications(value => !value)}><WorkspaceIcon name="bell" />{data.fixes.PREPARED > 0 && <i />}</button>{notifications && <div className="rx-notification-panel"><h2>{t.activity}</h2><p>{data.fixes.PREPARED ? `${data.fixes.PREPARED} ${t.prepared}` : t.activityEmpty}</p>{data.fixes.PREPARED > 0 && <Link href="/dashboard/github">{t.viewFixes} →</Link>}</div>}</div>
        <LanguageSelect language={language} onChange={setLanguage} />
        <Link href="/dashboard/account" className="rx-avatar" aria-label={t.account}>{initials}</Link>
      </header>
      <div className="rx-content" id="rx-content">
        <div className="rx-heading"><div><h1>{heading}</h1><p>{view === "overview" ? <>{t.state} <strong>{selected ? websiteHost(selected) : t.noSite}</strong></> : view === "tools" ? t.toolIntro : view === "connections" ? t.connectionIntro : view === "websites" ? t.siteIntro : view === "improvements" ? t.issueIntro : t.helpHint}</p></div><Link href="/dashboard/scan" className="rx-primary"><WorkspaceIcon name="plus" />{t.scan}</Link></div>
        {data.scans.length > 1 && ["overview", "improvements", "tools"].includes(view) && <label className="rx-site-select"><span>{t.selectSite}</span><select value={selectedScanId} onChange={event => { setSelectedId(event.target.value); try { sessionStorage.setItem("rankfix:selected-scan", event.target.value); } catch {} setSearch(""); }}>{data.scans.map(scan => <option value={scan.id} key={scan.id}>{websiteHost(scan)}</option>)}</select></label>}
        {loading ? <div className="rx-loading" role="status"><span />{t.loading}</div> : error ? <div className="rx-error" role="alert"><p>{t.error}</p><button type="button" className="rx-primary" onClick={() => setAttempt(value => value + 1)}>{t.retry}</button></div> : <>
          {view === "overview" && <>
            <section className="rx-summary" aria-label={t.overview}>
              <Link className="rx-score-hero" href={auditHref}><div className={`rx-score-ring${hasRange ? " rx-score-range" : ""}`}><svg viewBox="0 0 140 140" aria-hidden="true"><circle cx="70" cy="70" r="59" fill="none" stroke="#174c61" strokeWidth="12" /><circle cx="70" cy="70" r="59" fill="none" stroke="#00d69b" strokeWidth="12" strokeLinecap="round" pathLength="100" strokeDasharray={`${hasRange ? 0 : Math.max(0, Math.min(100, score ?? 0))} 100`} transform="rotate(-90 70 70)" /></svg><div><strong>{displayScore}</strong><span>{t.outOf}</span></div></div><div className="rx-score-copy">{change !== null && <span className={`rx-score-change${change < 0 ? " rx-change-down" : ""}`}>{change >= 0 ? "↑ +" : "↓ "}{change} {t.since}</span>}<h2>{selected ? (score != null && score >= 70 ? t.good : t.attention) : t.empty}<br />{selected && <span>{selected.open_issues ? language === "nl" ? `Nog ${selected.open_issues} ${selected.open_issues === 1 ? "ding" : "dingen"} te verbeteren` : `${selected.open_issues} ${t.remaining}` : t.noIssues}</span>}</h2><p>{selected ? `${t.latest}: ${new Date(selected.created_at).toLocaleString(language, { dateStyle: "short", timeStyle: "short" })}` : t.emptyHint}</p>{audit && <small>{scoreQualifier(audit, language).label}</small>}</div></Link>
              <article className="rx-usage-card"><h2>{t.month}</h2><strong>{usage?.used ?? "—"}<span> / {usage?.limit == null ? t.unlimited : usage.limit}</span></strong><div className="rx-progress"><i style={{ width: `${usage?.limit ? Math.min(100, usage.used / usage.limit * 100) : 0}%` }} /></div><p>{scansRemaining == null ? t.unlimited : `${scansRemaining} ${t.scansLeft}`}</p></article>
              <article className="rx-usage-card"><h2>{t.aiLeft}</h2><strong>{aiRemaining === undefined ? "—" : aiRemaining === null ? "∞" : aiRemaining}<span>{aiUsage && ` / ${aiUsage.limit == null ? t.unlimited : aiUsage.limit}`}</span></strong><div className="rx-progress rx-progress-green"><i style={{ width: `${aiUsage?.limit && aiRemaining != null ? aiRemaining / aiUsage.limit * 100 : 0}%` }} /></div><p>{t.aiHint}</p></article>
            </section>
            <div className="rx-main-grid"><section className="rx-panel rx-priorities"><div className="rx-panel-heading"><h2>{t.first}</h2><Link href="/dashboard/improvements">{t.all} →</Link></div>{renderIssues(5)}</section><section className="rx-panel rx-trend-panel"><div className="rx-panel-heading"><h2>{t.trend}</h2><span className="rx-time-badge">{t.lastScans}</span></div><ScoreChart scans={scans} language={language} /><dl className="rx-category-scores"><div><dt>SEO</dt><dd>{selected?.seo_score ?? "—"}</dd></div><div><dt>{t.aiSearch}</dt><dd>{selected?.geo_score ?? "—"}</dd></div><div><dt>{t.security}</dt><dd>{audit?.security?.score ?? "—"}</dd></div><div><dt>{t.remaining}</dt><dd>{selected?.open_issues ?? "—"}</dd></div></dl></section></div>
          </>}
          {view === "improvements" && <section className="rx-panel rx-all-issues"><div className="rx-panel-heading"><h2>{selected ? websiteHost(selected) : t.empty}</h2><Link href={auditHref}>{t.audit} →</Link></div>{renderIssues()}</section>}
          {view === "websites" && <section id="websites" className="rx-panel rx-website-list">{matchingSites.map(scan => <article key={scan.id}><span className={`rx-site-dot${scan.critical_issues ? " rx-site-critical" : scan.open_issues ? " rx-site-warning" : ""}`} /><div><h2>{websiteHost(scan)}</h2><p>{scan.open_issues} {t.remaining} · {new Date(scan.created_at).toLocaleDateString(language)}</p></div><strong>{scan.overall_score}<small>/100</small></strong><div className="rx-website-actions"><Link href={`/dashboard/audit/${encodeURIComponent(scan.id)}`}>{t.audit}</Link><Link href={`/dashboard/scan?url=${encodeURIComponent(scan.scanned_url)}`}>{t.scanAgain}</Link><Link href={`/dashboard/audit/${encodeURIComponent(scan.id)}/report`}>PDF</Link></div></article>)}{!matchingSites.length && <div className="rx-empty"><h2>{query ? t.noResults : t.empty}</h2><p>{t.emptyHint}</p></div>}<Link href="/dashboard/scan" className="rx-add-website"><WorkspaceIcon name="plus" />{t.added}</Link></section>}
          {["tools", "connections", "more"].includes(view) && <div className="rx-tools-grid">{cards.map(card => <Link href={card.href} className="rx-panel rx-tool-card" key={card.href}><span className="rx-tool-icon"><WorkspaceIcon name={card.icon} /></span><div><h2>{card.title}{"premium" in card && card.premium && data.usage.plan === "free" && <small>{t.premium}</small>}</h2><p>{card.body}</p></div><WorkspaceIcon name="chevron" /></Link>)}</div>}
        </>}
      </div>
    </div>
  </main>;
}
