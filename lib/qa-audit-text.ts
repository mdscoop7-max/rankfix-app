/** Readable, evidence-based plain text summary of the exact real QA scan.
 * Intended for copying into chat or support requests; no raw JSON or fabricated checks.
 */
type AuditCheck = {
  title?: string;
  key?: string;
  status: string;
  message?: string;
  fix?: string;
  evidence?: { details?: string };
};
export type QaAuditTextResult = {
  scannedUrl?: string;
  finalUrl?: string;
  scannedAt?: string;
  overallScore?: number;
  scoreModel?: {
    provisional?: boolean;
    evidenceLevel?: string;
    evidenceReasons?: string[];
    headline?: { kind?: string; display?: string };
  };
  seo?: { score?: number; checks?: AuditCheck[] };
  geo?: { score?: number; checks?: AuditCheck[] };
  security?: { score?: number };
  sectorProfile?: { label?: string; confidenceScore?: number };
  coverage?: { coveragePercent?: number; unableToConfirm?: number };
  multiPage?: { counts?: { audited?: number; selected?: number } };
};

function concise(value: unknown, length = 650): string {
  if (typeof value !== "string") return "";
  const clean = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return clean.length > length ? clean.slice(0, length - 3) + "..." : clean;
}

export function formatQaAuditText(result: QaAuditTextResult, fallbackUrl = ""): string {
  const target = result.finalUrl || result.scannedUrl || fallbackUrl;
  let host = target || "Website niet vermeld";
  try { host = new URL(target).hostname; } catch {}
  const timestamp = result.scannedAt
    ? result.scannedAt.replace("T", " ").replace(/\.\d+(?=Z|[+-]\d\d:\d\d|$)/, "").replace(/Z$/, " UTC")
    : "niet vermeld";
  const allChecks = [...(result.seo?.checks || []), ...(result.geo?.checks || [])];
  const issues = allChecks.filter(c => c.status === "warning" || c.status === "fail");
  const unconfirmed = allChecks.filter(c => c.status === "unable_to_confirm");
  const passed = allChecks.filter(c => c.status === "pass");
  const notApplicable = allChecks.filter(c => c.status === "not_applicable");
  const headline = result.scoreModel?.headline?.display ??
    (typeof result.overallScore === "number" ? String(result.overallScore) : "onbekend");
  const score = result.scoreModel?.headline?.kind === "range" ? headline : headline + "/100";
  const sector = concise(result.sectorProfile?.label || "Sector niet bevestigd", 150);
  const sectorConfidence = typeof result.sectorProfile?.confidenceScore === "number"
    ? " (" + result.sectorProfile.confidenceScore + "% zekerheid)" : "";
  const lines = [
    "RANKFIX / AUDITRAPPORT",
    host,
    "Scanmoment: " + timestamp + " | Bron: echte scan",
    "Eindscore: " + score + " | SEO: " + (result.seo?.score ?? "—") +
      " | GEO: " + (result.geo?.score ?? "—") + " | Security: " + (result.security?.score ?? "—"),
    "Herkende sector: " + sector + sectorConfidence,
    "Aandachtspunten: " + issues.length + " | Onbevestigd: " +
      (result.coverage?.unableToConfirm ?? unconfirmed.length) + " | Geslaagd: " + passed.length,
  ];
  if (typeof result.coverage?.coveragePercent === "number")
    lines.push("Bewijsdekking: " + result.coverage.coveragePercent + "%");
  if (result.scoreModel?.provisional || ["provisional", "insufficient"].includes(result.scoreModel?.evidenceLevel || ""))
    lines.push("VOORLOPIGE SCORE: niet alle toepasselijke controles zijn bevestigd.");
  for (const reason of (result.scoreModel?.evidenceReasons || []).slice(0, 5))
    lines.push("- " + concise(reason, 280));

  lines.push("", "Belangrijkste verbeterpunten");
  if (!issues.length) lines.push("Geen bewezen fouten of waarschuwingen in deze scan.");
  for (const [index, check] of issues.entries()) {
    lines.push((index + 1) + ". [" + (check.status === "fail" ? "FOUT" : "LET OP") + "] " +
      concise(check.title || check.key || "Controle", 180));
    if (check.message) lines.push(concise(check.message));
    if (check.fix) lines.push("Advies: " + concise(check.fix));
    if (check.evidence?.details && concise(check.evidence.details) !== concise(check.message))
      lines.push("Bewijs: " + concise(check.evidence.details));
  }

  lines.push("", "Niet te bevestigen - geen bewezen fouten");
  if (!unconfirmed.length) lines.push("Geen onbevestigde SEO/GEO-controles.");
  for (const [index, check] of unconfirmed.entries()) {
    lines.push((index + 1) + ". " + concise(check.title || check.key || "Controle", 180));
    if (check.message) lines.push(concise(check.message, 330));
  }

  lines.push("", "Geslaagde controles");
  if (!passed.length) lines.push("Geen geslaagde controles opgegeven.");
  else for (const check of passed) lines.push("- " + concise(check.title || check.key || "Controle", 180));

  if (notApplicable.length) {
    lines.push("", "Niet van toepassing");
    for (const check of notApplicable) lines.push("- " + concise(check.title || check.key || "Controle", 180));
  }

  lines.push("", "Methode en beperkingen",
    "Dit is een leesbare samenvatting van de echte scan, geen volledige site-audit. Onbevestigd betekent niet fout of geslaagd. Een hoge score garandeert geen zoekmachinerankings of AI-vermeldingen.",
    "Gescande URL: " + (target || "niet vermeld"));
  if (typeof result.multiPage?.counts?.audited === "number")
    lines.push("Pagina's in steekproef: " + result.multiPage.counts.audited +
      (typeof result.multiPage.counts.selected === "number" ? " van " + result.multiPage.counts.selected : ""));
  return lines.join("\n").trim() + "\n";
}
