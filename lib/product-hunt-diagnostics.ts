// Why a confirmed webshop has (no) proven product page. One outcome per product
// candidate, for every platform (Shopify, WooCommerce, custom, JS frameworks):
//   confirmed   - the fetched page proves a product (Product data or offer + buy action)
//   blocked     - the site refused RankFix (401/403/429, bot check)
//   not_loaded  - no usable answer (time-out, network, render failure, empty page)
//   missing     - the link points to a page that does not exist (404/410)
//   rejected    - fetched and readable, but no provable product information
// "none_found" (no candidate at all) is reported separately. Never a guess.

export type ProductCandidateOutcome = "confirmed" | "blocked" | "not_loaded" | "missing" | "rejected";

export type ProductCandidateAudit = {
  url: string;
  status: string;
  httpStatus?: number | null;
  nonContent?: string | null;
  fetchFailure?: string | null;
  commerceEvidence?: { confirmedRetailPage?: boolean; financialOffer?: boolean } | null;
};

export function productCandidateOutcome(a: ProductCandidateAudit): ProductCandidateOutcome {
  const http = a.httpStatus ?? null;
  if (a.status === "audited" && a.commerceEvidence?.confirmedRetailPage && !a.commerceEvidence?.financialOffer) return "confirmed";
  if (a.nonContent === "challenge" || http === 401 || http === 403 || http === 429) return "blocked";
  if (http === 404 || http === 410) return "missing";
  if (a.status !== "audited" || a.fetchFailure || a.nonContent || (http !== null && http >= 500)) return "not_loaded";
  return "rejected";
}

export type ProductHuntSummary = {
  candidatesFound: number;
  attempted: number;
  sources: string[];
  outcomes: Record<ProductCandidateOutcome, number>;
  examples: { url: string; outcome: ProductCandidateOutcome; httpStatus: number | null }[];
  /** Listing pages read for product links; rendered without a product card; render failed. */
  listings?: ProductHuntListings;
};
export type ProductHuntListings = { checked: number; renderedWithoutCards: number; renderFailed: number };

export function summarizeProductHunt(found: number, sources: string[], audits: ProductCandidateAudit[], listings?: ProductHuntListings): ProductHuntSummary {
  const outcomes: Record<ProductCandidateOutcome, number> = { confirmed: 0, blocked: 0, not_loaded: 0, missing: 0, rejected: 0 };
  const examples: ProductHuntSummary["examples"] = [];
  for (const a of audits) {
    const o = productCandidateOutcome(a);
    outcomes[o] += 1;
    if (examples.length < 6) examples.push({ url: a.url, outcome: o, httpStatus: a.httpStatus ?? null });
  }
  return { candidatesFound: found, attempted: audits.length, sources: [...new Set(sources)], outcomes, examples, ...(listings ? { listings } : {}) };
}

const LABEL: Record<ProductCandidateOutcome, string> = {
  confirmed: "bevestigd", blocked: "geweigerd door de website", not_loaded: "niet geladen (time-out of renderfout)",
  missing: "bestaan niet (404/410)", rejected: "afgekeurd: geen aantoonbare productinformatie",
};

/** One Dutch sentence for the report; empty when a product page was confirmed. */
export function productHuntSentence(s: ProductHuntSummary | null | undefined): string {
  if (!s || s.outcomes.confirmed > 0) return "";
  if (!s.candidatesFound) {
    const l = s.listings;
    const detail = l && l.checked ? [
      `${l.checked} lijst- of categoriepagina's gelezen`,
      l.renderedWithoutCards ? `${l.renderedWithoutCards} toonden na JavaScript-rendering geen herkenbare productkaarten` : "",
      l.renderFailed ? `${l.renderFailed} konden niet worden gerenderd (niet geladen)` : "",
    ].filter(Boolean).join("; ") : "";
    return `Geen productkandidaten gevonden in links van de bemonsterde pagina's of in de sitemap${detail ? ` (${detail})` : ""}. Dit is geen bewijs dat de webshop geen productpagina's heeft.`;
  }
  const parts = (Object.keys(LABEL) as ProductCandidateOutcome[]).filter((k) => k !== "confirmed" && s.outcomes[k] > 0).map((k) => `${s.outcomes[k]} ${LABEL[k]}`);
  const first = s.examples[0];
  return `${s.candidatesFound} productkandidaten gevonden, ${s.attempted} gecontroleerd: ${parts.join(", ") || "geen resultaat"}.${first ? ` Voorbeeld: ${first.url}${first.httpStatus ? ` (HTTP ${first.httpStatus})` : ""}.` : ""}`;
}
