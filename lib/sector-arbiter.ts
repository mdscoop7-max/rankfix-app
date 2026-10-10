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
    /** The earlier engine layers already confirmed commerce with hard evidence. */
    previouslyConfirmed: boolean;
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
  /** Sectors whose primary term occurs in title/h1/meta description/host/path. */
  identitySectors: string[];
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
  if (sector === "recruitment" && inv.jobs && input.identitySectors.includes("recruitment")) found.push("inventory:jobs+identity");
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
  const strong = c.previouslyConfirmed && (store || productLevel || c.siteSampleProduct)
    ? true
    : c.siteSampleProduct ||
      (store && (productLevel || c.cartOrCheckout)) ||
      (c.addToCart && (c.cartOrCheckout || c.product));
  const weak = !strong && (c.previouslyConfirmed || (productLevel && groups.length >= 2));
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
  const contested = Boolean(top && structural[1] && structural[1].proof.length === top.proof.length &&
    !(input.current.sector === top.sector || input.current.sector === structural[1].sector) &&
    structural[1].sector !== top.sector);

  const activities = (exclude: string[]): ArbiterActivity[] => {
    const out: ArbiterActivity[] = [];
    const seen = new Set(exclude);
    for (const item of structural) {
      if (seen.has(item.sector)) continue;
      seen.add(item.sector);
      out.push({ sector: item.sector, label: labelOf(input, item.sector), basis: "structural", note: item.proof.join(", ") });
    }
    for (const sector of input.identitySectors) {
      if (seen.has(sector) || sector === "ecommerce") continue;
      seen.add(sector);
      out.push({ sector, label: labelOf(input, sector), basis: "identity", note: "Term in titel/koppen/omschrijving, zonder structureel bewijs" });
    }
    for (const sector of input.bodySectors) {
      if (seen.has(sector) || sector === "ecommerce") continue;
      seen.add(sector);
      out.push({ sector, label: labelOf(input, sector), basis: "body_text", note: "Alleen algemene tekstwoorden; bepaalt de hoofdsector niet" });
    }
    return out.slice(0, 8);
  };

  const build = (partial: {
    role: ArbiterRole; sector: string; key?: string; label?: string; status: ArbiterStatus;
    confidenceScore: number; commerceConfirmed: boolean; structural?: string[];
  }): ArbiterDecision => {
    const key = partial.key || partial.sector;
    const label = partial.label || labelOf(input, partial.sector);
    return {
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
    if (top && top.proof.length >= 2 && !GENERIC_WORD_SECTORS.has(top.sector) && !contested) {
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

  // B. Weak storefront signals (e.g. product schema + prices only).
  if (storefront.grade === "weak") {
    if (top) {
      reasons.push(`Beperkt winkelbewijs (${storefront.groups.join(", ")}) verliest van structureel sectorbewijs (${top.proof.join(", ")}).`);
      return specialist(top, false);
    }
    if (input.current.sector === "ecommerce" || input.commerce.previouslyConfirmed) {
      reasons.push(`Webshop bevestigd door eerdere lagen en ${storefront.groups.join(", ") || "bestaand bewijs"}.`);
      return build({ role: "storefront", sector: "ecommerce", status: "probable", confidenceScore: 84, commerceConfirmed: true, structural: storefront.groups });
    }
    if (input.identitySectors.includes(input.current.sector) && !GENERIC_WORD_SECTORS.has(input.current.sector)) {
      reasons.push("Beperkt winkelbewijs; de eerder bepaalde identiteit staat in titel/koppen en blijft behouden.");
      return build({ role: "specialist_business", sector: input.current.sector, key: input.current.key, label: input.current.label, status: "probable", confidenceScore: 78, commerceConfirmed: false });
    }
    reasons.push(`Product-/prijssignalen (${storefront.groups.join(", ")}) zonder concurrerende structurele sector: waarschijnlijk webshop.`);
    return build({ role: "storefront", sector: "ecommerce", status: "probable", confidenceScore: 78, commerceConfirmed: true, structural: storefront.groups });
  }

  // C. No purchase structure.
  if (top && !contested) {
    reasons.push(`Structureel bewijs voor ${labelOf(input, top.sector)}: ${top.proof.join(", ")}.`);
    return specialist(top, false);
  }
  if (contested && top) {
    reasons.push("Meerdere sectoren hebben even sterk structureel bewijs; geen betrouwbare hoofdsector.");
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
  const identityCompetitors = input.identitySectors.filter(sector => sector !== "ecommerce");
  if (current && current !== "unknown" && current !== "ecommerce" && input.identitySectors.includes(current)) {
    if (identityCompetitors.length >= 3) {
      reasons.push("Titel/koppen bevatten termen van drie of meer sectoren; geen betrouwbare hoofdsector.");
      return build({ role: "unconfirmed", sector: "unknown", label: FALLBACK_LABELS.unknown, status: "uncertain", confidenceScore: 40, commerceConfirmed: false });
    }
    reasons.push("Sector alleen ondersteund door termen in titel/koppen/omschrijving; geen structureel bewijs.");
    return build({
      role: "specialist_business", sector: current, key: input.current.key, label: input.current.label,
      status: "probable", confidenceScore: Math.min(75, Math.max(60, input.current.confidenceScore)), commerceConfirmed: false,
    });
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
  extra: { siteSampleProduct: boolean; previouslyConfirmed: boolean },
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
