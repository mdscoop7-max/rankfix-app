// Cookie-information evidence beyond a footer link. A site can inform about
// cookies through a consent management platform (CMP), a consent banner or a
// "cookie settings" control, or inside its privacy statement. Not finding a
// cookie link is therefore never proof that cookie information is missing.
// This is detection of website signals only, never a legal compliance verdict.
// Pure: unit-tested in tests/cookie-evidence.test.mjs.

// Generic CMP / consent-tool fingerprints (vendor scripts, globals, markup).
// These identify consent software, not any scanned website or brand.
const CMP_FINGERPRINTS: Array<[string, RegExp]> = [
  ["Cookiebot", /consent\.cookiebot\.(?:com|eu)|\bCookiebot\b|CookieConsent\.(?:renew|show)/i],
  ["OneTrust", /cdn\.cookielaw\.org|optanon|onetrust/i],
  ["Didomi", /sdk\.privacy-center\.org|\bdidomi\b/i],
  ["Usercentrics", /usercentrics/i],
  ["CookieYes", /cookieyes|cdn-cookieyes\.com/i],
  ["Complianz", /\bcmplz[-_]|complianz/i],
  ["CookieLawInfo", /cookie-law-info|\bcli-bar\b/i],
  ["iubenda", /iubenda/i],
  ["Quantcast Choice", /quantcast\.mgr\.consensu|quantcast-choice|\bqc-cmp/i],
  ["consentmanager", /consentmanager\.(?:net|de)|cmp\.consentmanager/i],
  ["Klaro", /\bklaro(?:\.js|Config)\b/i],
  ["Borlabs Cookie", /borlabs-cookie/i],
  ["Osano", /\bosano\b/i],
  ["Termly", /app\.termly\.io|termly-code-snippet/i],
  ["TrustArc", /consent\.trustarc\.com|truste-consent/i],
  ["Axeptio", /\baxeptio\b/i],
  ["Sourcepoint", /sourcepoint|sp-prod\.net/i],
  ["Google Funding Choices", /fundingchoicesmessages\.google\.com/i],
  ["CookieFirst", /cookiefirst/i],
  ["Cookie Script", /cookie-script\.com/i],
  ["tarteaucitron", /tarteaucitron/i],
  ["Real Cookie Banner", /real-cookie-banner/i],
  ["Cookie Notice", /\bcn-notice\b|cookie-notice-container|cookie-notice-js/i],
  ["GDPR Cookie Compliance", /moove_gdpr|gdpr-cookie-compliance/i],
  ["IAB TCF", /__tcfapi|__cmp\(/],
];

// Consent banner markup or a consent control (button/link/attribute) that
// names cookies, in any of the supported languages.
const CONSENT_MARKUP = /<[^>]+(?:id|class)\s*=\s*["'][^"']*(?:cookie[-_]?(?:banner|consent|notice|bar|popup|wall|melding|settings)|consent[-_]?(?:banner|manager|popup|modal)|cookiebanner|cookiebar|cookieconsent)[^"']*["']/i;
const COOKIE_CONTROL = /<(?:button|a|div|span)\b[^>]*(?:aria-label|title|data-cc|data-consent)\s*=\s*["'][^"']*\b(?:cookie\w*)[^"']*["'][^>]*>|<button\b[^>]*>[^<]{0,80}\b(?:cookie\w*|cookie-instellingen|cookievoorkeuren|cookie settings|cookie preferences|cookie-einstellungen|paramètres des cookies|preferenze cookie|configuración de cookies)\b/i;

export type CookieInfoEvidence = {
  found: boolean;
  source: "link" | "cmp" | "banner" | "control" | "privacy_statement" | null;
  detail: string | null;
};

export function detectCookieInformation(input: { html: string; hasCookieLink: boolean; cookieLinkDetail?: string | null; privacyStatementMentionsCookies?: boolean }): CookieInfoEvidence {
  if (input.hasCookieLink) return { found: true, source: "link", detail: input.cookieLinkDetail || "cookielink" };
  const html = input.html.slice(0, 3_000_000);
  const cmp = CMP_FINGERPRINTS.find(([, pattern]) => pattern.test(html));
  if (cmp) return { found: true, source: "cmp", detail: `consentplatform ${cmp[0]}` };
  if (CONSENT_MARKUP.test(html)) return { found: true, source: "banner", detail: "cookie-/consentbanner in de HTML" };
  if (COOKIE_CONTROL.test(html)) return { found: true, source: "control", detail: "knop of label voor cookie-instellingen" };
  if (input.privacyStatementMentionsCookies) return { found: true, source: "privacy_statement", detail: "cookie-informatie in de privacyverklaring" };
  return { found: false, source: null, detail: null };
}
