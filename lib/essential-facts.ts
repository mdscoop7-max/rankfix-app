// Essential customer facts (company registration, contact, stock, checkout) shown
// at the top of the report. Three honest states:
// - confirmed: found, with the page it was found on;
// - missing: proven absent — placeholder/test data, or the pages where such facts
//   belong (contact, terms, privacy, about) were read and do not contain it;
// - not_confirmed: not found, but not every relevant page could be read.
// These facts never add points; an open fact keeps the score provisional.

export type FactState = "confirmed" | "not_confirmed" | "missing" | "not_applicable";
export type FactKey = "company_registration" | "contact" | "stock" | "checkout";
export type EssentialFact = { key: FactKey; label: string; state: FactState; detail: string; url: string | null };

export type FactPage = {
  url: string;
  status: "audited" | "unable_to_confirm";
  /** Same strings the scan stores per page, e.g. "KvK 12345678", "telefoonnummer". */
  businessDetails?: string[];
  /** The page HTML was a JavaScript shell that could not be read. */
  thin?: boolean;
  /** HTML forms on the page; a form on a contact page is a contact channel. */
  formCount?: number;
};

export type FactInput = {
  scannedUrl: string;
  scannedRegistration: string | null;
  scannedContact: boolean;
  scannedIndirectContactOnly: boolean;
  scannedThin: boolean;
  placeholders: number;
  testData: boolean;
  pages: FactPage[];
  commerceConfirmed: boolean;
  /** Status of the product_availability check, when it exists. */
  stockCheck?: { status: string; message?: string; url?: string | null } | null;
  /** Status of the checkout_funnel_static check, when it exists. */
  checkoutCheck?: { status: string; message?: string; url?: string | null } | null;
};

const LABELS: Record<FactKey, string> = {
  company_registration: "Bedrijfsregistratie (KvK/btw)",
  contact: "Contactgegevens",
  stock: "Voorraadinformatie",
  checkout: "Winkelwagen en checkout",
};

