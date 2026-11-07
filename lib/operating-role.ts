/**
 * P0-1 (7 Nov 2026): business model before sector.
 *
 * One operating role per scan, with its own confidence, source evidence and
 * counter-evidence. The role decides what the sector may claim:
 *  - a platform is never confirmed as the provider it lists;
 *  - a holding with several proven activities gets no single confirmed sector;
 *  - conflicting role evidence leaves the sector unconfirmed;
 *  - a sector is only confirmed (>= 80) with two INDEPENDENT sources. Two
 *    fields of the same homepage are one source; independent sources are
 *    distinct own pages (template, alias and editorial pages already excluded
 *    by the page-vote functions) or a functional proof (own cart/checkout).
 * No domain or brand rules: the inputs are evidence the scan already collected.
 */

export type OperatingRole = "own_service" | "webshop" | "manufacturer" | "platform" | "publisher" | "holding" | "unknown";

export const OPERATING_ROLE_LABELS: Record<OperatingRole, string> = {
  own_service: "Eigen dienstverlener",
  webshop: "Webshop / eigen verkoper",
  manufacturer: "Fabrikant / producent",
  platform: "Platform / marktplaats / bemiddelaar",
  publisher: "Informatieve website / uitgever",
  holding: "Holding / concern met meerdere activiteiten",
  unknown: "Bedrijfsmodel niet bevestigd",
};

/** One piece of evidence with the place it was found. */
export type RoleSource = { source: string; text: string };

export type OperatingRoleInput = {
  sector: string;
  key: string;
  sectorConfidence: number;
  /** Homepage evidence per role (own title/description/H1/schema = ONE source). */
  homepage: Partial<Record<Exclude<OperatingRole, "unknown" | "holding">, string[]>>;
  /** Distinct own pages (URL) supporting the decided sector; homepage excluded. */
  sectorSupportPages: RoleSource[];
  /** Distinct own pages voting for another sector. */
  otherSectorPages: RoleSource[];
  /** Functional proof of an own shop (cart/checkout/product pages), with URL. */
  ownShopFunction: RoleSource[];
  /** The decided sector is retail/e-commerce (the shop IS the primary activity). */
  retailSector: boolean;
  /** Own-fields wording that the organisation is a group/holding. */
  groupWording: string | null;
  /** Distinct proven activities (sectors) besides the decided one. */
  otherActivities: string[];
};

export type OperatingRoleResult = {
  role: OperatingRole;
  label: string;
  confidenceScore: number;
  status: "confirmed" | "probable" | "unconfirmed";
  evidence: RoleSource[];
  counterEvidence: RoleSource[];
  independentSources: number;
  /** Capabilities that are not the primary role (a museum ticket shop, an insurer's online sign-up). */
  secondaryCapabilities: string[];
  /** Maximum sector confidence the role allows, with the reason; null = no cap. */
  sectorCap: { max: number; reason: string } | null;
};

const status = (score: number): OperatingRoleResult["status"] => (score >= 80 ? "confirmed" : score >= 60 ? "probable" : "unconfirmed");
const HOME = "homepage";

// Sectors whose own activity is a service delivered by the organisation itself.
const PLATFORM_SECTOR_KEYS = /^(?:service_marketplace|comparison_platform|marketplace|travel|ota|booking_platform)$/;

