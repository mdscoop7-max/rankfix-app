"use client";

import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "Home", icon: "M3 10l9-7 9 7v10H3z M9 20v-7h6v7" },
  { href: "/#scan", label: "Scannen", icon: "M12 3v18 M3 12h18" },
  { href: "/dashboard", label: "Dashboard", icon: "M3 5h18v14H3z M3 10h18 M9 10v9" },
  { href: "/dashboard/github", label: "Fixes", icon: "M7 4l10 16 M17 4L7 20" },
  { href: "/dashboard/more", label: "Meer", icon: "M5 12h.01 M12 12h.01 M19 12h.01" }
];

export default function RootMobileNav() {
  const pathname = usePathname();
  return (
    <nav className="root-bottom-nav" aria-label="Mobiele navigatie">
      {items.map((item,index) => {
        const active = item.href === "/" ? pathname === "/" : !item.href.includes("#") && pathname === item.href;
        return <a href={item.href} key={item.href} className={index === 1 ? "root-bottom-scan" : undefined} aria-current={active ? "page" : undefined}>
          <span className="root-bottom-icon"><svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={item.icon} /></svg></span>
          <span>{item.label}</span>
        </a>;
      })}
    </nav>
  );
}
