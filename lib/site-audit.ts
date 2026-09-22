import { CrawlPage, CrawlResult, CrawlMode, crawlSite } from "@/lib/crawler";

export const SITE_AUDIT_ENGINE_VERSION = "1.0.0";

export type SiteRuleStatus = "PASS" | "FAIL" | "WARNING" | "NOT_APPLICABLE" | "UNABLE_TO_CONFIRM";

export type SiteIssue = {
  issue_id: string;
  rule_id: string;
  category: string;
  title: string;
  description: string;
  recommendation: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
  confidence: "high" | "medium" | "low";
  status: SiteRuleStatus;
  affected_urls: string[];
  evidence: {
    total_pages: number;
    affected_pages: number;
    examples: Array<{ url: string; found?: string | number | boolean | null; expected?: string; details?: string }>;
  };
};

export type SiteAudit = {
  startUrl: string;
  finalUrl: string;
  mode: CrawlMode;
  crawler_version: string;
  audit_version: string;
  startedAt: string;
  finishedAt: string;
  crawl: {
    pages: number;
    discovered: number;
    errors: number;
    blocked: number;
    complete: boolean;
  };
  scores: { technical: number; onPage: number; content: number; structuredData: number; internalLinks: number; overall: number; grade: string };
  page_types: Record<string, number>;
  issues: SiteIssue[];
};

type RuleEvaluation = {
  status: SiteRuleStatus;
  found?: string | number | boolean | null;
  expected?: string;
  details: string;
};

type RuleDef = {
  id: string;
  category: string;
  title: string;
  severity: SiteIssue["severity"];
  description: string;
  recommendation: string;
  applicable: (p: CrawlPage, all: CrawlPage[]) => boolean;
  evaluate: (p: CrawlPage, all: CrawlPage[]) => RuleEvaluation;
};

const example = (p: CrawlPage, result: RuleEvaluation) => ({
  url: p.url, found: result.found, expected: result.expected, details: result.details,
});

