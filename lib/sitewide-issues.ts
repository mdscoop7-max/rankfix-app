/**
 * Sitewide improvement points from the representative page sample.
 *
 * QA 144 (24 Oct 2026): reports showed "Verbeterpunten (0)" while sampled
 * subpages had proven problems (an empty meta description on /job-alert and
 * /privacy, no H1 on a FAQ page, a category page with no title, description
 * or H1). The page score correctly covers only the entered page, but every
 * proven sample problem must also reach the customer's advice list, with the
 * exact URL, the check, its severity, the evidence and a concrete fix.
 *
 * This list never changes the score of the entered page. Absence claims from
 * raw HTML are only "confirmed" when the server clearly delivered the page head;
 * when title, description AND H1 are all missing in raw HTML, the page may be
 * client-rendered, so the point is kept but marked "to be confirmed".
 */
export type SampleEvidenceCheck = { key: string; status: "PASS" | "WARNING" | "UNABLE_TO_CONFIRM"; details: string };
export type SamplePageForIssues = {
  url: string;
  status?: string | null;
  title?: string | null;
  description?: string | null;
  h1Count?: number | null;
  evidenceSource?: "raw_html" | "rendered_html";
  evidenceChecks?: SampleEvidenceCheck[];
};

export type SitewideIssue = {
  issueId: string;
  url: string;
  check: "title" | "description" | "h1" | "canonical";
  checkLabel: string;
  severity: "warning" | "info";
  certainty: "confirmed" | "needs_render_confirmation";
  evidence: string;
  evidenceSource: "raw_html" | "rendered_html";
  recommendation: string;
  scope: "site_sample";
};

const LABEL: Record<SitewideIssue["check"], string> = {
  title: "Paginatitel (title)",
  description: "Meta description",
  h1: "H1-kop",
  canonical: "Canonical",
};

function recommendation(check: SitewideIssue["check"], page: SamplePageForIssues, details: string): string {
  const missing = /ontbreekt|geen |leeg|empty|missing|0 H1/i.test(details);
  if (check === "title") return missing
    ? "Geef deze pagina een unieke title van circa 30–60 tekens die het onderwerp van de pagina en de merknaam noemt."
    : "Herschrijf de title tot een unieke, beschrijvende titel van circa 30–60 tekens (zonder dubbele merknaam of verouderd jaartal).";
  if (check === "description") return missing
    ? "Vul de meta description met een unieke samenvatting van circa 120–160 tekens die beschrijft wat de bezoeker op deze pagina vindt."
    : "Pas de meta description aan naar een unieke samenvatting van circa 120–160 tekens.";
  if (check === "h1") return (page.h1Count ?? 0) > 1
    ? "Gebruik één duidelijke H1 die het hoofdonderwerp van de pagina noemt; maak overige koppen H2/H3."
    : "Voeg één H1 toe die het hoofdonderwerp van deze pagina noemt.";
  return missing
    ? "Voeg een self-referencing canonical toe (of een canonical naar de gewenste voorkeurs-URL)."
    : "Controleer of de canonical naar de juiste voorkeurs-URL van deze pagina wijst.";
}

function sameUrl(a: string, b: string): boolean {
  try {
    const x = new URL(a), y = new URL(b);
    return x.hostname.replace(/^www\./, "").toLowerCase() === y.hostname.replace(/^www\./, "").toLowerCase()
      && (x.pathname.replace(/\/+$/, "") || "/") === (y.pathname.replace(/\/+$/, "") || "/") && x.search === y.search;
  } catch { return a === b; }
}

export function buildSitewideIssues(pages: SamplePageForIssues[], startUrl: string): SitewideIssue[] {
  const out: SitewideIssue[] = [];
  const seen = new Set<string>();
  for (const page of pages || []) {
    if (page.status !== "audited" || !page.url || sameUrl(page.url, startUrl)) continue;
    const source = page.evidenceSource === "rendered_html" ? "rendered_html" : "raw_html";
    const checks = page.evidenceChecks || [];
    const warn = (key: string) => checks.some((c) => c.key === key && c.status === "WARNING");
    // Everything a browser would add is missing at once: raw HTML alone cannot
    // prove that the live page lacks it.
    const headAbsentInRaw = source === "raw_html" && !page.title && !page.description && !(page.h1Count && page.h1Count > 0)
      && warn("title") && warn("description") && warn("h1");
    for (const c of checks) {
      if (c.status !== "WARNING" || !["title", "description", "h1", "canonical"].includes(c.key)) continue;
      const check = c.key as SitewideIssue["check"];
      const id = `site:${check}:${page.url}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const certainty: SitewideIssue["certainty"] = headAbsentInRaw ? "needs_render_confirmation" : "confirmed";
      out.push({
        issueId: id,
        url: page.url,
        check,
        checkLabel: LABEL[check],
        // Missing/empty title or description on an indexable page is a real SEO
        // issue; canonical and multiple-H1 notes are advisory.
        severity: certainty === "confirmed" && (check === "title" || check === "description" || (check === "h1" && !(page.h1Count && page.h1Count > 1))) ? "warning" : "info",
        certainty,
        evidence: certainty === "confirmed"
          ? `${c.details} (bron: ${source === "rendered_html" ? "browserweergave" : "server-HTML"})`
          : `${c.details} Title, description én H1 ontbreken alle drie in de server-HTML; mogelijk worden ze pas door JavaScript geladen. Controleer de pagina in een browser voordat je dit als definitief ziet.`,
        evidenceSource: source,
        recommendation: recommendation(check, page, c.details),
        scope: "site_sample",
      });
    }
  }
  // Confirmed warnings first, then by URL for a stable order.
  const rank = (i: SitewideIssue) => (i.certainty === "confirmed" ? 0 : 2) + (i.severity === "warning" ? 0 : 1);
  return out.sort((a, b) => rank(a) - rank(b) || a.url.localeCompare(b.url) || a.check.localeCompare(b.check));
}
