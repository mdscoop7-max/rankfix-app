/**
 * Which URLs may enter the multi-page sample, and which count as the same page.
 * Generic rules only: no domains, brands or sectors.
 */

const UTILITY_SEGMENT = /(?:^|\/)(?:login|log-in|logout|signin|sign-in|signup|sign-up|register|registreren|inloggen|uitloggen|account|myaccount|my-account|mijn-account|mijn-[a-z0-9-]+|wachtwoord(?:-vergeten)?|password(?:-reset)?|forgot-password|reset-password|passwort(?:-vergessen)?|cart|basket|winkelwagen(?:tje)?|shoppingcart|warenkorb|panier|carrello|carrito|checkout|kassa|bestellen|wishlist|verlanglijst|favorites|favourites|compare|vergelijk|search|zoeken|zoek|suche|recherche|wp-admin|wp-login\.php|admin|cgi-bin|feed|print|preferences|profile|unsubscribe|uitschrijven)(?:\.[a-z0-9]+)?(?:\/|$)/i;

export function isUtilityPath(pathname: string): boolean {
  return UTILITY_SEGMENT.test(pathname);
}

const LOCALE_SEGMENT = /^[a-z]{2}(?:[-_][a-z]{2,4})?$/i;
const COMMON_NON_LOCALE_TWO_LETTER = new Set(["tv", "pr", "hr", "ai", "ux", "ui", "it", "me", "my", "go", "up", "do", "bi", "ev", "dj", "fm", "hq"]);

/** Path with a leading language/market segment removed: /nl/over-ons and /en/over-ons share one key. */
export function languageNeutralPath(pathname: string): string {
  const parts = pathname.replace(/\/+$/, "").split("/").filter(Boolean);
  if (parts.length > 1 && LOCALE_SEGMENT.test(parts[0]) && !COMMON_NON_LOCALE_TWO_LETTER.has(parts[0].toLowerCase())) parts.shift();
  return "/" + parts.join("/").toLowerCase();
}

export function localeOfPath(pathname: string): string {
  const first = pathname.split("/").filter(Boolean)[0] || "";
  return LOCALE_SEGMENT.test(first) && !COMMON_NON_LOCALE_TWO_LETTER.has(first.toLowerCase()) ? first.toLowerCase().split(/[-_]/)[0] : "";
}

/** Query parameters that only select a presentation variant of the same page. */
const VARIANT_PARAM = /^(?:color|colour|kleur|farbe|couleur|colore|variant|variation|size|maat|groesse|größe|taille|sort|order|orderby|view|display|page|p|pagina|lang|language|taal|currency|valuta|ref|source|sku)$/i;

/** Key under which URL variants (language, colour, size, sorting, tracking) collapse to one page. */
export function pageIdentityKey(url: string): string {
  try {
    const parsed = new URL(url);
    const keptParams = [...parsed.searchParams.entries()].filter(([key]) => !VARIANT_PARAM.test(key)).sort(([a], [b]) => a.localeCompare(b));
    const query = keptParams.length ? "?" + keptParams.map(([k, v]) => `${k}=${v}`).join("&") : "";
    return `${parsed.hostname.replace(/^www\./, "")}${languageNeutralPath(parsed.pathname)}${query}`;
  } catch {
    return url;
  }
}

/**
 * Removes utility pages and collapses language/variant duplicates. The preferred
 * language wins; otherwise the first (highest ranked) candidate stays.
 */
export function eligibleSampleCandidates<T extends { url: string }>(ranked: T[], preferredLocale = ""): T[] {
  const best = new Map<string, T>();
  const order: string[] = [];
  for (const item of ranked) {
    let pathname: string;
    try { pathname = new URL(item.url).pathname; } catch { continue; }
    if (isUtilityPath(pathname)) continue;
    const key = pageIdentityKey(item.url);
    const existing = best.get(key);
    if (!existing) { best.set(key, item); order.push(key); continue; }
    const existingLocale = localeOfPath(new URL(existing.url).pathname);
    const candidateLocale = localeOfPath(pathname);
    if (preferredLocale && candidateLocale === preferredLocale && existingLocale !== preferredLocale) best.set(key, item);
  }
  return order.map((key) => best.get(key)!).filter(Boolean);
}
