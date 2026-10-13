// Declared site identity: what a website says it IS, read only from the parts a
// site uses to name itself (title, meta description, og:site_name, the main H1,
// Organization/WebSite schema and the hostname). Body text, news headlines,
// customer stories and sample pages describe topics, not identity, and caused
// the sector errors of the 13 Oct 2026 sector run (a news site as transport, a
// payment platform as beauty, the tax authority as news, accounting software as
// a webshop, a job board as logistics). No brand names: category words only.
// Pure, import-free and regression-tested in tests/site-identity.test.mjs.

export type DeclaredSector = "government" | "news_media" | "saas_b2b" | "recruitment" | "finance" | "health_wellness";

export type DeclaredIdentity = { sector: DeclaredSector; label: string; evidence: string[] } | null;

export type DeclaredIdentityInput = {
  title: string;
  description: string;
  siteName?: string;
  h1s: string[];
  schemaTypes: string[];
  hostname: string;
};

const LABELS: Record<DeclaredSector, string> = {
  government: "Overheid & Publieke sector",
  news_media: "Nieuws & Media",
  saas_b2b: "SaaS / B2B",
  recruitment: "Recruitment & Werk",
  finance: "Financieel platform / betaaldiensten",
  health_wellness: "Zorg & Gezondheid",
};

const GOV_HOST = /(?:\.gov(?:\.[a-z]{2})?|\.gouv\.[a-z]{2}|\.gob\.[a-z]{2}|\.overheid\.nl|\.bund\.de|\.gc\.ca|\.europa\.eu|\.admin\.ch|\.gv\.at|\.belgium\.be|\.fgov\.be)$/i;
const GOV_SCHEMA = /^(?:governmentorganization|governmentoffice|governmentservice|governmentbuilding|cityhall|municipality|legislativebuilding)$/i;
const GOV_WORDS = /\b(?:rijksoverheid|overheid|gemeente|provincie|waterschap|ministerie|ministry|government|belastingdienst|tax (?:authority|administration)|finanzamt|bundesministerium|stadtverwaltung|municipality|city council|council tax|uwv|sociale verzekeringsbank|kamer van koophandel|politie|police department)\b/i;

const NEWS_SCHEMA = /^(?:newsmediaorganization|newsarticle)$/i;
const NEWS_WORDS = /\b(?:nieuws|het laatste nieuws|news|breaking news|nachrichten|actualit[eé]s?|notizie|noticias|krant|newspaper|dagblad|zeitung|journal)\b/i;

const SOFTWARE_SCHEMA = /^(?:softwareapplication|webapplication|mobileapplication)$/i;
const SOFTWARE_WORDS = /(?:\w*software\b|\b(?:saas|crm|erp|online boekhouden|boekhoudprogramma|boekhoudsoftware|boekhoudpakket|facturatie(?:software|programma)?|facturen maken|projectbeheer|planningssoftware|cloud(?:software| platform)|business software|app voor|platform voor (?:ondernemers|bedrijven|teams)|accounting software|invoicing software|project management|buchhaltungssoftware)\b)/i;
const SOFTWARE_TRIAL = /\b(?:gratis proberen|probeer (?:het )?gratis|start gratis|gratis (?:account|uitproberen|demo)|free trial|try (?:it )?(?:for )?free|request a demo|demo aanvragen|book a demo|kostenlos testen)\b/i;

