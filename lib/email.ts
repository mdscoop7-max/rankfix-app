type ScanCheck = {
  category: "seo" | "geo" | "security" | "accessibility";
  title: string;
  status: "pass" | "warning" | "fail" | "not_applicable" | "unable_to_confirm";
  message: string;
  fix: string;
  points: number;
  maxPoints: number;
};

type ScanReportEmail = {
  language?: "nl"|"en"|"de"|"fr"|"it"|"es";
  scanId?: string | null;
  mode?: "seo" | "geo" | "both";
  to: string;
  name?: string | null;
  scannedUrl: string;
  finalUrl: string;
  scannedAt: string;
  overallScore: number;
  overallGrade: string;
  seoScore: number;
  seoGrade: string;
  geoScore: number;
  geoGrade: string;
  responseTime: number;
  httpStatus: number;
  checks: ScanCheck[];
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function sendScanReportEmail(report: ScanReportEmail) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.SCAN_REPORT_FROM || process.env.RESEND_FROM;

  if (!apiKey || !from) {
    throw new Error("RESEND_API_KEY en SCAN_REPORT_FROM moeten zijn ingesteld.");
  }

  const language=report.language||"nl";
  const copy={
    nl:{subject:"Je RankFix-scan is klaar",hello:"Hallo",ready:"Je scan is klaar.",website:"Website",overall:"Totaalscore",attention:"verbeterpunten gevonden",next:"Volgende stap",nextText:"Open je rapport om de verbeterpunten te bekijken en opnieuw te scannen nadat je wijzigingen hebt doorgevoerd.",button:"Open rapport",seo:"SEO-score",geo:"GEO-score"},
    en:{subject:"Your RankFix scan is ready",hello:"Hello",ready:"Your scan is ready.",website:"Website",overall:"Overall score",attention:"improvements found",next:"Next step",nextText:"Open your report to review the improvements and scan again after making changes.",button:"Open report",seo:"SEO score",geo:"GEO score"},
    de:{subject:"Dein RankFix-Scan ist fertig",hello:"Hallo",ready:"Dein Scan ist fertig.",website:"Website",overall:"Gesamtscore",attention:"Verbesserungen gefunden",next:"Nächster Schritt",nextText:"Öffne deinen Bericht, prüfe die Verbesserungen und scanne nach deinen Änderungen erneut.",button:"Bericht öffnen",seo:"SEO-Score",geo:"GEO-Score"},
    fr:{subject:"Votre analyse RankFix est prête",hello:"Bonjour",ready:"Votre analyse est prête.",website:"Site",overall:"Score global",attention:"améliorations trouvées",next:"Prochaine étape",nextText:"Ouvrez votre rapport pour consulter les améliorations, puis relancez une analyse après vos modifications.",button:"Ouvrir le rapport",seo:"Score SEO",geo:"Score GEO"},
    it:{subject:"La scansione RankFix è pronta",hello:"Ciao",ready:"La scansione è pronta.",website:"Sito",overall:"Punteggio totale",attention:"miglioramenti trovati",next:"Prossimo passo",nextText:"Apri il report per vedere i miglioramenti e ripeti la scansione dopo le modifiche.",button:"Apri report",seo:"Punteggio SEO",geo:"Punteggio GEO"},
    es:{subject:"Tu análisis de RankFix está listo",hello:"Hola",ready:"Tu análisis está listo.",website:"Web",overall:"Puntuación total",attention:"mejoras encontradas",next:"Siguiente paso",nextText:"Abre el informe para revisar las mejoras y vuelve a analizar después de aplicar los cambios.",button:"Abrir informe",seo:"Puntuación SEO",geo:"Puntuación GEO"}
  }[language];
  const name = report.name ? " " + escapeHtml(report.name) : "";
  const attentionCount = report.checks.filter((check) => check.status !== "pass").length;

  const base=(process.env.APP_URL||"https://rankfix-app.onrender.com").replace(/\/$/,"");
  const reportUrl=report.scanId?`${base}/dashboard/audit/${encodeURIComponent(report.scanId)}`:`${base}/dashboard`;
  const html='<!doctype html><html lang="'+language+'"><body style="margin:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#0f172a;"><div style="max-width:640px;margin:0 auto;padding:28px 18px;"><div style="background:#0f172a;color:#fff;border-radius:18px;padding:24px;"><div style="font-size:13px;color:#94a3b8;font-weight:700;letter-spacing:.08em;">RANKFIX AI</div><h1 style="margin:8px 0 6px;font-size:26px;">'+escapeHtml(copy.subject)+'</h1><p style="margin:0;color:#cbd5e1;">'+escapeHtml(copy.hello)+name+', '+escapeHtml(copy.ready)+'</p></div><div style="background:#fff;border-radius:18px;padding:24px;margin-top:18px;"><p><strong>'+escapeHtml(copy.website)+'</strong><br>'+escapeHtml(report.scannedUrl)+'</p><div style="display:flex;gap:12px;flex-wrap:wrap;margin:20px 0;"><div style="padding:14px;border:1px solid #e5e7eb;border-radius:12px;"><small>'+escapeHtml(copy.overall)+'</small><div style="font-size:26px;font-weight:800;">'+report.overallScore+'/100</div></div><div style="padding:14px;border:1px solid #e5e7eb;border-radius:12px;"><small>'+escapeHtml(copy.seo)+'</small><div style="font-size:26px;font-weight:800;">'+report.seoScore+'/100</div></div><div style="padding:14px;border:1px solid #e5e7eb;border-radius:12px;"><small>'+escapeHtml(copy.geo)+'</small><div style="font-size:26px;font-weight:800;">'+report.geoScore+'/100</div></div></div><p><strong>'+attentionCount+'</strong> '+escapeHtml(copy.attention)+'.</p><h2 style="font-size:18px;margin-top:24px;">'+escapeHtml(copy.next)+'</h2><p style="color:#475569;">'+escapeHtml(copy.nextText)+'</p><p style="margin-top:22px;"><a href="'+escapeHtml(reportUrl)+'" style="display:inline-block;padding:12px 18px;background:#2563eb;color:#fff;text-decoration:none;border-radius:9px;font-weight:700;">'+escapeHtml(copy.button)+'</a></p></div></div></body></html>';
  const text=[copy.subject,"",copy.hello+(report.name?" "+report.name:"")+", "+copy.ready,"",copy.website+": "+report.scannedUrl,copy.overall+": "+report.overallScore+"/100",copy.seo+": "+report.seoScore+"/100",copy.geo+": "+report.geoScore+"/100",attentionCount+" "+copy.attention+".","",copy.next+": "+copy.nextText,reportUrl].join("\n");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [report.to],
      subject: copy.subject + ": " + report.overallScore + "/100 — " + report.scannedUrl,
      html,
      text,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error("Resend email failed (" + response.status + "): " + detail.slice(0, 500));
  }

  return response.json();
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
