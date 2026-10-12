// A high point estimate is not a definitive A-grade when evidence coverage is low.
// This message accompanies the score in public and dashboard views; it never changes
// the numeric score or guesses results for unverified checks.
type Report = {
  scoreModel?: { provisional?: boolean; range?: { low?: number; high?: number } };
  coverage?: { coveragePercent?: number };
  summary?: { unableToConfirm?: number };
};
const wording: Record<string,{title:string;coverage:string;unknown:string;range:string;disclaimer:string}> = {
  nl:{title:"Voorlopige score",coverage:"beoordelingsdekking",unknown:"controles niet te bevestigen",range:"mogelijke scorebandbreedte",disclaimer:"De getoonde score is alleen gebaseerd op bevestigde controles; de beoordeling is niet definitief."},
  en:{title:"Provisional score",coverage:"assessment coverage",unknown:"checks unconfirmed",range:"possible score range",disclaimer:"The displayed score covers confirmed checks only; the grade is not definitive."},
  de:{title:"Vorläufige Bewertung",coverage:"Prüfabdeckung",unknown:"nicht bestätigte Prüfungen",range:"möglicher Wertebereich",disclaimer:"Der angezeigte Wert basiert nur auf bestätigten Prüfungen und ist nicht endgültig."},
  fr:{title:"Score provisoire",coverage:"couverture des contrôles",unknown:"contrôles non confirmés",range:"fourchette possible",disclaimer:"Le score affiché ne porte que sur les contrôles confirmés ; la note n’est pas définitive."},
  it:{title:"Punteggio provvisorio",coverage:"copertura dei controlli",unknown:"controlli non confermati",range:"intervallo possibile",disclaimer:"Il punteggio riflette solo i controlli confermati e non è definitivo."},
  es:{title:"Puntuación provisional",coverage:"cobertura de controles",unknown:"controles sin confirmar",range:"intervalo posible",disclaimer:"La puntuación refleja solo los controles confirmados y no es definitiva."}
};
export function provisionalScoreMessage(input: unknown, language: string): string | null {
  if (!input || typeof input !== "object") return null;
  const report = input as Report;
  if (report.scoreModel?.provisional !== true) return null;
  const copy = wording[language] ?? wording.en;
  const coverage = report.coverage?.coveragePercent;
  const unknown = report.summary?.unableToConfirm;
  const range = report.scoreModel.range;
  const details = [
    typeof coverage === "number" && Number.isFinite(coverage) ? `${coverage}% ${copy.coverage}` : null,
    typeof unknown === "number" && unknown > 0 ? `${unknown} ${copy.unknown}` : null,
    typeof range?.low === "number" && typeof range?.high === "number" ? `${copy.range} ${range.low}–${range.high}` : null,
  ].filter(Boolean).join(" · ");
  return `${copy.title}. ${details ? details + ". " : ""}${copy.disclaimer}`;
}