const rules: RuleDef[] = [
  {
    id: "SITE_TITLE_MISSING", category: "on-page", title: "Pagina zonder meta title", severity: "HIGH",
    description: "Elke indexeerbare HTML-pagina hoort een bruikbare title te hebben.",
    recommendation: "Voeg een unieke, beschrijvende meta title toe.",
    applicable: p => !p.noindex,
    evaluate: p => p.title.trim() ? {status:"PASS",details:"Meta title aanwezig.",found:p.title} : {status:"FAIL",details:"Meta title ontbreekt.",found:""},
  },
  {
    id: "SITE_TITLE_DUPLICATE", category: "on-page", title: "Dubbele meta titles", severity: "HIGH",
    description: "Identieke titles op meerdere indexeerbare pagina's verminderen onderscheid tussen pagina's.",
    recommendation: "Maak titles uniek en laat ze aansluiten op de zoekintentie van de pagina.",
    applicable: p => !p.noindex,
    evaluate: (p, all) => {
      const same = all.filter(x => !x.noindex && x.title.trim().toLowerCase() === p.title.trim().toLowerCase() && p.title.trim()).length;
      return same > 1 ? {status:"FAIL",found:same,expected:"1",details:"Dezelfde meta title komt op meerdere pagina's voor."} : {status:"PASS",found:1,details:"Meta title is uniek binnen de gecrawlde pagina's."};
    },
  },
  {
    id: "SITE_DESCRIPTION_MISSING", category: "on-page", title: "Pagina zonder meta description", severity: "MEDIUM",
    description: "Een beschrijvende meta description geeft zoekmachines en gebruikers extra context.",
    recommendation: "Voeg een unieke, relevante meta description toe.",
    applicable: p => !p.noindex,
    evaluate: p => p.description.trim() ? {status:"PASS",details:"Meta description aanwezig.",found:p.description} : {status:"FAIL",details:"Meta description ontbreekt.",found:""},
  },
  {
    id: "SITE_DESCRIPTION_DUPLICATE", category: "on-page", title: "Dubbele meta descriptions", severity: "MEDIUM",
    description: "Dubbele descriptions maken pagina's minder onderscheidend.",
    recommendation: "Schrijf per indexeerbare pagina een unieke description.",
    applicable: p => !p.noindex,
    evaluate: (p, all) => {
      const same = all.filter(x => !x.noindex && x.description.trim().toLowerCase() === p.description.trim().toLowerCase() && p.description.trim()).length;
      return same > 1 ? {status:"FAIL",found:same,expected:"1",details:"Dezelfde meta description komt op meerdere pagina's voor."} : {status:"PASS",found:1,details:"Meta description is uniek binnen de gecrawlde pagina's."};
    },
  },
  {
    id: "SITE_H1_MISSING", category: "on-page", title: "Pagina zonder H1", severity: "HIGH",
    description: "Een duidelijke primaire heading helpt de hoofdonderwerpstructuur te bepalen.",
    recommendation: "Voeg één duidelijke H1 toe die het hoofdonderwerp van de pagina beschrijft.",
    applicable: p => !p.noindex,
    evaluate: p => p.h1.length === 0 ? {status:"FAIL",found:0,expected:"1",details:"Geen H1 gevonden."} : {status:"PASS",found:p.h1.length,details:"Minstens één H1 gevonden."},
  },
  {
    id: "SITE_H1_MULTIPLE", category: "on-page", title: "Meerdere H1's", severity: "MEDIUM",
    description: "Meerdere primaire headings zijn niet automatisch fout, maar kunnen de hoofdstructuur onduidelijk maken.",
    recommendation: "Gebruik bij voorkeur één duidelijke primaire H1 per pagina.",
    applicable: p => !p.noindex,
    evaluate: p => p.h1.length > 1 ? {status:"WARNING",found:p.h1.length,expected:"1",details:"Meerdere H1's gevonden."} : {status:"PASS",found:p.h1.length,details:"Niet meer dan één H1 gevonden."},
  },
  {
    id: "SITE_CANONICAL_MISSING", category: "technical", title: "Canonical ontbreekt", severity: "MEDIUM",
    description: "Een canonical helpt de voorkeurs-URL van vergelijkbare pagina's expliciet te maken.",
    recommendation: "Voeg een self-referencing canonical toe waar dat passend is.",
    applicable: p => !p.noindex,
    evaluate: p => p.canonical ? {status:"PASS",found:p.canonical,details:"Canonical gevonden."} : {status:"WARNING",details:"Geen canonical gevonden."},
  },
  {
    id: "SITE_NOINDEX", category: "indexability", title: "Pagina heeft noindex", severity: "HIGH",
    description: "Noindex voorkomt indexatie van de betreffende pagina.",
    recommendation: "Controleer bewust of noindex voor deze pagina gewenst is.",
    applicable: () => true,
    evaluate: p => p.noindex ? {status:"WARNING",found:true,details:"Pagina bevat een noindex-directive."} : {status:"PASS",found:false,details:"Geen noindex gevonden."},
  },
  {
    id: "SITE_IMAGES_ALT", category: "images", title: "Afbeeldingen zonder alt-tekst", severity: "MEDIUM",
    description: "Informatieve afbeeldingen horen een passende alternatieve tekst te hebben.",
    recommendation: "Voeg relevante alt-teksten toe; gebruik een lege alt voor puur decoratieve afbeeldingen.",
    applicable: p => p.imageCount > 0,
    evaluate: p => p.imagesMissingAlt > 0 ? {status:"FAIL",found:p.imagesMissingAlt,expected:"0",details:"Een of meer afbeeldingen missen alt-tekst."} : {status:"PASS",found:0,details:"Alle gevonden afbeeldingen hebben alt-tekst."},
  },
  {
    id: "SITE_CONTENT_THIN", category: "content", title: "Weinig zichtbare tekst", severity: "MEDIUM",
    description: "Zeer dunne pagina-inhoud kan onvoldoende context bieden voor een zoekintentie.",
    recommendation: "Beoordeel of de pagina voldoende unieke, nuttige inhoud bevat voor de beoogde zoekintentie.",
    applicable: p => !["cart","checkout","account","search","filter"].includes(p.pageType) && !p.noindex,
    evaluate: p => p.wordCount < 80 ? {status:"WARNING",found:p.wordCount,expected:"≥ 80",details:"De pagina bevat weinig zichtbare tekst."} : {status:"PASS",found:p.wordCount,details:"De pagina bevat voldoende zichtbare tekst voor deze heuristiek."},
  },
  {
    id: "SITE_STRUCTURED_DATA_MISSING", category: "structured-data", title: "Geen structured data", severity: "MEDIUM",
    description: "Er is geen JSON-LD structured data aangetroffen op deze pagina.",
    recommendation: "Voeg alleen schema.org markup toe die de zichtbare en aantoonbare inhoud van de pagina beschrijft.",
    applicable: p => !p.noindex && ["homepage","product","product_category","category","blog_article","news","faq","local_business"].includes(p.pageType),
    evaluate: p => p.jsonLdTypes.length === 0 ? {status:"WARNING",found:0,details:"Geen JSON-LD types gevonden."} : {status:"PASS",found:p.jsonLdTypes.join(", "),details:"JSON-LD structured data gevonden."},
  },
  {
    id: "SITE_INTERNAL_LINKS_LOW", category: "internal-linking", title: "Weinig interne links", severity: "LOW",
    description: "Belangrijke indexeerbare pagina's hebben baat bij een begrijpelijke interne linkstructuur.",
    recommendation: "Voeg relevante contextuele interne links toe naar belangrijke gerelateerde pagina's.",
    applicable: p => !p.noindex && !["cart","checkout","account","search","filter"].includes(p.pageType),
    evaluate: p => p.internalLinks.length < 2 ? {status:"WARNING",found:p.internalLinks.length,expected:"≥ 2",details:"Weinig interne links gevonden."} : {status:"PASS",found:p.internalLinks.length,details:"Voldoende interne links gevonden volgens deze heuristiek."},
  },
];

