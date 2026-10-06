function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

type MonitoringAlertEmail = {
  to:string;
  name?:string|null;
  language?:"nl"|"en"|"de"|"fr"|"it"|"es";
  website:string;
  status:string;
  httpStatus?:number|null;
};

export async function sendMonitoringAlertEmail(alert:MonitoringAlertEmail){
  const apiKey=process.env.RESEND_API_KEY;
  const from=process.env.SCAN_REPORT_FROM||process.env.RESEND_FROM;
  if(!apiKey||!from) throw new Error("Email configuration missing.");
  const language=alert.language||"nl";
  const copy={
    nl:{subject:"RankFix waarschuwing: websitecontrole mislukt",hello:"Hallo",intro:"RankFix kon je website tijdens de automatische controle niet normaal bereiken.",status:"Status",next:"Controleer de website en hosting. RankFix probeert de controle later opnieuw.",button:"Open dashboard"},
    en:{subject:"RankFix alert: website check failed",hello:"Hello",intro:"RankFix could not reach your website normally during the automatic check.",status:"Status",next:"Check the website and hosting. RankFix will try the check again later.",button:"Open dashboard"},
    de:{subject:"RankFix-Warnung: Website-Prüfung fehlgeschlagen",hello:"Hallo",intro:"RankFix konnte deine Website bei der automatischen Prüfung nicht normal erreichen.",status:"Status",next:"Prüfe Website und Hosting. RankFix versucht die Kontrolle später erneut.",button:"Dashboard öffnen"},
    fr:{subject:"Alerte RankFix : contrôle du site échoué",hello:"Bonjour",intro:"RankFix n’a pas pu accéder normalement à votre site pendant le contrôle automatique.",status:"Statut",next:"Vérifiez le site et l’hébergement. RankFix réessaiera plus tard.",button:"Ouvrir le tableau de bord"},
    it:{subject:"Avviso RankFix: controllo del sito non riuscito",hello:"Ciao",intro:"RankFix non è riuscito a raggiungere normalmente il sito durante il controllo automatico.",status:"Stato",next:"Controlla il sito e l’hosting. RankFix riproverà più tardi.",button:"Apri dashboard"},
    es:{subject:"Alerta RankFix: falló la comprobación del sitio",hello:"Hola",intro:"RankFix no pudo acceder normalmente a tu sitio durante la comprobación automática.",status:"Estado",next:"Comprueba el sitio y el alojamiento. RankFix volverá a intentarlo más tarde.",button:"Abrir panel"}
  }[language];
  const base=(process.env.APP_URL||"https://rankfix-app.onrender.com").replace(/\/$/,"");
  const dashboard=base+"/dashboard";
  const status=alert.httpStatus?alert.status+" · HTTP "+alert.httpStatus:alert.status;
  const html='<!doctype html><html lang="'+language+'"><body style="margin:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#0f172a"><div style="max-width:620px;margin:0 auto;padding:28px 18px"><div style="background:#0f172a;color:#fff;border-radius:18px;padding:24px"><div style="font-size:13px;color:#94a3b8;font-weight:700">RANKFIX AI</div><h1 style="font-size:24px">'+escapeHtml(copy.subject)+'</h1></div><div style="background:#fff;border-radius:18px;padding:24px;margin-top:18px"><p>'+escapeHtml(copy.hello)+(alert.name?" "+escapeHtml(alert.name):"")+',</p><p>'+escapeHtml(copy.intro)+'</p><p><strong>'+escapeHtml(alert.website)+'</strong></p><p><strong>'+escapeHtml(copy.status)+':</strong> '+escapeHtml(status)+'</p><p>'+escapeHtml(copy.next)+'</p><p><a href="'+escapeHtml(dashboard)+'" style="display:inline-block;padding:12px 18px;background:#2563eb;color:#fff;text-decoration:none;border-radius:9px;font-weight:700">'+escapeHtml(copy.button)+'</a></p></div></div></body></html>';
  const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:"Bearer "+apiKey,"Content-Type":"application/json"},body:JSON.stringify({from,to:[alert.to],subject:copy.subject+" — "+alert.website,html})});
  if(!response.ok) throw new Error("Monitoring alert email failed ("+response.status+")");
  return response.json();
}


type SystemHealthEmail={to:string;recovered?:boolean;checks:Array<{label:string;level:string;message:string}>};
export async function sendSystemHealthEmail(alert:SystemHealthEmail){
 const apiKey=process.env.RESEND_API_KEY;
 const from=process.env.SCAN_REPORT_FROM||process.env.RESEND_FROM;
 if(!apiKey||!from) throw new Error("Email configuration missing.");
 const base=(process.env.APP_URL||"https://rankfix-app.onrender.com").replace(/\/$/,"");
 const dashboard=base+"/dashboard/health";
 const highest=alert.checks.some(c=>c.level==="red")?"red":alert.checks.some(c=>c.level==="orange")?"orange":"green";
 const subject=alert.recovered?"RankFix Health Guard — systeem hersteld":highest==="red"?"RankFix Health Guard — kritiek probleem":"RankFix Health Guard — waarschuwing hoge belasting";
 const intro=alert.recovered?"RankFix werkt weer normaal. Het incident is automatisch als hersteld gemarkeerd.":highest==="red"?"Health Guard heeft een kritiek probleem meerdere keren bevestigd. Controleer het interne health-dashboard.":"Health Guard ziet structureel verhoogde belasting. RankFix werkt nog, maar controleer capaciteit en overweeg opschalen als dit aanhoudt.";
 const rows=alert.checks.map(c=>"<li><strong>"+escapeHtml(c.label)+"</strong> — "+escapeHtml(c.message)+"</li>").join("");
 const html='<!doctype html><html><body style="font-family:Arial,sans-serif;background:#f8fafc;color:#0f172a"><div style="max-width:620px;margin:auto;padding:28px"><div style="background:#fff;border-radius:16px;padding:24px"><div style="font-size:12px;font-weight:800">RANKFIX HEALTH GUARD</div><h1>'+escapeHtml(subject)+'</h1><p>'+escapeHtml(intro)+'</p><ul>'+rows+'</ul><p><a href="'+escapeHtml(dashboard)+'">Open Health Dashboard</a></p></div></div></body></html>';
 const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:"Bearer "+apiKey,"Content-Type":"application/json"},body:JSON.stringify({from,to:[alert.to],subject,html})});
 if(!response.ok) throw new Error("System health email failed ("+response.status+")");
 return response.json();
}
