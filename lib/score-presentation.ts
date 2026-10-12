// How a score is presented, separate from how it is calculated. The score
// calculation (lib/audit-score.ts) is unchanged: unconfirmed checks never lower
// the score. Because of exactly that, a score built on thin evidence must be
// shown as provisional, with its evidence coverage, reliability, the number of
// unconfirmed checks and the conservative-to-optimistic range.
// Pure: unit-tested in tests/score-presentation.test.mjs.

export type ScoreReliability = "high" | "medium" | "low";

export type ScorePresentation = {
  status: "confirmed" | "provisional";
  reliability: ScoreReliability;
  coveragePercent: number;
  unconfirmedChecks: number;
  range: { low: number; high: number } | null;
  reasons: Array<"low_coverage" | "bot_reduced" | "partial_coverage">;
};

// Same threshold as scoreModel.provisional (coverage below 90 %).
export const CONFIRMED_COVERAGE = 90;
export const MEDIUM_COVERAGE = 70;

export function presentScore(input: {
  coveragePercent: number;
  highConfidencePercent?: number;
  unableToConfirm: number;
  range?: { low: number; high: number } | null;
  botReduced?: boolean;
}): ScorePresentation {
  const coverage = Math.max(0, Math.min(100, Math.round(input.coveragePercent || 0)));
  const reasons: ScorePresentation["reasons"] = [];
  if (input.botReduced) reasons.push("bot_reduced");
  if (coverage < MEDIUM_COVERAGE) reasons.push("low_coverage");
  else if (coverage < CONFIRMED_COVERAGE) reasons.push("partial_coverage");
  const reliability: ScoreReliability = input.botReduced || coverage < MEDIUM_COVERAGE
    ? "low"
    : coverage >= CONFIRMED_COVERAGE && (input.highConfidencePercent ?? 100) >= 80
      ? "high"
      : "medium";
  const status = coverage >= CONFIRMED_COVERAGE && !input.botReduced ? "confirmed" : "provisional";
  const range = input.range && status === "provisional" && input.range.high > input.range.low
    ? { low: Math.round(input.range.low), high: Math.round(input.range.high) }
    : null;
  return { status, reliability, coveragePercent: coverage, unconfirmedChecks: Math.max(0, input.unableToConfirm || 0), range, reasons };
}

type Lang = "nl" | "en" | "de" | "fr" | "it" | "es";
const COPY: Record<Lang, { confirmed: string; provisional: string; coverage: string; reliability: string; levels: Record<ScoreReliability, string>; unconfirmed: string; range: string; note: string }> = {
  nl: { confirmed: "Score", provisional: "Voorlopige score", coverage: "Bewijsdekking", reliability: "Betrouwbaarheid", levels: { high: "hoog", medium: "gemiddeld", low: "laag" }, unconfirmed: "niet-bevestigde controles", range: "Scorebereik", note: "Niet-bevestigde controles verlagen de score niet. Bij beperkt bewijs is de score daarom voorlopig; het bereik toont de uitkomst als die controles allemaal zouden falen of slagen." },
  en: { confirmed: "Score", provisional: "Provisional score", coverage: "Evidence coverage", reliability: "Reliability", levels: { high: "high", medium: "medium", low: "low" }, unconfirmed: "unconfirmed checks", range: "Score range", note: "Unconfirmed checks do not lower the score. With limited evidence the score is therefore provisional; the range shows the outcome if all of those checks failed or passed." },
  de: { confirmed: "Score", provisional: "Vorläufiger Score", coverage: "Nachweisabdeckung", reliability: "Zuverlässigkeit", levels: { high: "hoch", medium: "mittel", low: "niedrig" }, unconfirmed: "nicht bestätigte Prüfungen", range: "Score-Spanne", note: "Nicht bestätigte Prüfungen senken den Score nicht. Bei begrenztem Nachweis ist der Score daher vorläufig; die Spanne zeigt das Ergebnis, wenn alle diese Prüfungen scheitern oder bestehen würden." },
  fr: { confirmed: "Score", provisional: "Score provisoire", coverage: "Couverture des preuves", reliability: "Fiabilité", levels: { high: "élevée", medium: "moyenne", low: "faible" }, unconfirmed: "contrôles non confirmés", range: "Plage de score", note: "Les contrôles non confirmés ne baissent pas le score. Avec peu de preuves, le score est donc provisoire ; la plage montre le résultat si tous ces contrôles échouaient ou réussissaient." },
  it: { confirmed: "Punteggio", provisional: "Punteggio provvisorio", coverage: "Copertura delle prove", reliability: "Affidabilità", levels: { high: "alta", medium: "media", low: "bassa" }, unconfirmed: "controlli non confermati", range: "Intervallo di punteggio", note: "I controlli non confermati non abbassano il punteggio. Con prove limitate il punteggio è quindi provvisorio; l’intervallo mostra il risultato se tutti quei controlli fallissero o riuscissero." },
  es: { confirmed: "Puntuación", provisional: "Puntuación provisional", coverage: "Cobertura de evidencia", reliability: "Fiabilidad", levels: { high: "alta", medium: "media", low: "baja" }, unconfirmed: "comprobaciones no confirmadas", range: "Rango de puntuación", note: "Las comprobaciones no confirmadas no bajan la puntuación. Con evidencia limitada la puntuación es provisional; el rango muestra el resultado si todas esas comprobaciones fallaran o se superaran." },
};

export function scorePresentationCopy(language: string) {
  return COPY[(["nl", "en", "de", "fr", "it", "es"] as const).includes(language as Lang) ? language as Lang : "nl"];
}
