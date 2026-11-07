/**
 * P0-1 (7 Nov 2026): business model before sector. A site that lets visitors
 * find, compare or review MANY providers of a trade ("Vergelijk 3.029
 * sportscholen", "Top 20 kappers in Amsterdam", "Find 9,000 salons near you")
 * is a directory/platform about that trade, not a provider of it. A gym chain
 * counting its OWN clubs ("onze 200 clubs") is not a directory.
 *
 * Evidence comes only from the site's own title, description and H1. Both
 * signals are required: (A) a counted or ranked set of providers named by a
 * plural trade noun, and (B) a visitor discovery action or discovery context.
 * No domain or brand rules.
 */

// Singular provider nouns (any trade). A compound ending in one of them counts
// ("schoonheidssalon", "autogarage", "fysiotherapiepraktijk").
const PROVIDER_NOUNS = [
  "sportschool", "fitnessclub", "fitnesscentrum", "gym", "yogastudio", "kapper", "kapsalon", "salon", "barbier", "barber",
  "tandarts", "huisarts", "arts", "fysiotherapeut", "therapeut", "praktijk", "kliniek", "dierenarts", "opticien", "apotheek",
  "restaurant", "hotel", "camping", "vakantiepark", "bed and breakfast", "garage", "autobedrijf", "rijschool", "school",
  "kinderopvang", "makelaar", "advocaat", "notaris", "accountant", "installateur", "loodgieter", "aannemer", "schilder",
  "hovenier", "dakdekker", "elektricien", "klusbedrijf", "verhuizer", "schoonmaakbedrijf", "aanbieder", "specialist",
  "vakman", "vakmens", "professional", "dienstverlener", "bedrijf", "coach", "trainer", "provider", "dentist", "doctor",
  "plumber", "lawyer", "attorney", "contractor", "electrician", "studio", "spa", "massagesalon", "nagelstudio", "nagelstyliste",
  "fitnessstudio", "zahnarzt", "anwalt", "handwerker", "friseur", "dentiste", "avocat", "coiffeur", "artisan",
];
// Units of the organisation itself: counting them describes a chain, not a directory.
const OWN_UNITS = /^(?:clubs?|vestigingen|vestiging|locaties|locatie|filialen|filiaal|winkels?|stores?|branches|locations?|clubhuizen|centra)$/iu;

function singulars(word: string): string[] {
  const w = word.toLowerCase().replace(/['’]s$/u, "");
  const out = new Set([w]);
  if (/s$/u.test(w)) out.add(w.slice(0, -1));
  if (/en$/u.test(w)) {
    let stem = w.slice(0, -2);
    if (/ven$/u.test(w)) stem = stem.slice(0, -1) + "f";
    if (/zen$/u.test(w)) stem = stem.slice(0, -1) + "s";
    out.add(stem);
    // notarissen → notaris, praktijken → praktijk
    if (/([bcdfgklmnprst])\1$/u.test(stem)) out.add(stem.slice(0, -1));
    // sportscholen → sportschool, advocaten → advocaat, apotheken → apotheek
    const m = /^(.*[^aeiou])([aeou])([^aeiouy])$/u.exec(stem);
    if (m) out.add(m[1] + m[2] + m[2] + m[3]);
  }
  return [...out];
}

function providerNoun(word: string): string | null {
  if (OWN_UNITS.test(word)) return null;
  // Only plural forms describe a set of providers.
  if (!/(?:s|en|'s|’s)$/iu.test(word)) return null;
  for (const s of singulars(word)) {
    if (s === word.toLowerCase()) continue;
    const hit = PROVIDER_NOUNS.find((noun) => s === noun || (s.endsWith(noun) && s.length - noun.length >= 3));
    if (hit) return word;
  }
  return null;
}

const WORD = "[\\p{L}][\\p{L}'’-]*";
const NUMBER = "(?:\\d{1,3}(?:[.,]\\d{3})+|\\d{2,})\\+?";
const COUNTED = new RegExp(`(?<![\\p{L}\\d])(?:(?:meer\\s+dan|ruim|bijna|over|more\\s+than|mehr\\s+als|plus\\s+de)\\s+)?${NUMBER}\\s+((?:${WORD}\\s+){0,2}?)(${WORD})`, "giu");
const RANKED = new RegExp(`(?<![\\p{L}])(?:top\\s*\\d{1,3}|de\\s+beste|alle|the\\s+best|best|all)\\s+(${WORD})(?:\\s+(${WORD}))?`, "giu");
const OWN_POSSESSIVE = /(?<![\p{L}])(?:onze|ons|eigen|our|own|unsere?n?|nos|notre)\s+(?:[\p{L}\d.,+-]+\s+){0,3}$/iu;
const DISCOVERY = /(?<![\p{L}])(?:vind|zoek|vergelijk|ontdek|bekijk|find|search|compare|discover|finde|vergleiche|trouvez|comparez)(?![\p{L}])/iu;
const DISCOVERY_CONTEXT = /(?<![\p{L}])(?:bij\s+(?:jou|u)\s+in\s+de\s+buurt|in\s+(?:jouw|je|uw)\s+buurt|near\s+you|in\s+your\s+area|in\s+(?:heel\s+)?(?:nederland|belgi[eë]|vlaanderen)|per\s+(?:stad|provincie|regio|plaats)|reviews?|recensies|beoordelingen|ervaringen|openingstijden|in\s+der\s+n[äa]he)(?![\p{L}])/iu;

export type ProviderDirectory = { kind: "provider_directory"; noun: string; evidence: string[] } | null;

export function providerDirectoryIdentity(input: { title?: string | null; description?: string | null; h1s?: string[] }): ProviderDirectory {
  const fields = [input.title || "", input.description || "", ...(input.h1s || []).slice(0, 2)].map((x) => String(x).replace(/\s+/g, " ").trim()).filter(Boolean);
  const own = fields.join(" · ");
  if (!own) return null;
  let noun: string | null = null;
  let phrase = "";
  for (const field of fields) {
    for (const m of field.matchAll(COUNTED)) {
      if (OWN_POSSESSIVE.test(field.slice(0, m.index))) continue;
      const words = [...(m[1] || "").trim().split(/\s+/).filter(Boolean), m[2]];
      // "3.029 sportscholen", "9.000 salons", "500 erkende installateurs"; a unit
      // word ("200 clubs") or a non-provider word ("10.000 producten") is not.
      if (words.some((w) => OWN_UNITS.test(w))) continue;
      const hit = words.map(providerNoun).find(Boolean);
      if (hit) { noun = hit; phrase = m[0]; break; }
    }
    if (noun) break;
    for (const m of field.matchAll(RANKED)) {
      if (OWN_POSSESSIVE.test(field.slice(0, m.index))) continue;
      const hit = [m[1], m[2]].filter(Boolean).map((w) => providerNoun(String(w))).find(Boolean);
      if (hit) { noun = hit; phrase = m[0]; break; }
    }
    if (noun) break;
  }
  if (!noun) return null;
  const discovery = DISCOVERY.test(own);
  const context = DISCOVERY_CONTEXT.test(own);
  if (!(discovery && context)) return null;
  return {
    kind: "provider_directory",
    noun,
    evidence: [
      `Eigen titel/omschrijving noemt een verzameling aanbieders: "${phrase.trim().slice(0, 80)}"`,
      "Bezoekers zoeken, vergelijken of beoordelen die aanbieders (geen eigen vestiging of eigen dienst)",
    ],
  };
}
