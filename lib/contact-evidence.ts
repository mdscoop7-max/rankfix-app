// Contact evidence must show a way to actually reach the business: a contact page
// on the same site, an e-mail or phone link, a contact form or a visible address.
// FAQ, help, support, customer-service hubs and off-site links point towards
// contact but do not prove a channel; review/rating links are not contact at all.
export type ContactChannel = "email" | "phone" | "contact_page" | "contact_form";
export type ContactAnchorKind = Exclude<ContactChannel, "contact_form"> | "customer_service" | "faq_help" | "support" | "external" | "review";

// Kinds that suggest a route to contact without proving a channel.
export const INDIRECT_CONTACT_KINDS: ReadonlySet<ContactAnchorKind> = new Set(["customer_service", "faq_help", "support", "external"]);

const CONTACT = /\b(?:contact(?:eer|eren|ez|o|os|ar|us|pagina|formulier|gegevens|informatie|form|page|details)?|kontakt(?:formular|ieren|e|aufnahme)?|contatt(?:i|o|aci)|neem contact|get in touch)\b/;
const FAQ_HELP = /\b(?:faqs?|veel ?gestelde vragen|frequently asked|vragen en antwoorden|help|hulp|hilfe|aide|ayuda|aiuto|ajuda|kennisbank|knowledge ?base|helpcentrum|help ?cent(?:er|re))\b/;
const CUSTOMER_SERVICE = /\b(?:klantenservice|klanten service|customer (?:service|care)|kundenservice|kundendienst|service client|servicio al cliente|atencion al cliente|assistenza clienti|servizio clienti|apoio ao cliente)\b/;
const SUPPORT = /\b(?:support|helpdesk|assistenza|pomoc\w*)\b/;
const REVIEW = /\b(?:beoordeling(?:en)?|reviews?|recensies?|ratings?|sterren|stars|klantbeoordelingen|bewertungen|avis clients|valoraciones|opiniones|recensioni)\b/;

