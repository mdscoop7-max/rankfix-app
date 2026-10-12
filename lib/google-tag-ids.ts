// Google tag ID recognition (GA4 measurement IDs, Google Ads IDs, GTM
// containers), shared by every scan. A tag ID only counts when it:
//   1. has the exact upper-case shape Google issues (G-…, AW-…, GTM-…), and
//   2. sits in a tag context: a quoted JS/JSON string value, an attribute value
//      or a URL parameter (…?id=G-…). Never loose visible text.
// CSS classes and names such as "g-recaptcha", "gtm-banner" or a product name
// in body copy are therefore never reported as tracking IDs.
// Pure: unit-tested in tests/google-tag-ids.test.mjs.

// G- followed by 6–12 upper-case alphanumerics, at least one digit.
export const GA4_MEASUREMENT_ID = /^G-(?=[A-Z0-9]*\d)[A-Z0-9]{6,12}$/;
export const GOOGLE_ADS_ID = /^AW-\d{6,12}$/;
export const GTM_CONTAINER_ID = /^GTM-[A-Z0-9]{4,10}$/;

export function isValidGa4MeasurementId(value: string): boolean {
  return GA4_MEASUREMENT_ID.test(value);
}

// Start: directly after a quote, "=" (attribute or URL parameter), or the ";"
// of an HTML entity such as &quot;. End: the ID token must stop there.
const CONTEXT_BEFORE = "(?<=[\"'`=;])";
const TOKEN_END = "(?![A-Za-z0-9_-])";

function idsInContext(html: string, body: string, valid: RegExp): string[] {
  const pattern = new RegExp(`${CONTEXT_BEFORE}(${body})${TOKEN_END}`, "g");
  const found = new Set<string>();
  for (const match of html.matchAll(pattern)) {
    // Ads IDs may carry a conversion label (AW-123/abc); only the ID counts.
    const id = match[1];
    if (valid.test(id)) found.add(id);
  }
  return [...found];
}

export type GoogleTagIds = {
  ga4MeasurementIds: string[];
  googleAdsIds: string[];
  gtmContainerIds: string[];
  configuredGa4Ids: string[];
  configuredAdsIds: string[];
};

export function extractGoogleTagIds(rawHtml: string): GoogleTagIds {
  const html = rawHtml.slice(0, 5_000_000);
  const configured = (prefix: string, valid: RegExp) => [...new Set(
    [...html.matchAll(new RegExp(`gtag\\s*\\(\\s*["']config["']\\s*,\\s*["'](${prefix}-[A-Za-z0-9-]+)["']`, "g"))]
      .map((match) => match[1])
      .filter((id) => valid.test(id)),
  )];
  return {
    ga4MeasurementIds: idsInContext(html, "G-[A-Z0-9]{6,12}", GA4_MEASUREMENT_ID),
    googleAdsIds: idsInContext(html, "AW-\\d{6,12}", GOOGLE_ADS_ID),
    gtmContainerIds: idsInContext(html, "GTM-[A-Z0-9]{4,10}", GTM_CONTAINER_ID),
    configuredGa4Ids: configured("G", GA4_MEASUREMENT_ID),
    configuredAdsIds: configured("AW", GOOGLE_ADS_ID),
  };
}
