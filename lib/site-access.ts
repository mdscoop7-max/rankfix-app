/**
 * Site access and page coverage (QA 144-site test, 24 Oct 2026).
 *
 * A customer may enter any page as the start URL (an article, category or
 * product page). On some sites the homepage refuses RankFix while that page
 * and others are public (Decathlon webshop: 4/30 pages assessed, 26 refused).
 * The report must then:
 *   - register the homepage outcome separately,
 *   - base findings only on pages that were actually assessed,
 *   - call the scan partial when pages were refused or not retrieved,
 *   - never claim that one reachable page proves the whole site is accessible.
 * RankFix does not try to get around a refusal: a refused page stays refused.
 */

export type SamplePageAccess = {
  url: string;
  type?: string | null;
  status?: string | null;          // "audited" | "unable_to_confirm"
  httpStatus?: number | null;
  nonContent?: string | null;       // "challenge" | "error" | "maintenance"
  fetchFailure?: string | null;
};

export type HomepageAccess = "is_start_page" | "accessible" | "blocked" | "missing" | "not_retrieved" | "not_sampled";

export type SiteAccessSummary = {
  startUrl: string;
  startIsHomepage: boolean;
  homepage: { url: string; access: HomepageAccess; httpStatus: number | null };
  pages: { selected: number; assessed: number; refused: number; missing: number; notRetrieved: number };
  /** complete: every selected page assessed; partial: some refused/not retrieved; start_only: only the start page. */
  scanCoverage: "complete" | "partial" | "start_only";
  /** Customer-facing Dutch note; never claims the whole site is accessible from one page. */
  note: string;
};

const REFUSED = new Set([401, 403, 405, 429, 451]);

function key(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname.toLowerCase().replace(/^www\./, "")}${u.pathname.replace(/\/+$/, "") || "/"}`;
  } catch { return String(url || ""); }
}

export function pageAccessOutcome(page: SamplePageAccess): "assessed" | "refused" | "missing" | "not_retrieved" {
  if (page.status === "audited") return "assessed";
  if (page.nonContent === "challenge" || REFUSED.has(Number(page.httpStatus))) return "refused";
  if (page.httpStatus === 404 || page.httpStatus === 410) return "missing";
  return "not_retrieved";
}

export function summarizeSiteAccess(input: {
  startUrl: string;
  startIsHomepage: boolean;
  homepageUrl: string;
  pages: SamplePageAccess[];
}): SiteAccessSummary {
  const pages = input.pages || [];
  const counts = { selected: pages.length, assessed: 0, refused: 0, missing: 0, notRetrieved: 0 };
  for (const page of pages) {
    const outcome = pageAccessOutcome(page);
    if (outcome === "assessed") counts.assessed++;
    else if (outcome === "refused") counts.refused++;
    else if (outcome === "missing") counts.missing++;
    else counts.notRetrieved++;
  }
  let homepage: SiteAccessSummary["homepage"];
  if (input.startIsHomepage) {
    homepage = { url: input.startUrl, access: "is_start_page", httpStatus: null };
  } else {
    const homeKey = key(input.homepageUrl);
    const home = pages.find((p) => key(p.url) === homeKey) || pages.find((p) => p.type === "homepage" && key(p.url) !== key(input.startUrl));
    if (!home) homepage = { url: input.homepageUrl, access: "not_sampled", httpStatus: null };
    else {
      const outcome = pageAccessOutcome(home);
      homepage = {
        url: home.url,
        access: outcome === "assessed" ? "accessible" : outcome === "refused" ? "blocked" : outcome === "missing" ? "missing" : "not_retrieved",
        httpStatus: typeof home.httpStatus === "number" ? home.httpStatus : null,
      };
    }
  }
  const othersAssessed = pages.filter((p) => key(p.url) !== key(input.startUrl) && pageAccessOutcome(p) === "assessed").length;
  const scanCoverage: SiteAccessSummary["scanCoverage"] =
    pages.length > 1 && othersAssessed === 0 ? "start_only"
      : counts.refused + counts.notRetrieved > 0 || homepage.access === "blocked" || homepage.access === "not_retrieved" ? "partial"
        : "complete";
  const parts: string[] = [];
  if (!input.startIsHomepage) parts.push("De scan startte vanaf de ingevoerde pagina, niet vanaf de homepage.");
  if (homepage.access === "blocked") parts.push(`De homepage weigerde RankFix${homepage.httpStatus ? ` (HTTP ${homepage.httpStatus})` : ""}; RankFix omzeilt dit niet en heeft de homepage niet beoordeeld.`);
  else if (homepage.access === "not_retrieved") parts.push("De homepage kon niet worden opgehaald en is niet beoordeeld.");
  else if (homepage.access === "missing") parts.push("De homepage gaf HTTP 404/410.");
  else if (homepage.access === "not_sampled") parts.push("De homepage zat niet in de steekproef.");
  parts.push(`${counts.assessed} van ${counts.selected} geselecteerde pagina's zijn inhoudelijk beoordeeld${counts.refused ? `; ${counts.refused} geweigerd` : ""}${counts.notRetrieved ? `; ${counts.notRetrieved} niet opgehaald` : ""}${counts.missing ? `; ${counts.missing} bestaan niet` : ""}.`);
  if (scanCoverage !== "complete") parts.push("Dit is een gedeeltelijk rapport: alleen de beoordeelde pagina's tellen mee. Bereikbare pagina's bewijzen niet dat de hele website toegankelijk is.");
  return {
    startUrl: input.startUrl,
    startIsHomepage: input.startIsHomepage,
    homepage,
    pages: counts,
    scanCoverage,
    note: parts.join(" "),
  };
}
