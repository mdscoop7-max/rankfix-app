import { detectEuPrimaryIdentity, isConsentHeading } from "./eu-identity.ts";
import { detectPrimaryBusinessIdentity } from "./primary-business-identity.ts";

export type IdentityPage = {
  url: string; type: string; status: string; partialHead?: boolean;
  title?: string | null; description?: string | null;
  identityHeadings?: string[]; schemaTypes?: string[];
};

// Recovery uses the SAME multilingual identity rules as the homepage. Repeated
// templates, URL aliases, editorial topics and client stories are not independent
// business declarations. A vote is a page-level decision, never a body keyword.
// Pages about the industries, markets or customers a company SERVES ("/branchen/
// transport", "/industries/healthcare", "/klanten/", "/case-studies/") describe
// its clients. They are never independent evidence of the company's own sector.
const AUDIENCE_PATH = /\/(?:industries|industry|branchen|branche|sectoren|sectors?|secteurs?|settori|settore|sectores|industrias|maerkte|m%C3%A4rkte|märkte|markets?|markten|marches|march%C3%A9s|marchés|mercati|mercados|use-cases?|customers?|klanten|kunden|clients?|referenties|referenzen|references|case-studies|cases?|success-stories|customer-stories|klantverhalen|kundenstimmen|temoignages|témoignages)(?:\/|$)/i;
// Section names that combine a market word ("markets-products", "branchen-loesungen").
const AUDIENCE_SEGMENT = /^(?:(?:.*[-_])?(?:markets?|industries|industry|sectors?|branchen|branches|segments?|marches|mercati|mercados|markten|märkte|maerkte)(?:[-_].*)?|attivita[-_]commerciali|business[-_]types?|voor[-_]wie|fuer[-_]wen|für[-_]wen|pour[-_]qui|para[-_]quien|per[-_]chi|who[-_]we[-_]serve|zielgruppen|doelgroepen)$/i;
export function isAudiencePagePath(value: string): boolean {
  let path = String(value || "");
  try { path = new URL(value).pathname; } catch { /* plain path */ }
  if (AUDIENCE_PATH.test(path)) return true;
  // A market section index (/markets-products/) describes the company's own range;
  // its sub-pages (/markets-products/healthcare/) describe a customer market.
  const segments = path.split("/").filter(Boolean).map((part) => { try { return decodeURIComponent(part); } catch { return part; } });
  return segments.slice(0, -1).some((segment) => AUDIENCE_SEGMENT.test(segment));
}

// Page types that describe the organisation itself. "other" carries most
// identity in practice (/organisatie, /software/erp, /markets-products); it was
// excluded before, which left many sites unconfirmed. A shallow, undated page
// typed "article" is usually a section landing page (/groupe, /entreprises).
const IDENTITY_TYPES = new Set(["homepage", "corporate", "service", "listing", "category", "other"]);
const EDITORIAL_PATH = /(?:\/(?:19|20)\d{2}\/|\/(?:news|nieuws|nachrichten|actualites?|actualit%C3%A9s|actualités|notizie|noticias|blog|blogs|press|presse|pers|insights|stories|magazine|artikel|articles?|newsroom|media|medien|m%C3%A9dias|médias|mediacentrum|perskamer)(?:\/|$))/i;
function identityPage(page: IdentityPage, url: URL): boolean {
  if (IDENTITY_TYPES.has(page.type)) return true;
  if (page.type !== "article") return false;
  const segments = url.pathname.split("/").filter(Boolean);
  return segments.length <= 2 && !EDITORIAL_PATH.test(url.pathname) && !(page.schemaTypes || []).some((t) => /^(?:article|newsarticle|blogposting|reportage)$/i.test(t));
}

