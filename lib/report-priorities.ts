// The short report: the few improvements that matter most, each with its
// severity, the problem in one sentence and a concrete fix. Only proven issues
// (fail/warning) qualify; unconfirmed checks are never presented as problems.

export type PriorityCheck = {
  key?: string;
  title: string;
  status: string;
  severity?: string;
  message?: string;
  fix?: string;
  points?: number;
  maxPoints?: number;
};
export type Severity = "Hoog" | "Middel" | "Laag";
export type Improvement = { title: string; severity: Severity; problem: string; fix: string; key: string | null };

const SEVERITY_RANK: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4 };

function severityOf(check: PriorityCheck): Severity {
  const s = String(check.severity || "").toUpperCase();
  if (s === "CRITICAL" || s === "HIGH") return "Hoog";
  if (s === "MEDIUM") return "Middel";
  if (s === "LOW" || s === "INFO") return "Laag";
  return check.status === "fail" ? "Hoog" : "Middel";
}

const SEVERITY_ORDER: Record<Severity, number> = { Hoog: 0, Middel: 1, Laag: 2 };

/** First sentence, trimmed to a readable length. */
export function oneSentence(text: string | undefined, max = 180): string {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (!clean) return "";
  const first = clean.match(/^.+?[.!?](?=\s|$)/)?.[0] || clean;
  return first.length > max ? `${first.slice(0, max - 1).replace(/\s+\S*$/, "")}…` : first;
}

export function topImprovements(checks: PriorityCheck[], extra: Improvement[] = [], limit = 5): Improvement[] {
  const seen = new Set<string>();
  const ranked = checks
    .filter((check) => check.status === "fail" || check.status === "warning")
    .map((check) => ({
      check,
      severity: severityOf(check),
      lost: Math.max(0, (check.maxPoints ?? 0) - (check.points ?? 0)),
      statusRank: check.status === "fail" ? 0 : 1,
      severityRank: SEVERITY_RANK[String(check.severity || "").toUpperCase()] ?? (check.status === "fail" ? 1 : 2),
    }))
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.statusRank - b.statusRank || a.severityRank - b.severityRank || b.lost - a.lost)
    .map(({ check, severity }): Improvement => ({
      title: check.title,
      severity,
      problem: oneSentence(check.message),
      fix: oneSentence(check.fix) || "Bekijk de details van deze controle in het volledige rapport.",
      key: check.key || null,
    }));
  const merged = [...ranked, ...extra].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  const out: Improvement[] = [];
  for (const item of merged) {
    const id = item.title.toLowerCase();
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}

const FACT_FIX: Record<string, string> = {
  company_registration: "Vermeld het KvK- en btw-nummer in de footer of op de contact- of voorwaardenpagina.",
  contact: "Toon een telefoonnummer, e-mailadres of contactformulier op een vindbare contactpagina.",
  stock: "Toon op elke productpagina een duidelijke voorraadstatus die gelijk is aan de productgegevens.",
  checkout: "Zorg dat winkelwagen en checkout vanaf elke productpagina bereikbaar zijn.",
};

/** Proven-missing essential facts become improvements; unconfirmed ones do not. */
export function factImprovements(facts: Array<{ key: string; label: string; state: string; detail: string }>): Improvement[] {
  return facts.filter((fact) => fact.state === "missing").map((fact) => ({
    title: `${fact.label} ontbreekt`,
    severity: "Middel" as const,
    problem: oneSentence(fact.detail),
    fix: FACT_FIX[fact.key] || "Vul deze gegevens aan.",
    key: fact.key,
  }));
}

type CatalogLike = {
  checked: number;
  counts: Record<string, number>;
  examples?: Record<string, string[] | undefined>;
  checkout?: { url: string | null; httpStatus: number | null; reachable: boolean | null } | null;
};

const pathList = (urls: string[] | undefined) => (urls || []).slice(0, 3).map((u) => { try { return new URL(u).pathname; } catch { return u; } }).join(", ");

