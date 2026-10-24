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

// Legal policies must belong to the scanned site; third-party embedded-service
// policies cannot be presented as the business's own privacy/cookie/terms pages.
export function isFirstPartyLegalLink(href: string, pageUrl: string): boolean {
  try {
    const target = new URL(href, pageUrl);
    const page = new URL(pageUrl);
    if (!["http:", "https:"].includes(target.protocol)) return false;
    return sameSite(target.hostname, page.hostname);
  } catch { return false; }
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
// Linear: only text around each "@" is examined (local part ≤ 64, domain ≤ 255
// characters, the RFC limits). A whole-text regex was quadratic on long runs
// such as "a.a.a." or base64 and could stall a scan for minutes.
const EMAIL_LOCAL_CHAR = /[a-z0-9._%+-]/i;
const EMAIL_AT_START = /^[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}\b/i;
export function findVisibleEmail(text: string): string | null {
  for (let at = text.indexOf("@"); at !== -1; at = text.indexOf("@", at + 1)) {
    let start = at;
    while (start > 0 && at - start < 64 && EMAIL_LOCAL_CHAR.test(text[start - 1])) start--;
    if (start === at || (start > 0 && /\w/.test(text[start - 1]))) continue;
    const match = text.slice(start, at + 256).match(EMAIL_AT_START);
    if (match && !/\.(?:png|jpe?g|gif|webp|avif|svg|ico)$/i.test(match[0])) return match[0];
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
    const city = match[4].replace(/\s+(?:Nederland|Netherlands|België|Belgium|Duitsland|Germany|Tel|Telefoon|Toggle|Contact|Vestiging|Menu|WhatsApp).*$/i, "").trim();
    if (street && city) return `${street} ${match[2]}, ${match[3]} ${city}`;
  }
  // Conservative generic fallback: at most two street-name tokens; do not
  // infer a complete address from a long contact/navigation block.
  const match = text.match(/\b([A-ZÀ-Ý][A-Za-zÀ-ÿ.'-]+(?:\s+[A-ZÀ-Ý][A-Za-zÀ-ÿ.'-]+)?)\s+(\d{1,5}[A-Za-z]?),?\s+(\d{4}\s?[A-Z]{2}|\d{5})\s+([A-ZÀ-Ý][a-zà-ÿ'-]+)/);
  return match ? `${match[1]} ${match[2]}, ${match[3]} ${match[4]}` : null;
}

export type BusinessContactDetails = { phone: string | null; email: string | null; address: string | null; telLink: boolean; mailtoLink: boolean; suspectedTestData?: string[] };

// ---------------------------------------------------------------------------
// Example / test contact data (3.5). Template and documentation values such as
// info@example.com, +31 6 12345678, "Teststraat 1, 1234 AB" or KvK 12345678 look
// like contact details but identify nobody. They are never business evidence;
// the report names them so they can be replaced.
// ---------------------------------------------------------------------------
const PLACEHOLDER_EMAIL_DOMAIN = /@(?:(?:[\w-]+\.)*(?:example|voorbeeld|beispiel|exemple|esempio|ejemplo|exemplo|przyklad|exempel|eksempel|esimerkki|priklad|exemplu|pelda|paradeigma|yourdomain|yourcompany|your-company|yoursite|mydomain|mycompany|mysite|jouwdomein|jouwbedrijf|uwdomein|uwbedrijf|ihredomain|ihrefirma|votredomaine|votresociete|tuodominio|tudominio|domain|domein|company|email|website|test|testing|placeholder|sample)\.[a-z.]{2,10}|[\w.-]+\.(?:example|invalid|localhost))$/i;
const PLACEHOLDER_EMAIL_LOCAL = /^(?:test|tester|example|voorbeeld|beispiel|exemple|esempio|ejemplo|placeholder|naam|name|yourname|your\.name|jouwnaam|uwnaam|john\.doe|jane\.doe|johndoe|janedoe|max\.mustermann|maxmustermann|jean\.dupont|mario\.rossi|jan\.jansen)@/i;
const PLACEHOLDER_STREET = /\b(?:test|voorbeeld|muster|beispiel|example|sample|exemple|esempio|ejemplo|exempel|eksempel|esimerkki)(?:straat|laan|weg|plein|stra(?:ß|ss)e|gasse|weg|street|road|avenue|lane|gatan|vägen|vej|gade|veien|gata|katu|tie)\b|\b(?:rue de l'exemple|via esempio|calle ejemplo|rua exemplo|ulica przykładowa|ukázková ulice|strada exemplu)\b/i;
const PLACEHOLDER_TOWN = /\b(?:voorbeeldstad|voorbeelddorp|teststad|musterstadt|musterhausen|beispielstadt|anytown|sampletown|villexemple|esempiopoli|exempelstad|eksempelby|esimerkkikaupunki|przykładowo|cidade exemplo)\b/i;

function sequentialRun(digits: string, length: number): boolean {
  for (let i = 0; i + length <= digits.length; i++) {
    const part = digits.slice(i, i + length);
    let up = true, down = true;
    for (let k = 1; k < part.length; k++) {
      if ((Number(part[k - 1]) + 1) % 10 !== Number(part[k])) up = false;
      if ((Number(part[k]) + 1) % 10 !== Number(part[k - 1])) down = false;
    }
    if (up || down) return true;
  }
  return false;
}

/** A visible e-mail address that is a template or documentation value. */
export function isPlaceholderEmail(email: string, siteHost = ""): boolean {
  const value = email.trim().toLowerCase();
  const domain = value.split("@")[1] || "";
  const own = siteHost.toLowerCase().replace(/^www\./, "");
  // The site's own domain is never a placeholder (even under a reserved test TLD).
  if (own && (domain === own || domain.endsWith(`.${own}`))) return false;
  return PLACEHOLDER_EMAIL_DOMAIN.test(value) || PLACEHOLDER_EMAIL_LOCAL.test(value) || /\.test$/.test(domain);
}

/** A phone number made of a counting run (1234567), one repeated digit, or a 555-01xx fiction number. */
export function isPlaceholderPhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 6) return false;
  // Subscriber part: drop an international prefix (00/+ and up to 3 country digits) or a trunk 0.
  const national = digits.replace(/^00?\d{0,3}?(?=\d{9,10}$)/, "").replace(/^0/, "");
  if (/^(\d)\1{5,}$/.test(national) || /(\d)\1{6,}/.test(national)) return true;
  if (sequentialRun(national.slice(-8), 7) || sequentialRun(national, 8)) return true;
  if (/(?:^|1)555(?:01\d\d)$/.test(digits.slice(-7)) || /^(?:1)?\d{3}55501\d\d$/.test(digits)) return true;
  return false;
}

/** An address with a template street, a template town or the NL documentation postcode 1234 AB. */
export function isPlaceholderAddress(address: string): boolean {
  return PLACEHOLDER_STREET.test(address) || PLACEHOLDER_TOWN.test(address) || /\b1234\s?AB\b/.test(address) || /\b(?:12345|00000|99999)\s+[A-ZÀ-Ý]/.test(address);
}

/** A company registration number made of a counting run or one repeated digit. */
export function isPlaceholderRegistration(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 6) return false;
  return /^(\d)\1+$/.test(digits.slice(0, 8)) || sequentialRun(digits.slice(0, 9), 7) || /^(?:0+|12345678|87654321)/.test(digits);
}

function firstAccepted(text: string, find: (value: string) => string | null, reject: (value: string) => boolean, rejected: string[]): string | null {
  // Look past a rejected example value: a real detail can follow it.
  let rest = text;
  for (let i = 0; i < 6; i++) {
    const hit = find(rest);
    if (!hit) return null;
    if (!reject(hit)) return hit;
    rejected.push(hit);
    const at = rest.indexOf(hit);
    if (at < 0) return null;
    rest = rest.slice(at + hit.length);
  }
  return null;
}

export function findBusinessContactDetails(text: string, html: string, siteHost = ""): BusinessContactDetails {
  const suspected: string[] = [];
  const phone = firstAccepted(text, findVisiblePhone, isPlaceholderPhone, suspected);
  const email = firstAccepted(text, findVisibleEmail, (value) => isPlaceholderEmail(value, siteHost), suspected);
  const address = firstAccepted(text, findVisibleAddress, isPlaceholderAddress, suspected);
  const telNumbers = [...html.matchAll(/href\s*=\s*["']tel:([^"']+)["']/gi)].map((match) => match[1]).filter((value) => value.replace(/\D/g, "").length >= 6);
  const mailtos = [...html.matchAll(/href\s*=\s*["']mailto:([^"'@\s?]+@[^"'\s?]+\.[a-z]{2,})/gi)].map((match) => match[1]);
  for (const value of telNumbers) if (isPlaceholderPhone(value)) suspected.push(value);
  for (const value of mailtos) if (isPlaceholderEmail(value, siteHost)) suspected.push(value);
  return {
    phone,
    email,
    address,
    telLink: telNumbers.some((value) => !isPlaceholderPhone(value)),
    mailtoLink: mailtos.some((value) => !isPlaceholderEmail(value, siteHost)),
    suspectedTestData: [...new Set(suspected)].slice(0, 6),
  };
}

