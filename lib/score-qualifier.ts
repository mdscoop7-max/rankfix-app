import type { Locale } from "@/lib/locales";

/**
 * One wording for "how final is this score?", shared by every place that shows
 * a headline score (issue #151). It reads only fields the scan already returns.
 */
export type QualifiableResult = {
  overallScore?: number;
  coverage?: { coveragePercent?: number } | null;
  scoreModel?: { evidenceLevel?: "complete" | "provisional" | "insufficient"; provisional?: boolean; range?: { low: number; high: number } | null } | null;
  selfCheck?: { reliability?: "high" | "medium" | "low" } | null;
};

const TEXT: Record<Locale, { complete: string; provisional: string; insufficient: string; coverage: string; range: string; reliability: string; levels: Record<"high" | "medium" | "low", string>; perfect: string }> = {
  nl: { complete: "Definitief: volledig bewijs", provisional: "Voorlopig: niet alles kon worden bevestigd", insufficient: "Indicatie: onvoldoende bewijs voor een definitieve score", coverage: "bewijsdekking", range: "mogelijk bereik", reliability: "betrouwbaarheid", levels: { high: "hoog", medium: "gemiddeld", low: "laag" }, perfect: "100/100 wordt alleen gegeven als alle toepasselijke controles bevestigd zijn." },
  en: { complete: "Final: complete evidence", provisional: "Provisional: not everything could be confirmed", insufficient: "Indication only: not enough evidence for a final score", coverage: "evidence coverage", range: "possible range", reliability: "reliability", levels: { high: "high", medium: "medium", low: "low" }, perfect: "100/100 is only given when every applicable check is confirmed." },
  de: { complete: "Endgültig: vollständige Belege", provisional: "Vorläufig: nicht alles konnte bestätigt werden", insufficient: "Nur Indikation: zu wenig Belege für eine endgültige Bewertung", coverage: "Belegabdeckung", range: "möglicher Bereich", reliability: "Zuverlässigkeit", levels: { high: "hoch", medium: "mittel", low: "niedrig" }, perfect: "100/100 gibt es nur, wenn alle zutreffenden Prüfungen bestätigt sind." },
  fr: { complete: "Définitif : preuves complètes", provisional: "Provisoire : tout n'a pas pu être confirmé", insufficient: "Indication : preuves insuffisantes pour un score définitif", coverage: "couverture des preuves", range: "plage possible", reliability: "fiabilité", levels: { high: "élevée", medium: "moyenne", low: "faible" }, perfect: "100/100 n'est attribué que si tous les contrôles applicables sont confirmés." },
  it: { complete: "Definitivo: prove complete", provisional: "Provvisorio: non tutto è stato confermato", insufficient: "Indicazione: prove insufficienti per un punteggio definitivo", coverage: "copertura delle prove", range: "intervallo possibile", reliability: "affidabilità", levels: { high: "alta", medium: "media", low: "bassa" }, perfect: "100/100 viene assegnato solo se tutti i controlli applicabili sono confermati." },
  es: { complete: "Definitivo: evidencia completa", provisional: "Provisional: no todo pudo confirmarse", insufficient: "Indicación: evidencia insuficiente para una puntuación definitiva", coverage: "cobertura de evidencia", range: "rango posible", reliability: "fiabilidad", levels: { high: "alta", medium: "media", low: "baja" }, perfect: "100/100 solo se da cuando todos los controles aplicables están confirmados." },
};

export function scoreQualifier(result: QualifiableResult | null | undefined, locale: Locale) {
  const t = TEXT[locale] || TEXT.nl;
  const model = result?.scoreModel || {};
  const level = model.evidenceLevel || (model.provisional ? "provisional" : "complete");
  const coverage = result?.coverage?.coveragePercent;
  const parts = [
    typeof coverage === "number" ? `${t.coverage} ${coverage}%` : "",
    model.range && level !== "complete" ? `${t.range} ${model.range.low}–${model.range.high}` : "",
    result?.selfCheck?.reliability ? `${t.reliability} ${t.levels[result.selfCheck.reliability]}` : "",
  ].filter(Boolean);
  return { level, label: t[level], detail: parts.join(" · "), note: level === "complete" ? "" : t.perfect };
}
