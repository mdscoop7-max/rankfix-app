// Commerce-only checks (Merchant Center, checkout, EU consumer information, product
// data) may only be "not applicable" when the evidence shows the site is not a
// shop. Missing evidence is "unable to confirm": a country picker, a JavaScript
// shell or a thin sample cannot prove that a shop does not exist.
export type CommerceApplicability =
  | { state: "confirmed" }
  | { state: "absent"; reason: "service_identity" | "no_commerce_evidence" }
  | { state: "unconfirmed"; reason: "market_selector" | "thin_shell" | "weak_commerce_signals" | "low_coverage" };

export function commerceApplicability(input: {
  confirmed: boolean;
  primaryNonCommerceIdentity: boolean;
  commerceHints: boolean;
  thinShell: boolean;
  marketSelector: boolean;
  auditedRepresentativePages: number;
}): CommerceApplicability {
  if (input.confirmed) return { state: "confirmed" };
  if (input.marketSelector) return { state: "unconfirmed", reason: "market_selector" };
  if (input.thinShell) return { state: "unconfirmed", reason: "thin_shell" };
  // A proven service, hotel, dealer or similar identity outranks secondary shop navigation.
  if (input.primaryNonCommerceIdentity) return { state: "absent", reason: "service_identity" };
  if (input.commerceHints) return { state: "unconfirmed", reason: "weak_commerce_signals" };
  if (input.auditedRepresentativePages < 2) return { state: "unconfirmed", reason: "low_coverage" };
  return { state: "absent", reason: "no_commerce_evidence" };
}

export const COMMERCE_APPLICABILITY_COPY: Record<string, string> = {
  service_identity: "Scanbewijs bevestigt een niet-commerciële primaire identiteit zonder harde product-/retailketen; deze commercecontrole is niet van toepassing.",
  no_commerce_evidence: "In de gescande pagina en de representatieve pagina's is geen product-, prijs-, winkelwagen- of checkoutbewijs gevonden; deze commercecontrole is niet van toepassing.",
  market_selector: "Dit is een internationale land-/taalkeuzepagina. Webshopfunctionaliteit staat op de landversies en kan vanaf deze pagina niet worden beoordeeld. Scan de landversie (bijvoorbeeld /nl/nl/) voor een webshopbeoordeling.",
  thin_shell: "De opgehaalde HTML is een dunne JavaScript-shell zonder uitgevoerde rendering. Of hier een webshop is, kan niet betrouwbaar worden vastgesteld.",
  weak_commerce_signals: "Er zijn webshopsignalen gevonden (zoals platform of winkelnavigatie), maar geen bevestigde product-, prijs- of winkelwagenketen. Toepasselijkheid kan niet betrouwbaar worden vastgesteld.",
  low_coverage: "Te weinig representatieve pagina's konden worden onderzocht om vast te stellen of er een webshop is.",
};

// Existing report reason codes, so dashboard and PDF explain the status correctly.
export const UNCONFIRMED_COMMERCE_REASON_CODE = {
  market_selector: "type_uncertain",
  thin_shell: "needs_js",
  weak_commerce_signals: "weak_evidence",
  low_coverage: "insufficient_pages",
} as const;
