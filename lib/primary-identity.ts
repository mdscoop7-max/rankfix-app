// Declared primary identity: what a website says it primarily IS, proven by
// independent evidence families. Commerce, booking or lodging capabilities
// found on such a site (subscriptions on a news site, a pricing/cart flow on a
// software site, hotels at an attraction park) are secondary functions.
//
// Rules (generic, no brand/domain exceptions):
//  - three independent evidence families per identity:
//      schema    – self-declared schema.org type (e.g. NewsMediaOrganization)
//      identity  – the page's own identity text (title, meta description, H1)
//      structure – site structure or content scoring (link patterns, catalog)
//  - an identity counts only with at least two families, and two text-only
//    families (identity + catalog content) are never enough on their own:
//    schema or link structure must be one of them;
//  - self-declared retail store schema (OnlineStore, ClothingStore, ...) always
//    keeps retail as primary identity.
// Pure: unit-tested in tests/primary-identity.test.mjs.
import { hasRetailStoreSchema } from "./sector-identity.ts";

export type DeclaredIdentityKey = "news_publisher" | "software_saas" | "job_board" | "attraction_recreation";

export type DeclaredIdentity = {
  key: DeclaredIdentityKey;
  sector: "news_media" | "saas_b2b" | "recruitment" | "tourism_recreation";
  label: string;
  websiteType: string;
  families: Array<"schema" | "identity" | "structure">;
  evidence: string[];
};

export type IdentityInput = {
  schemaTypes: Iterable<string>;
  // title + meta description + H1s (+ hostname is fine; never body text)
  identityText: string;
  // internal link hrefs of the scanned page
  links: string[];
  // catalog candidates computed from page content: {key, score}
  catalog: Array<{ key: string; score: number }>;
};

type Definition = {
  key: DeclaredIdentityKey;
  sector: DeclaredIdentity["sector"];
  label: string;
  websiteType: string;
  schema: string[];
  identity: RegExp;
  // First capture group names the kind of page a link points to.
  linkPattern: RegExp;
  minLinks: number;
  // Distinct kinds required, so one repeated navigation item is not structure.
  minKinds: number;
  catalogKeys: string[];
};