// Pages where each fact belongs: only reading such a page can prove absence.
const CONTACT_PAGE = /\/(?:contact(?:eer|-us|ez)?|kontakt|contatti|contacto|klantenservice|customer-service)(?:[/.?#-]|$)/i;
const REGISTRATION_PAGE = /\/(?:contact(?:eer|-us|ez)?|kontakt|impressum|colofon|over-ons|about(?:-us)?|voorwaarden|algemene-voorwaarden|terms(?:-and-conditions)?|legal|juridisch)(?:[/.?#-]|$)/i;
const REGISTRATION = /^(?:KvK|BTW\/VAT)\b/;
const CONTACT_DETAIL = /^(?:adres|telefoonnummer|e-mailadres)\b/;

const pathOf = (url: string) => { try { return new URL(url).pathname || "/"; } catch { return url; } };

function readPages(input: FactInput, kind: RegExp): FactPage[] {
  return input.pages.filter((page) => page.status === "audited" && !page.thin && kind.test(pathOf(page.url)));
}
const readListOf = (input: FactInput, pages: FactPage[]) =>
  [input.scannedThin ? null : pathOf(input.scannedUrl), ...pages.map((page) => pathOf(page.url))].filter(Boolean).join(", ");

export function essentialFacts(input: FactInput): EssentialFact[] {
  const registrationPages = readPages(input, REGISTRATION_PAGE);
  const contactPages = readPages(input, CONTACT_PAGE);
  const facts: EssentialFact[] = [];

  // Company registration
  const regPage = input.pages.find((page) => page.status === "audited" && (page.businessDetails || []).some((item) => REGISTRATION.test(item)));
  if (input.scannedRegistration) {
    facts.push({ key: "company_registration", label: LABELS.company_registration, state: "confirmed", detail: `${input.scannedRegistration} op ${pathOf(input.scannedUrl)}.`, url: input.scannedUrl });
  } else if (regPage) {
    const reg = (regPage.businessDetails || []).find((item) => REGISTRATION.test(item));
    facts.push({ key: "company_registration", label: LABELS.company_registration, state: "confirmed", detail: `${reg} op ${pathOf(regPage.url)}.`, url: regPage.url });
  } else if (input.placeholders > 0 || input.testData) {
    facts.push({ key: "company_registration", label: LABELS.company_registration, state: "missing", detail: "Op de pagina staan voorbeeld- of placeholdergegevens in plaats van echte bedrijfsgegevens.", url: input.scannedUrl });
  } else if (!input.scannedThin && registrationPages.length) {
    facts.push({ key: "company_registration", label: LABELS.company_registration, state: "missing", detail: `Geen KvK- of btw-nummer gevonden op de onderzochte pagina's (${readListOf(input, registrationPages)}).`, url: registrationPages[0].url });
  } else {
    facts.push({ key: "company_registration", label: LABELS.company_registration, state: "not_confirmed", detail: "Geen KvK- of btw-nummer gevonden; een contact-, over-ons- of voorwaardenpagina kon niet worden onderzocht.", url: null });
  }

  // Contact
  const contactPage = input.pages.find((page) => page.status === "audited" && (page.businessDetails || []).some((item) => CONTACT_DETAIL.test(item)));
  const contactFormPage = contactPages.find((page) => (page.formCount || 0) > 0);
  if (input.scannedContact) {
    facts.push({ key: "contact", label: LABELS.contact, state: "confirmed", detail: `Contactmogelijkheid gevonden op ${pathOf(input.scannedUrl)}.`, url: input.scannedUrl });
  } else if (contactPage) {
    const found = (contactPage.businessDetails || []).filter((item) => CONTACT_DETAIL.test(item)).map((item) => item.replace(/\s*\(.*\)$/, ""));
    facts.push({ key: "contact", label: LABELS.contact, state: "confirmed", detail: `${found.join(", ")} op ${pathOf(contactPage.url)}.`, url: contactPage.url });
  } else if (contactFormPage) {
    facts.push({ key: "contact", label: LABELS.contact, state: "confirmed", detail: `Contactformulier op ${pathOf(contactFormPage.url)}.`, url: contactFormPage.url });
  } else if (!input.scannedThin && contactPages.length) {
    facts.push({ key: "contact", label: LABELS.contact, state: "missing", detail: `Geen adres, telefoonnummer of e-mailadres gevonden op de onderzochte pagina's (${readListOf(input, contactPages)}).`, url: contactPages[0].url });
  } else {
    facts.push({ key: "contact", label: LABELS.contact, state: "not_confirmed", detail: input.scannedIndirectContactOnly
      ? "Alleen een FAQ-, help- of klantenservicelink gevonden; een direct contactkanaal is niet bevestigd."
      : "Geen contactgegevens gevonden; een contactpagina kon niet worden onderzocht.", url: null });
  }

  // Stock and checkout only apply to a confirmed webshop.
  const fromCheck = (key: "stock" | "checkout", check: FactInput["stockCheck"], confirmedText: string, notConfirmedText: string): EssentialFact => {
    if (!input.commerceConfirmed) return { key, label: LABELS[key], state: "not_applicable", detail: "Geen webshop bevestigd.", url: null };
    if (!check) return { key, label: LABELS[key], state: "not_confirmed", detail: notConfirmedText, url: null };
    if (check.status === "pass") return { key, label: LABELS[key], state: "confirmed", detail: check.message || confirmedText, url: check.url ?? null };
    if (check.status === "warning" || check.status === "fail") return { key, label: LABELS[key], state: "missing", detail: check.message || "Ontbreekt of klopt niet.", url: check.url ?? null };
    if (check.status === "not_applicable") return { key, label: LABELS[key], state: "not_applicable", detail: check.message || "Niet van toepassing.", url: check.url ?? null };
    return { key, label: LABELS[key], state: "not_confirmed", detail: check.message || notConfirmedText, url: check.url ?? null };
  };
  facts.push(fromCheck("stock", input.stockCheck, "Voorraadstatus bevestigd.", "Voorraadstatus kon op geen productpagina worden bevestigd."));
  facts.push(fromCheck("checkout", input.checkoutCheck, "Winkelwagen of checkout bevestigd.", "Winkelwagen en checkout konden niet worden bevestigd."));
  return facts;
}

/** Facts that keep the score provisional: open or proven missing, never N/A. */
export function openEssentialFacts(facts: EssentialFact[]): string[] {
  return facts.filter((fact) => fact.state === "not_confirmed" || fact.state === "missing")
    .map((fact) => `${fact.label} ${fact.state === "missing" ? "ontbreekt" : "niet bevestigd"}`);
}

export const FACT_STATE_LABEL: Record<FactState, string> = {
  confirmed: "Bevestigd",
  not_confirmed: "Niet bevestigd",
  missing: "Ontbreekt",
  not_applicable: "N.v.t.",
};

type CatalogEvidence = {
  checked: number;
  counts: { no_availability: number; in_stock: number; out_of_stock: number; stock_mismatch: number };
  products?: Array<{ outcome: string; dataStock: string | null; visibleStock: string | null }>;
  checkout?: { url: string | null; httpStatus: number | null; reachable: boolean | null; foundOnProducts: number } | null;
} | null | undefined;

/**
 * The catalogue audit runs after the facts are first derived and reads many more
 * product pages. Its evidence replaces the single-page stock and checkout facts:
 * - stock is "missing" only when every checked product lacks both a data and a
 *   visible stock state, "confirmed" when every checked product shows one;
 * - checkout stays "not_confirmed" (no order is placed) but states what was proven.
 */
export function refineFactsWithCatalog(facts: EssentialFact[], catalog: CatalogEvidence): EssentialFact[] {
  if (!catalog || catalog.checked <= 0) return facts;
  const checked = (catalog.products || []).filter((p) => p.outcome === "checked");
  const withStock = checked.filter((p) => p.dataStock || p.visibleStock).length;
  return facts.map((fact) => {
    if (fact.state === "not_applicable") return fact;
    if (fact.key === "stock" && checked.length) {
      if (withStock === 0) return { ...fact, state: "missing" as const, url: null,
        detail: `Op ${checked.length} van ${checked.length} gecontroleerde productpagina's geen voorraadstatus in de productgegevens en geen zichtbare voorraadtekst.` };
      if (withStock === checked.length && catalog.counts.stock_mismatch === 0) return { ...fact, state: "confirmed" as const, url: null,
        detail: `Voorraadstatus aanwezig op alle ${checked.length} gecontroleerde productpagina's.` };
      return { ...fact, state: "not_confirmed" as const, url: null,
        detail: `Voorraadstatus op ${withStock} van ${checked.length} gecontroleerde productpagina's${catalog.counts.stock_mismatch ? `; bij ${catalog.counts.stock_mismatch} klopt de zichtbare voorraad niet met de productgegevens` : ""}.` };
    }
    if (fact.key === "checkout" && catalog.checkout) {
      const c = catalog.checkout;
      const path = (() => { try { return c.url ? new URL(c.url).pathname : null; } catch { return c.url; } })();
      if (c.reachable === true) return { ...fact, state: "not_confirmed" as const, url: c.url,
        detail: `Winkelwagen bereikbaar (${path}, HTTP ${c.httpStatus}) vanaf ${c.foundOnProducts} productpagina('s). Afrekenen zelf is niet doorlopen: RankFix plaatst geen bestellingen.` };
      if (c.reachable === false) return { ...fact, state: "missing" as const, url: c.url,
        detail: `De winkelwagen-/checkoutpagina (${path}) gaf HTTP ${c.httpStatus}.` };
    }
    return fact;
  });
}
