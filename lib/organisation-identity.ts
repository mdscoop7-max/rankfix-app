/**
 * Mission-driven organisations (charities, conservation, humanitarian, member
 * associations) and construction/infrastructure groups, from identity evidence
 * only (title, description, H1, site name, navigation, typed schema).
 * Generic multilingual vocabulary; no organisation names or domains.
 *
 * Why this exists: a charity homepage says "nieuws" and "verhalen" in title and
 * description and was read as a publisher; a conservation association has no word
 * "stichting" and fell through to "zakelijke dienstverlening"; construction and
 * infrastructure groups describe projects, not "aannemer", and stayed unknown.
 */

const B = "(?<![\\p{L}\\p{N}])";
const rx = (list: string[], stem = false) => new RegExp(`${B}(?:${list.join("|")})${stem ? "\\p{L}*" : "(?![\\p{L}])"}`, "iu");

// Groups of independent concepts: two different groups are required.
const MISSION = rx(["stichting", "vereniging", "goed doel", "goede doelen", "hulporganisatie", "hulpverlening", "noodhulp", "humanitair", "humanitaire", "natuurbehoud", "natuurbescherming", "natuurorganisatie", "natuurmonument", "natuurgebied", "natuurgebieden", "bescherm(?:t|en)? (?:de )?natuur", "behoud van natuur", "charity", "non-?profit", "ngo", "humanitarian", "conservation", "wildlife", "nature reserves?", "relief organi[sz]ation", "stiftung", "hilfsorganisation", "naturschutz", "fondation", "association caritative", "protection de la nature", "fundaci[oó]n", "organizaci[oó]n ben[eé]fica", "fondazione", "organizzazione non profit", "protezione della natura"], true);
const SUPPORT_ACTION = rx(["doneer", "doneren", "donatie", "gift", "schenking", "steun ons", "steun (?:de )?natuur", "word lid", "lid worden", "meld je aan als lid", "word donateur", "donateur", "vrijwilliger", "vrijwilligerswerk", "nalaten", "donate", "give now", "make a donation", "support us", "become a member", "membership", "volunteer", "spenden", "spende", "mitglied werden", "ehrenamt", "faire un don", "devenir membre", "b[eé]n[eé]vole", "donar", "hazte socio", "voluntari[oa]", "dona ora", "diventa socio", "volontari"], true);
// Fresh144 (6b741e96, Hartstichting read as health care): Dutch/German names are
// compounds ("Hartstichting", "Nierstichting", "Kinderpostzegels-vereniging",
// "Krebsstiftung"), so the word-boundary MISSION list never saw "stichting".
// A compound legal-form suffix is the same mission concept; it still needs an
// independent support action (doneren, nalaten, vrijwilliger) to be primary.
// Deliberately no "fonds" (pension and investment funds are financial).
const MISSION_COMPOUND = /\p{L}{3,}(?:stichting|vereniging|stiftung)(?![\p{L}])/iu;
// A compound alone is weaker than the word: a care or housing foundation
// ("Zorgstichting", "Woningstichting") also recruits volunteers. It counts only
// together with fundraising as the main action (donating, legacies, collecting).
const FUNDRAISING = rx(["doneer", "doneren", "donatie", "donateur", "word donateur", "schenking", "nalaten", "collectant", "collecte", "steun ons", "donate", "make a donation", "give now", "spenden", "spende", "faire un don", "donar", "dona ora"], true);
const NGO_SCHEMA = new Set(["ngo", "nonprofitorganization", "charity"]);
const ANBI = /\banbi\b|charity registration|registered charity|gemeinn[üu]tzig|association loi 1901/i;

// Customer/audience declarations are supporting topics, not the provider's trade.
const AUDIENCE_PROVIDER=/\b(?:consultancy|consultants?|adviesbureau|marketing agency|software|saas|cloud platform|logiciel|beratung|softwareanbieter|agenzia|agencia)\b/i;
const AUDIENCE_LINK=/\b(?:for|voor|pour|für|para|per)\b/i;
function servesAudience(own:string){return AUDIENCE_PROVIDER.test(own)&&AUDIENCE_LINK.test(own);}

