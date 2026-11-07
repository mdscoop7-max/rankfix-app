// Product discovery for the first sample (4 Nov 2026, QA10 step 4c). Product
// cards on the scanned page (homepage or category) nominate product candidates,
// whatever their URL shape (flat "/fauteuil-torino-4325187" URLs were typed
// "other" and never sampled). A nomination is no evidence: the fetched page must
// still prove it is a product page (Product data, price, purchase action).

type Candidate = { url: string; type: string; evidence: string[] };

/**
 * Re-type up to `limit` candidates that the scanned page links from product cards
 * as "product" (adding unknown ones via `classify`). Legal, contact, support,
 * article, location and similar candidates are never re-typed.
 */
export function nominateProductCards<C extends Candidate>(candidates: C[], cardLinks: string[], keyOf: (url: string) => string, classify: (url: string) => C | null, limit = 6): number {
  const byKey = new Map(candidates.map((item) => [keyOf(item.url), item] as const));
  let nominated = 0;
  for (const link of [...new Set(cardLinks)]) {
    if (nominated >= limit) break;
    const key = keyOf(link);
    let candidate = byKey.get(key);
    if (!candidate) {
      const fresh = classify(link);
      if (!fresh) continue;
      candidates.push(fresh); byKey.set(key, fresh); candidate = fresh;
    }
    if (!["other", "category", "product"].includes(candidate.type)) continue;
    candidate.type = "product";
    candidate.evidence.push("productkaart op de gescande pagina (nominatie, geen bewijs)");
    nominated++;
  }
  return nominated;
}
