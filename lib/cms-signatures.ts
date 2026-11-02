/**
 * Generic CMS / site-builder detection from unique, public signatures.
 *
 * Rules (no domain exceptions):
 * - `<meta name="generator">` is read for ANY value; known names are normalised,
 *   unknown values are shown as-is (so a vendor CMS is named when it declares itself).
 * - Asset paths and runtime markers are only accepted when they are specific to one
 *   platform (one unique signature is enough, a bare brand word in body text is not).
 * - `x-powered-by`/`x-generator` response headers are read as evidence.
 */

export type CmsSignature = {
  name: string;
  role: "cms" | "framework" | "site_builder";
  /** 1 = single indirect marker, 2 = unique asset/runtime marker, 3 = self-declared. */
  strength: 1 | 2 | 3;
  evidence: string[];
};

type Rule = { name: string; role: CmsSignature["role"]; strength: 1 | 2 | 3; label: string; pattern: RegExp };

const RULES: Rule[] = [
  { name: "TYPO3", role: "cms", strength: 2, label: "TYPO3 asset path", pattern: /\/typo3(?:conf|temp)\//i },
  { name: "TYPO3", role: "cms", strength: 2, label: "TYPO3 comment marker", pattern: /this website is powered by typo3/i },
  { name: "Framer", role: "site_builder", strength: 2, label: "Framer assets", pattern: /framerusercontent\.com|data-framer-(?:name|component-type|page-effect)|framer\.com\/m\//i },
  { name: "Bloomreach (Hippo CMS)", role: "cms", strength: 2, label: "Bloomreach/Hippo asset path", pattern: /\/binaries\/content\/gallery\/|\/_cmsinternal\/|hippo-?cms|brxm/i },
  { name: "Drupal", role: "cms", strength: 2, label: "Drupal asset path", pattern: /\/sites\/(?:default|all)\/(?:files|modules|themes)\/|drupal-settings-json|Drupal\.settings/i },
  { name: "Joomla", role: "cms", strength: 2, label: "Joomla asset path", pattern: /\/media\/(?:jui|system)\/js\/|\/components\/com_[a-z0-9_]+\//i },
  { name: "Adobe Experience Manager", role: "cms", strength: 2, label: "AEM client libraries", pattern: /\/etc\.clientlibs\/|\/content\/dam\/[^"' ]+|\/etc\/designs\//i },
  { name: "Sitecore", role: "cms", strength: 2, label: "Sitecore asset path", pattern: /\/sitecore\/(?:shell|service)\/|\/-\/media\/[^"' ]+\.ashx/i },
  { name: "Umbraco", role: "cms", strength: 2, label: "Umbraco asset path", pattern: /\/umbraco\/(?:assets|lib|api)\/|umbraco-forms/i },
  { name: "Craft CMS", role: "cms", strength: 2, label: "Craft CMS asset path", pattern: /\/cpresources\/|craftcms/i },
  { name: "Liferay", role: "cms", strength: 2, label: "Liferay runtime", pattern: /Liferay\.(?:ThemeDisplay|Portlet)|\/o\/[a-z0-9-]+-theme\//i },
  { name: "Ghost", role: "cms", strength: 2, label: "Ghost asset path", pattern: /\/content\/images\/size\/|ghost-(?:portal|search)/i },
  { name: "HubSpot CMS", role: "cms", strength: 2, label: "HubSpot CMS assets", pattern: /\.hubspotusercontent\d*\.net|\/hs-fs\/hubfs\/|hs-sites\.com/i },
  { name: "Duda", role: "site_builder", strength: 2, label: "Duda assets", pattern: /irp\.cdn-website\.com|dmcdn\.net|dudaone/i },
  { name: "Weebly", role: "site_builder", strength: 2, label: "Weebly assets", pattern: /editmysite\.com|weebly\.com\/files\//i },
  { name: "Jimdo", role: "site_builder", strength: 2, label: "Jimdo assets", pattern: /jimdo(?:free|site)\.com|assets\.jimstatic\.com/i },
  { name: "Shopware", role: "cms", strength: 2, label: "Shopware assets", pattern: /\/bundles\/storefront\/|shopware-?(?:storefront|cms)/i },
  { name: "Gatsby", role: "framework", strength: 2, label: "Gatsby runtime", pattern: /id="___gatsby"|\/page-data\/[^"' ]+\/page-data\.json/i },
  { name: "Astro", role: "framework", strength: 2, label: "Astro runtime", pattern: /<astro-island|\/_astro\//i },
  { name: "SvelteKit", role: "framework", strength: 2, label: "SvelteKit runtime", pattern: /\/_app\/immutable\/|data-sveltekit-/i },
  { name: "Angular", role: "framework", strength: 2, label: "Angular runtime", pattern: /<app-root[ >]|ng-version="/i },
];

const GENERATOR_NORMALISE: Array<[RegExp, string, CmsSignature["role"]]> = [
  [/^typo3/i, "TYPO3", "cms"],
  [/^drupal/i, "Drupal", "cms"],
  [/^joomla/i, "Joomla", "cms"],
  [/^wordpress/i, "WordPress", "cms"],
  [/^wix/i, "Wix", "site_builder"],
  [/^squarespace/i, "Squarespace", "site_builder"],
  [/^webflow/i, "Webflow", "site_builder"],
  [/^framer/i, "Framer", "site_builder"],
  [/^shopify/i, "Shopify", "cms"],
  [/^ghost/i, "Ghost", "cms"],
  [/^hugo/i, "Hugo", "framework"],
  [/^jekyll/i, "Jekyll", "framework"],
  [/^gatsby/i, "Gatsby", "framework"],
  [/^astro/i, "Astro", "framework"],
  [/^next\.?js/i, "Next.js", "framework"],
  [/^nuxt/i, "Nuxt", "framework"],
  [/^craft ?cms/i, "Craft CMS", "cms"],
  [/^umbraco/i, "Umbraco", "cms"],
  [/^hubspot/i, "HubSpot CMS", "cms"],
  [/^elementor|^divi|^wpbakery|^slider revolution|^powered by/i, "", "cms"],
];

/** Meta generator values that describe a plugin/theme builder, not the CMS itself. */
const GENERATOR_IGNORED = /^(?:elementor|divi|wpbakery|wp bakery|slider revolution|powered by|site kit|woocommerce|yoast|all in one seo|rank math|wpml|essential addons|visual composer|generatepress|astra)/i;

function metaGenerators(html: string): string[] {
  const values: string[] = [];
  const tagPattern = /<meta\b[^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = tagPattern.exec(html))) {
    const tag = match[0];
    if (!/\bname\s*=\s*["']?generator["']?/i.test(tag)) continue;
    const content = /\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag);
    const value = (content?.[1] ?? content?.[2] ?? "").trim();
    if (value) values.push(value.slice(0, 80));
  }
  return values;
}

function footerCreditVendor(html: string): string | null {
  // "Website by X", "Realisatie: X", "Powered by X" in footer/credit blocks. Only a
  // linked vendor name counts, and only when it is not a well-known third party.
  const credit = /(?:website|site|realisatie|gerealiseerd|ontwikkeld|powered|made|built|webdesign)\s*(?:door|by|met|:)\s*<a\b[^>]*>([^<]{2,40})<\/a>/i.exec(html);
  return credit ? credit[1].trim() : null;
}

export function detectCmsSignatures(html: string, headers: Record<string, string> = {}): CmsSignature[] {
  const found = new Map<string, CmsSignature>();
  const add = (name: string, role: CmsSignature["role"], strength: 1 | 2 | 3, evidence: string) => {
    const existing = found.get(name);
    if (existing) {
      existing.strength = Math.max(existing.strength, strength) as 1 | 2 | 3;
      if (!existing.evidence.includes(evidence)) existing.evidence.push(evidence);
      return;
    }
    found.set(name, { name, role, strength, evidence: [evidence] });
  };

  for (const value of metaGenerators(html)) {
    if (GENERATOR_IGNORED.test(value)) continue;
    const known = GENERATOR_NORMALISE.find(([pattern]) => pattern.test(value));
    if (known && known[1]) add(known[1], known[2], 3, `meta generator: ${value}`);
    else if (!known) {
      // Unknown vendor CMS that declares itself: report the declared name (without version).
      const label = value.replace(/\s+v?\d[\d.]*.*$/, "").trim();
      if (label.length >= 2) add(label, "cms", 3, `meta generator: ${value}`);
    }
  }

  for (const rule of RULES) {
    if (rule.pattern.test(html)) add(rule.name, rule.role, rule.strength, rule.label);
  }

  const poweredBy = String(headers["x-powered-by"] ?? "");
  const generatorHeader = String(headers["x-generator"] ?? "");
  const headerBlob = `${poweredBy} ${generatorHeader}`;
  if (/typo3/i.test(headerBlob)) add("TYPO3", "cms", 3, "x-generator header");
  if (/drupal/i.test(headerBlob)) add("Drupal", "cms", 3, "x-generator header");
  if (/umbraco/i.test(headerBlob)) add("Umbraco", "cms", 3, "x-powered-by header");
  if (/next\.js/i.test(poweredBy)) add("Next.js", "framework", 3, "x-powered-by header");

  // A self-credit in the footer names a vendor CMS only when nothing else matched.
  if (![...found.values()].some((entry) => entry.role === "cms" || entry.role === "site_builder")) {
    const vendor = footerCreditVendor(html);
    if (vendor && !/google|facebook|wordpress|elementor|cloudflare|shopify/i.test(vendor)) {
      add(vendor, "cms", 1, `footer credit: ${vendor}`);
    }
  }

  return [...found.values()].sort((a, b) => b.strength - a.strength);
}