// Lowercase, accent-free, "-"/"_"/"/" as spaces: the shape the lexicons expect.
function normalize(value: string): string {
  let decoded = value;
  try { decoded = decodeURIComponent(value); } catch {}
  return decoded.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[_\-/.?=&#]+/g, " ").replace(/\s+/g, " ").trim();
}

const bareHost = (host: string) => host.toLowerCase().replace(/^www\./, "");
function sameSite(a: string, b: string): boolean {
  const x = bareHost(a), y = bareHost(b);
  return x === y || x.endsWith(`.${y}`) || y.endsWith(`.${x}`);
}

// text: the visible label plus aria-label/title. The URL path alone is weaker:
// a "/customer-service/services" link labelled "Services" is not customer service.
export function classifyContactAnchor(input: { href: string; text: string; pageUrl: string }): ContactAnchorKind | null {
  const target = input.href.trim();
  const lower = target.toLowerCase();
  if (lower.startsWith("mailto:")) return /^mailto:[^@\s]+@[^@\s]+\.[a-z]{2,}/.test(lower) ? "email" : null;
  if (lower.startsWith("tel:")) return lower.replace(/\D/g, "").length >= 6 ? "phone" : null;
  let url: URL;
  try { url = new URL(target, input.pageUrl); } catch { return null; }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  const label = normalize(input.text);
  const path = normalize(url.pathname);
  if (REVIEW.test(label) || /\breviews?\b/.test(path)) return "review";
  const explicitContact = CONTACT.test(label) || CONTACT.test(path);
  if (!sameSite(url.hostname, new URL(input.pageUrl).hostname)) return explicitContact || CUSTOMER_SERVICE.test(label) ? "external" : null;
  // An explicit contact word wins, so /support/contact is still a contact page.
  if (explicitContact) return "contact_page";
  if (FAQ_HELP.test(label) || FAQ_HELP.test(path)) return "faq_help";
  if (CUSTOMER_SERVICE.test(label)) return "customer_service";
  if (CUSTOMER_SERVICE.test(path) || SUPPORT.test(label) || SUPPORT.test(path)) return "support";
  return null;
}

// A message box plus a way to reply; search and newsletter forms have no textarea.
export function isContactForm(formHtml: string): boolean {
  if (!/<textarea\b/i.test(formHtml)) return false;
  return /<input\b[^>]*\btype\s*=\s*["']?email\b/i.test(formHtml)
    || /<input\b[^>]*\bname\s*=\s*["']?[^"'\s>]*(?:e-?mail|phone|telefoon|tel)\b/i.test(formHtml);
}

// Visible addresses only; asset names like logo@2x.png are not contact details.
export function findVisibleEmail(text: string): string | null {
  for (const match of text.matchAll(/\b[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}\b/gi)) {
    if (!/\.(?:png|jpe?g|gif|webp|avif|svg|ico)$/i.test(match[0])) return match[0];
  }
  return null;
}

// Phone numbers need a dialling shape (+country, 00 or a leading 0) and enough
// digits; counts such as "76.121 beoordelingen", prices and dates do not qualify.
export function findVisiblePhone(text: string): string | null {
  for (const match of text.matchAll(/(?:\+|\b00|\b0)\d(?:[\s.()-]{0,2}\d){7,13}\b/g)) {
    const digits = match[0].replace(/\D/g, "");
    if (digits.length < 9 || digits.length > 15) continue;
    const after = text.slice((match.index ?? 0) + match[0].length, (match.index ?? 0) + match[0].length + 30);
    if (REVIEW.test(normalize(after.split(/[.!?\n]/)[0] || ""))) continue;
    return match[0].trim();
  }
  return null;
}

// Street + number followed by a Dutch, Belgian or German style postcode and place.
export function findVisibleAddress(text: string): string | null {
  // Anchor on the street number and postcode, rather than swallowing navigation
  // labels ("Of chat Dutch", "Adres gegevens") in front of the street.
  const dutchStreet = /\b((?:(?:[A-Z](?:\.[A-Z])?\.|[A-ZÀ-Ý][a-zà-ÿ'-]+)\s+){0,2}[A-ZÀ-Ý][A-Za-zÀ-ÿ.'-]*(?:straat|weg|laan|kade|plein|dreef|singel|gracht|steeg|dijk|hof))\s+(\d{1,5}[A-Za-z]?)\s*,?\s*(\d{4}\s?[A-Z]{2})\s+([A-ZÀ-Ý][a-zà-ÿ'-]+(?:\s+[A-ZÀ-Ý][a-zà-ÿ'-]+)?)/g;
  for (const match of text.matchAll(dutchStreet)) {
    const streetWords = match[1].trim().split(/\s+/);
    const street = streetWords.length > 1 && /^[A-Z](?:\.[A-Z])?\.$/.test(streetWords[streetWords.length - 2])
      ? streetWords.slice(-2).join(" ")
      : streetWords[streetWords.length - 1];
    const city = match[4].replace(/\s+(?:Tel|Telefoon|Toggle|Contact|Vestiging|Menu|WhatsApp).*$/i, "").trim();
    if (street && city) return `${street} ${match[2]}, ${match[3]} ${city}`;
  }
  // Conservative generic fallback: at most two street-name tokens; do not
  // infer a complete address from a long contact/navigation block.
  const match = text.match(/\b([A-ZÀ-Ý][A-Za-zÀ-ÿ.'-]+(?:\s+[A-ZÀ-Ý][A-Za-zÀ-ÿ.'-]+)?)\s+(\d{1,5}[A-Za-z]?),?\s+(\d{4}\s?[A-Z]{2}|\d{5})\s+([A-ZÀ-Ý][a-zà-ÿ'-]+)/);
  return match ? `${match[1]} ${match[2]}, ${match[3]} ${match[4]}` : null;
}

export type BusinessContactDetails = { phone: string | null; email: string | null; address: string | null; telLink: boolean; mailtoLink: boolean };

export function findBusinessContactDetails(text: string, html: string): BusinessContactDetails {
  return {
    phone: findVisiblePhone(text),
    email: findVisibleEmail(text),
    address: findVisibleAddress(text),
    telLink: [...html.matchAll(/href\s*=\s*["']tel:([^"']+)["']/gi)].some((match) => match[1].replace(/\D/g, "").length >= 6),
    mailtoLink: /href\s*=\s*["']mailto:[^"'@\s]+@[^"'\s]+\.[a-z]{2,}/i.test(html),
  };
}

export function hasBusinessContactDetails(details: BusinessContactDetails): boolean {
  return Boolean(details.phone || details.email || details.address || details.telLink || details.mailtoLink);
}

// Registration identifiers: Dutch KvK (8 digits), EU VAT numbers, or a labelled
// company registration number. A label without a number does not count.
export function findCompanyRegistration(text: string): string | null {
  const kvk = text.match(/\b(?:kvk|k\.v\.k\.|kamer van koophandel)(?:[\s-]*(?:nr|nummer|number|no)\.?)?\s*:?\s*(\d{8})\b/i);
  if (kvk) return `KvK ${kvk[1]}`;
  const vat = text.match(/\b(?:btw|vat|ust-?idnr|tva|iva)(?:[\s-]*(?:nr|nummer|number|id|no)\.?)?\s*:?\s*([A-Z]{2}\s?[0-9A-Z]{8,12})\b/i);
  if (vat) return `BTW/VAT ${vat[1].replace(/\s/g, "")}`;
  return null;
}

export type BusinessDetailsAssessment =
  | { status: "fail"; placeholders: string[] }
  | { status: "pass"; found: string[] }
  | { status: "unable_to_confirm"; reason: "no_details" | "thin_shell" };

// "No placeholders found" is not proof of correct business details: pass needs
// at least one concrete identifier or contact detail on the page.
export function assessBusinessDetails(input: { placeholders: string[]; details: BusinessContactDetails; registration: string | null; schemaContact: boolean; thinShell: boolean }): BusinessDetailsAssessment {
  if (input.placeholders.length) return { status: "fail", placeholders: input.placeholders };
  const found = [
    input.registration,
    input.details.address && `adres (${input.details.address})`,
    (input.details.phone || input.details.telLink) && "telefoonnummer",
    (input.details.email || input.details.mailtoLink) && "e-mailadres",
    input.schemaContact && "adres/telefoon in structured data",
  ].filter((item): item is string => Boolean(item));
  if (found.length) return { status: "pass", found };
  return { status: "unable_to_confirm", reason: input.thinShell ? "thin_shell" : "no_details" };
}
