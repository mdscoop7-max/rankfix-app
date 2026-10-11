/**
 * Sector Motor 3.1 — Universal Evidence Arbiter.
 *
 * One definitive decision layer for the primary site sector. It consumes the
 * evidence the scan has already collected and never looks at brand names,
 * hostnames of known companies or country-specific wording.
 *
 * Principles
 * 1. Evidence has tiers: structural (dedicated schema, verified inventory,
 *    verified purchase flow) > identity (term in title/h1/meta/host) > body
 *    text. Body text alone can never decide a primary sector.
 * 2. Words that occur on almost every large site ("delivery", "tours", "stay",
 *    "hotel", "news") belong to generic-word sectors. They need structural
 *    evidence to beat a verified storefront or a retail corporate site.
 * 3. A site has a role: storefront, corporate website, specialist business or
 *    unconfirmed. A webshop is a role (purchase flow), not merely a topic.
 * 4. Secondary activities are reported, not discarded, and never decide the
 *    primary sector.
 * 5. Not enough evidence yields an explicit uncertainty status instead of a
 *    confident-looking guess.
 */

import type { ScanEvidence } from "./scan-evidence";

export type ArbiterStatus = "supported" | "probable" | "uncertain";
export type ArbiterRole = "storefront" | "corporate_website" | "specialist_business" | "unconfirmed";
export type EvidenceBasis = "structural" | "identity" | "body_text";
/**
 * Where an identity term was found. Only title, h1, meta description and the
 * titles/descriptions of audited site-sample pages are reliable identity
 * sources. A URL (host/path) alone never establishes identity, and general
 * page text is not an identity source at all.
 */
export type IdentitySource = "title" | "h1" | "meta_description" | "site_sample_title" | "site_sample_meta" | "url";
export type IdentityEvidence = { sector: string; sources: IdentitySource[] };
const RELIABLE_IDENTITY_SOURCES: ReadonlySet<IdentitySource> = new Set(["title", "h1", "meta_description", "site_sample_title", "site_sample_meta"]);

export type ArbiterInput = {
  /** Sector decided by the earlier engine layers (the arbiter may confirm or replace it). */
  current: { sector: string; key: string; label: string; confidenceScore: number };
  /** Raw schema.org @type values found on the audited pages. */
  schemaTypes: string[];
  commerce: {
    /** Confirmed Product schema or confirmed product page (high confidence only). */
    product: boolean;
    /** Confirmed add-to-cart action (high confidence only). */
    addToCart: boolean;
    /** Cart or checkout structure (high confidence only). */
    cartOrCheckout: boolean;
    productLinks: number;
    priceCount: number;
    /** A representative same-site product page or sitewide commerce sample confirmed retail. */
    siteSampleProduct: boolean;
    /** Earlier engine layers confirmed commerce with HARD evidence (not technology fingerprints). */
    previouslyConfirmed: boolean;
    /** Only a commerce platform/technology fingerprint was seen; this is never proof of a webshop. */
    technologyOnly?: boolean;
  };
  /** High-confidence inventory/capability flags only. */
  inventory: {
    vehicles: boolean;
    properties: boolean;
    jobs: boolean;
    rooms: boolean;
    menu: boolean;
    booking: boolean;
    reservation: boolean;
  };
  /** Lodging evidence with guests/dates/booking (short stay). */
  shortStayIdentity: boolean;
  /** Sector identity terms with the reliable source(s) they were found in. */
  identity: IdentityEvidence[];
  /** Sectors that only matched somewhere in body text or secondary pages. */
  bodySectors: string[];
  /** Display labels per sector key. */
  labels: Record<string, string>;
};

export type ArbiterActivity = {
  sector: string;
  label: string;
  basis: EvidenceBasis;
  note: string;
};

export type ArbiterDecision = {
  version: "3.1";
  role: ArbiterRole;
  sector: string;
  key: string;
  label: string;
  status: ArbiterStatus;
  confidence: "high" | "medium" | "low";
  confidenceScore: number;
  commerceConfirmed: boolean;
  storefrontGrade: "none" | "weak" | "strong";
  structuralEvidence: string[];
  reasons: string[];
  secondaryActivities: ArbiterActivity[];
  /** True when the decision differs from the incoming sector. */
  changed: boolean;
};

