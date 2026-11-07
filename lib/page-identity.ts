// Page type from the page's OWN identity (H1, title head, schema), in EU languages
// (4 Nov 2026, QA10 step 4). Content decides; the URL only nominates a page. A
// privacy statement, an accessibility statement or terms stay legal pages even
// below /klantenservice/ or next to a product mega-menu; an FAQ is support even
// below /contact/; a store/branch overview is a location page. No domain rules.

export type IdentityType = "legal" | "support" | "contact" | "location" | "pricing";
export type PageIdentity = { type: IdentityType; reason: string } | null;

const L = String.raw`(?<![\p{L}])`;
const R = String.raw`(?![\p{L}])`;
const re = (body: string) => new RegExp(`${L}(?:${body})${R}`, "iu");

// Legal and policy documents (incl. accessibility statements: a legal disclosure).
const LEGAL = re(String.raw`privacy(?:[ -]?(?:verklaring|beleid|statement|policy|reglement|notice|voorwaarden))|privacy|cookie(?:[ -]?(?:beleid|verklaring|statement|policy|richtlijn|instellingen))|cookies|\p{L}*voorwaarden|terms(?: (?:and|&) conditions| of (?:use|service|sale))?|disclaimer|impressum|colofon|datenschutz(?:erkl(?:ä|ae)rung|hinweise)?|\p{L}*bedingungen|agb|mentions l[ée]gales|politique de (?:confidentialit[ée]|cookies)|conditions g[ée]n[ée]rales(?: de vente| d'utilisation)?|informativa(?: sulla)? (?:privacy|cookie)|termini e condizioni|condizioni (?:generali|di vendita)|pol[ií]tica de (?:privacidad|cookies)|aviso legal|t[ée]rminos y condiciones|condiciones generales|(?:digitale )?toegankelijkheid(?:sverklaring)?|accessibility(?: statement)?|(?:erkl(?:ä|ae)rung zur )?barrierefreiheit(?:serkl(?:ä|ae)rung)?|d[ée]claration d'accessibilit[ée]|accessibilit[ée]|dichiarazione di accessibilit[àa]|declaraci[óo]n de accesibilidad`);
const FAQ = re(String.raw`veelgestelde vragen|veel gestelde vragen|faqs?|frequently asked questions|h(?:ä|ae)ufig gestellte fragen|h(?:ä|ae)ufige fragen|questions fr[ée]quentes|foire aux questions|domande frequenti|preguntas frecuentes`);
const CONTACT = re(String.raw`contact(?:eer ons| opnemen| us)?|neem contact op|contactgegevens|kontakt(?:ieren sie uns)?|nous contacter|contactez-nous|contatt(?:i|aci)|contacto|cont[áa]ctanos`);
const LOCATION = re(String.raw`(?:onze |alle )?(?:winkels|vestigingen|salons|locaties|filialen|kantoren|studio'?s|clubs|showrooms|praktijken)|winkelzoeker|vestigingszoeker|store ?(?:locator|finder)|(?:our |all )?(?:stores|shops|locations|branches|salons|clubs|showrooms)|filialfinder|(?:unsere )?(?:filialen|standorte|gesch(?:ä|ae)fte)|(?:nos |tous nos )?(?:magasins|boutiques|agences|salons)|(?:i nostri |tutti i )?(?:negozi|punti vendita|sedi)|(?:nuestras )?(?:tiendas|sucursales|oficinas)`);
const PRICING = re(String.raw`prijzen|tarieven|prijslijst|prijsoverzicht|kosten|pricing|prices|price list|rates|preise|preisliste|tarife|tarifs|prix|prezzi|tariffe|listino prezzi|precios|tarifas`);

/** Head of a title: the part before " | ", " - ", " – " (the site name follows). */
function titleHead(title: string | null | undefined): string {
  return String(title || "").split(/\s+[|–—-]\s+|\s*[|·•]\s*/)[0].trim();
}

/**
 * A heading identifies a page only when it is short and mostly that phrase:
 * "Privacyverklaring", "Algemene voorwaarden webshop", "Onze salons" — never a
 * product title that merely contains a word ("Privacy screen protector 14 inch").
 */
