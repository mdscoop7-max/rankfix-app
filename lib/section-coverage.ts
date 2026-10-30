// Which relevant parts of a website the audit actually examined (QA 30 Oct:
// "RankFix moet voldoende relevante pagina's onderzoeken … als onderdelen niet
// toegankelijk zijn, moet dat duidelijk worden vermeld"). Pure: it only reads
// the sampled-page outcomes the scan already recorded and never fetches.
export type SectionStatus = "checked" | "not_accessible" | "missing" | "not_found" | "not_examined";
export type SectionCoverageItem = {
  section: string;
  label: string;
  status: SectionStatus;
  urls: string[];
  note: string;
};
type SampledPage = { url: string; type: string; status: "audited" | "unable_to_confirm"; httpStatus: number | null; nonContent?: string; fetchFailure?: string; excludedUtility?: boolean };

const SECTIONS: Array<{ section: string; label: string; types: string[]; shopOnly?: boolean; nonShopOnly?: boolean }> = [
  { section: "homepage", label: "Homepage", types: ["homepage"] },
  { section: "offer", label: "Diensten / aanbod", types: ["service", "corporate", "event", "listing"], nonShopOnly: true },
  { section: "category", label: "Categorie- en overzichtspagina's", types: ["category", "listing"], shopOnly: true },
  { section: "product", label: "Productpagina's", types: ["product"], shopOnly: true },
  { section: "contact", label: "Contact", types: ["contact", "form"] },
  { section: "support", label: "Klantenservice / veelgestelde vragen", types: ["support"] },
  { section: "legal", label: "Juridisch (privacy, voorwaarden, cookies)", types: ["legal"] },
  { section: "content", label: "Artikelen / nieuws", types: ["article"] },
];

const blockedStatus = (p: SampledPage) => p.status !== "audited" && (p.httpStatus === 401 || p.httpStatus === 403 || p.httpStatus === 405 || p.httpStatus === 429 || p.httpStatus === 202 || p.nonContent === "challenge");
const missingStatus = (p: SampledPage) => p.status !== "audited" && (p.httpStatus === 404 || p.httpStatus === 410);

export function sectionCoverage(input: { pages: SampledPage[]; isShop: boolean; homepageUrl: string; homepageAccess?: "is_start_page" | "accessible" | "blocked" | "missing" | "not_retrieved" | "not_sampled"; homepageHttpStatus?: number | null }): { items: SectionCoverageItem[]; summary: string } {
  const pages = input.pages.filter((p) => !p.excludedUtility);
  const items: SectionCoverageItem[] = [];
  for (const def of SECTIONS) {
    if (def.shopOnly && !input.isShop) continue;
    if (def.nonShopOnly && input.isShop) continue;
    // The homepage counts as checked only when it was the scanned start page or a
    // sampled page that answered; a blocked or unsampled homepage is said so.
    const access = input.homepageAccess || "is_start_page";
    const homeStatus = access === "is_start_page" || access === "accessible" ? "audited" as const : "unable_to_confirm" as const;
    const homeHttp = access === "blocked" ? (input.homepageHttpStatus ?? 403) : access === "missing" ? (input.homepageHttpStatus ?? 404) : (input.homepageHttpStatus ?? null);
    const matching = def.section === "homepage"
      ? (access === "not_sampled" ? [] : [{ url: input.homepageUrl, type: "homepage", status: homeStatus, httpStatus: homeHttp }])
      : pages.filter((p) => def.types.includes(p.type));
    const audited = matching.filter((p) => p.status === "audited");
    const blocked = matching.filter(blockedStatus);
    const missing = matching.filter(missingStatus);
    let status: SectionStatus; let note: string; let urls: string[];
    if (audited.length) { status = "checked"; urls = [...new Set(audited.map((p) => p.url))].slice(0, 5); note = `${audited.length} pagina('s) inhoudelijk beoordeeld${matching.length > audited.length ? `; ${matching.length - audited.length} niet te beoordelen` : ""}.`; }
    else if (blocked.length) { status = "not_accessible"; urls = blocked.map((p) => p.url).slice(0, 5); note = `Niet toegankelijk voor RankFix (HTTP ${[...new Set(blocked.map((p) => p.httpStatus ?? "challenge"))].join("/")}); niet gecontroleerd en niet als fout geteld.`; }
    else if (missing.length) { status = "missing"; urls = missing.map((p) => p.url).slice(0, 5); note = `Gelinkte pagina('s) bestaan niet (HTTP ${[...new Set(missing.map((p) => p.httpStatus))].join("/")}).`; }
    else if (matching.length) { status = "not_examined"; urls = matching.map((p) => p.url).slice(0, 5); note = `Geselecteerd maar niet opgehaald (${matching.map((p) => p.fetchFailure || "geen antwoord").slice(0, 2).join(", ")}); niet gecontroleerd.`; }
    else { status = "not_found"; urls = []; note = "Geen pagina van dit type gevonden in de gelinkte navigatie of steekproef; niet gecontroleerd."; }
    items.push({ section: def.section, label: def.label, status, urls, note });
  }
  if (input.isShop) items.push({ section: "checkout", label: "Winkelwagen en afrekenen", status: "not_examined", urls: [], note: "RankFix plaatst geen bestellingen: de afrekenstappen zelf zijn niet doorlopen; alleen links en signalen op de bezochte pagina's zijn beoordeeld." });
  const group = (statuses: SectionStatus[]) => items.filter((i) => statuses.includes(i.status) && i.section !== "checkout").map((i) => i.label);
  const checked = group(["checked"]);
  const blocked = group(["not_accessible", "not_examined"]);
  const missing = group(["missing"]);
  const notFound = group(["not_found"]);
  const summary = [
    `Gecontroleerd: ${checked.join(", ") || "geen onderdelen"}.`,
    blocked.length ? `Niet toegankelijk of niet opgehaald (niet gecontroleerd): ${blocked.join(", ")}.` : "",
    missing.length ? `Gelinkt maar niet bestaand: ${missing.join(", ")}.` : "",
    notFound.length ? `Niet gevonden in de steekproef: ${notFound.join(", ")}.` : "",
    input.isShop ? "Afrekenstappen zijn niet doorlopen (RankFix plaatst geen bestellingen)." : "",
  ].filter(Boolean).join(" ");
  return { items, summary };
}
