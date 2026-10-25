/**
 * What a headline score does and does not say (QA 144, 24 Oct 2026).
 *
 * Reports showed 98–99/100 next to 4/30 assessed pages, 75–91% evidence and
 * sitewide sample problems; "voorlopig" was printed, but the 99 dominated.
 * This block separates, in data the UI can show next to the number:
 *   - the score of the entered page (that is what the number is),
 *   - the result of the other assessed pages (sample score, sample issues),
 *   - evidence coverage and page coverage,
 *   - unconfirmed checks,
 *   - final / provisional / partial status and whether the sector is confirmed.
 * The range is a min/max scenario over unconfirmed checks, never a statistical
 * confidence interval. Nothing here changes a score.
 */
export type ScoreScopeInput = {
  overallScore: number;
  startUrl: string;
  startIsHomepage: boolean;
  evidenceCoveragePercent: number;
  unconfirmedChecks: number;
  evidenceLevel: "complete" | "provisional" | "insufficient";
  range?: { low: number; high: number } | null;
  pages: { selected: number; assessed: number };
  siteCoverage: "complete" | "partial" | "start_only";
  homepageAccess?: string | null;
  sampleScore: number | null;
  sitewideIssues: { confirmed: number; toConfirm: number };
  sectorStatus: "confirmed" | "probable" | "unconfirmed";
  sectorLabel?: string | null;
  /** The site refused RankFix and the browser page had no own navigation. */
  recoveryWithoutNavigation?: boolean;
};

export type ScoreScope = {
  scoreAppliesTo: "start_page";
  startPage: { url: string; isHomepage: boolean; score: number };
  otherPages: { assessed: number; selected: number; sampleScore: number | null; issuesConfirmed: number; issuesToConfirm: number };
  evidenceCoveragePercent: number;
  pageCoverage: { assessed: number; selected: number; percent: number };
  unconfirmedChecks: number;
  scanStatus: "definitive" | "provisional" | "partial";
  sectorConfirmed: boolean;
  range: { low: number; high: number; method: "min_max_over_unconfirmed_checks"; statisticalInterval: false } | null;
  /** Shown next to a high headline score whenever it must not read as "the whole site is near perfect". */
  caution: string | null;
  notes: string[];
};

export function buildScoreScope(input: ScoreScopeInput): ScoreScope {
  const selected = Math.max(0, input.pages.selected);
  const assessed = Math.max(0, Math.min(selected, input.pages.assessed));
  const percent = selected ? Math.round((assessed / selected) * 100) : 0;
  const scanStatus: ScoreScope["scanStatus"] = input.siteCoverage !== "complete" ? "partial" : input.evidenceLevel === "complete" ? "definitive" : "provisional";
  const sectorConfirmed = input.sectorStatus === "confirmed";
  const notes: string[] = [];
  notes.push(`Deze score (${input.overallScore}/100) geldt voor de ingevoerde ${input.startIsHomepage ? "homepage" : "pagina"}, niet voor de hele website.`);
  if (selected > 1) notes.push(`Overige pagina's: ${assessed} van ${selected} beoordeeld${input.sampleScore != null ? `, steekproefscore ${input.sampleScore}` : ""}${input.sitewideIssues.confirmed ? `, ${input.sitewideIssues.confirmed} bevestigde aandachtspunten` : ""}${input.sitewideIssues.toConfirm ? `, ${input.sitewideIssues.toConfirm} nog te bevestigen` : ""}.`);
  notes.push(`Bewijsdekking ${input.evidenceCoveragePercent}%${input.unconfirmedChecks ? `; ${input.unconfirmedChecks} controle(s) niet te bevestigen` : ""}.`);
  if (input.homepageAccess === "blocked") notes.push("De homepage weigerde RankFix en is niet beoordeeld.");
  if (!sectorConfirmed) notes.push(input.sectorStatus === "unconfirmed"
    ? "Hoofdsector onbevestigd: de score beoordeelt SEO/GEO-kwaliteit en bevestigt geen sector."
    : `Hoofdsector waarschijnlijk${input.sectorLabel ? ` (${input.sectorLabel})` : ""}, niet bevestigd; de score bevestigt de sector niet.`);
  const range = input.range && input.range.low < input.range.high
    ? { low: input.range.low, high: input.range.high, method: "min_max_over_unconfirmed_checks" as const, statisticalInterval: false as const }
    : null;
  if (range) notes.push(`Bereik ${range.low}–${range.high}: uitkomst als alle onbevestigde controles zouden falen of slagen. Dit is geen statistische onzekerheidsmarge.`);
  const reasons = [
    scanStatus === "partial" ? `gedeeltelijke scan (${assessed}/${selected} pagina's)` : "",
    selected > 1 && percent < 100 && scanStatus !== "partial" ? `${assessed}/${selected} pagina's beoordeeld` : "",
    input.evidenceCoveragePercent < 100 ? `${input.evidenceCoveragePercent}% bewijsdekking` : "",
    input.sitewideIssues.confirmed ? `${input.sitewideIssues.confirmed} aandachtspunten op andere pagina's` : "",
    !sectorConfirmed ? "sector niet bevestigd" : "",
    input.recoveryWithoutNavigation ? "browserpagina na weigering zonder eigen navigatie (niet bewezen dat dit de volledige homepage is)" : "",
  ].filter(Boolean);
  // QA 144: 88–89 with an unknown sector or partial scan also read as "fine".
  const caution = reasons.length && (input.overallScore >= 80 || input.sectorStatus === "unconfirmed" || input.recoveryWithoutNavigation)
    ? `${input.overallScore}/100 betekent niet dat de hele website vrijwel perfect is: ${reasons.join(", ")}.`
    : null;
  return {
    scoreAppliesTo: "start_page",
    startPage: { url: input.startUrl, isHomepage: input.startIsHomepage, score: input.overallScore },
    otherPages: { assessed, selected, sampleScore: input.sampleScore, issuesConfirmed: input.sitewideIssues.confirmed, issuesToConfirm: input.sitewideIssues.toConfirm },
    evidenceCoveragePercent: input.evidenceCoveragePercent,
    pageCoverage: { assessed, selected, percent },
    unconfirmedChecks: input.unconfirmedChecks,
    scanStatus,
    sectorConfirmed,
    range,
    caution,
    notes,
  };
}
