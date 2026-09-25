"use client";
import DashboardNav from "../nav";
import "../dashboard.css";
const items=[
 ["Scanhistorie","Bekijk eerdere scans en veranderingen.","/dashboard/history"],
 ["Rapporten","Open en deel je RankFix-resultaten.","/dashboard"],
 ["RankFix AI & Help","Krijg uitleg over scores, fixes, SEO, GEO en GitHub.","/dashboard/help"],
 ["GitHub","Beheer de koppeling voor veilige codefixes.","/dashboard/github"],
 ["Review geven","Deel je ervaring als geverifieerde RankFix-klant.","/dashboard/reviews"],
 ["Abonnement & credits","Bekijk je pakket en beschikbare credits.","/dashboard/account"],
 ["Account & instellingen","Profiel, taal en beveiliging.","/dashboard/account"],
 ["Terug naar RankFix-site","Bekijk productinformatie, prijzen en uitleg.","/"]
];
export default function MorePage(){return <main className="rf-page"><div className="rf-shell"><header className="rf-header"><a href="/dashboard" className="rf-brand">RankFix <span>AI</span></a><a href="/" className="rf-back">← RankFix-site</a></header><DashboardNav current={7}/><div className="rf-body"><div className="rf-heading"><h1>Meer</h1><p>Alle instellingen, hulp en extra onderdelen op één plek.</p></div><div className="rf-more-grid">{items.map(([title,desc,href])=><a className="rf-more-card" href={href} key={title}><div><strong>{title}</strong><p>{desc}</p></div><span>→</span></a>)}</div></div></div></main>}