export function missionOrganisationIdentity(input: { title?: string; description?: string; h1?: string; siteName?: string; navLabels?: string[]; schemaTypes?: string[] }) {
  const own = [input.title, input.description, input.h1, input.siteName].filter(Boolean).join(" · ");
  const nav = (input.navLabels || []).join(" · ");
  const schema = new Set((input.schemaTypes || []).map((t) => t.toLowerCase()));
  const schemaNgo = [...schema].some((t) => NGO_SCHEMA.has(t));
  const missionWord = MISSION.test(own);
  const missionCompound = !missionWord && MISSION_COMPOUND.test(own) && FUNDRAISING.test(`${own} · ${nav}`);
  const mission = missionWord || missionCompound;
  const supportOwn = SUPPORT_ACTION.test(own);
  const supportNav = SUPPORT_ACTION.test(nav);
  const anbi = ANBI.test(`${own} ${nav}`);
  const evidence: string[] = [];
  if (schemaNgo) evidence.push("Structured data: non-profit-/goededoelenorganisatie");
  if (mission) evidence.push("Eigen identiteit noemt een missie (goed doel, natuurbehoud, hulporganisatie of vereniging)");
  if (supportOwn || supportNav) evidence.push("Doneren, lid worden of vrijwilliger worden als hoofdactie");
  if (anbi) evidence.push("Goededoelenregistratie (ANBI of gelijkwaardig)");
  // Mission + support action, or typed non-profit schema with either, or ANBI with a mission.
  const primary = !servesAudience([input.title,input.h1,input.siteName].filter(Boolean).join(" · ")) && ((mission && (supportOwn || supportNav)) || (schemaNgo && (mission || supportOwn || supportNav)) || (anbi && mission));
  return { primary, mission, support: supportOwn || supportNav, evidence };
}

const CONSTRUCTION_CORE = rx(["bouwgroep", "bouwbedrijf", "bouwbedrijven", "bouwconcern", "bouw en infra", "bouw- en infra", "bouw, infra", "infrabedrijf", "infrastructuur", "civiele techniek", "wegenbouw", "grond-?, weg-? en waterbouw", "gww", "waterbouw", "projectontwikkeling", "gebiedsontwikkeling", "utiliteitsbouw", "woningbouw", "installatietechniek", "construction group", "construction company", "civil engineering", "infrastructure", "contractor", "general contractor", "building contractor", "real estate development", "bauunternehmen", "baukonzern", "tiefbau", "hochbau", "infrastrukturprojekte", "entreprise de construction", "groupe de construction", "travaux publics", "genie civil", "empresa constructora", "grupo constructor", "obra civil", "impresa di costruzioni", "gruppo di costruzioni", "ingegneria civile"], true);
const CONSTRUCTION_ACTIVITY = rx(["projecten", "projects", "realiseren", "realiseert", "bouwt", "bouwen", "bouwprojecten", "ontwerp(?:en)?", "ontwikkel(?:en|t)", "renovatie", "verbouw", "onderhoud", "beheer", "building", "builds", "develops?", "design and build", "bauen", "baut", "b[aâ]timent", "construit", "construye", "costruisce"], true);

export function constructionGroupIdentity(input: { title?: string; description?: string; h1?: string; siteName?: string; navLabels?: string[]; schemaTypes?: string[] }) {
  const own = [input.title, input.description, input.h1, input.siteName].filter(Boolean).join(" · ");
  const nav = (input.navLabels || []).join(" · ");
  const schema = new Set((input.schemaTypes || []).map((t) => t.toLowerCase()));
  const core = CONSTRUCTION_CORE.test(own);
  const coreNav = CONSTRUCTION_CORE.test(nav);
  const activity = CONSTRUCTION_ACTIVITY.test(own) || CONSTRUCTION_ACTIVITY.test(nav);
  const schemaType = schema.has("generalcontractor") || schema.has("homeandconstructionbusiness") || schema.has("roofingcontractor");
  const evidence: string[] = [];
  if (schemaType) evidence.push("Structured data: aannemer/bouwbedrijf");
  if (core) evidence.push("Eigen identiteit noemt bouw, infrastructuur of ontwikkeling van projecten");
  else if (coreNav) evidence.push("Navigatie noemt bouw- of infrastructuurdiensten");
  if (activity) evidence.push("Beschrijft het realiseren of ontwikkelen van projecten");
  const primary = !servesAudience([input.title,input.h1,input.siteName].filter(Boolean).join(" · ")) && (schemaType || (core && activity) || (core && coreNav));
  return { primary, evidence };
}
