import type { Locale } from "@/lib/locales";

/**
 * One wording for "how final is this score?", shared by every place that shows
 * a headline score (issue #151). It reads only fields the scan already returns.
 */
export type QualifiableResult = {
  overallScore?: number;
  coverage?: { coveragePercent?: number } | null;
  scoreModel?: { evidenceLevel?: "complete" | "provisional" | "insufficient"; evidenceReasons?: string[]; provisional?: boolean; range?: { low: number; high: number } | null; headline?: { kind: "score" | "range"; display: string } | null } | null;
  selfCheck?: { reliability?: "high" | "medium" | "low" } | null;
  multiPage?: { counts?: { selected?: number; audited?: number } | null; sitewideSummary?: { scoredPageIsHomepage?: boolean; checkedPages?: number; pagesWithIssues?: number; topIssues?: Array<{ key: string; affected: number; checked: number }>; sampleScore?: number | null } } | null;
};

const SCOPE: Record<Locale, { home: string; page: string; sample: (issues: number, checked: number) => string; sampleScore: string; keys: Record<string, string> }> = {
  nl: { home: "Score van de homepage", page: "Score van deze pagina", sample: (i, c) => `Steekproef: ${i} van ${c} pagina's met aandachtspunten`, sampleScore: "steekproefscore", keys: { title: "title", description: "meta description", h1: "H1", canonical: "canonical" } },
  en: { home: "Homepage score", page: "Score for this page", sample: (i, c) => `Site sample: ${i} of ${c} pages need attention`, sampleScore: "sample score", keys: { title: "title", description: "meta description", h1: "H1", canonical: "canonical" } },
  de: { home: "Score der Startseite", page: "Score dieser Seite", sample: (i, c) => `Stichprobe: ${i} von ${c} Seiten mit Handlungsbedarf`, sampleScore: "Stichprobenscore", keys: { title: "Title", description: "Meta-Description", h1: "H1", canonical: "Canonical" } },
  fr: { home: "Score de la page d'accueil", page: "Score de cette page", sample: (i, c) => `Échantillon : ${i} pages sur ${c} à améliorer`, sampleScore: "score de l'échantillon", keys: { title: "title", description: "meta description", h1: "H1", canonical: "canonical" } },
  it: { home: "Punteggio della homepage", page: "Punteggio di questa pagina", sample: (i, c) => `Campione: ${i} pagine su ${c} da migliorare`, sampleScore: "punteggio del campione", keys: { title: "title", description: "meta description", h1: "H1", canonical: "canonical" } },
  es: { home: "Puntuación de la página de inicio", page: "Puntuación de esta página", sample: (i, c) => `Muestra: ${i} de ${c} páginas con aspectos a mejorar`, sampleScore: "puntuación de la muestra", keys: { title: "title", description: "meta description", h1: "H1", canonical: "canonical" } },
};

/** "Homepage score · site sample: 16 of 30 pages need attention (meta description 16)". */
export function scoreScope(result: QualifiableResult | null | undefined, locale: Locale): string {
  const t = SCOPE[locale] || SCOPE.nl;
  const s = result?.multiPage?.sitewideSummary;
  const head = s?.scoredPageIsHomepage === false ? t.page : t.home;
  if (!s || !s.checkedPages) return head;
  const top = (s.topIssues || []).slice(0, 3).map((item) => `${t.keys[item.key] || item.key} ${item.affected}`).join(", ");
  return `${head} · ${t.sample(s.pagesWithIssues || 0, s.checkedPages)}${top ? ` (${top})` : ""}${s.sampleScore != null ? ` · ${t.sampleScore} ${s.sampleScore}` : ""}`;
}

