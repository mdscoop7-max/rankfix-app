"use client";
import { useState } from "react";
import AiAssistant from "@/components/ai-assistant";
import DashboardNav from "../nav";
import "../dashboard.css";
const topics=[
 ["Scans en scores","Je RankFix-score laat zien hoe je website ervoor staat. Open een scan voor SEO, GEO en concrete verbeterpunten."],
 ["Problemen oplossen","Begin bij de belangrijkste verbeterpunten. RankFix legt eerst in gewone taal uit wat er mis is en wat de volgende stap is."],
 ["AI-fixes","Een AI-fix is een voorstel. Een technische wijziging telt pas als opgelost nadat deze is gepubliceerd en een nieuwe live scan de verbetering bevestigt."],
 ["GitHub koppelen","GitHub is de veilige route voor codewijzigingen: koppel je account, kies de repository, laat RankFix een voorstel maken, controleer/publiceer het en scan opnieuw."],
 ["Credits","Credits worden gebruikt voor RankFix AI-fixes. Voor een actie die credits kost hoort RankFix vooraf duidelijk te tonen hoeveel."],
 ["Rapporten en historie","Gebruik je scanhistorie om oude en nieuwe resultaten te vergelijken. Rapporten zijn bedoeld om resultaten eenvoudig te bewaren of delen."]
];
export default function HelpPage(){
 const [open,setOpen]=useState<number|null>(0);
 return <main className="rf-page"><div className="rf-shell"><header className="rf-header"><a href="/dashboard" className="rf-brand">RankFix <span>AI</span></a><a href="/" className="rf-back">← Terug naar RankFix-site</a></header><DashboardNav current={7}/><div className="rf-body"><div className="rf-heading"><h1>Helpcentrum</h1><p>Alles wat je nodig hebt om RankFix te gebruiken, zonder technische kennis.</p></div><section className="rf-help-ai"><strong>🤖 Vraag RankFix AI</strong><p>Vraag bijvoorbeeld: “Waarom is mijn score lager?”, “Wat moet ik eerst oplossen?” of “Hoe koppel ik GitHub?” Gebruik de AI-knop rechtsonder.</p></section><div className="rf-help-grid">{topics.map(([title,body],i)=><button key={title} className="rf-help-topic" onClick={()=>setOpen(open===i?null:i)} aria-expanded={open===i}><span><b>{title}</b><em>{open===i?"−":"+"}</em></span>{open===i&&<p>{body}</p>}</button>)}</div><section className="rf-github-steps"><h2>GitHub in 5 eenvoudige stappen</h2><div>1. GitHub koppelen → 2. Repository kiezen → 3. RankFix maakt een fix → 4. Jij publiceert → 5. RankFix scant opnieuw</div><a href="/dashboard/github">Open GitHub-koppeling →</a></section></div></div><AiAssistant dashboard/></main>
}