/** Sectors whose trigger words appear on many unrelated sites. */
export const GENERIC_WORD_SECTORS: ReadonlySet<string> = new Set([
  "transport_travel", "tourism_recreation", "hospitality", "food_local_retail", "news_media",
  "telecom_technology", "service_marketplace", "professional_services", "general_business",
]);

const SECTOR_SCHEMA_PROOF: Record<string, readonly string[]> = {
  real_estate: ["realestateagent", "residence", "house", "apartment", "singlefamilyresidence"],
  automotive: ["autodealer", "automotivebusiness", "autorepair", "autorental", "motorcycledealer", "vehicle", "car"],
  hospitality: ["hotel", "lodgingbusiness", "hostel", "motel", "bedandbreakfast", "resort", "campground", "vacationrental",
    "restaurant", "foodestablishment", "cafeorcoffeeshop", "barorpub", "hotelroom"],
  health_wellness: ["dentist", "medicalclinic", "physician", "medicalorganization", "hospital", "pharmacy", "physiotherapy"],
  beauty: ["beautysalon", "hairsalon", "dayspa", "healthclub"],
  home_services: ["plumber", "electrician", "homeandconstructionbusiness", "generalcontractor", "roofingcontractor", "locksmith", "housepainter"],
  professional_services: ["legalservice", "attorney", "accountingservice", "notary"],
  recruitment: ["employmentagency"],
  government: ["governmentorganization", "governmentoffice", "cityhall", "governmentservice"],
  news_media: ["newsmediaorganization"],
  tourism_recreation: ["touristattraction", "touristinformationcenter", "touristdestination", "amusementpark", "zoo", "skiresort"],
  transport_travel: ["airline", "airport", "trainstation", "busstation", "busorcoach", "taxiservice", "movingcompany", "travelagency"],
  food_local_retail: ["bakery", "grocerystore", "confectionerystore", "butcher"],
  saas_b2b: ["softwareapplication", "webapplication", "mobileapplication"],
};

const SECTOR_PRIORITY = [
  "real_estate", "automotive", "health_wellness", "beauty", "home_services", "recruitment", "government",
  "saas_b2b", "hospitality", "transport_travel", "tourism_recreation", "food_local_retail", "news_media",
  "professional_services", "telecom_technology", "service_marketplace",
];

const FALLBACK_LABELS: Record<string, string> = {
  ecommerce: "Webshop / e-commerce",
  corporate_website: "Internationale bedrijfswebsite",
  unknown: "Sector niet bevestigd",
};

const reliableIdentity = (input: ArbiterInput, sector: string) =>
  input.identity.some(item => item.sector === sector && item.sources.some(source => RELIABLE_IDENTITY_SOURCES.has(source)));

/** Test each sector's primary identity pattern against each identity source separately. */
export function collectIdentityEvidence(
  sectors: { sector: string; pattern: RegExp }[],
  sources: Partial<Record<IdentitySource, string>>,
): IdentityEvidence[] {
  const out: IdentityEvidence[] = [];
  for (const { sector, pattern } of sectors) {
    const found = (Object.keys(sources) as IdentitySource[]).filter(source => {
      const text = sources[source];
      return Boolean(text) && new RegExp(pattern.source, pattern.flags.replace("g", "")).test(text as string);
    });
    if (found.length) out.push({ sector, sources: found });
  }
  return out;
}

// schema.org retail types all end in "Store" (Store, OnlineStore, FurnitureStore, ClothingStore, ...).
const isStoreSchemaType = (type: string) => type.endsWith("store");

export function hasStoreSchema(schemaTypes: string[]) {
  return schemaTypes.some(type => isStoreSchemaType(type.toLowerCase()));
}