const TEXT: Record<Locale, { complete: string; final: string; sectorOnly: string; sectorUnknown: string; provisional: string; insufficient: string; coverage: string; pages: (assessed: number, selected: number) => string; range: string; reliability: string; levels: Record<"high" | "medium" | "low", string>; perfect: string; point: string }> = {
  nl: { complete: "Definitief: alle toepasselijke controles bevestigd", final: "Definitief", sectorOnly: "Voorlopig: alle controles bevestigd, hoofdsector niet eenduidig", sectorUnknown: "Voorlopig: hoofdsector niet vastgesteld, alleen algemene controles", provisional: "Voorlopig: niet alles kon worden bevestigd", insufficient: "Indicatie: onvoldoende bewijs voor een definitieve score", coverage: "bewijsdekking", pages: (a: number, t: number) => `pagina's beoordeeld ${a}/${t}`, range: "mogelijk bereik", reliability: "betrouwbaarheid", levels: { high: "hoog", medium: "gemiddeld", low: "laag" }, perfect: "100/100 wordt alleen gegeven als alle toepasselijke controles bevestigd zijn." , point: "score op bevestigd bewijs" },
  en: { complete: "Final: all applicable checks confirmed", final: "Final", sectorOnly: "Provisional: all checks confirmed, primary sector ambiguous", sectorUnknown: "Provisional: primary sector not established, generic checks only", provisional: "Provisional: not everything could be confirmed", insufficient: "Indication only: not enough evidence for a final score", coverage: "evidence coverage", pages: (a: number, t: number) => `pages assessed ${a}/${t}`, range: "possible range", reliability: "reliability", levels: { high: "high", medium: "medium", low: "low" }, perfect: "100/100 is only given when every applicable check is confirmed." , point: "score on confirmed evidence" },
  de: { complete: "Endgültig: alle zutreffenden Prüfungen bestätigt", final: "Endgültig", sectorOnly: "Vorläufig: alle Prüfungen bestätigt, Hauptbranche nicht eindeutig", sectorUnknown: "Vorläufig: Hauptbranche nicht ermittelt, nur allgemeine Prüfungen", provisional: "Vorläufig: nicht alles konnte bestätigt werden", insufficient: "Nur Indikation: zu wenig Belege für eine endgültige Bewertung", coverage: "Belegabdeckung", pages: (a: number, t: number) => `Seiten bewertet ${a}/${t}`, range: "möglicher Bereich", reliability: "Zuverlässigkeit", levels: { high: "hoch", medium: "mittel", low: "niedrig" }, perfect: "100/100 gibt es nur, wenn alle zutreffenden Prüfungen bestätigt sind." , point: "Score auf bestätigten Belegen" },
  fr: { complete: "Définitif : tous les contrôles applicables confirmés", final: "Définitif", sectorOnly: "Provisoire : tous les contrôles confirmés, secteur principal ambigu", sectorUnknown: "Provisoire : secteur principal non établi, contrôles généraux uniquement", provisional: "Provisoire : tout n'a pas pu être confirmé", insufficient: "Indication : preuves insuffisantes pour un score définitif", coverage: "couverture des preuves", pages: (a: number, t: number) => `pages évaluées ${a}/${t}`, range: "plage possible", reliability: "fiabilité", levels: { high: "élevée", medium: "moyenne", low: "faible" }, perfect: "100/100 n'est attribué que si tous les contrôles applicables sont confirmés." , point: "score sur preuves confirmées" },
  it: { complete: "Definitivo: tutti i controlli applicabili confermati", final: "Definitivo", sectorOnly: "Provvisorio: tutti i controlli confermati, settore principale ambiguo", sectorUnknown: "Provvisorio: settore principale non determinato, solo controlli generali", provisional: "Provvisorio: non tutto è stato confermato", insufficient: "Indicazione: prove insufficienti per un punteggio definitivo", coverage: "copertura delle prove", pages: (a: number, t: number) => `pagine valutate ${a}/${t}`, range: "intervallo possibile", reliability: "affidabilità", levels: { high: "alta", medium: "media", low: "bassa" }, perfect: "100/100 viene assegnato solo se tutti i controlli applicabili sono confermati." , point: "punteggio su prove confermate" },
  es: { complete: "Definitivo: todos los controles aplicables confirmados", final: "Definitivo", sectorOnly: "Provisional: todos los controles confirmados, sector principal ambiguo", sectorUnknown: "Provisional: sector principal no determinado, solo controles generales", provisional: "Provisional: no todo pudo confirmarse", insufficient: "Indicación: evidencia insuficiente para una puntuación definitiva", coverage: "cobertura de evidencia", pages: (a: number, t: number) => `páginas evaluadas ${a}/${t}`, range: "rango posible", reliability: "fiabilidad", levels: { high: "alta", medium: "media", low: "baja" }, perfect: "100/100 solo se da cuando todos los controles aplicables están confirmados." , point: "puntuación sobre evidencia confirmada" },
};

export function scoreQualifier(result: QualifiableResult | null | undefined, locale: Locale) {
  const t = TEXT[locale] || TEXT.nl;
  const model = result?.scoreModel || {};
  const coverage = result?.coverage?.coveragePercent;
  // "Complete" needs every applicable check confirmed. Older stored reports could
  // say "complete" at e.g. 97% coverage; those are shown as provisional (with range).
  const storedLevel = model.evidenceLevel || (model.provisional ? "provisional" : "complete");
  const level = storedLevel === "complete" && typeof coverage === "number" && coverage < 100 ? "provisional" : storedLevel;
  const parts = [
    model.headline?.kind === "range" && typeof result?.overallScore === "number" ? `${t.point} ${result.overallScore}` : "",
    typeof coverage === "number" ? `${t.coverage} ${coverage}%` : "",
    // Evidence coverage is about checks; show page coverage next to it, so 100%
    // never reads as "every page was assessed" (live QA scan 345f4d24).
    typeof result?.multiPage?.counts?.selected === "number" && result.multiPage.counts.selected > 1 && typeof result.multiPage.counts.audited === "number"
      ? t.pages(result.multiPage.counts.audited, result.multiPage.counts.selected) : "",
    // A range of one value (97–97) says nothing: show it only when it is a real range.
    model.range && level !== "complete" && model.range.low < model.range.high ? `${t.range} ${model.range.low}–${model.range.high}` : "",
    // Reliability is shown once, in the score explainer (one verdict per report).
  ].filter(Boolean);
  // "Complete evidence" only when every applicable check was confirmed.
  const fully = typeof coverage === "number" && coverage >= 100;
  const onlySector = level === "provisional" && typeof coverage === "number" && coverage >= 100 && (model.evidenceReasons || []).length > 0 && (model.evidenceReasons || []).every((r) => /^Hoofdsector niet eenduidig/.test(r));
  const reasons: string[] = model.evidenceReasons || [];
  // A missing sector is named as such, also when other reasons apply (it changes which modules count).
  const unknownSector = level === "provisional" && reasons.some((r) => /^Hoofdsector niet vastgesteld/.test(r));
  const label = level === "complete" && !fully ? t.final : level === "provisional" && storedLevel === "complete" ? t.provisional : onlySector ? t.sectorOnly : unknownSector ? t.sectorUnknown : t[level];
  return { level, label, detail: parts.join(" · "), note: level === "complete" ? "" : t.perfect };
}

/** The big headline: a range ("64–99") when evidence is below 70%, else the score. */
export function headlineDisplay(result: QualifiableResult | null | undefined): string {
  const h = result?.scoreModel?.headline;
  if (h?.kind === "range" && h.display) return h.display;
  return result?.overallScore == null ? "—" : String(result.overallScore);
}
