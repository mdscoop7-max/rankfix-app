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
  const from = process.env.SCAN_REPORT_FROM;

  if (!apiKey || !from) {
    throw new Error("RESEND_API_KEY en SCAN_REPORT_FROM moeten zijn ingesteld.");
  }

  const name = report.name ? " " + escapeHtml(report.name) : "";
  const attentionCount = report.checks.filter((check) => check.status !== "pass").length;

  const rows = report.checks.map((check) =>
    '<tr><td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;color:' + statusColor(check.status) + ';font-weight:700;">' + statusLabel(check.status) + '</td>' +
    '<td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;font-weight:600;">' + escapeHtml(check.title) + '</td>' +
    '<td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;">' + escapeHtml(check.message) + '</td>' +
    '<td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;">' + escapeHtml(check.fix) + '</td></tr>'
  ).join("");

  const actionCards = report.checks.filter((check) => check.status !== "pass").map((check) => {
    const w = fixWorksheet(check);
    return '<div style="margin:12px 0;padding:16px;border:1px solid #dbe4f0;border-radius:14px;background:#f8fafc;">' +
      '<div style="font-weight:800;font-size:15px;">' + escapeHtml(check.title) + '</div>' +
      '<div style="margin-top:10px;font-size:12px;color:#64748b;">VAK / INSTELLING</div>' +
      '<div style="margin-top:4px;padding:10px;background:#fff;border:1px solid #e2e8f0;border-radius:8px;font-weight:700;">' + escapeHtml(w.field) + '</div>' +
      '<div style="margin-top:10px;font-size:12px;color:#64748b;">WAT JE MOET INVULLEN</div>' +
      '<div style="margin-top:4px;padding:10px;background:#fff;border:1px solid #e2e8f0;border-radius:8px;">' + escapeHtml(w.value) + '</div>' +
      '<div style="margin-top:10px;font-size:12px;color:#64748b;">WAAR</div>' +
      '<div style="margin-top:4px;color:#334155;">' + escapeHtml(w.where) + '</div></div>';
  }).join("");

  const html = [
    '<!doctype html><html lang="nl"><body style="margin:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">',
    '<div style="max-width:900px;margin:0 auto;padding:32px 18px;">',
    '<div style="background:#0f172a;color:#fff;border-radius:18px;padding:24px;">',
    '<div style="font-size:13px;color:#94a3b8;font-weight:700;letter-spacing:.08em;">RANKFIX AI</div>',
    '<h1 style="margin:8px 0 6px;font-size:28px;">SEO + GEO scanrapport</h1>',
    '<p style="margin:0;color:#cbd5e1;">Hallo' + name + ', hier is je scanresultaat.</p></div>',
    '<div style="background:#fff;border-radius:18px;padding:24px;margin-top:18px;">',
    '<p style="margin:0 0 6px;font-weight:700;">Website</p>',
    '<p style="margin:0 0 8px;"><a href="' + escapeHtml(report.scannedUrl) + '">' + escapeHtml(report.scannedUrl) + '</a></p>',
    '<p style="margin:0 0 18px;color:#64748b;">Eindadres: ' + escapeHtml(report.finalUrl) + '</p>',
    '<div style="display:flex;gap:12px;flex-wrap:wrap;">',
    '<div style="min-width:150px;padding:16px;border:1px solid #e5e7eb;border-radius:12px;"><div style="font-size:12px;color:#64748b;">OVERALL</div><div style="font-size:30px;font-weight:800;">' + report.overallScore + '/100</div><div>Grade ' + escapeHtml(report.overallGrade) + '</div></div>',
    '<div style="min-width:150px;padding:16px;border:1px solid #e5e7eb;border-radius:12px;"><div style="font-size:12px;color:#64748b;">SEO</div><div style="font-size:30px;font-weight:800;">' + report.seoScore + '/100</div><div>Grade ' + escapeHtml(report.seoGrade) + '</div></div>',
    '<div style="min-width:150px;padding:16px;border:1px solid #e5e7eb;border-radius:12px;"><div style="font-size:12px;color:#64748b;">GEO</div><div style="font-size:30px;font-weight:800;">' + report.geoScore + '/100</div><div>Grade ' + escapeHtml(report.geoGrade) + '</div></div>',
    '</div>',
    '<p style="margin:18px 0 0;color:#475569;">HTTP ' + report.httpStatus + ' · server response ' + report.responseTime + ' ms · ' + attentionCount + ' aandachtspunt(en)</p></div>',
    '<div style="background:#fff;border-radius:18px;padding:24px;margin-top:18px;"><h2 style="margin-top:0;">Fix dit stap voor stap</h2><p style="color:#475569;">Gebruik hieronder per probleem het juiste vak in je CMS. Vul alleen waarden in die passen bij de pagina en controleer daarna opnieuw met RankFix.</p>' + actionCards + '</div><div style="background:#fff;border-radius:18px;padding:24px;margin-top:18px;"><h2 style="margin-top:0;">Checks</h2>',
    '<div style="overflow:auto;"><table style="width:100%;border-collapse:collapse;font-size:13px;">',
    '<thead><tr><th align="left" style="padding:10px 8px;border-bottom:2px solid #e5e7eb;">Status</th><th align="left" style="padding:10px 8px;border-bottom:2px solid #e5e7eb;">Check</th><th align="left" style="padding:10px 8px;border-bottom:2px solid #e5e7eb;">Resultaat</th><th align="left" style="padding:10px 8px;border-bottom:2px solid #e5e7eb;">Aanbevolen actie</th></tr></thead>',
    '<tbody>' + rows + '</tbody></table></div></div>',
    '<p style="font-size:12px;color:#64748b;margin:18px 4px;">Automatisch gegenereerd door RankFix AI. Scanmoment: ' + escapeHtml(report.scannedAt) + '.</p>',
    '</div></body></html>'
  ].join("");

  const text = [
    "RANKFIX AI — SEO + GEO scanrapport",
    "",
    "Website: " + report.scannedUrl,
    "Eindadres: " + report.finalUrl,
    "Overall: " + report.overallScore + "/100 (grade " + report.overallGrade + ")",
    "SEO: " + report.seoScore + "/100 (grade " + report.seoGrade + ")",
    "GEO: " + report.geoScore + "/100 (grade " + report.geoGrade + ")",
    "HTTP: " + report.httpStatus + " · response: " + report.responseTime + " ms",
    "",
    "FIX-INSTRUCTIES",
    ...report.checks.filter((check) => check.status !== "pass").flatMap((check) => {
      const w = fixWorksheet(check);
      return ["", "[" + statusLabel(check.status) + "] " + check.title, "VAK: " + w.field, "INVULLEN: " + w.value, "WAAR: " + w.where, "CONTROLE: " + check.fix];
    }),
    "",
    "CHECKS",
    ...report.checks.map((check) => "[" + statusLabel(check.status) + "] " + check.title + ": " + check.message + " — " + check.fix),
  ].join("\n");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [report.to],
      subject: "RankFix scan: " + report.overallScore + "/100 — " + report.scannedUrl,
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