function buildIssue(rule: RuleDef, affected: Array<{ p: CrawlPage; r: RuleEvaluation }>, total: number): SiteIssue {
  const fail = affected.filter(x => x.r.status === "FAIL");
  const warn = affected.filter(x => x.r.status === "WARNING");
  const status: SiteRuleStatus = fail.length ? "FAIL" : warn.length ? "WARNING" : "PASS";
  return {
    issue_id: rule.id, rule_id: rule.id, category: rule.category, title: rule.title,
    description: rule.description, recommendation: rule.recommendation, severity: rule.severity,
    confidence: "high", status, affected_urls: affected.filter(x => x.r.status !== "PASS").map(x => x.p.url),
    evidence: {total_pages: total, affected_pages: fail.length + warn.length, examples: affected.filter(x => x.r.status !== "PASS").slice(0,5).map(x => example(x.p,x.r))},
  };
}

function scoreFor(issues: SiteIssue[], categories: string[]) {
  const relevant = issues.filter(i => categories.includes(i.category));
  if (!relevant.length) return 100;
  const weights: Record<SiteIssue["severity"], number> = {CRITICAL:12,HIGH:8,MEDIUM:4,LOW:2,INFO:1};
  let penalty = 0;
  for (const i of relevant) {
    if (i.status === "FAIL") penalty += Math.min(30, weights[i.severity] * Math.min(1, i.affected_urls.length / Math.max(1, i.evidence.total_pages)));
    else if (i.status === "WARNING") penalty += Math.min(15, weights[i.severity] * 0.5 * Math.min(1, i.affected_urls.length / Math.max(1, i.evidence.total_pages)));
  }
  return Math.max(0, Math.min(100, Math.round(100 - penalty)));
}

function grade(score: number) { return score >= 90 ? "A" : score >= 75 ? "B" : score >= 60 ? "C" : score >= 45 ? "D" : "E"; }

export async function auditSite(url: string, mode: CrawlMode = "STANDARD"): Promise<SiteAudit> {
  const crawl = await crawlSite(url, mode);
  const pages = crawl.pages;
  const evaluated = rules.map(rule => {
    const applicable = pages.filter(p => rule.applicable(p, pages));
    if (!applicable.length) return {rule, issue: {issue_id:rule.id,rule_id:rule.id,category:rule.category,title:rule.title,description:rule.description,recommendation:rule.recommendation,severity:rule.severity,confidence:"high" as const,status:"NOT_APPLICABLE" as const,affected_urls:[],evidence:{total_pages:pages.length,affected_pages:0,examples:[]}}};
    return {rule, issue:buildIssue(rule, applicable.map(p => ({p,r:rule.evaluate(p,pages)})), pages.length)};
  });
  const issues = evaluated.map(x=>x.issue);
  const technical = scoreFor(issues,["technical","indexability"]);
  const onPage = scoreFor(issues,["on-page"]);
  const content = scoreFor(issues,["content"]);
  const structuredData = scoreFor(issues,["structured-data"]);
  const internalLinks = scoreFor(issues,["internal-linking"]);
  const overall = Math.round((technical + onPage + content + structuredData + internalLinks) / 5);
  const page_types: Record<string,number> = {};
  for (const p of pages) page_types[p.pageType]=(page_types[p.pageType]||0)+1;
  return {
    startUrl:crawl.startUrl, finalUrl:crawl.finalUrl, mode,
    crawler_version:crawl.engineVersion, audit_version:SITE_AUDIT_ENGINE_VERSION,
    startedAt:crawl.startedAt, finishedAt:crawl.finishedAt,
    crawl:{pages:pages.length,discovered:crawl.discovered,errors:crawl.errors.length,blocked:crawl.blocked,complete:crawl.errors.length===0},
    scores:{technical,onPage,content,structuredData,internalLinks,overall,grade:grade(overall)},
    page_types, issues,
  };
}