function structuralEvidenceFor(sector: string, input: ArbiterInput): string[] {
  const schema = new Set(input.schemaTypes.map(type => type.toLowerCase()));
  const found: string[] = [];
  const schemaHit = (SECTOR_SCHEMA_PROOF[sector] || []).find(type => schema.has(type));
  if (schemaHit) found.push(`schema:${schemaHit}`);
  const inv = input.inventory;
  if (sector === "real_estate" && inv.properties) found.push("inventory:properties");
  if (sector === "automotive" && inv.vehicles) found.push("inventory:vehicles");
  if (sector === "hospitality") {
    if (input.shortStayIdentity) found.push("capability:short_stay");
    else if (inv.rooms && inv.booking) found.push("inventory:rooms+booking");
    else if (inv.menu && inv.reservation) found.push("inventory:menu+reservation");
  }
  if (sector === "recruitment" && inv.jobs && reliableIdentity(input, "recruitment")) found.push("inventory:jobs+identity");
  return found;
}

function gradeStorefront(input: ArbiterInput) {
  const c = input.commerce;
  const store = hasStoreSchema(input.schemaTypes);
  const groups = [
    store && "store_schema",
    c.product && "product",
    c.addToCart && "add_to_cart",
    c.cartOrCheckout && "cart_checkout",
    c.productLinks >= 3 && "product_links",
    c.priceCount >= 3 && "prices",
    c.siteSampleProduct && "site_sample",
  ].filter((value): value is string => Boolean(value));
  const productLevel = c.product || c.addToCart;
  // Catalogue storefront: a cart/checkout structure plus a priced product catalogue
  // (many product links AND many visible prices) are three independent purchase-structure
  // groups. Large retailers often show this on the homepage without Product schema or an
  // add-to-cart button (those live on product pages that may be blocked or JS-rendered).
  const catalogue = c.cartOrCheckout && c.productLinks >= 6 && c.priceCount >= 4;
  // Add-to-cart actions on several priced product cards are a purchase flow even when
  // the cart itself is only a JavaScript icon without a recognisable link.
  const buyableGrid = c.addToCart && c.productLinks >= 3 && c.priceCount >= 3;
  const strong = c.previouslyConfirmed || c.siteSampleProduct ||
    (store && (productLevel || c.cartOrCheckout)) ||
    (c.addToCart && (c.cartOrCheckout || c.product)) ||
    catalogue || buyableGrid;
  // Weak evidence (product schema + prices, a priced catalogue without cart, or only a
  // platform fingerprint) is a hint, never a confirmation.
  const weak = !strong && (Boolean(c.technologyOnly) || (productLevel && groups.length >= 2) || (c.productLinks >= 3 && c.priceCount >= 3));
  return { store, groups, grade: strong ? "strong" as const : weak ? "weak" as const : "none" as const };
}

function labelOf(input: ArbiterInput, sector: string) {
  return input.labels[sector] || FALLBACK_LABELS[sector] || sector;
}

