// Versioned test set for the internal nightly regression pilot (issue #128).
// Read-only: RankFix only fetches these public pages through the normal scanner.
// Expectations are evidence-bound invariants, never fixed total scores or
// brand exceptions. A site without an approved URL stays disabled and is
// reported as "overgeslagen" (skipped) until the owner confirms it.

export type PilotSiteExpectation = {
  // Sector keys from the scan's classification.sector.key that are plausible
  // for this site. Anything else is an invariant violation.
  sectors?: string[];
  // Allowed classification.websiteType values ("Webshop", "Website", ...).
  websiteTypes?: string[];
  // Website types that would be a false claim for this site (e.g. a practice
  // website classified as "Webshop" triggers unproven checkout findings).
  forbiddenWebsiteTypes?: string[];
  // Allowed classification.pageType.type values.
  pageTypes?: string[];
  // The site depends on client-side JavaScript; a raw-HTML-only result is a
  // rendering warning unless a bot manager served a reduced page.
  javascriptSite?: boolean;
  // The site is known to answer automated requests with bot protection; a
  // reduced or blocked response is then expected, never a regression.
  botProtectionExpected?: boolean;
};

export type PilotSite = {
  id: string;
  label: string;
  url: string | null;
  enabled: boolean;
  approval: "approved" | "awaiting_owner_approval";
  expect: PilotSiteExpectation;
};

export const PILOT_SITES_VERSION = "pilot-7-2026-10-12";

export const PILOT_SITES: PilotSite[] = [
  {
    id: "coolblue-nl",
    label: "Coolblue NL",
    url: "https://www.coolblue.nl/",
    enabled: true,
    approval: "approved",
    expect: { sectors: ["ecommerce"], websiteTypes: ["Webshop"], pageTypes: ["homepage"], javascriptSite: true },
  },
  {
    id: "zalando-de",
    label: "Zalando DE",
    url: "https://www.zalando.de/",
    enabled: true,
    approval: "approved",
    expect: { sectors: ["ecommerce"], websiteTypes: ["Webshop"], pageTypes: ["homepage"], botProtectionExpected: true },
  },
  {
    id: "expert-nl",
    label: "Expert NL",
    url: "https://www.expert.nl/",
    enabled: true,
    approval: "approved",
    expect: { sectors: ["ecommerce"], websiteTypes: ["Webshop"], pageTypes: ["homepage"] },
  },
  {
    id: "acupunctuur-dijkstra",
    label: "Acupunctuur Dijkstra",
    url: "https://www.acupunctuurdijkstra.nl/",
    enabled: true,
    approval: "approved",
    // A practice website: never a webshop, never a checkout/merchant subject.
    expect: { sectors: ["health_wellness", "professional_services", "general_business"], forbiddenWebsiteTypes: ["Webshop"], pageTypes: ["homepage", "service"] },
  },
  {
    id: "transheroes-nl",
    label: "TransHeroes NL",
    url: "https://www.transheroes.com/nl/",
    enabled: true,
    approval: "approved",
    expect: { forbiddenWebsiteTypes: ["Webshop"], pageTypes: ["homepage"], javascriptSite: true },
  },
  {
    id: "ikea-nl",
    label: "IKEA NL",
    url: "https://www.ikea.com/nl/nl/",
    enabled: true,
    approval: "approved",
    expect: { sectors: ["ecommerce"], websiteTypes: ["Webshop"], pageTypes: ["homepage"] },
  },
  {
    // Candidate (verified Shopify storefront meta tags, public, no login):
    // https://allbirds.de/ — enabled only after the owner approves the URL.
    id: "shopify-shop",
    label: "Shopify-webshop",
    url: null,
    enabled: false,
    approval: "awaiting_owner_approval",
    expect: { sectors: ["ecommerce"], websiteTypes: ["Webshop"], pageTypes: ["homepage"] },
  },
];

export const MAX_PILOT_SITES = 29;

export function enabledPilotSites(sites: PilotSite[] = PILOT_SITES): PilotSite[] {
  return sites.filter((site) => site.enabled && site.approval === "approved" && typeof site.url === "string").slice(0, MAX_PILOT_SITES);
}

export function pilotSiteById(id: unknown, sites: PilotSite[] = PILOT_SITES): PilotSite | null {
  return typeof id === "string" ? sites.find((site) => site.id === id) || null : null;
}