function headingSays(pattern: RegExp, heading: string): boolean {
  const h = heading.replace(/\s+/g, " ").trim();
  if (!h || h.length > 70) return false;
  const m = h.match(pattern);
  if (!m) return false;
  const rest = h.replace(m[0], " ").replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(" ").filter(Boolean);
  return rest.length <= 4;
}

// Stripe live scan (6 Nov): /nl/careers was typed "Juridisch". A consent dialog's
// heading ("Cookie-instellingen", "We gebruiken cookies") is rendered as an H1
// before the page's own H1, and "arbeidsvoorwaarden" (employment terms) contains
// "voorwaarden". Neither is the page's own legal identity.
const CONSENT_HEADING = /^(?:cookie[ -]?(?:instellingen|voorkeuren|settings|preferences|toestemming|melding|consent|banner)|(?:we|wij) (?:use|gebruiken|maken gebruik van) cookies|this (?:site|website) uses cookies|deze (?:site|website) gebruikt cookies|(?:uw|jouw|your) privacy(?: (?:instellingen|settings|voorkeuren|preferences|choices))?|privacy[ -]?(?:instellingen|settings|voorkeuren|preferences|center|centrum)|manage (?:cookies|consent)|cookies (?:beheren|accepteren))\b/iu;
const EMPLOYMENT_TERMS = /\b(?:arbeidsvoorwaarden|secundaire arbeidsvoorwaarden|employment (?:terms|conditions)|arbeitsbedingungen)\b/iu;
const CAREERS_PATH = /(?:^|\/)(?:careers?|jobs?|vacatures?|werken-bij|werkenbij|karriere|stellenangebote|carrieres?|carriere|emplois?|lavora-con-noi|empleo)(?:\/|$)/i;

export function pageIdentityType(input: {
  title?: string | null;
  h1s?: string[];
  schemaTypes?: string[];
  /** The page sells one product or lists a priced product range: never re-typed here. */
  sellsOneProduct?: boolean;
  /** Street addresses (or LocalBusiness/Store objects) found on the page. */
  addressCount?: number;
  /** URL path of the page; a careers/jobs path is never re-typed as legal. */
  path?: string;
}): PageIdentity {
  if (input.sellsOneProduct) return null;
  const h1 = (input.h1s || []).map((h) => h.trim()).filter((h) => h && !CONSENT_HEADING.test(h))[0] || "";
  const head = titleHead(input.title);
  const headings = [h1, head].filter(Boolean);
  const says = (pattern: RegExp) => headings.some((h) => headingSays(pattern, h));
  const schema = new Set((input.schemaTypes || []).map((t) => String(t).toLowerCase()));
  // The H1 is the page's own statement; the title head is its fallback.
  const h1Says = (pattern: RegExp) => Boolean(h1) && headingSays(pattern, h1);
  const legalHeading = (h: string) => !EMPLOYMENT_TERMS.test(h) && headingSays(LEGAL, h);
  const careersPage = CAREERS_PATH.test(input.path || "");
  if (!careersPage && ((h1 && legalHeading(h1)) || (!h1 && headings.some(legalHeading)))) return { type: "legal", reason: `kop "${h1 || head}"` };
  if (h1Says(FAQ) || (!h1 && says(FAQ))) return { type: "support", reason: `veelgestelde vragen (kop "${h1 || head}")` };
  if (h1Says(CONTACT) || (!h1 && says(CONTACT))) return { type: "contact", reason: `kop "${h1 || head}"` };
  if ((h1Says(LOCATION) || (!h1 && says(LOCATION))) && !schema.has("product")) return { type: "location", reason: `vestigingsoverzicht (kop "${h1 || head}"${(input.addressCount || 0) >= 2 ? `, ${input.addressCount} adressen` : ""})` };
  if ((h1Says(PRICING) || (!h1 && says(PRICING))) && !schema.has("product")) return { type: "pricing", reason: `prijs-/tarievenpagina (kop "${h1 || head}")` };
  // Schema only when no heading decided: FAQPage is support, ContactPage contact.
  if (schema.has("faqpage") && !h1) return { type: "support", reason: "FAQPage structured data" };
  if (schema.has("contactpage") && !h1) return { type: "contact", reason: "ContactPage structured data" };
  // A legal heading in the title head while the H1 is a generic brand line.
  if (!careersPage && headings.some(legalHeading) && !h1Says(CONTACT) && !h1Says(FAQ)) return { type: "legal", reason: `titel "${head}"` };
  return null;
}