export function arbitratePrimarySector(input: ArbiterInput): ArbiterDecision {
  const reasons: string[] = [];
  const storefront = gradeStorefront(input);

  // Collect structurally proven non-commerce sectors.
  const structural = Object.keys(SECTOR_SCHEMA_PROOF)
    .map(sector => ({ sector, proof: structuralEvidenceFor(sector, input) }))
    .filter(item => item.proof.length > 0)
    .sort((a, b) => b.proof.length - a.proof.length ||
      (SECTOR_PRIORITY.indexOf(a.sector) + 1 || 99) - (SECTOR_PRIORITY.indexOf(b.sector) + 1 || 99));
  const top = structural[0];
  // Contradictory structural proof: a second, different sector must trail the leader by at least two
  // independent proof groups, otherwise there is no reliable primary sector (regardless of earlier layers).
  const contested = Boolean(top && structural[1] && top.proof.length - structural[1].proof.length < 2);

  const activities = (exclude: string[]): ArbiterActivity[] => {
    const out: ArbiterActivity[] = [];
    const seen = new Set(exclude);
    for (const item of structural) {
      if (seen.has(item.sector)) continue;
      seen.add(item.sector);
      out.push({ sector: item.sector, label: labelOf(input, item.sector), basis: "structural", note: item.proof.join(", ") });
    }
    for (const item of input.identity) {
      const sector = item.sector;
      if (seen.has(sector) || sector === "ecommerce") continue;
      seen.add(sector);
      const reliable = reliableIdentity(input, sector);
      out.push({
        sector, label: labelOf(input, sector), basis: reliable ? "identity" : "body_text",
        note: reliable ? `Term in ${item.sources.filter(source => RELIABLE_IDENTITY_SOURCES.has(source)).join("/")}, zonder structureel bewijs` : "Alleen in de URL; geen betrouwbare identiteitsbron",
      });
    }
    for (const sector of input.bodySectors) {
      if (seen.has(sector) || sector === "ecommerce") continue;
      seen.add(sector);
      out.push({ sector, label: labelOf(input, sector), basis: "body_text", note: "Alleen algemene tekstwoorden; bepaalt de hoofdsector niet" });
    }
    return out.slice(0, 8);
  };

  if (storefront.grade === "weak") {
    reasons.push(`Beperkt winkelbewijs (${storefront.groups.join(", ") || "alleen platform-/technologiesignaal"}): een aanwijzing voor een webshop, geen bevestiging.`);
  }

  const build = (partial: {
    role: ArbiterRole; sector: string; key?: string; label?: string; status: ArbiterStatus;
    confidenceScore: number; commerceConfirmed: boolean; structural?: string[];
  }): ArbiterDecision => {
    const key = partial.key || partial.sector;
    const label = partial.label || labelOf(input, partial.sector);
    const built: ArbiterDecision = {
      version: "3.1",
      role: partial.role,
      sector: partial.sector,
      key,
      label,
      status: partial.status,
      confidence: partial.status === "supported" ? "high" : partial.status === "probable" ? "medium" : "low",
      confidenceScore: partial.confidenceScore,
      commerceConfirmed: partial.commerceConfirmed,
      storefrontGrade: storefront.grade,
      structuralEvidence: partial.structural || [],
      reasons,
      secondaryActivities: activities([partial.sector]),
      changed: partial.sector !== input.current.sector || key !== input.current.key,
    };
    // Weak storefront signals stay visible as an unconfirmed hint and never confirm commerce.
    if (storefront.grade === "weak" && !built.commerceConfirmed && partial.sector !== "ecommerce") {
      built.secondaryActivities = [
        { sector: "ecommerce", label: "Webshop (niet bevestigd)", basis: "structural" as const, note: `Beperkt bewijs: ${storefront.groups.join(", ") || "technologiesignaal"}` },
        ...built.secondaryActivities,
      ].slice(0, 8);
    }
    return built;
  };

  const specialist = (item: { sector: string; proof: string[] }, withCommerce: boolean) => {
    const strongProof = item.proof.length >= 2;
    return build({
      role: "specialist_business", sector: item.sector, status: strongProof ? "supported" : "probable",
      confidenceScore: strongProof ? 95 : 84, commerceConfirmed: withCommerce, structural: item.proof,
    });
  };

  // A. Verified storefront.
  if (storefront.grade === "strong") {
    // Generic-word sectors only lose to a storefront when their "proof" could be words.
    // A dedicated schema type PLUS an independent structural capability (menu+reservation,
    // rooms+booking) is not a word match; with a small shop (e.g. gift cards) the
    // specialist stays primary. A full product catalogue still wins as a storefront.
    const dedicatedGenericSpecialist = !!top &&
      top.proof.some(proof => proof.startsWith("schema:")) && top.proof.some(proof => !proof.startsWith("schema:"));
    const smallShop = input.commerce.productLinks < 6 && !input.commerce.siteSampleProduct && !input.commerce.previouslyConfirmed;
    if (top && top.proof.length >= 2 && !contested && (!GENERIC_WORD_SECTORS.has(top.sector) || (dedicatedGenericSpecialist && smallShop))) {
      reasons.push(`Sterke specialistische identiteit (${top.proof.join(", ")}) gaat voor de winkelfunctie.`);
      reasons.push(`Aankoopstructuur (${storefront.groups.join(", ")}) wordt als nevenactiviteit/webshopfunctie behandeld.`);
      return specialist(top, true);
    }
    reasons.push(`Bevestigde aankoopstructuur: ${storefront.groups.join(", ")}.`);
    if (structural.length) reasons.push("Overige sectorsignalen zijn nevenactiviteiten en bepalen de hoofdsector niet.");
    return build({
      role: "storefront", sector: "ecommerce", status: "supported",
      confidenceScore: Math.min(99, 88 + storefront.groups.length * 2), commerceConfirmed: true, structural: storefront.groups,
    });
  }

  // C. No purchase structure.
  if (top && !contested) {
    reasons.push(`Structureel bewijs voor ${labelOf(input, top.sector)}: ${top.proof.join(", ")}.`);
    return specialist(top, false);
  }
  if (contested && top) {
    reasons.push("Meerdere sectoren hebben structureel bewijs zonder duidelijke voorsprong (minimaal twee bewijsgroepen verschil nodig); geen betrouwbare hoofdsector.");
    return build({ role: "unconfirmed", sector: "unknown", label: FALLBACK_LABELS.unknown, status: "uncertain", confidenceScore: 40, commerceConfirmed: false });
  }
  if (storefront.store) {
    reasons.push("Retail-/store-schema aanwezig, maar geen product-, winkelwagen- of afrekenstructuur op de onderzochte pagina's.");
    reasons.push("Behandeld als bedrijfswebsite van een retailmerk; geen webshopmodules geactiveerd.");
    const decision = build({ role: "corporate_website", sector: "general_business", key: "corporate_website", label: FALLBACK_LABELS.corporate_website, status: "probable", confidenceScore: 72, commerceConfirmed: false });
    const retail: ArbiterActivity = { sector: "retail", label: "Retail (store-schema)", basis: "structural", note: "Store-schema zonder bevestigde aankoopstructuur" };
    decision.secondaryActivities = [retail, ...decision.secondaryActivities].slice(0, 8);
    return decision;
  }
  const current = input.current.sector;
  const identityCompetitors = input.identity.filter(item => item.sector !== "ecommerce" && reliableIdentity(input, item.sector));
  if (current && current !== "unknown" && current !== "ecommerce" && reliableIdentity(input, current)) {
    if (identityCompetitors.length >= 3) {
      reasons.push("Titel/koppen/omschrijving bevatten termen van drie of meer sectoren; geen betrouwbare hoofdsector.");
      return build({ role: "unconfirmed", sector: "unknown", label: FALLBACK_LABELS.unknown, status: "uncertain", confidenceScore: 40, commerceConfirmed: false });
    }
    reasons.push("Sector alleen ondersteund door termen in titel/koppen/omschrijving; geen structureel bewijs.");
    return build({
      role: "specialist_business", sector: current, key: input.current.key, label: input.current.label,
      status: "probable", confidenceScore: Math.min(75, Math.max(60, input.current.confidenceScore)), commerceConfirmed: false,
    });
  }
  // Earlier layers proposed a sector the page itself does not support, but the page's own
  // title/h1/meta name exactly one specific (non-generic) sector: that identity is the better
  // probable answer than "unknown" (e.g. a dental practice misread as a booking platform).
  const specificIdentities = identityCompetitors.filter(item => !GENERIC_WORD_SECTORS.has(item.sector));
  if (specificIdentities.length === 1 && identityCompetitors.length <= 2) {
    const adopted = specificIdentities[0].sector;
    reasons.push(`Eerder voorgestelde sector "${input.current.label}" wordt niet door titel/koppen/omschrijving ondersteund; die noemen ${labelOf(input, adopted)}. Geen structureel bewijs, dus waarschijnlijk.`);
    const decision = build({ role: "specialist_business", sector: adopted, status: "probable", confidenceScore: 62, commerceConfirmed: false });
    if (current && current !== "unknown" && current !== "ecommerce" && current !== adopted && !decision.secondaryActivities.some(item => item.sector === current)) {
      decision.secondaryActivities.unshift({ sector: current, label: input.current.label, basis: "body_text", note: "Eerder voorgesteld, niet ondersteund door titel/koppen/omschrijving" });
    }
    return decision;
  }
  if (current === "general_business") {
    return build({ role: "corporate_website", sector: "general_business", key: input.current.key, label: input.current.label, status: "probable", confidenceScore: 65, commerceConfirmed: false });
  }
  reasons.push(current && current !== "unknown"
    ? `Sector "${input.current.label}" rust alleen op algemene tekstwoorden en is geen hoofdsector.`
    : "Onvoldoende onafhankelijk bewijs voor een hoofdsector.");
  const decision = build({ role: "unconfirmed", sector: "unknown", label: FALLBACK_LABELS.unknown, status: "uncertain", confidenceScore: 35, commerceConfirmed: false });
  if (current && current !== "unknown" && current !== "ecommerce" && !decision.secondaryActivities.some(item => item.sector === current)) {
    decision.secondaryActivities.unshift({ sector: current, label: input.current.label, basis: "body_text", note: "Eerder voorgesteld op basis van algemene tekstwoorden" });
  }
  return decision;
}

