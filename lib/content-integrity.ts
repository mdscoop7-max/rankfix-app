/**
 * Content-integrity signals on shop pages that a plain "does the tag exist" audit misses:
 * test/dummy products, order buttons that cannot work, and contradictory review claims.
 * Generic: no site, brand or sector names. Each finding names its evidence; weak cases abstain.
 */

const TEST_NAME = /^(?:test(?:product|artikel|item)?|testing|dummy|demo|sample|voorbeeld(?:product)?|example(?: product)?|product ?(?:naam|name|x|\d{1,3})|new product|nieuw product|untitled|naamloos|lorem ipsum|asdf|qwerty|xxx+|aaa+|todo|tbd)(?:[\s\-_:#]*\d{0,3})?$/i;
const TEST_FRAGMENT = /\blorem ipsum\b|\bdolor sit amet\b|\btest ?product(?:en)?\b|\btest ?artikel\b|\bdummy ?(?:product|text|tekst)\b/i;

export function findTestProducts(input: { productNames: string[]; visibleText?: string }): string[] {
  const hits = new Set<string>();
  for (const raw of input.productNames) {
    const name = raw.replace(/\s+/g, " ").trim();
    if (name && (TEST_NAME.test(name) || TEST_FRAGMENT.test(name))) hits.add(name.slice(0, 60));
  }
  const lorem = input.visibleText ? /\blorem ipsum\b|\bdolor sit amet\b/i.test(input.visibleText) : false;
  if (lorem) hits.add("Lorem ipsum-tekst op de pagina");
  return [...hits];
}

const ORDER_TEXT = /^(?:in (?:de |mijn |het )?winkel(?:wagen|mand)|toevoegen aan (?:de )?winkel(?:wagen|mand)|bestel(?:len)?(?: nu)?|koop(?: nu)?|kopen|nu bestellen|add to (?:cart|basket|bag)|buy(?: now)?|order(?: now)?|in den warenkorb|jetzt kaufen|ajouter au panier|acheter|aggiungi al carrello|a[ñn]adir al carrito)$/i;
const SOLD_OUT = /uitverkocht|niet beschikbaar|niet op voorraad|sold out|out of stock|unavailable|ausverkauft|nicht verf[üu]gbar|[ée]puis[ée]|esaurito|agotado/i;

export type InertButton = { label: string; reason: "disabled_always" | "empty_href" | "no_action" };

/**
 * Order buttons that cannot work from the HTML alone: a link to "#" or javascript:void, or a button that is
 * permanently disabled without any stock reason. A bare <button> is NOT reported (handlers are attached by
 * script), only the cases above and a type="submit" button outside every form without form= attribute.
 */
export function findInertOrderButtons(html: string): InertButton[] {
  const found: InertButton[] = [];
  const formRanges: Array<[number, number]> = [];
  for (const m of html.matchAll(/<form\b[\s\S]*?<\/form>/gi)) formRanges.push([m.index!, m.index! + m[0].length]);
  const inForm = (index: number) => formRanges.some(([a, b]) => index >= a && index <= b);
  const textOf = (value: string) => value.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

  for (const m of html.matchAll(/<a\b([^>]*)>([\s\S]{0,200}?)<\/a>/gi)) {
    const label = textOf(m[2]);
    if (!ORDER_TEXT.test(label)) continue;
    const href = /\bhref\s*=\s*["']([^"']*)["']/i.exec(m[1])?.[1]?.trim();
    const hasHandler = /\bonclick\s*=|\bdata-(?:action|add|cart|product|id|href|url|toggle)[a-z-]*\s*=|\bformaction\s*=|\bhx-(?:post|get)\s*=|\b@click\s*=|\bv-on:click/i.test(m[1]);
    if (!hasHandler && (href === undefined || href === "" || href === "#" || /^javascript:\s*(?:void\(0\)|;)?$/i.test(href))) found.push({ label, reason: "empty_href" });
  }
  for (const m of html.matchAll(/<button\b([^>]*)>([\s\S]{0,200}?)<\/button>/gi)) {
    const label = textOf(m[2]);
    if (!ORDER_TEXT.test(label)) continue;
    const attrs = m[1];
    if (/(?:^|\s)disabled(?:\s|=|$)/i.test(attrs) && !SOLD_OUT.test(html.slice(Math.max(0, m.index! - 600), m.index! + 600))) {
      // Often enabled by script once a variant is chosen: only a disabled button on a page without any variant selector is reported.
      if (!/<select\b|type\s*=\s*["']radio["']|swatch|variant|maat|size|kleur|color/i.test(html.slice(Math.max(0, m.index! - 1500), m.index! + 300))) found.push({ label, reason: "disabled_always" });
    } else if (/\btype\s*=\s*["']submit["']/i.test(attrs) && !/\bform\s*=/.test(attrs) && !inForm(m.index!) && !/\bonclick\s*=|\bdata-[a-z-]+\s*=|\bhx-|@click|v-on:/i.test(attrs)) {
      found.push({ label, reason: "no_action" });
    }
  }
  return found.slice(0, 5);
}

export type ReviewClaims = { schemaRating?: number | null; schemaCount?: number | null; visibleRating?: number | null; visibleCount?: number | null; visibleScale?: number | null };

/** "4,6 van 5", "4.6/5", "9,2/10", "Rated 4.5 out of 5" */
export function parseVisibleRating(text: string): { rating: number; scale: number } | null {
  const m = /(\d{1,2}(?:[.,]\d{1,2})?)\s*(?:\/|van|of|out of|von|sur|su|de)\s*(5|10)\b/i.exec(text);
  if (!m) return null;
  const rating = parseFloat(m[1].replace(",", "."));
  const scale = Number(m[2]);
  return rating >= 0 && rating <= scale ? { rating, scale } : null;
}

export function parseVisibleReviewCount(text: string): number | null {
  const m = /(\d{1,3}(?:[.,]\d{3})*|\d+)\s*(?:reviews?|beoordelingen|recensies|bewertungen|avis|opiniones|recensioni|ratings?)\b/i.exec(text);
  if (!m) return null;
  const n = parseInt(m[1].replace(/[.,]/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}

/** Contradictions between structured data and visible text, normalised to a 5-point scale. */
export function reviewContradictions(claims: ReviewClaims): string[] {
  const out: string[] = [];
  if (claims.schemaRating != null && claims.visibleRating != null) {
    const scale = claims.visibleScale === 10 ? 10 : 5;
    const visible5 = claims.visibleRating * (5 / scale);
    const schema5 = claims.schemaRating > 5 ? claims.schemaRating / 2 : claims.schemaRating;
    if (Math.abs(visible5 - schema5) >= 0.3) out.push(`zichtbare waardering ${claims.visibleRating}/${scale} wijkt af van de gemarkeerde ${claims.schemaRating}`);
  }
  if (claims.schemaCount != null && claims.visibleCount != null && claims.schemaCount > 0 && claims.visibleCount > 0) {
    const ratio = Math.max(claims.schemaCount, claims.visibleCount) / Math.min(claims.schemaCount, claims.visibleCount);
    if (ratio >= 1.5 && Math.abs(claims.schemaCount - claims.visibleCount) >= 5) out.push(`zichtbaar aantal reviews (${claims.visibleCount}) wijkt af van het gemarkeerde aantal (${claims.schemaCount})`);
  }
  return out;
}
