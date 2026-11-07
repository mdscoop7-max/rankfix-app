/**
 * Which Product on a page is THE product of that page (QA 144, 24 Oct 2026).
 *
 * A product page for SKU 1807532 showed SKU 1807530 (a sibling model) in the
 * product diagnostics: the first Product object in the page's structured data
 * was taken, and product evidence from another sampled product page could
 * overwrite the entered page's product checks. Product name, SKU, price,
 * currency and availability must always belong to a known source URL.
 *
 * Matching, strongest first: the Product's url/@id equals the page URL; its
 * sku/productID/gtin/mpn appears in the page URL; its name matches the page
 * H1 or title. One Product on the page is that page's product. Several
 * Products without a match are a conflict: "niet te bevestigen", never merged.
 */
export type ProductCandidate = { name?: string; sku?: string; url?: string; id?: string; productIds?: string[] };
export type ProductMatch = {
  index: number | null;
  matchedBy: "url" | "url_identifier" | "name" | "single" | null;
  conflict: boolean;
  candidates: number;
  sourceUrl: string;
  note: string;
};

function norm(url: string): string {
  try { const u = new URL(url); return `${u.hostname.replace(/^www\./, "").toLowerCase()}${u.pathname.replace(/\/+$/, "")}`; } catch { return String(url || "").toLowerCase(); }
}
function words(text: string): Set<string> {
  return new Set(String(text || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").split(/[^a-z0-9]+/).filter((w) => w.length >= 2));
}
function overlap(a: string, b: string): number {
  const x = words(a), y = words(b);
  if (!x.size || !y.size) return 0;
  let hit = 0; for (const w of x) if (y.has(w)) hit++;
  return hit / Math.min(x.size, y.size);
}

export function selectPageProduct(products: ProductCandidate[], page: { url: string; title?: string; h1s?: string[] }): ProductMatch {
  const list = products || [];
  const base = { candidates: list.length, sourceUrl: page.url };
  if (!list.length) return { ...base, index: null, matchedBy: null, conflict: false, note: "Geen Product structured data op deze pagina." };
  if (list.length === 1) return { ...base, index: 0, matchedBy: "single", conflict: false, note: "Eén product op deze pagina." };
  const pageKey = norm(page.url);
  const byUrl = list.findIndex((p) => [p.url, p.id].some((v) => v && norm(String(v).split("#")[0]) === pageKey));
  if (byUrl >= 0) return { ...base, index: byUrl, matchedBy: "url", conflict: false, note: "Product-URL in structured data komt overeen met de pagina-URL." };
  const path = (() => { try { return decodeURIComponent(new URL(page.url).pathname).toLowerCase(); } catch { return String(page.url).toLowerCase(); } })();
  const idHits = list.map((p, i) => ({ i, hit: [p.sku, ...(p.productIds || [])].some((id) => {
    const v = String(id || "").trim().toLowerCase();
    return v.length >= 4 && new RegExp(`(?:^|[^a-z0-9])${v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:[^a-z0-9]|$)`).test(path);
  }) })).filter((x) => x.hit);
  if (idHits.length === 1) return { ...base, index: idHits[0].i, matchedBy: "url_identifier", conflict: false, note: "Artikelnummer van het product staat in de pagina-URL." };
  const heading = [...(page.h1s || []), page.title || ""].filter(Boolean).join(" ");
  const scored = list.map((p, i) => ({ i, s: overlap(p.name || "", heading) })).sort((a, b) => b.s - a.s);
  if (scored[0] && scored[0].s >= 0.6 && (!scored[1] || scored[0].s - scored[1].s >= 0.15)) {
    return { ...base, index: scored[0].i, matchedBy: "name", conflict: false, note: "Productnaam komt overeen met de H1/titel van de pagina." };
  }
  return { ...base, index: null, matchedBy: null, conflict: true, note: `${list.length} producten in de structured data van deze pagina en geen ervan is eenduidig het product van de pagina; productgegevens zijn niet te bevestigen en worden niet gecombineerd.` };
}