/** Compact, serialisable summary stored with the scan evidence. */
export function summarizeArbiterDecision(decision: ArbiterDecision) {
  return {
    version: decision.version,
    role: decision.role,
    status: decision.status,
    sector: decision.sector,
    label: decision.label,
    confidenceScore: decision.confidenceScore,
    storefrontGrade: decision.storefrontGrade,
    structuralEvidence: decision.structuralEvidence,
    reasons: decision.reasons,
    secondaryActivities: decision.secondaryActivities,
    changed: decision.changed,
  };
}

/**
 * Maps collected scan evidence to arbiter inputs. Only high-confidence facts
 * count as proof; medium/low hints stay out of the structural tiers.
 */
export function arbiterEvidenceFromScan(
  evidence: ScanEvidence,
  extra: { siteSampleProduct: boolean; previouslyConfirmed: boolean; technologyOnly?: boolean },
): Pick<ArbiterInput, "schemaTypes" | "commerce" | "inventory"> {
  const high = (fact: { value: unknown; confidence: string }) => Boolean(fact.value) && fact.confidence === "high";
  const schema = new Set(evidence.schema.types.map(type => type.toLowerCase()));
  return {
    schemaTypes: evidence.schema.types,
    commerce: {
      product: high(evidence.commerce.productPage) || (schema.has("product") && high(evidence.commerce.products)),
      addToCart: high(evidence.commerce.addToCart),
      cartOrCheckout: high(evidence.commerce.cart) || high(evidence.commerce.checkout),
      productLinks: Number(evidence.commerce.productLinks.value) || 0,
      priceCount: evidence.commerce.prices.value.count,
      siteSampleProduct: extra.siteSampleProduct,
      previouslyConfirmed: extra.previouslyConfirmed,
      technologyOnly: Boolean(extra.technologyOnly),
    },
    inventory: {
      vehicles: high(evidence.inventory.vehicles),
      properties: high(evidence.inventory.properties),
      jobs: high(evidence.inventory.jobs),
      rooms: high(evidence.inventory.rooms),
      menu: high(evidence.inventory.menu),
      booking: high(evidence.appointments.booking),
      reservation: high(evidence.appointments.reservation),
    },
  };
}

