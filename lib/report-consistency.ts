/**
 * Central report self-check (RankFix 3.1).
 *
 * Every part of a report (sector label, sector evidence, active modules,
 * check advice, points, evidence URLs and scores) must describe the same
 * established facts. Individual detectors are allowed to be imperfect; this
 * module runs once, right before a report is stored or presented, and
 *   - corrects contradictions that have exactly one honest resolution, and
 *   - records every correction or remaining doubt in `selfCheck`, so the
 *     report says how reliable its own conclusions are.
 *
 * It contains no domain or brand rules: it only compares the report with itself.
 */

export type ConsistencyCheck = {
  key: string;
  title?: string;
  category?: string;
  status: string;
  issue_status: string;
  points: number;
  maxPoints: number;
  message: string;
  recommendation?: string;
  evidence?: { url: string; found: unknown; details: string; expected?: string };
};

export type ConsistencySector = {
  sector: string;
  key: string;
  label: string;
  confidence: string;
  confidenceScore: number;
  evidence: string[];
  applicableModules: string[];
};

export type SelfCheckEntry = { code: string; action: "corrected" | "flagged"; detail: string };

export type SelfCheck = {
  version: string;
  consistent: boolean;
  reliability: "high" | "medium" | "low";
  reliabilityReasons: string[];
  corrections: SelfCheckEntry[];
  flags: SelfCheckEntry[];
};

export const SELF_CHECK_VERSION = "selfcheck-1.1";