const DEFINITIONS: Definition[] = [
  {
    key: "news_publisher",
    sector: "news_media",
    label: "Nieuws & Media",
    websiteType: "Nieuws-/mediasite",
    schema: ["newsmediaorganization", "newsarticle", "reportagenewsarticle", "analysisnewsarticle", "opinionnewsarticle", "backgroundnewsarticle", "liveblogposting"],
    // "nieuwsbrief"/"newsletter" is a mailing list, not news identity.
    identity: /(?:\b|(?<=\p{L}))(?:nieuws(?!brief)|news(?!letter)|nachrichten|actualit[eé]s?|noticias|notizie|journaal|krant|newspaper|zeitung|journal(?:isme|ism|istiek))\b/iu,
    // Article sections, dated paths, or section/<numeric article id>/slug
    // (never product paths, which also carry numeric ids).
    linkPattern: /\/(artikel|article|articles|nieuws|news|nachrichten|actualites?|noticias?|notizie|liveblog|20\d{2}\/\d{2})\/|\/(?!(?:product|producten|products|p|item|artikelnummer)\/)[a-z][a-z0-9-]*\/(\d{5,})(?:\/|-|\.html)/i,
    minLinks: 6,
    minKinds: 1,
    catalogKeys: ["news_media"],
  },
  {
    key: "software_saas",
    sector: "saas_b2b",
    label: "Software / SaaS",
    websiteType: "Software-/SaaS-website",
    schema: ["softwareapplication", "webapplication", "mobileapplication"],
    identity: /\b(?:saas|software(?:pakket)?|\p{L}*software|boekhoudpakket|boekhoudprogramma|facturatieprogramma|crm|erp|cloudsoftware|online (?:boekhouding|facturatie|administratie)|web ?app(?:licatie)?|business software|buchhaltungssoftware|logiciel)\b/iu,
    linkPattern: /\/(features?|functies|functionaliteiten|integraties|integrations?|koppelingen|prijzen|pricing|tarieven|demo|aanmelden|signup|sign-up|registreren|probeer|trial|app|app-store|login|inloggen|software)(?:\/|$|\?|-)/i,
    minLinks: 4,
    minKinds: 3,
    catalogKeys: ["saas_b2b", "software_app"],
  },
  {
    key: "job_board",
    sector: "recruitment",
    label: "Vacatureplatform",
    websiteType: "Vacatureplatform",
    schema: ["jobposting", "employmentagency"],
    identity: /\b(?:vacature(?:s|site|bank|platform)?|banen|bijbanen|jobs?|jobboard|job board|stellenangebote|stellenbörse|offres? d['’]emploi|ofertas de empleo|offerte di lavoro|werk zoeken)\b/iu,
    linkPattern: /\/(vacatures?|vacature-|jobs?|job-|banen|stellen|stellenangebote|emploi|empleo|lavoro|werk\/)/i,
    minLinks: 8,
    minKinds: 1,
    catalogKeys: ["recruitment"],
  },
  {
    key: "attraction_recreation",
    sector: "tourism_recreation",
    label: "Recreatie & attracties",
    websiteType: "Recreatie-/attractiewebsite",
    schema: ["amusementpark", "touristattraction", "zoo", "aquarium", "themepark", "waterpark", "museum"],
    // Compounds count ("Rijksmuseum", "Diergaarde ..."): (?<=\p{L}) allows a prefix.
    identity: /(?:\b|(?<=\p{L}))(?:attractiepark|pretpark|themapark|amusementpark|amusement park|theme park|dierentuin|diergaarde|dierenpark|zoo|safaripark|waterpark|freizeitpark|vergnügungspark|parc d['’]attractions|parque de atracciones|parco divertimenti|museum|musée|museo|dagje uit|dagjes uit)\b/iu,
    linkPattern: /\/(attracties?|attractions?|park(?:plattegrond|map)?|openingstijden|opening-?hours|tickets?|kaartjes|plattegrond|shows?|dieren|animals|bezoek|plan-je-bezoek|visit|zien-en-doen|tentoonstellingen?|exhibitions?|collectie|collection)(?:\/|$|\?|-)/i,
    minLinks: 3,
    minKinds: 2,
    catalogKeys: ["entertainment", "events", "museum_culture"],
  },
];

export function declaredPrimaryIdentity(input: IdentityInput): DeclaredIdentity | null {
  const schema = new Set([...input.schemaTypes].map((type) => String(type).toLowerCase()));
  if (hasRetailStoreSchema(schema)) return null;
  const results: DeclaredIdentity[] = [];
  for (const def of DEFINITIONS) {
    const families: DeclaredIdentity["families"] = [];
    const evidence: string[] = [];
    const schemaHit = def.schema.find((type) => schema.has(type));
    if (schemaHit) { families.push("schema"); evidence.push(`Schema: ${schemaHit}`); }
    const identityHit = input.identityText.match(def.identity)?.[0];
    if (identityHit) { families.push("identity"); evidence.push(`Paginaidentiteit (title/description/H1): "${identityHit}"`); }
    const matched = [...new Set(input.links)].map((href) => href.match(def.linkPattern)).filter(Boolean) as RegExpMatchArray[];
    const linkHits = matched.length;
    const linkKinds = new Set(matched.map((m) => (m[1] ? m[1].toLowerCase() : "id"))).size;
    const catalogHit = input.catalog.find((item) => def.catalogKeys.includes(item.key) && item.score >= 4);
    const structural = linkHits >= def.minLinks && linkKinds >= def.minKinds;
    if (structural || catalogHit) {
      families.push("structure");
      if (structural) evidence.push(`Sitestructuur: ${linkHits} interne links naar ${def.label.toLowerCase()}-pagina's`);
      if (catalogHit) evidence.push(`Inhoudsanalyse: ${catalogHit.key} (score ${catalogHit.score})`);
    }
    // Two families, of which at least one is schema or link structure.
    const independent = Boolean(schemaHit) || structural;
    if (families.length >= 2 && independent) {
      results.push({ key: def.key, sector: def.sector, label: def.label, websiteType: def.websiteType, families, evidence });
    }
  }
  if (!results.length) return null;
  // Most families wins; on a tie the identity is ambiguous and nothing is declared.
  results.sort((a, b) => b.families.length - a.families.length);
  if (results[1] && results[1].families.length === results[0].families.length) return null;
  return results[0];
}

// A page is about the declared identity unless it is itself a product or
// category page: a news site's subscription product page is still a product.
export function declaredIdentityGovernsPage(identity: DeclaredIdentity | null, page: { isProductPage: boolean; isCategoryPage: boolean }): boolean {
  return Boolean(identity) && !page.isProductPage && !page.isCategoryPage;
}

// Article structured data on a non-homepage is page-level evidence that the
// page is an article. It outranks keyword-only local-business hints (for
// example the word "menu" in site navigation), but never real LocalBusiness
// schema on the same page.
const ARTICLE_SCHEMA = ["article", "newsarticle", "blogposting", "reportagenewsarticle", "analysisnewsarticle", "opinionnewsarticle", "backgroundnewsarticle", "techarticle", "scholarlyarticle", "liveblogposting"];
const LOCAL_BUSINESS_SCHEMA = /^(?:localbusiness|restaurant|foodestablishment|cafeorcoffeeshop|barorpub|bakery|dentist|physician|medicalclinic|hairsalon|beautysalon|dayspa|plumber|electrician|generalcontractor|roofingcontractor|homeandconstructionbusiness|autorepair|autodealer|automotivebusiness|realestateagent|legalservice|attorney|accountingservice|travelagency|hotel|lodgingbusiness|bedandbreakfast|store)$/;

export function articleSchemaPage(schemaTypes: Iterable<string>, isHomepage: boolean): boolean {
  if (isHomepage) return false;
  const types = [...schemaTypes].map((type) => String(type).toLowerCase());
  return types.some((type) => ARTICLE_SCHEMA.includes(type)) && !types.some((type) => LOCAL_BUSINESS_SCHEMA.test(type));
}
