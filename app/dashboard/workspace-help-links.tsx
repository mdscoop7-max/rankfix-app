import Link from "next/link";
import type { Locale } from "@/lib/locales";
import { workspaceCopy } from "./workspace-copy";
import { WorkspaceIcon } from "./workspace-icons";
import "./workspace-help-links.css";

export function WorkspaceHelpLinks({ language }: { language: Locale }) {
  const t = workspaceCopy[language];
  return <nav className="rx-help-service" aria-label={t.help}>{[
    { href: "/dashboard/how", title: t.how, icon: "brand" as const },
    { href: "/dashboard/contact", title: t.contact, icon: "contact" as const },
    { href: "/dashboard/reviews", title: t.review, icon: "review" as const }
  ].map(item => <Link key={item.href} href={item.href}><WorkspaceIcon name={item.icon} /><span>{item.title}</span><span aria-hidden="true">→</span></Link>)}</nav>;
}