// Absolute claims that no limited automated check can support (security, WCAG).
const ABSOLUTE_CLAIM = /\b(?:volledig (?:veilig|toegankelijk|beveiligd)|website is (?:veilig|toegankelijk)|geen beveiligingsrisico'?s?|wcag[- ]?(?:conform|compliant)|voldoet aan (?:de )?wcag|fully (?:secure|accessible)|site is (?:secure|accessible)|no security risks?|vollständig (?:sicher|barrierefrei)|entièrement (?:sécurisé|accessible)|completamente (?:sicuro|accessibile|seguro|accesible))\b/gi;

/** Canonical family label per primary sector; used when a label contradicts its sector. */
export const SECTOR_FAMILY_LABEL: Record<string, string> = {
  financial_services: "Financiële diensten",
  ecommerce: "Webshop / e-commerce",
  real_estate: "Vastgoed & Makelaardij",
  automotive: "Automotive",
  home_services: "Lokale vakdienst",
  professional_services: "Zakelijke dienstverlening",
  hospitality: "Horeca & verblijf",
  health_wellness: "Zorg & Gezondheid",
  beauty: "Beauty & Verzorging",
  recruitment: "Recruitment & Werk",
  government: "Overheid & Publieke sector",
  news_media: "Nieuws & Media",
  tourism_recreation: "Toerisme & Recreatie",
  transport_travel: "Transport & Logistiek",
  telecom_technology: "Telecom & Technologie",
  saas_b2b: "SaaS / B2B software",
  education: "Onderwijs",
  nonprofit: "Stichting / non-profit",
  energy_utilities: "Energie & nutsvoorzieningen",
  events_culture: "Evenementen & cultuur",
  fitness_sports: "Sport & fitness",
  manufacturing_industrial: "Industrie & Productie",
  cybersecurity: "Cybersecurity & informatiebeveiliging",
  waste_recycling: "Afvalverwerking & recycling",
  sports_organizations: "Sportbond & sportorganisatie",
  maritime_ports: "Havenbedrijf & maritieme infrastructuur",
  airports: "Luchthaven & luchthavenexploitatie",
  agriculture_horticulture: "Landbouw & tuinbouw",
};

/**
 * Words a label may contain for each family. A label outside its family (for
 * example a dentist label on a news sector) is a contradiction.
 */
const FAMILY_LABEL_WORDS: Record<string, RegExp> = {
  financial_services: /financ|bank|verzeker|insur|betaal|payment|fintech|krediet|lening|hypothe|vermogen/i,
  ecommerce: /webshop|e-?commerce|shop|winkel|retail|marketplace|verkoop/i,
  real_estate: /vastgoed|makelaar|woning|real estate|verhuur|property/i,
  automotive: /auto|garage|dealer|car|vehicle|voertuig/i,
  home_services: /vakdienst|installat|bouw|aannemer|loodgiet|schoonmaak|klus|dak|elektric|schilder|home/i,
  professional_services: /zakelijk|dienstverlen|advocat|juridisch|legal|accountan|advies|consult|notaris|bureau|agency|professional/i,
  hospitality: /horeca|hotel|restaurant|caf[eé]|bar|b&b|bed|guest|camping|vakantie|accommodat|verblijf|hospitality|resort|chalet|lodging/i,
  health_wellness: /zorg|gezond|health|tandarts|dentist|kliniek|clinic|fysio|medisch|medical|apotheek|pharmac|dierenarts|veterin|therap|praktijk/i,
  beauty: /beauty|verzorging|kapper|hair|salon|schoonheid|spa|nagel|wellness/i,
  recruitment: /recruit|werk|vacature|uitzend|staffing|job/i,
  government: /overheid|publiek|gemeente|government|ministerie|public/i,
  news_media: /nieuws|news|media|publisher|blog|omroep|journal|magazine/i,
  tourism_recreation: /toeris|recreat|tourism|attract|vakantie|leisure/i,
  transport_travel: /transport|logistiek|logistics|vervoer|reis|travel|airline|spoor|rail|koerier/i,
  telecom_technology: /telecom|technolog|internet|mobiel|mobile|netwerk/i,
  saas_b2b: /saas|software|b2b|platform|app/i,
  education: /onderwijs|education|school|universit|opleiding|cursus|training/i,
  nonprofit: /stichting|non-?profit|goed doel|charity|ngo|vereniging/i,
  energy_utilities: /energie|energy|nuts|utilit|stroom|gas/i,
  events_culture: /event|evenement|cultuur|culture|museum|theater|ticket|festival/i,
  fitness_sports: /sport|fitness|gym|club/i,
  manufacturing_industrial: /industri|productie|fabrik|manufactur|b2b/i,
  cybersecurity: /cyber|informatiebeveilig|security|incident response/i,
  waste_recycling: /afval|recycl|waste|resource recovery|hergebruik/i,
  sports_organizations: /sport|voetbal|football|federati|olympi/i,
  maritime_ports: /haven|mariti|port|harbor|harbour|terminal/i,
  airports: /luchthaven|airport|aéroport|flughafen|aeroporto|aeropuerto/i,
  agriculture_horticulture: /landbouw|tuinbouw|agrar|horticultur|agricultur|teelt/i,
};

/** Sector-defining modules and the primary sector each one belongs to. */
const SECTOR_MODULE_OWNER: Record<string, string> = {
  automotive: "automotive",
  real_estate: "real_estate",
  recruitment: "recruitment",
  hospitality: "hospitality",
  accommodation: "hospitality",
  health_wellness: "health_wellness",
  beauty: "beauty",
  home_services: "home_services",
  professional_services: "professional_services",
  transport_travel: "transport_travel",
  telecom_technology: "telecom_technology",
  news_media: "news_media",
  government: "government",
  saas_b2b: "saas_b2b",
  education: "education",
  nonprofit: "nonprofit",
  energy_utilities: "energy_utilities",
  events_culture: "events_culture",
  fitness_sports: "fitness_sports",
  manufacturing_industrial: "manufacturing_industrial",
};

/** Legitimate hybrids: a primary sector may keep these secondary sector modules. */
const HYBRID_MODULES: Record<string, string[]> = {
  hospitality: ["events_culture", "fitness_sports", "beauty", "health_wellness", "transport_travel"],
  tourism_recreation: ["hospitality", "transport_travel", "events_culture", "fitness_sports"],
  transport_travel: ["hospitality"],
  health_wellness: ["beauty", "fitness_sports"],
  beauty: ["health_wellness"],
  fitness_sports: ["health_wellness", "events_culture"],
  events_culture: ["hospitality", "education"],
  education: ["events_culture"],
  real_estate: ["professional_services"],
  professional_services: ["real_estate"],
  home_services: ["professional_services"],
  automotive: ["home_services"],
  ecommerce: [],
};

/** Sectors that are not a local walk-in business: LocalBusiness advice contradicts them. */
const NON_LOCAL_SECTORS = new Set([
  "financial_services", "telecom_technology", "news_media", "saas_b2b", "government",
  "ecommerce", "education", "nonprofit", "energy_utilities", "recruitment",
]);

function registrableHost(host: string): string {
  const parts = host.toLowerCase().replace(/^www\./, "").split(".").filter(Boolean);
  if (parts.length <= 2) return parts.join(".");
  // Common two-level public suffixes (co.uk, com.au...) keep three labels.
  const sld = parts[parts.length - 2];
  if (["co", "com", "net", "org", "gov", "ac", "edu"].includes(sld) && parts[parts.length - 1].length === 2) return parts.slice(-3).join(".");
  return parts.slice(-2).join(".");
}

export function labelFitsSector(sector: string, label: string): boolean {
  const words = FAMILY_LABEL_WORDS[sector];
  return words ? words.test(label) : true;
}

export function enforceReportConsistency(input: {
  sector: ConsistencySector;
  checks: ConsistencyCheck[];
  scannedUrl: string;
  scores: { seo: number; geo: number; overall: number; mode: "both" | "seo" | "geo" };
  range?: { low: number; high: number } | null;
  coveragePercent: number;
  javascriptRequiredButNotRendered?: boolean;
  /** Final evidence level of the headline score ("complete" = Definitief). */
  evidenceLevel?: "complete" | "provisional" | "insufficient";
  /** Representative pages typed as product / financial product pages. */
  sampledProductPages?: number;
  sampledFinancialProductPages?: number;
  /** HTTP status the website gave the scanned page in the sample, and whether RankFix was blocked. */
  scannedPageSampleStatus?: number | null;
  scannerBlocked?: boolean;
  /** Security and accessibility checks are limited by nature: no absolute claims. */
  limitedChecks?: ConsistencyCheck[];
}): { selfCheck: SelfCheck; scores: { seo: number; geo: number; overall: number }; evidenceLevel?: "complete" | "provisional" | "insufficient" } {
  const corrections: SelfCheckEntry[] = [];
  const flags: SelfCheckEntry[] = [];
  const { sector } = input;
  const primary = sector.sector;

  // 1. Label must name the primary sector's family.
  if (primary !== "unknown" && FAMILY_LABEL_WORDS[primary] && !labelFitsSector(primary, sector.label)) {
    const canonical = SECTOR_FAMILY_LABEL[primary] || sector.label;
    corrections.push({ code: "sector_label_mismatch", action: "corrected", detail: `Label "${sector.label}" past niet bij sector ${primary}; vervangen door "${canonical}".` });
    sector.label = canonical;
  }

  // 2. "Primaire identiteit" evidence must describe the primary sector itself.
  if (primary !== "unknown" && FAMILY_LABEL_WORDS[primary]) {
    const kept = sector.evidence.filter((line) => {
      const m = /^Primaire identiteit:\s*(.+)$/i.exec(line);
      if (!m) return true;
      // Generic lines ("4 onafhankelijke sectorsignalen") are fine; a line that
      // names another sector family and not this one is a contradiction.
      const namesOther = Object.entries(FAMILY_LABEL_WORDS).some(([family, words]) => family !== primary && words.test(m[1]));
      const fits = FAMILY_LABEL_WORDS[primary].test(m[1]) || !namesOther;
      if (!fits) corrections.push({ code: "sector_evidence_mismatch", action: "corrected", detail: `Bewijsregel "${line}" hoort niet bij sector ${primary} en is verwijderd.` });
      return fits;
    });
    sector.evidence = kept.length ? kept : sector.evidence;
  }

  // 3. Sector-defining modules must belong to the primary sector (or an allowed hybrid).
  const allowedHybrids = new Set(HYBRID_MODULES[primary] || []);
  const modules = sector.applicableModules.filter((module) => {
    const owner = SECTOR_MODULE_OWNER[module];
    if (!owner || owner === primary) return true;
    if (allowedHybrids.has(owner)) return true;
    corrections.push({ code: "foreign_sector_module", action: "corrected", detail: `Module ${module} hoort bij sector ${owner}, niet bij ${primary}; uitgeschakeld.` });
    return false;
  });
  sector.applicableModules = [...new Set(modules)];

  // 4. Points and statuses: unknown/not-applicable never carry points; points within bounds.
  for (const item of input.checks) {
    if ((item.issue_status === "NOT_APPLICABLE" || item.issue_status === "UNABLE_TO_CONFIRM") && item.points !== 0) {
      corrections.push({ code: "points_on_unscored_check", action: "corrected", detail: `${item.key}: ${item.points} punten op een ${item.issue_status.toLowerCase()}-controle teruggezet naar 0.` });
      item.points = 0;
    }
    if (item.points > item.maxPoints || item.points < 0) {
      corrections.push({ code: "points_out_of_bounds", action: "corrected", detail: `${item.key}: ${item.points}/${item.maxPoints} begrensd.` });
      item.points = Math.max(0, Math.min(item.maxPoints, item.points));
    }
    if (item.issue_status === "PASS" && item.maxPoints > 0 && item.points === 0) {
      flags.push({ code: "pass_without_points", action: "flagged", detail: `${item.key}: geslaagd maar 0 punten.` });
    }
  }

  // 5. Advice must fit the established sector: no LocalBusiness advice for a
  //    sector that is not a local walk-in business.
  if (NON_LOCAL_SECTORS.has(primary)) {
    for (const item of input.checks) {
      if (item.key !== "schema" && item.key !== "organization_website") continue;
      const before = item.message + "|" + (item.recommendation || "");
      item.message = item.message.replace(/voor deze lokale bedrijfs-\/dienstpagina/g, "voor deze pagina");
      if (item.recommendation) item.recommendation = item.recommendation.replace(/Voor dit paginatype is [A-Za-z]*LocalBusiness de belangrijkste richting\./, primary === "news_media" ? "Voor een nieuws-/mediaorganisatie zijn NewsMediaOrganization en WebSite de belangrijkste richting." : "Voor deze organisatie zijn Organization en WebSite de belangrijkste richting.");
      if (before !== item.message + "|" + (item.recommendation || "")) corrections.push({ code: "advice_sector_mismatch", action: "corrected", detail: `${item.key}: LocalBusiness-advies past niet bij sector ${primary}; aangepast.` });
    }
  }

  // 6. Evidence isolation: every evidence URL belongs to the scanned site.
  const scannedSite = (() => { try { return registrableHost(new URL(input.scannedUrl).hostname); } catch { return ""; } })();
  for (const item of input.checks) {
    const url = item.evidence?.url;
    if (!url || !scannedSite) continue;
    let host = "";
    try { host = registrableHost(new URL(url).hostname); } catch { continue; }
    if (host !== scannedSite) {
      corrections.push({ code: "foreign_evidence_url", action: "corrected", detail: `${item.key}: bewijs-URL ${url} hoort niet bij de gescande site; vervangen door de gescande URL.` });
      item.evidence = { ...item.evidence!, url: input.scannedUrl };
    }
  }

  // 6b. One finding per (category, key). A second check with the same key is a
  //     duplicated or contradicting conclusion; it is recorded, never hidden.
  {
    const seen = new Map<string, string>();
    for (const item of input.checks) {
      const id = `${item.category || ""}:${item.key}`;
      const previous = seen.get(id);
      if (previous !== undefined) flags.push({ code: previous === item.issue_status ? "duplicate_finding" : "contradicting_finding", action: "flagged", detail: `${item.key}: dubbele bevinding (${previous} en ${item.issue_status}).` });
      else seen.set(id, item.issue_status);
    }
  }

  // 7. Scores: 100 only when nothing is left to improve; score within its own range.
  const scored = (group?: string) => input.checks.filter((item) => (!group || item.category === group) && item.maxPoints > 0);
  const hasIssue = (items: ConsistencyCheck[]) => items.some((item) => item.issue_status === "WARNING" || item.issue_status === "FAIL");
  let { seo, geo, overall } = input.scores;
  if (seo > 99 && hasIssue(scored("seo"))) { corrections.push({ code: "perfect_score_with_issue", action: "corrected", detail: "SEO 100 met een open SEO-issue → 99." }); seo = 99; }
  if (geo > 99 && hasIssue(scored("geo"))) { corrections.push({ code: "perfect_score_with_issue", action: "corrected", detail: "GEO 100 met een open GEO-issue → 99." }); geo = 99; }
  if (overall > 99 && hasIssue(scored())) { corrections.push({ code: "perfect_score_with_issue", action: "corrected", detail: "Totaalscore 100 met een open issue → 99." }); overall = 99; }
  if (input.scores.mode === "both") {
    const expected = Math.round(seo * 0.6 + geo * 0.4);
    if (Math.abs(expected - overall) > 1 && overall > expected) {
      corrections.push({ code: "overall_above_weighted", action: "corrected", detail: `Totaal ${overall} lag boven 0,6×SEO + 0,4×GEO = ${expected}.` });
      overall = expected;
    } else if (Math.abs(expected - overall) > 1) {
      flags.push({ code: "overall_capped", action: "flagged", detail: `Totaal ${overall} is lager dan 0,6×SEO + 0,4×GEO = ${expected} door een bewezen kritieke bevinding.` });
    }
  }
  if (input.range && (overall < input.range.low || overall > input.range.high)) {
    flags.push({ code: "score_outside_range", action: "flagged", detail: `Score ${overall} valt buiten het bereik ${input.range.low}–${input.range.high}.` });
  }

  // 8. Score certainty: "Definitief" (complete) is impossible next to an
  //    unconfirmed scored check; such a score keeps an uncertainty range.
  let evidenceLevel = input.evidenceLevel;
  const unconfirmedScored = input.checks.filter((item) => item.issue_status === "UNABLE_TO_CONFIRM" && item.maxPoints > 0).length;
  if (evidenceLevel === "complete" && unconfirmedScored > 0) {
    corrections.push({ code: "final_score_with_unconfirmed", action: "corrected", detail: `Score stond als definitief terwijl ${unconfirmedScored} controle(s) niet bevestigd zijn; voorlopig gemaakt.` });
    evidenceLevel = "provisional";
  }
  if (evidenceLevel === "complete" && input.range && input.range.low < input.range.high) {
    corrections.push({ code: "final_score_with_range", action: "corrected", detail: `Score stond als definitief naast een bereik ${input.range.low}–${input.range.high}; voorlopig gemaakt.` });
    evidenceLevel = "provisional";
  }

  // 9. Applicability wording uses the same product evidence as the sample: never
  //    "no products found" next to sampled product or financial-product pages.
  if ((input.sampledProductPages || 0) > 0 || (input.sampledFinancialProductPages || 0) > 0) {
    for (const item of input.checks) {
      if (item.issue_status !== "NOT_APPLICABLE" || !/geen producten of productpagina|geen product-, prijs-|no products (?:or product pages )?(?:were )?found/i.test(item.message)) continue;
      const replacement = (input.sampledProductPages || 0) > 0
        ? "Er zijn productpagina's gevonden, maar deze controle hoort bij een functie die voor deze website niet is bevestigd; niet van toepassing."
        : "De gevonden productpagina's beschrijven financiële producten, geen fysieke retailproducten; deze retailcontrole is niet van toepassing.";
      corrections.push({ code: "na_contradicts_product_sample", action: "corrected", detail: `${item.key}: N.v.t.-tekst ontkende productpagina's die wel in de steekproef staan.` });
      item.message = replacement;
      if (item.evidence) item.evidence = { ...item.evidence, details: replacement };
    }
  }

  // 10. HTTP status: the status check and the sample of the same URL agree, and a
  //     block aimed at RankFix is never presented as a website error.
  const statusCheck = input.checks.find((item) => item.key === "status");
  if (statusCheck && (statusCheck.issue_status === "WARNING" || statusCheck.issue_status === "FAIL")) {
    const reported = Number((statusCheck.message.match(/HTTP (\d{3})/) || [])[1] || NaN);
    if (input.scannerBlocked || (typeof input.scannedPageSampleStatus === "number" && Number.isFinite(reported) && input.scannedPageSampleStatus !== reported)) {
      flags.push({ code: "http_status_contradiction", action: "flagged", detail: `HTTP-statuscontrole meldt ${reported}, de steekproef van dezelfde URL ${input.scannedPageSampleStatus ?? "?"}${input.scannerBlocked ? " (RankFix geblokkeerd)" : ""}.` });
    }
  }

  // 11. Limited checks never claim that a site is secure or accessible.
  for (const item of [...input.checks, ...(input.limitedChecks || [])]) {
    if (!ABSOLUTE_CLAIM.test(item.message)) continue;
    ABSOLUTE_CLAIM.lastIndex = 0;
    corrections.push({ code: "absolute_claim_in_limited_check", action: "corrected", detail: `${item.key}: absolute veiligheids-/toegankelijkheidsclaim verwijderd.` });
    item.message = item.message.replace(ABSOLUTE_CLAIM, "geen problemen gevonden in deze beperkte controle");
  }
  ABSOLUTE_CLAIM.lastIndex = 0;

  // 12. Reliability: say how much the conclusions can be trusted.
  const reasons: string[] = [];
  if (input.coveragePercent < 70) reasons.push(`Slechts ${input.coveragePercent}% van de relevante controles kon worden beoordeeld.`);
  else if (input.coveragePercent < 90) reasons.push(`${input.coveragePercent}% van de relevante controles kon worden beoordeeld.`);
  if (input.javascriptRequiredButNotRendered) reasons.push("De pagina heeft JavaScript nodig, maar kon niet volledig worden gerenderd.");
  if (primary === "unknown") reasons.push("De primaire sector kon niet worden bevestigd; sectorspecifieke controles zijn beperkt.");
  else if (sector.confidenceScore < 70) reasons.push(`Sectorherkenning heeft lage zekerheid (${sector.confidenceScore}).`);
  const severe = input.coveragePercent < 70 || (input.javascriptRequiredButNotRendered && input.coveragePercent < 90);
  const reliability: SelfCheck["reliability"] = severe ? "low" : reasons.length ? "medium" : "high";

  return {
    selfCheck: {
      version: SELF_CHECK_VERSION,
      consistent: corrections.length === 0 && flags.filter((f) => ["score_outside_range", "contradicting_finding"].includes(f.code)).length === 0,
      reliability,
      reliabilityReasons: reasons,
      corrections,
      flags,
    },
    scores: { seo, geo, overall },
    evidenceLevel,
  };
}
