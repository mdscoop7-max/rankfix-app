// Evidence-quality rules from the October 2026 six-site review (allbirds.de,
// rijksoverheid.nl, discountoffice.nl, mollie.com/nl, transheroes.com/nl,
// sneakers.nl). Pure functions without imports so every decision is
// regression-tested in tests/evidence-quality.test.mjs. The scan route only adds
// wording and points around these results.
//
// Principle: judge quality, not mere presence. A heading that says "Home" or
// belongs to a cookie banner is not a page heading; a description that is a
// keyword list is not a summary; Product markup without a price is incomplete.

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const stripTags = (value: string) => value
  .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
  .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
  .replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;/gi, " ")
  .replace(/&amp;/gi, "&")
  .replace(/\s+/g, " ")
  .trim();

const normalizeText = (value: string) => value
  .normalize("NFD")
  .replace(/[̀-ͯ]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

/** A short quote around the first match, so a "found" result shows where it is. */
export function evidenceSnippet(text: string, pattern: RegExp, radius = 60): string | null {
  const flags = pattern.flags.replace("g", "");
  const match = new RegExp(pattern.source, flags).exec(text);
  if (!match || match.index === undefined) return null;
  const start = Math.max(0, match.index - radius);
  const end = Math.min(text.length, match.index + match[0].length + radius);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";
  return (prefix + text.slice(start, end).replace(/\s+/g, " ").trim() + suffix).slice(0, radius * 2 + 80);
}

// ---------------------------------------------------------------------------
// 1. H1 quality
// ---------------------------------------------------------------------------

const COOKIE_TEXT = /\b(?:cookie\w*|we use cookies|wij gebruiken cookies|deze website gebruikt cookies|wir verwenden cookies|nous utilisons des cookies|utilizziamo i cookie|utilizamos cookies|privacy[- ]?(?:instellingen|settings|voorkeuren|preferences)|datenschutz[- ]?einstellungen|consent|toestemming|your privacy|uw privacy|jouw privacy|ihre privatsph\w*|manage (?:your )?preferences|gegevensbescherming)\b/i;
const CONSENT_CONTAINER = /(?:id|class|data-[a-z-]+|aria-label)\s*=\s*["'][^"']*(?:cookie|consent|onetrust|ot-sdk|cookiebot|cybot|didomi|usercentrics|uc-banner|cookieyes|cky-|cmplz|complianz|iubenda|quantcast|qc-cmp|trustarc|truste|termly|osano|klaro|axeptio|sp_message|gdpr|cmp-|cc-window|cc-banner|cookie-law|cookie-notice|privacy-banner)[^"']*["']/i;
const GENERIC_H1 = /^(?:home|homepage|home page|hoofdpagina|startpagina|start|startseite|accueil|inicio|pagina iniziale|welkom|welcome|willkommen|bienvenue|benvenuti|bienvenido|index|menu|navigatie|navigation|main|untitled|titel|title|page|pagina|seite|logo|header)$/i;

// True when the element at `index` sits inside a still-open consent wrapper that
// starts at most ~4000 characters earlier.
function insideConsentContainer(html: string, index: number): boolean {
  const windowStart = Math.max(0, index - 4000);
  const before = html.slice(windowStart, index);
  const opener = new RegExp("<(div|section|aside|dialog|form|nav|header|footer)\\b[^>]*" + CONSENT_CONTAINER.source + "[^>]*>", "gi");
  let last: RegExpExecArray | null = null;
  for (let found = opener.exec(before); found; found = opener.exec(before)) last = found;
  if (!last) return false;
  const tag = last[1].toLowerCase();
  const segment = before.slice(last.index);
  const opens = (segment.match(new RegExp("<" + tag + "\\b", "gi")) || []).length;
  const closes = (segment.match(new RegExp("</" + tag + "\\s*>", "gi")) || []).length;
  return opens > closes;
}

export type H1Quality = {
  status: "pass" | "warning" | "missing";
  flag: null | "generic" | "multiple" | "missing" | "only_consent";
  /** Unique content H1 texts after removing consent-banner headings. */
  contentH1s: string[];
  /** H1 elements found in the HTML (including duplicates and consent banners). */
  rawCount: number;
  /** Identical H1 texts collapsed into one (responsive duplicates, hidden copies). */
  duplicatesCollapsed: number;
  excludedConsentH1s: string[];
  details: string;
};

/**
 * Extract H1s with enough context to tell a page heading from a cookie banner.
 * `brandTokens` are lower-case brand names (hostname label, og:site_name).
 */
export function assessH1Quality(html: string, brandTokens: string[] = []): H1Quality {
  const found: Array<{ text: string; consent: boolean }> = [];
  for (const match of html.matchAll(/<h1\b([^>]*)>([\s\S]*?)<\/h1>/gi)) {
    const text = stripTags(match[2] || "");
    if (!text) continue;
    const index = match.index ?? 0;
    const ownAttrs = match[1] || "";
    // Inside a consent container: the heading carries a consent class, an open
    // consent wrapper precedes it, or it is short cookie copy.
    const consent = CONSENT_CONTAINER.test(ownAttrs) || insideConsentContainer(html, index) || (COOKIE_TEXT.test(text) && text.split(/\s+/).length <= 14);
    found.push({ text, consent });
  }
  const excludedConsentH1s = found.filter((item) => item.consent).map((item) => item.text);
  const content = found.filter((item) => !item.consent);
  const unique = [...new Map(content.map((item) => [normalizeText(item.text), item.text])).values()];
  const duplicatesCollapsed = content.length - unique.length;
  const notes: string[] = [];
  if (duplicatesCollapsed > 0) notes.push(`${content.length} H1-elementen met ${unique.length} unieke tekst(en); identieke kopieën tellen als één.`);
  if (excludedConsentH1s.length) notes.push(`H1 in de cookiebanner/consentmelding telt niet als paginakop: "${excludedConsentH1s[0].slice(0, 80)}".`);
  const base = { rawCount: found.length, duplicatesCollapsed, excludedConsentH1s, contentH1s: unique };
  if (!unique.length) {
    return {
      ...base,
      status: "missing",
      flag: excludedConsentH1s.length ? "only_consent" : "missing",
      details: excludedConsentH1s.length
        ? `De enige H1 hoort bij de cookiebanner ("${excludedConsentH1s[0].slice(0, 80)}"); de pagina zelf heeft geen inhoudelijke H1.`
        : "Er is geen H1-heading gevonden.",
    };
  }
  const brands = new Set(brandTokens.map(normalizeText).filter(Boolean));
  const isGeneric = (value: string) => {
    const key = normalizeText(value);
    return GENERIC_H1.test(key) || brands.has(key) || brands.has(key.replace(/\s+/g, ""));
  };
  if (unique.length === 1) {
    if (isGeneric(unique[0])) {
      return { ...base, status: "warning", flag: "generic", details: [`De H1 is "${unique[0].slice(0, 80)}"; dat beschrijft het onderwerp van de pagina niet.`, ...notes].join(" ") };
    }
    return { ...base, status: "pass", flag: null, details: [`Eén inhoudelijke H1: "${unique[0].slice(0, 100)}".`, ...notes].join(" ") };
  }
  const genericOnes = unique.filter(isGeneric);
  return {
    ...base,
    status: "warning",
    flag: genericOnes.length === unique.length ? "generic" : "multiple",
    details: [`${unique.length} verschillende H1-teksten gevonden, bijvoorbeeld ${unique.slice(0, 3).map((value) => `"${value.slice(0, 60)}"`).join(", ")}. Eén duidelijke H1 maakt het onderwerp van de pagina eenduidig.`, ...notes].join(" "),
  };
}

// ---------------------------------------------------------------------------
// 1. Meta description quality: a real sentence, not a keyword list or a cut-off
// ---------------------------------------------------------------------------

export type DescriptionQuality = { flag: null | "keyword_list" | "truncated"; details: string | null };

const DANGLING_WORD = /\b(?:en|of|de|het|een|met|voor|van|in|op|and|or|the|a|an|with|for|of|to|und|oder|der|die|das|mit|für|et|ou|le|la|les|avec|pour|e|o|il|con|per|y|el|los|las|con|para)$/i;

export function assessDescriptionQuality(description: string): DescriptionQuality {
  const value = description.trim();
  if (!value) return { flag: null, details: null };
  if (/(?:\.\.\.|…)$/.test(value) || /[,;:\-–|/]$/.test(value) || (value.length >= 60 && DANGLING_WORD.test(value))) {
    return { flag: "truncated", details: `De description lijkt afgekapt: "…${value.slice(-40)}". Een afgebroken zin oogt onaf in zoekresultaten.` };
  }
  const segments = value.split(/\s*[,|;·•]\s*|\s+[-–—]\s+/).map((part) => part.trim()).filter(Boolean);
  const words = value.split(/\s+/).filter(Boolean);
  const averageSegmentWords = segments.length ? words.length / segments.length : words.length;
  const hasSentencePunctuation = /[.!?](?:\s|$)/.test(value);
  if (segments.length >= 5 && averageSegmentWords <= 3 && !hasSentencePunctuation) {
    return { flag: "keyword_list", details: `De description is een opsomming van ${segments.length} losse termen ("${segments.slice(0, 4).join(", ")}…") in plaats van een zin die de pagina samenvat.` };
  }
  return { flag: null, details: null };
}

// ---------------------------------------------------------------------------
// 1. Product structured data: price and currency are required, not optional
// ---------------------------------------------------------------------------

export type ProductOfferInput = {
  name: string;
  hasImage: boolean;
  offers: Array<{ price: unknown; currency: string; availability: string }>;
};

export function assessProductSchemaCompleteness(products: ProductOfferInput[]): { complete: boolean; missing: string[]; products: number } {
  if (!products.length) return { complete: false, missing: ["Product"], products: 0 };
  const hasPrice = (value: unknown) => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(String(value).replace(",", ".")));
  const best = products.map((product) => {
    const offerOk = product.offers.some((offer) => hasPrice(offer.price) && /^[A-Z]{3}$/.test(offer.currency));
    const missing = [
      !product.name ? "naam" : null,
      !product.hasImage ? "afbeelding" : null,
      !product.offers.length ? "offers" : null,
      product.offers.length && !product.offers.some((offer) => hasPrice(offer.price)) ? "prijs" : null,
      product.offers.length && !product.offers.some((offer) => /^[A-Z]{3}$/.test(offer.currency)) ? "valuta" : null,
      product.offers.length && !product.offers.some((offer) => offer.availability) ? "beschikbaarheid" : null,
    ].filter(Boolean) as string[];
    return { offerOk, missing };
  }).sort((a, b) => a.missing.length - b.missing.length)[0];
  return { complete: best.offerOk && best.missing.length === 0, missing: best.missing, products: products.length };
}

// ---------------------------------------------------------------------------
// 2. Visible facts: prices, reference/old prices, payment methods, reviews
// ---------------------------------------------------------------------------

const PRICE_PATTERNS: RegExp[] = [
  /(?:€|EUR)\s?\d{1,3}(?:[.\s]\d{3})*(?:,\d{2}|,-{1,2}|\.\d{2})?(?!\d)/gi,
  /\b\d{1,3}(?:[.\s]\d{3})*(?:,\d{2}|,-{1,2}|\.\d{2})?\s?(?:€|EUR\b)/gi,
  /(?:£|\$|CHF|GBP|USD)\s?\d{1,3}(?:[,.\s]\d{3})*(?:[.,]\d{2})?(?!\d)/gi,
  /\b\d{1,4},-(?=\s|$)/g,
];

export type VisiblePriceEvidence = {
  count: number;
  examples: string[];
  notation: "comma_decimal" | "dot_decimal" | "whole" | "mixed" | "none";
  referencePrices: string[];
  discountExamples: string[];
};

const REFERENCE_CLASS = /(?:compare[-_]?at|old[-_]?price|was[-_]?price|price[-_]?(?:old|was|before|regular|compare|strike|crossed)|original[-_]?price|regular[-_]?price|list[-_]?price|line-through|strikethrough|crossed[-_]?out|price--compare|price__compare|price-item--regular|rrp|uvp|msrp|streichpreis|alter[-_]?preis)/i;

export function findVisiblePrices(html: string, text: string): VisiblePriceEvidence {
  const examples = [...new Set(PRICE_PATTERNS.flatMap((pattern) => text.match(pattern) || []).map((value) => value.trim()))];
  const comma = examples.filter((value) => /,\d{2}\b|,-/.test(value)).length;
  const dot = examples.filter((value) => /\.\d{2}(?!\d)/.test(value) && !/,\d{2}/.test(value)).length;
  const whole = examples.length - comma - dot;
  const notation = !examples.length ? "none" : comma && dot ? "mixed" : comma ? "comma_decimal" : dot ? "dot_decimal" : whole ? "whole" : "none";
  const referencePrices: string[] = [];
  // <del>/<s>/<strike> around a price, and classes/attributes that mark an old price.
  for (const match of html.matchAll(/<(del|s|strike)\b[^>]*>([\s\S]{0,200}?)<\/\1>/gi)) {
    const inner = stripTags(match[2] || "");
    if (/\d/.test(inner) && /(?:€|EUR|£|\$|\d,\d{2}|\d,-)/i.test(inner)) referencePrices.push(inner.slice(0, 40));
  }
  for (const match of html.matchAll(/<([a-z0-9]+)\b([^>]*)>([\s\S]{0,240}?)<\/\1>/gi)) {
    if (!REFERENCE_CLASS.test(match[2] || "")) continue;
    const inner = stripTags(match[3] || "");
    if (/\d/.test(inner) && /(?:€|EUR|£|\$|\d,\d{2}|\d\.\d{2}|\d,-)/i.test(inner)) referencePrices.push(inner.slice(0, 40));
  }
  for (const match of text.matchAll(/(?:\b(?:van|was|adviesprijs|oude prijs|vanaf-prijs|previous price|was price|regular price|rrp|uvp|statt|vorher|ursprünglich|prix barré|prix avant|prezzo precedente|precio anterior)\b\s*:?\s*)((?:€|EUR|£|\$)\s?\d[\d.,-]*|\d[\d.,]*\s?(?:€|EUR))/gi)) {
    referencePrices.push(match[0].trim().slice(0, 40));
  }
  const discountExamples = [...new Set(text.match(/(?:[-−]\s?\d{1,2}\s?%|\b\d{1,2}\s?%\s*(?:korting|off|discount|rabatt|remise|sconto|descuento|günstiger)|\b(?:sale|korting|uitverkoop|rabatt|reduziert|soldes|saldi|rebajas)\b)/gi) || [])].slice(0, 5);
  return {
    count: examples.length,
    examples: examples.slice(0, 6),
    notation,
    referencePrices: [...new Set(referencePrices)].slice(0, 6),
    discountExamples,
  };
}

const PAYMENT_METHODS: Array<[string, RegExp]> = [
  ["iDEAL", /\bideal\b/i],
  ["Visa", /\bvisa\b/i],
  ["Mastercard", /\bmaster[- ]?card\b/i],
  ["Maestro", /\bmaestro\b/i],
  ["American Express", /\b(?:american[- ]express|amex)\b/i],
  ["Bancontact", /\bbancontact\b/i],
  ["PayPal", /\bpay[- ]?pal\b/i],
  ["Klarna", /\bklarna\b/i],
  ["Apple Pay", /\bapple[- ]?pay\b/i],
  ["Google Pay", /\bgoogle[- ]?pay\b/i],
  ["Shop Pay", /\bshop[- ]?pay\b/i],
  ["Sofort", /\bsofort(?:überweisung|ueberweisung)?\b/i],
  ["Giropay", /\bgiropay\b/i],
  ["EPS", /\beps[- ]?(?:überweisung|ueberweisung|payment)\b/i],
  ["SEPA", /\bsepa\b/i],
  ["Kauf auf Rechnung", /\b(?:kauf auf rechnung|rechnungskauf|auf rechnung)\b/i],
  ["Vorkasse", /\bvorkasse\b/i],
  ["Achteraf betalen", /\b(?:achteraf betalen|afterpay|riverty|in3|billink)\b/i],
  ["Przelewy24", /\bprzelewy\s?24\b/i],
  ["TWINT", /\btwint\b/i],
  ["Carte Bancaire", /\bcarte[s]? bancaire[s]?\b/i],
  ["Cadeaubon", /\b(?:cadeaubon|cadeaukaart|gift ?card|gutschein)\b/i],
];

/** Payment methods named in visible text or shown as icons (alt, title, aria-label, file names, classes). */
export function findPaymentMethods(html: string, text: string): string[] {
  const iconText = [
    ...[...html.matchAll(/<img\b[^>]*>/gi)].map((match) => match[0]),
    ...[...html.matchAll(/<svg\b[^>]*>[\s\S]{0,400}?<\/svg>/gi)].map((match) => match[0].slice(0, 600)),
    ...[...html.matchAll(/\b(?:aria-label|title|alt|data-payment[-\w]*|class)\s*=\s*["']([^"']{2,200})["']/gi)]
      .map((match) => match[1])
      .filter((value) => /pay|betaal|zahl|paiement|pago|card|icon|logo|visa|ideal|klarna|mastercard|amex|sofort|bancontact|giropay/i.test(value)),
  ].join(" ").replace(/[-_/.]+/g, " ");
  const haystack = `${text} ${iconText}`;
  return PAYMENT_METHODS.filter(([, pattern]) => pattern.test(haystack)).map(([name]) => name);
}

const REVIEW_PLATFORMS: Array<[string, RegExp]> = [
  ["Trustpilot", /trustpilot/i],
  ["Kiyoh", /kiyoh/i],
  ["Feedback Company", /feedbackcompany|feedback company/i],
  ["Trusted Shops", /trustedshops|trusted shops/i],
  ["eKomi", /ekomi/i],
  ["Google reviews", /google reviews|google-reviews|googlereviews/i],
  ["Reviews.io", /reviews\.io/i],
  ["Yotpo", /yotpo/i],
  ["Judge.me", /judge\.me|judgeme/i],
  ["Okendo", /okendo/i],
  ["Stamped", /stamped\.io/i],
  ["Feefo", /feefo/i],
  ["Bazaarvoice", /bazaarvoice/i],
  ["Klantenvertellen", /klantenvertellen/i],
  ["Webwinkelkeur", /webwinkelkeur/i],
  ["Thuiswinkel Waarborg", /thuiswinkel/i],
];

export type ReviewEvidence = { platforms: string[]; aggregateRating: boolean; ratingText: string | null; found: boolean };

export function findReviewEvidence(html: string, text: string, schemaTypes: string[] = []): ReviewEvidence {
  const platforms = REVIEW_PLATFORMS.filter(([, pattern]) => pattern.test(html)).map(([name]) => name);
  const types = new Set(schemaTypes.map((type) => type.toLowerCase()));
  const aggregateRating = types.has("aggregaterating") || /"aggregateRating"\s*:/i.test(html);
  const ratingMatch = text.match(/\b(?:[1-5](?:[.,]\d)?\s?(?:\/|van|von|sur|su|de|out of)\s?(?:5|10)\b|[1-9](?:[.,]\d)?\s?(?:sterren|stars|sterne|étoiles|stelle|estrellas)\b|\d[\d.]*\s+(?:reviews|beoordelingen|bewertungen|avis|recensioni|reseñas)\b)/i);
  const ratingText = ratingMatch ? ratingMatch[0] : null;
  return { platforms, aggregateRating, ratingText, found: Boolean(platforms.length || aggregateRating || ratingText) };
}

// ---------------------------------------------------------------------------
// 2/7. Forms, cookie banner and scripts that may only exist after JavaScript
// ---------------------------------------------------------------------------

const FORM_EMBEDS: Array<[string, RegExp]> = [
  ["HubSpot", /hsforms\.(?:net|com)|hbspt\.forms|hs-form/i],
  ["Typeform", /typeform\.com|data-tf-widget|data-tf-live/i],
  ["Jotform", /jotform\.(?:com|eu)/i],
  ["Google Forms", /docs\.google\.com\/forms|forms\.gle/i],
  ["Microsoft Forms", /forms\.office\.com|forms\.microsoft\.com/i],
  ["Tally", /tally\.so/i],
  ["Formstack", /formstack\.com/i],
  ["Cognito Forms", /cognitoforms\.com/i],
  ["Wufoo", /wufoo\.com/i],
  ["Paperform", /paperform\.co/i],
  ["Calendly", /calendly\.com/i],
  ["Contact Form 7", /wpcf7/i],
  ["WPForms", /wpforms/i],
  ["Gravity Forms", /gform_wrapper|gravityforms/i],
  ["Elementor Forms", /elementor-form/i],
  ["Ninja Forms", /ninja-forms|nf-form/i],
  ["Mailchimp", /mc-embedded-subscribe|list-manage\.com/i],
  ["Klaviyo", /klaviyo-form|static\.klaviyo\.com/i],
  ["Zoho Forms", /forms\.zohopublic|zoho\.com\/forms/i],
  ["Pipedrive", /webforms\.pipedrive\.com/i],
];

export type FormEvidence = {
  nativeForms: number;
  inputControls: number;
  embeddedProviders: string[];
  roleForms: number;
  found: boolean;
};

export function findFormEvidence(html: string): FormEvidence {
  const nativeForms = (html.match(/<form\b/gi) || []).length;
  const inputControls = [...html.matchAll(/<(input|select|textarea)\b([^>]*)>/gi)]
    .filter((match) => !/\btype\s*=\s*["']?(?:hidden|submit|button|reset|image)\b/i.test(match[2] || "")).length;
  const roleForms = (html.match(/\brole\s*=\s*["']form["']/gi) || []).length;
  const embeddedProviders = FORM_EMBEDS.filter(([, pattern]) => pattern.test(html)).map(([name]) => name);
  return { nativeForms, inputControls, embeddedProviders, roleForms, found: nativeForms > 0 || roleForms > 0 || embeddedProviders.length > 0 };
}

const CONSENT_PROVIDERS: Array<[string, RegExp]> = [
  ["OneTrust", /onetrust|optanon|cookielaw\.org/i],
  ["Cookiebot", /cookiebot|consent\.cookiebot/i],
  ["Didomi", /didomi/i],
  ["Usercentrics", /usercentrics/i],
  ["CookieYes", /cookieyes|cky-consent/i],
  ["Iubenda", /iubenda/i],
  ["Quantcast Choice", /quantcast\.mgr|qc-cmp/i],
  ["TrustArc", /trustarc|truste\.com/i],
  ["Termly", /termly\.io/i],
  ["Complianz", /complianz|cmplz/i],
  ["CookieLaw / GDPR Cookie Consent", /cookie-law-info|cli_settings/i],
  ["Osano", /osano/i],
  ["Klaro", /klaro/i],
  ["consentmanager", /consentmanager\.net/i],
  ["Axeptio", /axeptio/i],
  ["Sourcepoint", /sourcepoint|sp_message/i],
  ["Shopify Customer Privacy", /shopify-privacy-banner|customerPrivacy/i],
  ["CookieFirst", /cookiefirst/i],
  ["Borlabs", /borlabs-cookie/i],
];

export function findConsentEvidence(html: string): { providers: string[]; bannerMarkup: boolean } {
  const providers = CONSENT_PROVIDERS.filter(([, pattern]) => pattern.test(html)).map(([name]) => name);
  const bannerMarkup = CONSENT_CONTAINER.test(html);
  return { providers, bannerMarkup };
}

/** Google Tag Manager, including first-party/server-side loaders (gtm.start). */
export function findTagManagerEvidence(html: string): { containers: string[]; loader: boolean } {
  const containers = [...new Set((html.match(/\bGTM-[A-Z0-9]{4,}\b/g) || []))];
  const loader = /googletagmanager\.com\/gtm\.js|\/gtm\.js\?id=|['"]gtm\.start['"]|\bgtm\.start\b/i.test(html);
  return { containers, loader };
}

// ---------------------------------------------------------------------------
// 2. Legal links: privacy and terms may live in a PDF or on another host
// ---------------------------------------------------------------------------

export const LEGAL_LEXICON = {
  // Compounds count: privacyverklaring, privacystatement, Datenschutzerklärung,
  // algemene/leverings-voorwaarden, AGB, CGV, …
  privacy: /(?:\bprivacy\w*|privacyverklaring|privacystatement|\bdatenschutz\w*|\bconfidentialit\w*|\bvie privee\b|\bprivacidad\b|\briservatezza\b|\bprivatnost\w*|\bzasebnost\w*|\bprivacidade\b|\brgpd\b|\bavg\b|\bgdpr\b)/i,
  cookies: /\b(?:cookie\w*|piskotk\w*|kolacic\w*|galleta\w*|biscott\w*)\b/i,
  terms: /(?:\w*voorwaarden|\bterms\b|terms of (?:service|use|sale)|conditions? (?:generales|of sale)|\bconditions\b|\bagb\b|allgemeine geschaftsbedingungen|geschaftsbedingungen|\bcgv\b|\bcgu\b|condiciones|condizioni|\btermos\b|uvjet\w*|pogoj\w*|gebruiksvoorwaarden|nutzungsbedingungen)/i,
};

// Provider policies (an embedded map, video or payment widget) are not the
// scanned business's own legal documents.
const THIRD_PARTY_POLICY_HOST = /(?:^|\.)(?:google\.[a-z.]+|policies\.google\.com|youtube\.com|facebook\.com|meta\.com|instagram\.com|twitter\.com|x\.com|linkedin\.com|tiktok\.com|pinterest\.[a-z.]+|apple\.com|microsoft\.com|vimeo\.com|paypal\.com|klarna\.com|mollie\.com|stripe\.com|adyen\.com|shopify\.com|wix\.com|squarespace\.com|wordpress\.(?:com|org)|hubspot\.com|mailchimp\.com|recaptcha\.net|gstatic\.com|cloudflare\.com|trustpilot\.com|kiyoh\.com|onetrust\.com|cookiebot\.com|usercentrics\.(?:eu|com)|didomi\.io)$/i;

function registrableHost(host: string): string {
  const parts = host.toLowerCase().replace(/^www\./, "").split(".").filter(Boolean);
  if (parts.length <= 2) return parts.join(".");
  const secondLevel = /^(?:co|com|org|net|gov|ac|edu)$/.test(parts[parts.length - 2]);
  return parts.slice(secondLevel ? -3 : -2).join(".");
}

/** example.nl, www.example.nl and shop.example.nl are the same site; example.com is not. */
export function sameRegistrableSite(hostA: string, hostB: string): boolean {
  return Boolean(hostA && hostB) && registrableHost(hostA) === registrableHost(hostB);
}

export type LegalLinkKind ="first_party" | "first_party_pdf" | "external_pdf" | "external_host";

/**
 * Accept a legal link when it is first-party, a PDF, or another host that is not a
 * known third-party provider. `pageUrl` is the scanned page; `scannedSite` the
 * registrable site of the scan. Returns null when the link does not count.
 */
export function classifyLegalLink(href: string, pageUrl: string): LegalLinkKind | null {
  let target: URL;
  let page: URL;
  if (!href.trim()) return null;
  try { target = new URL(href, pageUrl); page = new URL(pageUrl); } catch { return null; }
  if (!/^https?:$/.test(target.protocol)) return null;
  const isPdf = /\.pdf(?:$|[?#])/i.test(target.pathname + target.search);
  const sameSite = registrableHost(target.hostname) === registrableHost(page.hostname);
  if (sameSite) return isPdf ? "first_party_pdf" : "first_party";
  if (THIRD_PARTY_POLICY_HOST.test(target.hostname.toLowerCase())) {
    // A PDF hosted on a CDN (cdn.shopify.com, …) is still the shop's own document.
    return isPdf && /cdn|files|assets|static|storage|blob/i.test(target.hostname) ? "external_pdf" : null;
  }
  return isPdf ? "external_pdf" : "external_host";
}

// ---------------------------------------------------------------------------
// 3/4. Severity
// ---------------------------------------------------------------------------

/** A canonical to another registrable domain hands ranking to that domain. */
export function canonicalCrossDomainRisk(canonicalHref: string, pageUrl: string): { crossDomain: boolean; canonicalHost: string | null } {
  try {
    const canonical = new URL(canonicalHref, pageUrl);
    const page = new URL(pageUrl);
    if (!/^https?:$/.test(canonical.protocol)) return { crossDomain: false, canonicalHost: null };
    const crossDomain = registrableHost(canonical.hostname) !== registrableHost(page.hostname);
    return { crossDomain, canonicalHost: canonical.hostname };
  } catch {
    return { crossDomain: false, canonicalHost: null };
  }
}

/** HTTP statuses that say "you are blocked", not "this page is broken". */
export function isBlockingStatus(status: number | null | undefined): boolean {
  return status === 401 || status === 403 || status === 405 || status === 418 || status === 429 || status === 451 || status === 503 || status === 999;
}

/** A proven broken destination: gone or a server error, never a block. */
export function isBrokenStatus(status: number | null | undefined): boolean {
  if (status === null || status === undefined) return false;
  if (isBlockingStatus(status)) return false;
  return status === 404 || status === 410 || status >= 500;
}

// ---------------------------------------------------------------------------
// 5. "Found" needs proof: FAQ, audience, regulatory information
// ---------------------------------------------------------------------------

export type FaqEvidence = { found: boolean; pairs: Array<{ question: string; answer: string }>; source: "details" | "headings" | "schema" | null; reason: string };

const QUESTION_WORD = /^(?:hoe|wat|waar|wanneer|waarom|welke|wie|kan|kun|mag|moet|is|zijn|heb|hebben|krijg|how|what|when|where|why|which|who|can|do|does|is|are|will|should|wie|was|wann|wo|warum|welche|kann|muss|gibt|comment|pourquoi|quand|quel|quelle|est-ce|como|cómo|qué|cuándo|dónde|por qué|come|cosa|quando|dove|perché)\b/i;
const FAQ_CONTEXT = /\b(?:faq|f\.a\.q|veelgestelde vragen|veel gestelde vragen|vragen en antwoorden|frequently asked questions|häufig gestellte fragen|häufige fragen|questions fréquentes|foire aux questions|domande frequenti|preguntas frecuentes)\b/i;

/**
 * FAQ content needs real question/answer pairs. A heading ending in "?" with an
 * answer counts; a heading that only starts with a question word ("Wat doet de
 * overheid") counts only inside an FAQ section. One pair alone is not an FAQ
 * unless it sits under an explicit FAQ heading.
 */
export function findFaqEvidence(html: string, hasFaqSchema = false): FaqEvidence {
  const visible = (value: string) => stripTags(value);
  const faqContext = FAQ_CONTEXT.test(stripTags(html).slice(0, 400000));
  const pairs: Array<{ question: string; answer: string }> = [];
  for (const match of html.matchAll(/<details\b[^>]*>\s*<summary\b[^>]*>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/gi)) {
    const question = visible(match[1] || "");
    const answer = visible(match[2] || "");
    const isQuestion = /\?\s*$/.test(question) || (faqContext && QUESTION_WORD.test(question));
    if (isQuestion && answer.length >= 12) pairs.push({ question: question.slice(0, 140), answer: answer.slice(0, 120) });
  }
  const detailsPairs = pairs.length;
  for (const match of html.matchAll(/<h[2-6]\b[^>]*>([\s\S]*?)<\/h[2-6]>\s*(?:<div[^>]*>\s*)?<(?:p|div)\b[^>]*>([\s\S]*?)<\/(?:p|div)>/gi)) {
    const question = visible(match[1] || "");
    const answer = visible(match[2] || "");
    const isQuestion = /\?\s*$/.test(question) || (faqContext && QUESTION_WORD.test(question));
    if (isQuestion && answer.length >= 12) pairs.push({ question: question.slice(0, 140), answer: answer.slice(0, 120) });
  }
  const unique = [...new Map(pairs.map((pair) => [pair.question.toLowerCase(), pair])).values()];
  const enough = unique.length >= 2 || (unique.length === 1 && faqContext);
  if (enough) {
    return { found: true, pairs: unique.slice(0, 3), source: detailsPairs ? "details" : "headings", reason: `${unique.length} vraag-en-antwoordpaar/paren gevonden, bijvoorbeeld "${unique[0].question}"` };
  }
  if (hasFaqSchema) {
    return { found: true, pairs: [], source: "schema", reason: "FAQPage structured data gevonden; de vragen staan in JSON-LD, niet als zichtbare sectie in de gescande HTML." };
  }
  return { found: false, pairs: unique, source: null, reason: unique.length ? `Slechts één losse vraagkop zonder FAQ-sectie ("${unique[0].question}"); dat is geen FAQ.` : "Geen vraag-en-antwoordparen gevonden." };
}

const AUDIENCE = /\b(?:voor (?:bedrijven|ondernemers|teams|organisaties|webshops|webwinkels|retailers|zzp'?ers|mkb|het mkb|starters|startups|enterprises?|platforms|marketplaces|developers|ontwikkelaars|particulieren|consumenten|scholen|zorgverleners|gemeenten)|(?:mkb|zzp|b2b|enterprise)[- ](?:bedrijven|klanten|oplossing|plan)|for (?:businesses|business|teams|enterprises?|startups|merchants|retailers|developers|platforms|marketplaces|small businesses|smes|agencies|online stores)|für (?:unternehmen|händler|teams|entwickler|onlineshops|kmu)|pour (?:les )?(?:entreprises|commerçants|marchands|équipes|développeurs)|per (?:aziende|imprese|negozi online)|para (?:empresas|comercios|negocios)|ondernemers|merchants|retailers|händler)\b/i;

export function findAudienceEvidence(text: string): string | null {
  return evidenceSnippet(text, AUDIENCE, 50);
}

const FINTECH_IDENTITY = /\b(?:betaalprovider|payment service provider|payment provider|betaaloplossing(?:en)?|betalingen ontvangen|betaalmethoden (?:toevoegen|integreren|accepteren)|accept payments|online payments|payment processing|betaalverwerking|zahlungsanbieter|zahlungsdienstleister|prestataire de paiement|fornitore di pagamenti|proveedor de pagos|e-money|elektronisch geld|betaalinstelling|payment institution|acquirer|acquiring|psp)\b/gi;
const REGULATORY = /\b(?:de nederlandsche bank|dnb|autoriteit financi[eë]le markten|afm|bafin|fca|financial conduct authority|banque de france|acpr|consob|cnmv|cssf|central bank of ireland|vergunning(?:houder)?|licen[cs]ed|licen[cs]e(?:d)? (?:as|by|under)|regulated by|under (?:the )?supervision|onder toezicht|toezichthouder|betaalinstelling|elektronischgeldinstelling|elektronisch geld instelling|e-money institution|electronic money institution|payment institution|zahlungsinstitut|e-geld-institut|établissement de paiement|istituto di pagamento|entidad de pago|registered with|registratienummer|wft|psd2)\b/i;

/** Fintech/payment identity needs several independent mentions. */
export function fintechIdentity(text: string): { identified: boolean; hits: string[] } {
  const hits = [...new Set((text.match(FINTECH_IDENTITY) || []).map((value) => value.toLowerCase()))];
  return { identified: hits.length >= 2, hits: hits.slice(0, 6) };
}

export function findRegulatoryEvidence(text: string): string | null {
  return evidenceSnippet(text, REGULATORY, 60);
}

// ---------------------------------------------------------------------------
// 6/9. Headline score with the representative sample, uniform report metadata
// ---------------------------------------------------------------------------

/**
 * The headline blends the scanned page with the representative sample, so a site
 * whose other pages are weaker cannot hide behind one strong page. The sample
 * weighs more as it covers more pages, up to 30%.
 */
export function blendHeadlineScore(pageScore: number, sampleScore: number | null, sampledPages: number): { score: number; sampleWeight: number } {
  if (sampleScore === null || !Number.isFinite(sampleScore) || sampledPages < 1) return { score: pageScore, sampleWeight: 0 };
  const sampleWeight = sampledPages >= 10 ? 0.3 : sampledPages >= 5 ? 0.25 : sampledPages >= 3 ? 0.2 : 0.1;
  return { score: Math.round(pageScore * (1 - sampleWeight) + sampleScore * sampleWeight), sampleWeight };
}

export const RANKFIX_BOT_INFO_PATH = "/bot";

export function rankfixUserAgents(siteUrl: string) {
  const infoUrl = siteUrl.replace(/\/+$/, "") + RANKFIX_BOT_INFO_PATH;
  return {
    bot: `RankFixBot/2.1 (+${infoUrl})`,
    browser: `RankFixBrowser/1.0 (+${infoUrl})`,
    infoUrl,
  };
}

/** Customer copy for a scan the website refused. Never presented as an SEO finding. */
export function blockedScanMessage(status: number, language: string, agents: { bot: string; infoUrl: string }): string {
  const nl: Record<string, string> = {
    "403": "De website weigert de scan (HTTP 403, toegang geweigerd).",
    "418": "De website blokkeert geautomatiseerde bezoekers (HTTP 418).",
    "429": "De website beperkt het aantal verzoeken (HTTP 429, te veel verzoeken).",
    "401": "De website vraagt om in te loggen (HTTP 401).",
    "451": "De website is om juridische redenen niet beschikbaar voor deze scan (HTTP 451).",
    "503": "De website is tijdelijk niet beschikbaar of blokkeert de scan (HTTP 503).",
  };
  const en: Record<string, string> = {
    "403": "The website refused the scan (HTTP 403, forbidden).",
    "418": "The website blocks automated visitors (HTTP 418).",
    "429": "The website is rate-limiting requests (HTTP 429, too many requests).",
    "401": "The website requires a login (HTTP 401).",
    "451": "The website is unavailable to this scan for legal reasons (HTTP 451).",
    "503": "The website is temporarily unavailable or blocking the scan (HTTP 503).",
  };
  const key = String(status);
  if (language === "nl") {
    return `${nl[key] || `De website gaf HTTP ${status} terug.`} Er is daarom geen score berekend; dit is geen SEO-fout van de website. RankFix scant als ${agents.bot}. Vraag de beheerder deze user-agent toe te staan (uitleg: ${agents.infoUrl}) en scan opnieuw.`;
  }
  return `${en[key] || `The website returned HTTP ${status}.`} No score was calculated; this is not an SEO error on the website. RankFix scans as ${agents.bot}. Ask the site owner to allow this user agent (details: ${agents.infoUrl}) and scan again.`;
}

// ---------------------------------------------------------------------------
// 10. Title: short titles are fine; brand-only, doubled brand and generic are not
// ---------------------------------------------------------------------------

const GENERIC_TITLE = /^(?:home|homepage|home page|hoofdpagina|startpagina|startseite|accueil|inicio|index|untitled|untitled document|nieuwe pagina|new page|page|pagina|document|welkom|welcome)$/i;

export function isGenericTitle(title: string): boolean {
  return GENERIC_TITLE.test(normalizeText(title));
}
