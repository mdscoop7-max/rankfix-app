// One rule for showing an SEO or GEO number (31 Oct, fresh144: 27 scans showed
// GEO 99 on 39–59% GEO evidence). When that dimension's OWN evidence is
// insufficient the number is an indication: its range (or the number marked as
// an indication) is shown, never a bare 99. The score itself is never changed.
// Results without dimension evidence (older reports) keep their stored number.
const INDICATION = { nl: "indicatie", en: "indication", de: "Indikation", fr: "indication", it: "indicazione", es: "indicación" };
/**
 * @param {number|null|undefined} score
 * @param {{level?:string|null,coveragePercent?:number|null}|null|undefined} evidence
 * @param {{low?:number,high?:number}|null|undefined} range
 * @param {string} [locale]
 * @returns {{text:string,indication:boolean,coveragePercent:number|null}}
 */
export function dimensionDisplay(score, evidence, range, locale = "nl") {
  const coveragePercent = typeof evidence?.coveragePercent === "number" ? evidence.coveragePercent : null;
  if (score == null || !Number.isFinite(Number(score))) return { text: "—", indication: false, coveragePercent };
  const point = Math.round(Number(score));
  if (evidence?.level !== "insufficient") return { text: String(point), indication: false, coveragePercent };
  const word = INDICATION[locale] || INDICATION.nl;
  const low = Number(range?.low), high = Number(range?.high);
  const text = Number.isFinite(low) && Number.isFinite(high) && low < high ? `${low}–${high} (${word})` : `${point} (${word})`;
  return { text, indication: true, coveragePercent };
}
/** From a full scan response. @param {any} data @param {"seo"|"geo"} dimension @param {string} [locale] */
export function dimensionDisplayOf(data, dimension, locale = "nl") {
  const model = data?.scoreModel || null;
  return dimensionDisplay(data?.[dimension]?.score, model?.dimensionEvidence?.[dimension], dimension === "seo" ? model?.seoRange : model?.geoRange, locale);
}