export const CORE_AUDIT_MODULES = ["core_seo", "geo", "technical"] as const;

/**
 * Module set after the arbiter changes the sector. Valid generic modules (local,
 * lead conversion, trust, accessibility, ...) stay active; only modules that
 * define a sector, and commerce modules when commerce is not confirmed, are
 * removed. Core modules can never disappear.
 */
export function reconcileModulesAfterArbitration(input: {
  previous: string[];
  /** Modules that define a single sector (e.g. real_estate, hospitality). */
  sectorOwned: Iterable<string>;
  /** Modules supplied by the new primary sector. */
  newSectorModules: string[];
  /** Generic modules supported by verified capabilities. */
  capabilityModules: string[];
  commerceModules: string[];
  euConsumerModule?: string;
  commerceConfirmed: boolean;
  euConsumerApplicable: boolean;
}): string[] {
  const owned = new Set(input.sectorOwned);
  const commerce = new Set([...input.commerceModules, ...(input.euConsumerModule ? [input.euConsumerModule] : [])]);
  const keep = (name: string) => !owned.has(name) && !commerce.has(name);
  const next = new Set<string>([
    ...CORE_AUDIT_MODULES,
    ...input.previous.filter(keep),
    ...input.capabilityModules.filter(keep),
    ...input.newSectorModules.filter(name => !commerce.has(name)),
  ]);
  if (input.commerceConfirmed) {
    for (const name of input.commerceModules) next.add(name);
    if (input.euConsumerModule && input.euConsumerApplicable) next.add(input.euConsumerModule);
  }
  return [...next];
}
