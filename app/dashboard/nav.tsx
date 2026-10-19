"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Locale } from "@/lib/locales";
import { workspaceCopy } from "./workspace-copy";
import { WorkspaceIcon } from "./workspace-icons";
import type { WorkspaceUsage } from "./workspace-model";
import "./workspace-nav.css";

const navItems = [
  ["overview", "/dashboard"], ["websites", "/dashboard/websites"], ["scan", "/dashboard/scan"],
  ["improvements", "/dashboard/improvements"], ["reports", "/dashboard/history"],
  ["tools", "/dashboard/tools"], ["connections", "/dashboard/connections"]
] as const;
const languages: Locale[] = ["nl", "en", "de", "fr", "it", "es"];

export function LanguageSelect({ language, onChange }: { language: Locale; onChange?: (value: Locale) => void }) {
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  async function change(value: Locale) {
    if (saving) return;
    setSaving(true); setFailed(false);
    try {
      const response = await fetch("/api/account/language", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ language: value }) });
      if (!response.ok) throw new Error("language");
      onChange?.(value);
      window.dispatchEvent(new CustomEvent("rankfix-language", { detail: value }));
      if (!onChange) window.location.reload();
    } catch { setFailed(true); }
    finally { setSaving(false); }
  }
  return <label className="rx-language"><span className="rx-sr-only">{workspaceCopy[language].language}</span><select aria-invalid={failed || undefined} value={language} disabled={saving} onChange={event => void change(event.target.value as Locale)}>{languages.map(value => <option key={value} value={value}>{value.toUpperCase()}</option>)}</select><WorkspaceIcon name="down" />{failed && <span className="rx-language-error" role="alert">{workspaceCopy[language].retry}</span>}</label>;
}

function isActive(path: string, href: string) {
  if (href === "/dashboard") return path === href || path.startsWith("/dashboard/audit/");
  if (href === "/dashboard/tools") return [href, "/dashboard/competitor", "/dashboard/local-seo"].some(item => path === item);
  if (href === "/dashboard/connections") return [href, "/dashboard/github", "/dashboard/search-console"].some(item => path.startsWith(item));
  return path.startsWith(href);
}

type MenuProps = { language: Locale; path: string; usage?: WorkspaceUsage; issues?: number; close?: () => void; drawer?: boolean };
function MenuContent({ language, path, usage, issues, close, drawer }: MenuProps) {
  const t = workspaceCopy[language];
  const ratio = usage?.limit ? Math.min(100, Math.max(0, usage.used / usage.limit * 100)) : 0;
  return <>
    <div className="rx-menu-brand"><Link href="/dashboard" onClick={close}><span><WorkspaceIcon name="brand" /></span><b>RankFix</b></Link>{drawer && <button type="button" onClick={close} aria-label={t.close}><WorkspaceIcon name="close" /></button>}</div>
    <nav className="rx-main-menu" aria-label={t.menu}>{navItems.map(([key, href]) => <Link href={href} key={key} onClick={close} aria-current={isActive(path, href) ? "page" : undefined}><WorkspaceIcon name={key} /><span>{t[key]}</span>{key === "improvements" && !!issues && <em>{issues}</em>}{["tools", "connections"].includes(key) && <WorkspaceIcon className="rx-menu-chevron" name="chevron" />}</Link>)}</nav>
    <div className="rx-menu-bottom">
      {usage && <Link href="/dashboard/account" onClick={close} className="rx-plan"><strong>{t.plan} · {usage.plan === "free" ? t.free : usage.plan}</strong><span>{usage.used}{usage.limit == null ? ` · ${t.unlimited}` : ` / ${usage.limit}`} {t.used}</span><div className="rx-progress"><i style={{ width: `${ratio}%` }} /></div></Link>}
      <nav className="rx-service-menu" aria-label={t.help}><Link href="/dashboard/help" onClick={close} aria-current={path.startsWith("/dashboard/help") ? "page" : undefined}><WorkspaceIcon name="help" /><span>{t.help}</span></Link><Link href="/dashboard/account" onClick={close} aria-current={path.startsWith("/dashboard/account") ? "page" : undefined}><WorkspaceIcon name="account" /><span>{t.account}</span></Link><Link href={`/${language}`} onClick={close}><WorkspaceIcon name="back" /><span>{t.back}</span></Link></nav>
      {drawer && <LanguageSelect language={language} />}
    </div>
  </>;
}

export default function DashboardNav({ language: suppliedLanguage, usage: suppliedUsage, issues, loadSummary = true }: { current?: number; language?: Locale; usage?: WorkspaceUsage; issues?: number; loadSummary?: boolean }) {
  const path = usePathname() || "/dashboard";
  const [language, setLanguage] = useState<Locale>("nl");
  const [usage, setUsage] = useState<WorkspaceUsage>();
  const [admin, setAdmin] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const activeLanguage = suppliedLanguage || language;
  const t = workspaceCopy[activeLanguage];
  useEffect(() => {
    const controller = new AbortController();
    if (!suppliedLanguage) fetch("/api/account/language", { signal: controller.signal }).then(r => r.ok ? r.json() : null).then(data => { if (data?.language in workspaceCopy) setLanguage(data.language); }).catch(() => {});
    if (loadSummary && !suppliedUsage) fetch("/api/history", { signal: controller.signal, cache: "no-store" }).then(r => r.ok ? r.json() : null).then(data => { if (data?.usage) setUsage(data.usage); }).catch(() => {});
    fetch("/api/health/admin-status", { signal: controller.signal, cache: "no-store" }).then(r => r.ok ? r.json() : null).then(data => setAdmin(data?.admin === true)).catch(() => {});
    return () => controller.abort();
  }, [suppliedLanguage, suppliedUsage, loadSummary]);
  useEffect(() => {
    const open = () => { if (!dialog.current?.open) dialog.current?.showModal(); };
    window.addEventListener("rankfix:open-menu", open);
    return () => window.removeEventListener("rankfix:open-menu", open);
  }, []);
  const close = () => dialog.current?.close();
  const menuProps = { language: activeLanguage, path, usage: suppliedUsage || usage, issues };
  return <>
    <aside className="rx-sidebar"><MenuContent {...menuProps} />{admin && <Link className="rx-admin-link" href="/dashboard/health">System Health · Admin</Link>}<div className="rx-legacy-language"><LanguageSelect language={activeLanguage} /></div></aside>
    <button className="rx-legacy-toggle" type="button" onClick={() => dialog.current?.showModal()} aria-label={t.menu}><WorkspaceIcon name="menu" /><b>RankFix</b></button>
    <dialog className="rx-menu-dialog" ref={dialog} aria-label={t.menu} onClick={event => { if (event.target === dialog.current) close(); }}><div className="rx-drawer"><MenuContent {...menuProps} close={close} drawer />{admin && <Link className="rx-admin-link" href="/dashboard/health" onClick={close}>System Health · Admin</Link>}</div></dialog>
    <nav className="rx-mobile-nav" aria-label={t.menu}>{([ ["overview", "/dashboard", t.overview], ["websites", "/dashboard/websites", t.sitesShort], ["scan", "/dashboard/scan", t.scanShort], ["improvements", "/dashboard/improvements", t.improvements] ] as const).map(([key, href, label]) => <Link key={key} href={href} aria-current={isActive(path, href) ? "page" : undefined}><WorkspaceIcon name={key} /><span>{label}</span></Link>)}<button type="button" onClick={() => dialog.current?.showModal()}><WorkspaceIcon name="more" /><span>{t.more}</span></button></nav>
  </>;
}