/** Proven catalogue problems as improvements, with counts and example pages. */
export function catalogImprovements(catalog: CatalogLike | null | undefined): Improvement[] {
  if (!catalog) return [];
  const out: Improvement[] = [];
  const n = (key: string) => catalog.counts[key] || 0;
  const eg = (key: string) => { const list = pathList(catalog.examples?.[key]); return list ? ` Bijvoorbeeld: ${list}.` : ""; };
  if (catalog.checkout && catalog.checkout.reachable === false) out.push({ title: "Winkelwagen of checkout niet bereikbaar", severity: "Hoog", key: "catalog_checkout",
    problem: `De winkelwagen-/checkoutpagina gaf HTTP ${catalog.checkout.httpStatus}.`, fix: "Herstel de winkelwagen- en checkoutpagina en test een bestelling van begin tot eind." });
  if (n("unreachable")) out.push({ title: "Productpagina's uit de sitemap geven een foutpagina", severity: "Hoog", key: "catalog_unreachable",
    problem: `${n("unreachable")} product(en) uit de sitemap zijn niet bereikbaar (404/5xx).${eg("unreachable")}`, fix: "Herstel deze producten of haal ze uit de sitemap en stuur oude URL's door." });
  if (n("stock_mismatch")) out.push({ title: "Zichtbare voorraad klopt niet met de productgegevens", severity: "Hoog", key: "catalog_stock_mismatch",
    problem: `Bij ${n("stock_mismatch")} product(en) verschilt de voorraad op de pagina van de productgegevens.${eg("stock_mismatch")}`, fix: "Laat de zichtbare voorraad en de availability in de productgegevens uit dezelfde bron komen." });
  if (n("no_price")) out.push({ title: "Prijs ontbreekt in de productgegevens", severity: "Middel", key: "catalog_no_price",
    problem: `${n("no_price")} van ${catalog.checked} gecontroleerde producten hebben geen prijs in de productgegevens.${eg("no_price")}`, fix: "Vul price en priceCurrency in de Product-gegevens (Offer) van elk product." });
  if (n("no_availability")) out.push({ title: "Voorraadstatus ontbreekt in de productgegevens", severity: "Middel", key: "catalog_no_availability",
    problem: `${n("no_availability")} van ${catalog.checked} gecontroleerde producten hebben geen voorraadstatus in de productgegevens.${eg("no_availability")}`, fix: "Vul availability (bijv. InStock of OutOfStock) in de Product-gegevens van elk product." });
  if (n("no_product_data")) out.push({ title: "Productgegevens ontbreken", severity: "Middel", key: "catalog_no_product_data",
    problem: `${n("no_product_data")} van ${catalog.checked} gecontroleerde producten hebben geen Product-gegevens voor zoekmachines.${eg("no_product_data")}`, fix: "Voeg Product-gegevens (JSON-LD) toe met naam, afbeelding, prijs, valuta en voorraad." });
  return out;
}

type BrowserLike = {
  language: { options: unknown[]; onlyAfterJavascript: boolean };
  reviews: { onlyAfterJavascript: boolean };
};

/** Content crawlers may miss because it only appears after JavaScript. */
export function browserImprovements(evidence: BrowserLike | null | undefined): Improvement[] {
  if (!evidence) return [];
  const out: Improvement[] = [];
  if (evidence.reviews.onlyAfterJavascript) out.push({ title: "Reviews alleen zichtbaar met JavaScript", severity: "Middel", key: "browser_reviews",
    problem: "De reviews en beoordeling verschijnen pas na JavaScript; zoekmachines en AI-crawlers zien ze mogelijk niet.",
    fix: "Zet de beoordeling (AggregateRating) en een samenvatting van de reviews ook in de server-HTML." });
  if (evidence.language.onlyAfterJavascript) out.push({ title: "Taalkeuze alleen zichtbaar met JavaScript", severity: "Middel", key: "browser_language",
    problem: `De ${evidence.language.options.length} taalversies zijn pas na JavaScript te vinden.`,
    fix: "Voeg hreflang-links toe in de <head> of toon de taalkiezer al in de server-HTML." });
  return out;
}

/** All report improvements; the catalogue's stock finding replaces the stock fact (no duplicate). */
export function reportImprovements(input: {
  checks: PriorityCheck[];
  facts: Array<{ key: string; label: string; state: string; detail: string }>;
  catalog: CatalogLike | null | undefined;
  browser: BrowserLike | null | undefined;
  limit?: number;
}): Improvement[] {
  const catalogCoversStock = (input.catalog?.counts?.no_availability || 0) > 0;
  const facts = input.facts.filter((fact) => !(fact.key === "stock" && catalogCoversStock));
  return topImprovements(input.checks, [...factImprovements(facts), ...catalogImprovements(input.catalog), ...browserImprovements(input.browser)], input.limit);
}