export function sectorPageEvidence(homeUrl: string, pages: IdentityPage[]) {
  const home = new URL(homeUrl);
  const host = home.hostname.replace(/^www\./, "");
  const urls = new Set<string>();
  const identities = new Set<string>();
  const votes: Array<{ sector: string; key: string; label: string; url: string; evidence: string[] }> = [];
  for (const page of pages) {
    if (page.status !== "audited" || page.partialHead) continue;
    let url: URL;
    try { url = new URL(page.url); } catch { continue; }
    if (!identityPage(page, url)) continue;
    if (url.hostname.replace(/^www\./, "") !== host || !["http:", "https:"].includes(url.protocol)) continue;
    // Query parameters and fragments cannot supply independent corroboration.
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const normalized = host + path;
    if (urls.has(normalized) || isAudiencePagePath(url.toString()) || EDITORIAL_PATH.test(url.pathname)) continue;
    urls.add(normalized);
    const h1s = (page.identityHeadings || []).filter(value => !isConsentHeading(value));
    const signature = [page.title, page.description, ...h1s].join(" ").normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
    if (!signature || identities.has(signature)) continue;
    identities.add(signature);
    const eu = detectEuPrimaryIdentity({title:page.title || "", description:page.description || "", h1s, schemaTypes:page.schemaTypes, homepage:false});
    const primary = detectPrimaryBusinessIdentity({title:page.title || "", description:page.description || "", headings:h1s, schemaTypes:page.schemaTypes});
    // A page with two incompatible detector decisions is counterevidence, not a
    // reason to choose whichever detector happens to run last.
    if (eu && primary.sector !== "unknown" && eu.sector !== primary.sector) continue;
    const result = primary.sector !== "unknown"
      ? {...primary, key:primary.financialKind ? `financial_${primary.financialKind}` : primary.sector, label:primary.sector === "hospitality" ? "Accommodatie & verblijf" : "Financiële dienstverlening"}
      : eu;
    if (!result || result.confidenceScore < 75) continue;
    votes.push({sector:result.sector, key:result.key, label:result.label, url:url.toString(), evidence:result.evidence});
  }
  const sectors = [...new Set(votes.map(vote => vote.sector))];
  const candidates = sectors.map(sector => ({sector, pages:votes.filter(vote => vote.sector === sector)})).sort((a,b) => b.pages.length-a.pages.length || a.sector.localeCompare(b.sector));
  const top = candidates[0];
  // Conflicting primary activities require review; a large sample is not a
  // licence to hide a minority activity behind an invented confidence score.
  // One deviating page (an e-mobility page of an energy company, a sponsorship
  // page of a software company) does not veto a clear majority: at least three
  // agreeing pages and at least three times the runner-up. Closer splits abstain.
  const runnerUp = candidates[1];
  const dominant = Boolean(top && runnerUp && top.pages.length >= 3 && top.pages.length >= runnerUp.pages.length * 3);
  const reason = !top ? "no_identity_evidence" : sectors.length > 1 ? (dominant ? "dominant_page_identity" : "conflicting_page_identities") : top.pages.length < 2 ? "insufficient_independent_pages" : "corroborated_pages";
  const decision = (reason === "corroborated_pages" || reason === "dominant_page_identity") && top ? {
    sector:top.sector, key:top.pages.every(p => p.key === top.pages[0].key) ? top.pages[0].key : top.sector,
    label:top.pages[0].label, confidence:"medium" as const, confidenceScore:reason === "dominant_page_identity" ? 74 : 78,
    evidence:top.pages.map(page => `${page.url}: ${page.evidence.join("; ")}`),
  } : null;
  return {decision, reason, independentPages:identities.size, supportingPages:top?.pages.length || 0, candidates};
}

export function scanCoverageDimensions(checkCoveragePercent: number, selected: number, fetched: number, scored: number) {
  return {
    checks:{coveragePercent:checkCoveragePercent, scope:"weighted_applicable_checks"},
    pages:{selected, fetched, scored, fetchedPercent:selected ? Math.round(fetched/selected*100) : 0, scoredPercent:selected ? Math.round(scored/selected*100) : 0, scope:"selected_sample_only"},
    note:"Bewijsdekking betreft beoordeelbare controles, niet het percentage opgehaalde pagina's of sectorzekerheid. Paginadekking geldt alleen voor de geselecteerde steekproef, niet voor de hele website.",
  };
}