export function determineOperatingRole(input: OperatingRoleInput): OperatingRoleResult {
  const home = input.homepage;
  const has = (role: keyof OperatingRoleInput["homepage"]) => (home[role] || []).length > 0;
  const homeLines = (role: keyof OperatingRoleInput["homepage"]) => (home[role] || []).map((text) => ({ source: HOME, text }));
  const evidence: RoleSource[] = [];
  const counter: RoleSource[] = [];
  let role: OperatingRole = "unknown";

  const holding = Boolean(input.groupWording) && input.otherActivities.length >= 1;
  const platformSector = PLATFORM_SECTOR_KEYS.test(input.key) || input.sector === "service_marketplace";
  const shopFunction = input.ownShopFunction.length > 0;

  if (holding) {
    role = "holding";
    evidence.push({ source: HOME, text: `Eigen omschrijving als groep/concern: "${input.groupWording}"` });
    evidence.push({ source: "activiteiten", text: `Meerdere bewezen activiteiten: ${[input.sector, ...input.otherActivities].join(", ")}` });
  } else if (has("platform") || platformSector) {
    role = "platform";
    evidence.push(...homeLines("platform"));
    if (!has("platform")) evidence.push({ source: HOME, text: "Hoofdactiviteit is bemiddeling of vergelijking voor derden" });
    // A platform whose homepage also presents its own establishment, or whose
    // decided sector is an own trade, is contradictory: never a confirmed provider.
    if (has("own_service")) counter.push(...homeLines("own_service"));
    if (has("platform") && !platformSector && input.sector !== "unknown") counter.push({ source: HOME, text: `Platform-signalen op de homepage, maar de branche (${input.key}) beschrijft een eigen dienst` });
  } else if (has("manufacturer")) {
    role = "manufacturer";
    evidence.push(...homeLines("manufacturer"));
  } else if (has("webshop") || (shopFunction && input.retailSector)) {
    role = "webshop";
    evidence.push(...homeLines("webshop"), ...input.ownShopFunction.slice(0, 3));
  } else if (has("publisher")) {
    role = "publisher";
    evidence.push(...homeLines("publisher"));
  } else if (has("own_service")) {
    role = "own_service";
    evidence.push(...homeLines("own_service"));
  } else if (input.sector !== "unknown") {
    // A known sector without a specific role signal: the organisation delivers
    // its own activity; that is still only as strong as the sector evidence.
    role = "own_service";
    evidence.push({ source: HOME, text: "Eigen hoofdactiviteit zonder kenmerken van platform, webshop, fabrikant of uitgever" });
  }

  // Independent sources: the homepage once, each distinct own page, a functional proof.
  const sources = new Set<string>();
  if (evidence.some((item) => item.source === HOME) || input.sector !== "unknown") sources.add(HOME);
  for (const page of input.sectorSupportPages) sources.add(page.source);
  if (shopFunction && role === "webshop") for (const page of input.ownShopFunction) sources.add(page.source);
  const secondaryCapabilities = shopFunction && role !== "webshop" ? [`Online verkoop/bestellen als nevenfunctie (${input.ownShopFunction.length} pagina('s))`] : [];
  const independent = role === "unknown" ? 0 : sources.size;
  // Every independent source is named, so the decision can be checked page by page.
  if (role !== "unknown") evidence.push(...input.sectorSupportPages.slice(0, 4));

  // Sector counter-evidence: own pages declaring another activity than the decided one.
  const otherVotes = input.otherSectorPages.length;
  const supportVotes = input.sectorSupportPages.length;
  if (role !== "holding" && otherVotes >= 2 && otherVotes > supportVotes) {
    counter.push(...input.otherSectorPages.slice(0, 3).map((p) => ({ source: p.source, text: `Eigen pagina beschrijft een andere activiteit: ${p.text}` })));
  }

  const conflict = counter.length > 0;
  let confidence = role === "unknown" ? 0 : independent >= 3 ? 90 : independent === 2 ? 82 : 70;
  if (conflict) confidence = Math.min(confidence, 55);
  // Holding and conflict: shown as "waarschijnlijk, niet bevestigd" (65); a sector shown below 60 would contradict the report.

  let sectorCap: OperatingRoleResult["sectorCap"] = null;
  if (role === "holding") sectorCap = { max: 65, reason: "Concern met meerdere activiteiten: geen enkele branche als hoofdactiviteit bevestigd" };
  else if (conflict) sectorCap = { max: 65, reason: "Tegenstrijdig bewijs over de eigen activiteit: branche niet bevestigd" };
  else if (input.sector !== "unknown" && independent < 2) sectorCap = { max: 70, reason: "Eén onafhankelijke bron (alleen de homepage): branche waarschijnlijk, niet bevestigd" };

  return {
    role,
    label: OPERATING_ROLE_LABELS[role],
    confidenceScore: confidence,
    status: status(confidence),
    evidence: evidence.slice(0, 8),
    counterEvidence: counter.slice(0, 4),
    independentSources: independent,
    secondaryCapabilities,
    sectorCap,
  };
}

// Own title/description/H1 calling the organisation a group or holding.
const GROUP_WORDING = /(?<![\p{L}])(?:holding|holdings|concern|conglomera\p{L}*|groep|group|gruppe|groupe|grupo|gruppo|koncern|werkmaatschappijen|dochterondernemingen|subsidiaries|divisies|divisions|tochtergesellschaften|filiales)(?![\p{L}])/iu;
export function groupWordingIn(text: string): string | null {
  const match = GROUP_WORDING.exec(String(text || ""));
  return match ? match[0] : null;
}
