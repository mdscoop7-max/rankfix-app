type ScanCheck = {
  category: "seo" | "geo";
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

function statusLabel(status: ScanCheck["status"]) {
  return status === "pass" ? "PASS" : status === "warning" ? "WAARSCHUWING" : "ACTIE";
}

function fixWorksheet(check: ScanCheck) {
  const key = (check.category + ":" + check.title).toLowerCase();
  if (check.status === "pass") return { field: "Geen actie nodig", value: "—", where: "—" };
  if (key.includes("meta title")) return { field: "Meta title / <title>", value: "Vul hier de nieuwe unieke title in.", where: "CMS → pagina → SEO/metadata → Meta title" };
  if (key.includes("meta description")) return { field: "Meta description", value: "Vul hier de nieuwe description in.", where: "CMS → pagina → SEO/metadata → Meta description" };
  if (key.includes("h1")) return { field: "H1", value: "Vul hier één duidelijke hoofdheading in.", where: "CMS → pagina → inhoud → H1-heading" };
  if (key.includes("alt-teksten")) return { field: "Alt-tekst", value: "Vul per afbeelding een korte, beschrijvende alt-tekst in.", where: "CMS → afbeelding → Alt tekst / Alternative text" };
  if (key.includes("social metadata")) return { field: "Open Graph", value: "Vul og:title, og:description en og:image in.", where: "CMS/plugin → Social sharing / Open Graph" };
  if (key.includes("structured data")) return { field: "Structured data / JSON-LD", value: "Plaats gevalideerde schema.org JSON-LD in de <head> of via je SEO-plugin.", where: "CMS/plugin → Structured data / schema.org" };
  return { field: "SEO-instelling", value: check.fix, where: "Zoek de genoemde SEO-instelling in je CMS of vraag je developer." };
}

function statusColor(status: ScanCheck["status"]) {
  return status === "pass" ? "#16a34a" : status === "warning" ? "#d97706" : "#dc2626";
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