const JOB_SCHEMA = /^(?:jobposting|employmentagency)$/i;
const JOB_WORDS = /\b(?:vacatures?|vacaturebank|banen|jobs? (?:board|site)|werk zoeken|stellenangebote|stellenb[öo]rse|offres d['’]emploi|ofertas de empleo|offerte di lavoro|job vacancies|find (?:a )?jobs?)\b/i;

const FINANCE_SCHEMA = /^(?:financialservice|paymentservice|bankorcreditunion|paymentcard|creditcard)$/i;
const FINANCE_WORDS = /\b(?:(?:online|fysieke|internationale|al je)(?: en fysieke)? betalingen|platform voor (?:al je )?(?:online )?betalingen|geld overmaken|geld (?:versturen|sturen)|betalingen beheren|send money|money transfer|betaalplatform|betaaloplossingen?|betaaldienst(?:verlener)?|payment (?:platform|provider|processing|solutions?)|online payments|accept payments|betalingen (?:ontvangen|accepteren|verwerken)|financial technology|fintech|acquiring|zahlungsl[öo]sungen?|zahlungsanbieter|solutions? de paiement|plateforme de paiement)\b/i;

const HEALTH_SCHEMA = /^(?:medicalorganization|hospital|physician|dentist|medicalclinic|pharmacy|medicalwebpage)$/i;
const HEALTH_WORDS = /\b(?:gezondheid|huisarts(?:en)?|ziekte|ziekenhuis|zorgverlener|medische informatie|pati[eë]nten|health information|hospital|gesundheit|krankenhaus|sant[ée]|salute)\b/i;

/** The main heading only when the page has one or two: many H1s are teasers. */
function mainHeadings(h1s: string[]): string[] {
  const unique = [...new Set(h1s.map((value) => value.trim()).filter(Boolean))];
  return unique.length <= 2 ? unique : unique.slice(0, 1);
}

export function identityText(input: Pick<DeclaredIdentityInput, "title" | "description" | "siteName" | "h1s">): string {
  return [input.title, input.description, input.siteName || "", ...mainHeadings(input.h1s)].join(" ");
}

export function declaredSiteIdentity(input: DeclaredIdentityInput): DeclaredIdentity {
  const text = identityText(input);
  const head = [input.title, input.siteName || ""].join(" ");
  const types = input.schemaTypes.map((type) => String(type));
  const host = input.hostname.toLowerCase();
  const found = (sector: DeclaredSector, evidence: string[]): DeclaredIdentity => ({ sector, label: LABELS[sector], evidence });

  // Government: an official host suffix or schema is decisive; a public-authority
  // name in the title or site name (not in body text) is too.
  const govSchema = types.find((type) => GOV_SCHEMA.test(type));
  if (GOV_HOST.test(host)) return found("government", [`Overheidsdomein: ${host}`]);
  if (govSchema) return found("government", [`Schema: ${govSchema}`]);
  const govTitle = head.match(GOV_WORDS);
  if (govTitle) return found("government", [`Overheidsidentiteit in title/sitenaam: "${govTitle[0]}"`]);

  // Payment and financial platforms (before software: they also sell an API).
  const financeSchema = types.find((type) => FINANCE_SCHEMA.test(type));
  const financeText = text.match(FINANCE_WORDS);
  if (financeText) return found("finance", [`Financiële dienstverlening in title/description: "${financeText[0]}"`, ...(financeSchema ? [`Schema: ${financeSchema}`] : [])]);

  // Job boards and recruiters.
  const jobSchema = types.find((type) => JOB_SCHEMA.test(type));
  const jobHead = head.match(JOB_WORDS);
  if (jobHead || (jobSchema && JOB_WORDS.test(text))) return found("recruitment", [jobHead ? `Vacature-identiteit in title/sitenaam: "${jobHead[0]}"` : `Schema: ${jobSchema}`]);

  // News publishers: a news word in the title or site name, or publisher schema.
  const newsSchema = types.find((type) => NEWS_SCHEMA.test(type));
  const newsHead = head.match(NEWS_WORDS);
  if (newsHead) return found("news_media", [`Nieuwsidentiteit in title/sitenaam: "${newsHead[0]}"`]);
  if (newsSchema) return found("news_media", [`Schema: ${newsSchema}`]);

  // Software: software words in title/description, plus a trial/demo offer or app schema.
  const softwareSchema = types.find((type) => SOFTWARE_SCHEMA.test(type));
  const softwareText = text.match(SOFTWARE_WORDS);
  if (softwareText && (softwareSchema || SOFTWARE_TRIAL.test(text) || SOFTWARE_WORDS.test(head))) {
    return found("saas_b2b", [`Software-identiteit in title/description: "${softwareText[0]}"`, ...(softwareSchema ? [`Schema: ${softwareSchema}`] : [])]);
  }

  // Health information and care providers.
  const healthSchema = types.find((type) => HEALTH_SCHEMA.test(type));
  const healthText = text.match(HEALTH_WORDS);
  const healthWords = new Set((text.match(new RegExp(HEALTH_WORDS.source, "gi")) || []).map((word) => word.toLowerCase()));
  if (healthSchema || (healthText && (HEALTH_WORDS.test(head) || healthWords.size >= 2))) return found("health_wellness", [healthSchema ? `Schema: ${healthSchema}` : `Zorgidentiteit in title/sitenaam: "${healthText?.[0]}"`]);

  return null;
}
