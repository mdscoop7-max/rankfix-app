const items = [
  { href: "/", label: "Home", icon: "M3 10l9-7 9 7v10H3z M9 20v-7h6v7" },
  { href: "/#scan", label: "Scan", icon: "M12 3v18 M3 12h18" },
  { href: "/#features", label: "Zo werkt het", icon: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 7v5l3 2" },
  { href: "/dashboard", label: "Dashboard", icon: "M3 5h18v14H3z M3 10h18 M9 10v9" },
  { href: "/account?lang=nl", label: "Account", icon: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 21v-2a8 8 0 0 1 16 0v2" }
];
export default function RootMobileNav() {
  return <nav className="root-bottom-nav" aria-label="Mobiele navigatie">{items.map((item,index) => <a href={item.href} key={item.href} className={index === 1 ? "root-bottom-scan" : undefined} aria-current={index === 0 ? "page" : undefined}><span className="root-bottom-icon"><svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={item.icon} /></svg></span><span>{item.label}</span></a>)}</nav>;
}