export function hasBusinessContactDetails(details: BusinessContactDetails): boolean {
  return Boolean(details.phone || details.email || details.address || details.telLink || details.mailtoLink);
}

// Registration identifiers: Dutch KvK (8 digits), EU VAT numbers, or a labelled
// company registration number. A label without a number does not count.
export function findCompanyRegistration(text: string, includePlaceholders = false): string | null {
  const kvk = text.match(/\b(?:kvk|k\.v\.k\.|kamer van koophandel)(?:[\s-]*(?:nr|nummer|number|no)\.?)?\s*:?\s*(\d{8})\b/i);
  if (kvk && (includePlaceholders || !isPlaceholderRegistration(kvk[1]))) return `KvK ${kvk[1]}`;
  // Navigation text such as 'BTW Elektricien' is not a VAT number.
  // A genuine VAT ID includes at least six digits after its country prefix.
  for (const vat of text.matchAll(/\b(?:btw|vat|ust-?idnr|tva|iva)(?:[\s-]*(?:nr|nummer|number|id|no)\.?)?\s*:?\s*([A-Z]{2}\s?[0-9A-Z]{8,12})\b/gi)) {
    const value = vat[1].replace(/\s/g, "");
    if ((value.match(/\d/g) || []).length < 6) continue;
    if (includePlaceholders || !isPlaceholderRegistration(value)) return "BTW/VAT " + value;
  }
  return null;
}

