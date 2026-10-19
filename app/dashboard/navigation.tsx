"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { WorkspaceIcon } from "./workspace-icons";

type Place = { href: string; y: number };
const key = "rankfix:dashboard-navigation:v1";
const labels: Record<string, string> = { nl: "Terug", en: "Back", de: "Zurück", fr: "Retour", it: "Indietro", es: "Volver" };

function Navigation() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const router = useRouter();
  const places = useRef<Place[]>([]);
  const restore = useRef<Place | null>(null);
  const popped = useRef<string | null>(null);
  const navigating = useRef(false);
  const [language, setLanguage] = useState("nl");
  const href = pathname + (search ? `?${search}` : "");

  useEffect(() => {
    fetch("/api/account/language").then(r => r.ok ? r.json() : null).then(d => { if (d?.language in labels) setLanguage(d.language); }).catch(() => {});
    const change = (event: Event) => setLanguage((event as CustomEvent<string>).detail);
    window.addEventListener("rankfix-language", change);
    return () => window.removeEventListener("rankfix-language", change);
  }, []);

  useEffect(() => {
    const pop = () => { navigating.current = true; popped.current = window.location.pathname + window.location.search; };
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);

  useEffect(() => {
    if (!places.current.length) {
      try {
        const saved = JSON.parse(sessionStorage.getItem(key) || "[]");
        if (Array.isArray(saved)) places.current = saved.filter(p => typeof p?.href === "string" && /^\/dashboard(?:[/?]|$)/.test(p.href) && Number.isFinite(p.y)).slice(-40);
      } catch { /* Storage may be disabled. */ }
    }
    const stack = places.current;
    if (stack.at(-1)?.href !== href) {
      const previousIndex = popped.current === href ? stack.findLastIndex(place => place.href === href) : -1;
      if (previousIndex >= 0) { stack.splice(previousIndex + 1); restore.current = { ...stack.at(-1)! }; }
      else stack.push({ href, y: 0 });
    }
    popped.current = null;
    navigating.current = false;
    const save = () => {
      if (navigating.current) return;
      if (stack.at(-1)?.href === href) stack[stack.length - 1].y = window.scrollY;
      try { sessionStorage.setItem(key, JSON.stringify(stack.slice(-40))); } catch { /* Storage may be disabled. */ }
    };
    const leaving = (event: MouseEvent) => {
      save();
      const link = (event.target as Element | null)?.closest("a[href]");
      if (link instanceof HTMLAnchorElement && link.origin === location.origin && link.pathname.startsWith("/dashboard") && link.pathname + link.search !== href) navigating.current = true;
    };
    let frame = 0;
    const target = restore.current;
    restore.current = null;
    if (target?.href === href && target.y > 0) {
      const started = performance.now();
      const scroll = () => {
        window.scrollTo({ top: target.y, behavior: "instant" });
        if (window.scrollY + 1 < target.y && performance.now() - started < 3000) frame = requestAnimationFrame(scroll);
      };
      frame = requestAnimationFrame(scroll);
    }
    document.addEventListener("click", leaving, true);
    window.addEventListener("pagehide", save);
    window.addEventListener("scroll", save, { passive: true });
    return () => { cancelAnimationFrame(frame); document.removeEventListener("click", leaving, true); window.removeEventListener("pagehide", save); window.removeEventListener("scroll", save); };
  }, [href]);

  function back() {
    if (places.current.length > 1) {
      places.current.pop();
      const previous = places.current.at(-1)!;
      restore.current = { ...previous };
      router.push(previous.href, { scroll: false });
    } else router.push("/dashboard");
  }

  return <div className="rx-return-bar"><button className="rx-return-menu" type="button" aria-label="Menu" onClick={() => window.dispatchEvent(new Event("rankfix:open-menu"))}><WorkspaceIcon name="menu" /></button><button className="rx-return-back" type="button" onClick={back}><WorkspaceIcon name="back" />{labels[language] || labels.nl}</button><Link href="/dashboard">RankFix <span>AI</span></Link></div>;
}

export default function DashboardNavigation() { return <Suspense><Navigation /></Suspense>; }
