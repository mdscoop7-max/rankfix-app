// Contact evidence must show a way to actually reach the business. FAQ, help
// and generic support articles answer questions but are not a contact channel.
export type ContactChannel = "email" | "phone" | "contact_page" | "contact_form" | "customer_service";
export type ContactAnchorKind = Exclude<ContactChannel, "contact_form"> | "faq_help" | "support";

// Haystacks are lowercased, accent-free and use spaces for "-" and "_".
const CONTACT = /\b(?:contact(?:eer|eren|ez|o|os|ar|us|pagina|formulier|gegevens|informatie|form|page|details)?|kontakt(?:formular|ieren|e|aufnahme)?|contatt(?:i|o|aci)|neem contact|get in touch)\b/;
const FAQ_HELP = /\b(?:faqs?|veel ?gestelde vragen|frequently asked|vragen en antwoorden|help|hulp|hilfe|aide|ayuda|aiuto|ajuda|kennisbank|knowledge ?base|helpcentrum|help ?cent(?:er|re))\b/;
const CUSTOMER_SERVICE = /\b(?:klantenservice|klanten service|customer (?:service|care)|kundenservice|kundendienst|service client|servicio al cliente|atencion al cliente|assistenza clienti|servizio clienti|apoio ao cliente)\b/;
const SUPPORT = /\b(?:support|helpdesk|assistenza|pomoc\w*)\b/;

export function classifyContactAnchor(href: string, haystack: string): ContactAnchorKind | null {
  const target = href.trim().toLowerCase();
  if (target.startsWith("mailto:")) return /^mailto:[^@\s]+@[^@\s]+\.[a-z]{2,}/.test(target) ? "email" : null;
  if (target.startsWith("tel:")) return target.replace(/\D/g, "").length >= 6 ? "phone" : null;
  // An explicit contact word wins, so /support/contact is still a contact page.
  if (CONTACT.test(haystack)) return "contact_page";
  if (FAQ_HELP.test(haystack)) return "faq_help";
  if (CUSTOMER_SERVICE.test(haystack)) return "customer_service";
  if (SUPPORT.test(haystack)) return "support";
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