/** Registration number that is a template value (KvK 12345678): reported, never evidence. */
export function findPlaceholderRegistration(text: string): string | null {
  const found = findCompanyRegistration(text, true);
  return found && isPlaceholderRegistration(found) ? found : null;
}

export type BusinessDetailsAssessment =
  | { status: "fail"; placeholders: string[] }
  | { status: "pass"; found: string[] }
  | { status: "warning"; testData: string[] }
  | { status: "unable_to_confirm"; reason: "no_details" | "thin_shell" };

// "No placeholders found" is not proof of correct business details: pass needs
// at least one concrete identifier or contact detail on the page.
export function assessBusinessDetails(input: { placeholders: string[]; details: BusinessContactDetails; registration: string | null; schemaContact: boolean; thinShell: boolean; testRegistration?: string | null }): BusinessDetailsAssessment {
  if (input.placeholders.length) return { status: "fail", placeholders: input.placeholders };
  const testData = [...(input.details.suspectedTestData || []), ...(input.testRegistration ? [input.testRegistration] : [])];
  const found = [
    input.registration,
    input.details.address && `adres (${input.details.address})`,
    (input.details.phone || input.details.telLink) && "telefoonnummer",
    (input.details.email || input.details.mailtoLink) && "e-mailadres",
    input.schemaContact && "adres/telefoon in structured data",
  ].filter((item): item is string => Boolean(item));
  // Example/test values next to real details: the real details count, the test
  // values are still named. Only test values: a visible, fixable issue.
  if (found.length) return { status: "pass", found };
  if (testData.length) return { status: "warning", testData };
  return { status: "unable_to_confirm", reason: input.thinShell ? "thin_shell" : "no_details" };
}
