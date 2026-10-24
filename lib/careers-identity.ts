/**
 * Employer careers sites ("werken bij", "careers at", "Karriere bei") are
 * recruitment websites of an employer. The topic of one vacancy (a logistics,
 * IT or shop job) is the PAGE topic, never the identity of the website.
 *
 * QA 144 (24 Oct 2026): a logistics vacancy on an employer careers site was
 * classified "Transport & Logistiek" at 92%. Generic rule, no domain list:
 *   - the site names itself a careers site (title brand part / og:site_name),
 *     and/or the hostname is a careers label (werkenbij…, careers., jobs.…),
 *   - AND the page's own identity or navigation talks about vacancies/applying.
 * Hostname alone, or vacancy words alone (a staffing article, a news item),
 * never decide.
 */
export type CareersIdentity = {
  sector: "recruitment";
  key: "employer_careers";
  label: string;
  confidence: "high" | "medium";
  confidenceScore: number;
  evidence: string[];
};

const CAREERS_NAME = /(?<![\p{L}])(?:werken bij|werken voor|werkenbij|careers? (?:at|with)|jobs? (?:at|with)|working at|work at|karriere (?:bei|bei der|bei den)|jobs bei|arbeiten bei|carri[eè]res? chez|travailler chez|emplois? chez|lavora con(?: noi)?|lavorare in|carriere|trabaja (?:con|en)|trabajar en|empleo en|carreiras?|trabalhe (?:conosco|na|no)|jobba (?:hos|på)|karriär)(?![\p{L}])/iu;
const CAREERS_HOST_LABEL = /^(?:werkenbij\p{L}*|werkenvoor\p{L}*|careers?|jobs|karriere|carrieres?|carriere|carreiras?|carreras?|empleo|lavoraconnoi|trabajaconnosotros|jobba\p{L}*)$/iu;
const CAREERS_HOST_PREFIX = /^(?:werkenbij|werkenvoor|careersat|jobsat|karrierebei)/i;
const VACANCY = /(?<![\p{L}])(?:vacatures?|vacaturebank|solliciteer\p{L}*|sollicit\p{L}*|vacanc(?:y|ies)|job openings?|open (?:positions|roles)|apply(?: now| today)?|bewerb\p{L}*|stellenangebote?|offres? d.emploi|postuler|candidature|offerte di lavoro|posizioni aperte|candidati|ofertas? de (?:empleo|trabajo)|vagas?|lediga jobb|tjänster)(?![\p{L}])/iu;

function hostLabels(hostname: string): string[] {
  return String(hostname || "").toLowerCase().replace(/^www\./, "").split(".").slice(0, -1);
}

export function careersSiteIdentity(input: { title?: string; description?: string; h1s?: string[]; hostname?: string; ogSiteName?: string; navLabels?: string[]; homepage?: boolean }): CareersIdentity | null {
  const title = String(input.title || "");
  const site = String(input.ogSiteName || "");
  const nameInTitle = CAREERS_NAME.test(title);
  const nameInSite = CAREERS_NAME.test(site);
  const labels = hostLabels(input.hostname || "");
  const host = labels.some((label) => CAREERS_HOST_LABEL.test(label) || CAREERS_HOST_PREFIX.test(label));
  const own = [title, input.description || "", ...(input.h1s || [])].join(" | ");
  const vacancyOwn = VACANCY.test(own);
  const vacancyNav = (input.navLabels || []).some((label) => VACANCY.test(label));
  // A "werken bij" page on an ordinary company site is that company's careers
  // SECTION: the title only names the site on its homepage, og:site_name always.
  const named = nameInSite || (nameInTitle && Boolean(input.homepage));
  if (!(named || host) || !(vacancyOwn || vacancyNav)) return null;
  // Name + host (two independent sources) is a confirmed careers site.
  const both = named && host;
  const sources = [nameInSite ? "de sitenaam" : named ? "de titel" : "", host ? "de domeinnaam" : ""].filter(Boolean);
  return {
    sector: "recruitment",
    key: "employer_careers",
    label: "Werken-bij- / carrièrewebsite",
    confidence: both ? "high" : "medium",
    confidenceScore: both ? 88 : 76,
    evidence: [`Werken-bij-/carrièrewebsite: ${sources.join(" en ")} noemt een carrièresite en de pagina gaat over vacatures/solliciteren. Het onderwerp van één vacature bepaalt niet de sector van de website.`],
  };
}
