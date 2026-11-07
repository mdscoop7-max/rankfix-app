/**
 * Phase 1 (7 Nov 2026): scanner reliability 0-10, separate from the customer's
 * SEO/GEO score. It says how well RankFix's OWN conclusions about this scan are
 * backed by evidence, not how good the website is.
 *
 * Computed only from fields of the scan report JSON, so anyone can recompute it
 * from a stored scan (scripts/testlab/scan-reliability.mjs). Caps prevent a high
 * score without evidence: an unknown sector, insufficient check evidence, an
 * incomplete render or a blocked scanner can never yield a high reliability.
 */

export const SCAN_RELIABILITY_VERSION = "reliability-1.0";

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export type ReliabilityComponent = { key: string; label: string; points: number; max: number; basis: Record<string, unknown>; reason: string };
export type ScanReliability = {
  version: string;
  score: number;
  level: "hoog" | "redelijk" | "laag";
  components: ReliabilityComponent[];
  caps: Array<{ max: number; reason: string }>;
  note: string;
};

const round1 = (value: number) => Math.round(value * 10) / 10;
const clamp = (value: number, max: number) => Math.max(0, Math.min(max, value));

export function computeScanReliability(report: Json): ScanReliability {
  const sector = report.sectorProfile || {};
  const role = report.websiteProfile?.operatingRole || null;
  const coverage = report.coverage || {};
  const evidenceLevel = String(report.scoreModel?.evidenceLevel || "");
  const rendering = report.rendering || {};
  const pages = report.multiPage?.coverageDimensions?.pages || {};
  const selfCheck = report.selfCheck || {};
  const access = report.access || {};
  const recovery = report.recovery || {};
  const httpStatus = Number(report.httpStatus || 0);
  const sectorUnknown = !sector.sector || sector.sector === "unknown";
  const components: ReliabilityComponent[] = [];

  // 1. Identity (role + sector): independent sources, counter-evidence.
  {
    const sources = Number(role?.independentSources || 0);
    const capped = Boolean(role?.sectorCap && role.sectorCap.max < 70);
    const points = sectorUnknown ? 0 : capped ? 1 : sources >= 3 ? 3 : sources === 2 ? 2.5 : sources === 1 ? 1.5 : 1;
    components.push({ key: "identity", label: "Bedrijfsrol en branche", points, max: 3,
      basis: { sector: sector.sector || "unknown", sectorConfidence: sector.confidenceScore ?? null, role: role?.role ?? null, independentSources: sources, counterEvidence: (role?.counterEvidence || []).length, sectorCap: role?.sectorCap?.max ?? null },
      reason: sectorUnknown ? "Branche niet vastgesteld" : capped ? "Tegenstrijdig bewijs of meerdere activiteiten" : `${sources} onafhankelijke bron(nen)` });
  }
  // 2. Evidence behind the SEO/GEO checks (weighted applicable checks).
  {
    const percent = Number(coverage.coveragePercent);
    let points = Number.isFinite(percent) ? round1(3 * clamp(percent, 100) / 100) : 0;
    if (evidenceLevel === "insufficient") points = Math.min(points, 1.5);
    components.push({ key: "check_evidence", label: "Bewijs achter de controles", points, max: 3,
      basis: { coveragePercent: Number.isFinite(percent) ? percent : null, unableToConfirm: coverage.unableToConfirm ?? null, evidenceLevel: evidenceLevel || null },
      reason: Number.isFinite(percent) ? `${percent}% van de toepasselijke controles met bewijs beoordeeld` : "Geen dekkingsgegevens" });
  }
  // 3. Analysed document complete (rendered where needed, no bot-reduced page).
  {
    const completeness = String(rendering.completeness || "");
    const reduced = Boolean(rendering.botProtection);
    const points = reduced ? 0 : completeness === "complete" ? 1 : completeness === "ssr_without_render" ? 0.5 : 0;
    components.push({ key: "rendering", label: "Volledigheid van de geanalyseerde pagina", points, max: 1,
      basis: { completeness: completeness || null, mode: rendering.mode ?? null, javascriptExecuted: rendering.javascriptExecuted ?? null, botProtection: reduced },
      reason: reduced ? "Beperkte botpagina ontvangen" : completeness === "complete" ? "Pagina volledig beoordeeld" : completeness === "ssr_without_render" ? "Server-HTML zonder benodigde browserweergave" : "Weergave onvolledig" });
  }
  // 4. Representative page sample actually fetched.
  {
    const selected = Number(pages.selected || 0), fetched = Number(pages.fetched || 0);
    const points = selected > 0 ? round1(clamp(fetched / selected, 1)) : 0;
    components.push({ key: "page_sample", label: "Opgehaalde steekproefpagina's", points, max: 1,
      basis: { selected, fetched },
      reason: selected > 0 ? `${fetched} van ${selected} geselecteerde pagina's opgehaald` : "Geen steekproefpagina's" });
  }
  // 5. Report consistency (self-check).
  {
    const corrections = (selfCheck.corrections || []).length;
    const points = selfCheck.reliability === "low" ? 0 : corrections > 0 || selfCheck.consistent === false ? 0.5 : 1;
    components.push({ key: "consistency", label: "Interne consistentie van het rapport", points, max: 1,
      basis: { consistent: selfCheck.consistent ?? null, corrections, selfCheckReliability: selfCheck.reliability ?? null },
      reason: points === 1 ? "Geen tegenspraak gevonden" : corrections > 0 ? `${corrections} tegenspraak/tegenspraken gecorrigeerd` : "Lage interne betrouwbaarheid" });
  }
  // 6. Access to the site.
  {
    const blocked = Boolean(access.rankfixBlocked);
    const limited = Boolean(recovery.limitedScope);
    const ok = httpStatus >= 200 && httpStatus < 300;
    const points = blocked || !ok ? 0 : limited ? 0.5 : 1;
    components.push({ key: "access", label: "Toegang tot de website", points, max: 1,
      basis: { httpStatus: httpStatus || null, rankfixBlocked: blocked, limitedScope: limited },
      reason: blocked ? "RankFix werd geblokkeerd" : !ok ? `HTTP ${httpStatus || "onbekend"}` : limited ? "Alleen via browserherstel en beperkt beoordeeld" : "Website normaal bereikbaar" });
  }

  // Caps: no high reliability without the evidence that would justify it.
  const caps: ScanReliability["caps"] = [];
  if (Boolean(access.rankfixBlocked)) caps.push({ max: 3, reason: "Scanner geblokkeerd: conclusies nauwelijks onderbouwd" });
  if (evidenceLevel === "insufficient") caps.push({ max: 6, reason: "Onvoldoende bewijs voor de controles" });
  if (String(rendering.completeness || "") === "render_incomplete") caps.push({ max: 6, reason: "Benodigde browserweergave ontbreekt" });
  if (sectorUnknown) caps.push({ max: 7, reason: "Branche niet vastgesteld: sectorspecifieke conclusies ontbreken" });
  // A sector that is only probable (one source, < 80) is not confirmed: the scan
  // cannot be "hoog" while its identity rests on one source.
  else if (Number(sector.confidenceScore || 0) < 80) caps.push({ max: 7.5, reason: "Branche alleen waarschijnlijk (niet bevestigd door twee onafhankelijke bronnen)" });

  const sum = components.reduce((total, item) => total + item.points, 0);
  const score = round1(Math.min(sum, ...caps.map((cap) => cap.max), 10));
  return {
    version: SCAN_RELIABILITY_VERSION,
    score,
    level: score >= 8 ? "hoog" : score >= 6 ? "redelijk" : "laag",
    components,
    caps,
    note: "Betrouwbaarheid van de RankFix-scan zelf (0-10), los van de SEO/GEO-score van de website. Volledig na te rekenen uit de velden van dit rapport.",
  };
}
