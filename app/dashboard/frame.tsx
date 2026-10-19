"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { Locale } from "@/lib/locales";
import DashboardNav, { LanguageSelect } from "./nav";
import { WorkspaceIcon } from "./workspace-icons";
import { workspaceCopy } from "./workspace-copy";
import "./workspace.css";

export default function DashboardFrame({ language, title, intro, children }: { language: Locale; title: string; intro: string; children: ReactNode }) {
  const t = workspaceCopy[language];
  return <main className="rx-page rx-detail-page" lang={language}><DashboardNav language={language} /><div className="rx-workspace"><header className="rx-topbar rx-detail-topbar"><button className="rx-menu-toggle" type="button" aria-label={t.menu} onClick={() => window.dispatchEvent(new Event("rankfix:open-menu"))}><WorkspaceIcon name="menu" /></button><Link href="/dashboard" className="rx-detail-brand"><WorkspaceIcon name="brand" /><b>RankFix <span>AI</span></b></Link><LanguageSelect language={language} /></header><div className="rx-heading"><div><h1>{title}</h1><p>{intro}</p></div></div><div className="rx-detail-content">{children}</div></div></main>;
}
