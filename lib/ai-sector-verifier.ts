// AI sector verification (owner request 7 Nov 2026).
//
// Rules decide first. AI is only asked when the rule engine found no sector or an
// unconfirmed one (confidence < 80), at most once per scan, with a hard timeout.
// The AI may only PROPOSE: a sector key from the engine's own list, a business
// role, and verbatim quotes. RankFix verifies every quote against the page text it
// actually fetched; a proposal is accepted only with verified quotes from at least
// two different own pages. A verified proposal that contradicts an unconfirmed
// rule sector makes the sector "niet bevestigd" (conflicting evidence). Never a
// sector without proof; never an override of a rule-confirmed sector.

/** vocab: the engine's own activity vocabulary for this key (names + context). */
export type AiSectorOption = { sector: string; key: string; label: string; vocab?: RegExp[] };
export type AiEvidencePage = { url: string; type?: string; title?: string | null; description?: string | null; headings?: string[]; text?: string | null };
export type AiBusinessRole = "eigen_dienstverlener" | "eigen_verkoper" | "eigen_productie" | "bemiddelaar" | "marktplaats_platform" | "vergelijker" | "software_saas" | "uitgever_media" | "publieke_instantie" | "non_profit" | "onbekend";
export const AI_ROLES: AiBusinessRole[] = ["eigen_dienstverlener", "eigen_verkoper", "eigen_productie", "bemiddelaar", "marktplaats_platform", "vergelijker", "software_saas", "uitgever_media", "publieke_instantie", "non_profit", "onbekend"];
export type AiProposal = { key: string; role: AiBusinessRole; quotes: { url: string; quote: string }[]; reasoning?: string };
/** Measured per AI call: tokens as reported by the API and wall time. */
export type AiUsage = { promptTokens: number | null; completionTokens: number | null; durationMs: number };
export type AiVerification =
  | { status: "not_needed" | "disabled"; reason: string }
  | { status: "error"; reason: string; model?: string }
  | { status: "rejected"; reason: string; model: string; proposal?: AiProposal; quoteChecks?: QuoteCheck[] }
  | { status: "unknown"; reason: string; model: string }
  | { status: "confirmed" | "conflict"; reason: string; model: string; option: AiSectorOption; role: AiBusinessRole; quotes: { url: string; quote: string }[]; quoteChecks?: QuoteCheck[] };

const MAX_TEXT_PER_PAGE = 1200;
// Legal, privacy, cookie, careers and account pages say nothing about the activity.
const NON_IDENTITY_PATH = /\/(?:privacy|privacyverklaring|privacy-policy|datenschutz|dsgvo|gdpr|avg|cookies?|cookiebeleid|disclaimer|voorwaarden|algemene-voorwaarden|terms|agb|impressum|legal|juridisch|careers?|jobs?|vacatures?|werken-bij|karriere|login|inloggen|account|mijn-)(?:[\/\-_.]|$)/i;
const MAX_PAGES = 6;

/** Ask AI only when the rules did not confirm a sector. */
export function shouldAskAi(profile: { sector?: string; confidenceScore?: number }, env: Record<string, string | undefined> = process.env): { ask: boolean; reason: string } {
  if (env.RANKFIX_AI_SECTOR !== "1") return { ask: false, reason: "AI-sectorcontrole staat uit (RANKFIX_AI_SECTOR)" };
  if (!String(env.OPENAI_API_KEY || "").trim()) return { ask: false, reason: "Geen OPENAI_API_KEY ingesteld" };
  if (profile.sector && profile.sector !== "unknown" && (profile.confidenceScore || 0) >= 80) return { ask: false, reason: "Regels bevestigden de branche al" };
  return { ask: true, reason: profile.sector && profile.sector !== "unknown" ? "Regelbranche niet bevestigd: AI ter controle" : "Regels vonden geen branche: AI ter controle" };
}

/** Identity pages only (homepage, about, services, other own pages), capped. */
export function buildEvidencePack(pages: AiEvidencePage[]): AiEvidencePage[] {
  const rank = (p: AiEvidencePage) => p.type === "homepage" ? 0 : /\/(?:over|about|wie-|ueber|qui-|chi-|quienes|sobre|o-nas|company|bedrijf)/i.test(p.url) || p.type === "corporate" ? 1 : p.type === "service" ? 2 : 3;
  return [...pages].filter((p) => p.url && (p.title || p.description || p.text) && !NON_IDENTITY_PATH.test(p.url))
    .sort((a, b) => rank(a) - rank(b)).slice(0, MAX_PAGES)
    .map((p) => ({ url: p.url, type: p.type, title: p.title || "", description: p.description || "", headings: (p.headings || []).slice(0, 3), text: String(p.text || "").replace(/\s+/g, " ").slice(0, MAX_TEXT_PER_PAGE) }));
}

import { QUOTE_RESULT_NL } from "./ai-sector-report.ts";
export { QUOTE_RESULT_NL };

// Words only: letters and digits, lower case, NFKC. Punctuation, quotes, dashes and
// the "·" between text blocks never decide; every word must still be on the page
// in the same order, so nothing can be added, removed or paraphrased.
const words = (s: string) => (String(s || "").normalize("NFKC").toLowerCase().match(/[\p{L}\p{N}]+/gu) || []).join(" ");

/** Why a single quote does or does not count (shown in the report and the JSON). */
export type QuoteCheck = { url: string; quote: string; result: "counted" | "page_not_in_evidence" | "too_short" | "not_found_verbatim" | "template_text" | "no_activity_word" };

/** Every claim must be a verbatim quote from the page it names; ≥2 different pages. */
export function verifyProposal(proposal: AiProposal, pack: AiEvidencePage[], options: AiSectorOption[]): { ok: true; option: AiSectorOption; quotes: AiProposal["quotes"]; quoteChecks: QuoteCheck[] } | { ok: false; reason: string; quoteChecks: QuoteCheck[] } {
  const option = options.find((o) => o.key === proposal.key);
  if (!option) return { ok: false, reason: `Onbekende sleutel "${proposal.key}" (niet in de lijst van de motor)`, quoteChecks: [] };
  if (!AI_ROLES.includes(proposal.role)) return { ok: false, reason: `Onbekende rol "${proposal.role}"`, quoteChecks: [] };
  // Without the engine's own activity vocabulary a proposal cannot be verified.
  if (!option.vocab?.length) return { ok: false, reason: `Geen activiteitenwoordenlijst voor "${option.key}": niet te verifiëren`, quoteChecks: [] };
  const haystacks = new Map(pack.map((p) => [p.url, ` ${words([p.title, p.description, ...(p.headings || []), p.text].join(" "))} `]));
  const quoteChecks: QuoteCheck[] = (proposal.quotes || []).slice(0, 6).map((q) => {
    const url = String(q.url || ""), quote = String(q.quote || "");
    const haystack = haystacks.get(url);
    const w = words(quote);
    const check = (result: QuoteCheck["result"]): QuoteCheck => ({ url, quote: quote.slice(0, 240), result });
    if (!haystack) return check("page_not_in_evidence");
    if (quote.length < 12 || w.split(" ").length < 3) return check("too_short");
    if (!haystack.includes(` ${w} `)) return check("not_found_verbatim");
    // Template text (menus, footers, cookie lines) repeats on many pages; markup
    // filtering misses menus without nav/header elements. Text found on 3 or more
    // of the evidence pages is never independent evidence.
    if ([...haystacks.values()].filter((h) => h.includes(` ${w} `)).length >= 3) return check("template_text");
    // About the activity: the quote must contain the engine's own vocabulary for
    // this sector ("rijschool", "rijles"); "We are DPD" proves nothing.
    if (!option.vocab!.some((re) => new RegExp(re.source, re.flags.replace("g", "")).test(quote))) return check("no_activity_word");
    return check("counted");
  });
  const verified = quoteChecks.filter((c) => c.result === "counted");
  const pages = new Set(verified.map((q) => q.url));
  if (pages.size < 2) {
    const why = [...new Set(quoteChecks.filter((c) => c.result !== "counted").map((c) => QUOTE_RESULT_NL[c.result]))].join("; ");
    return { ok: false, reason: `Slechts ${pages.size} pagina('s) met een letterlijk teruggevonden citaat over de activiteit zelf; minimaal 2 nodig${why ? ` (overige citaten: ${why})` : ""}`, quoteChecks };
  }
  return { ok: true, option: { sector: option.sector, key: option.key, label: option.label }, quotes: verified.slice(0, 4).map(({ url, quote }) => ({ url, quote })), quoteChecks };
}


/** Roles that mean the site does not perform the activity itself. */
export function mediationRole(role: AiBusinessRole): boolean {
  return role === "bemiddelaar" || role === "marktplaats_platform" || role === "vergelijker";
}

export function buildPrompt(pack: AiEvidencePage[], options: AiSectorOption[]): string {
  const list = options.map((o) => `${o.key} = ${o.label} [${o.sector}]`).join("\n");
  const pages = pack.map((p, i) => `### Pagina ${i + 1}: ${p.url} (${p.type || "pagina"})\nTitel: ${p.title}\nOmschrijving: ${p.description}\nKoppen: ${(p.headings || []).join(" | ")}\nTekst: ${p.text}`).join("\n\n");
  return [
    "Je bepaalt de HOOFDACTIVITEIT van de organisatie achter deze website, uitsluitend op basis van de onderstaande pagina's.",
    "Regels:",
    "- Kies precies één sleutel uit de lijst, of \"unknown\" als het bewijs onvoldoende of tegenstrijdig is.",
    "- Een product, hotel, vlucht of dienst AANBIEDEN betekent niet dat de organisatie de uitvoerder is: een boekingsplatform is bemiddelaar, geen hotel of luchtvaartmaatschappij.",
    "- Kies een rol: " + AI_ROLES.join(", ") + ".",
    "- Geef 2 tot 4 LETTERLIJKE citaten (exact gekopieerd, minstens 3 woorden) van minstens 2 verschillende pagina's die de hoofdactiviteit bewijzen, met de URL van de pagina.",
    "- Verzin niets. Geen citaat = \"unknown\".",
    "Antwoord alleen met JSON: {\"key\":\"...\",\"role\":\"...\",\"quotes\":[{\"url\":\"...\",\"quote\":\"...\"}],\"reasoning\":\"max 1 zin\"}",
    "",
    "Toegestane sleutels:", list, "", pages,
  ].join("\n");
}

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

/** One call, hard timeout, never throws. */
export async function verifySectorWithAi(input: {
  profile: { sector?: string; key?: string; confidenceScore?: number };
  pages: AiEvidencePage[];
  options: AiSectorOption[];
  env?: Record<string, string | undefined>;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}): Promise<AiVerification> {
  const env = input.env || process.env;
  const gate = shouldAskAi(input.profile, env);
  if (!gate.ask) return { status: env.RANKFIX_AI_SECTOR === "1" && String(env.OPENAI_API_KEY || "").trim() ? "not_needed" : "disabled", reason: gate.reason };
  const model = env.OPENAI_SECTOR_MODEL || env.OPENAI_MODEL || "gpt-5.6-luna";
  const pack = buildEvidencePack(input.pages);
  if (pack.length < 2) return { status: "rejected", reason: "Minder dan 2 eigen pagina's beschikbaar als bewijs", model };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs ?? 8000);
  const started = Date.now();
  let usage: AiUsage = { promptTokens: null, completionTokens: null, durationMs: 0 };
  const withUsage = <T extends AiVerification>(result: T): T & { usage: AiUsage } => ({ ...result, usage: { ...usage, durationMs: Date.now() - started } });
  try {
    const doFetch = input.fetchImpl || ((u, i) => fetch(u, i));
    const response = await doFetch("https://api.openai.com/v1/chat/completions", {
      method: "POST", signal: controller.signal,
      headers: { "content-type": "application/json", authorization: `Bearer ${String(env.OPENAI_API_KEY).trim()}` },
      body: JSON.stringify({ model, response_format: { type: "json_object" }, messages: [{ role: "user", content: buildPrompt(pack, input.options) }] }),
    });
    if (!response.ok) return withUsage({ status: "error", reason: `AI-dienst antwoordde HTTP ${response.status}`, model });
    const data = await response.json() as { choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
    usage = { promptTokens: data.usage?.prompt_tokens ?? null, completionTokens: data.usage?.completion_tokens ?? null, durationMs: 0 };
    let proposal: AiProposal;
    try { proposal = JSON.parse(String(data.choices?.[0]?.message?.content || "")); } catch { return withUsage({ status: "error", reason: "AI-antwoord was geen geldige JSON", model }); }
    if (!proposal || proposal.key === "unknown") return withUsage({ status: "unknown", reason: "AI vond onvoldoende of tegenstrijdig bewijs", model });
    const check = verifyProposal(proposal, pack, input.options);
    if (!check.ok) return withUsage({ status: "rejected", reason: check.reason, model, proposal, quoteChecks: check.quoteChecks });
    const ruleSector = input.profile.sector && input.profile.sector !== "unknown" ? input.profile.sector : null;
    const agrees = !ruleSector || ruleSector === check.option.sector;
    return withUsage({ status: agrees ? "confirmed" : "conflict", reason: agrees ? "AI-voorstel bevestigd met letterlijk websitebewijs" : `AI-bewijs (${check.option.label}) spreekt de onbevestigde regelbranche tegen`, model, option: check.option, role: proposal.role, quotes: check.quotes, quoteChecks: check.quoteChecks });
  } catch (error) {
    return withUsage({ status: "error", reason: controller.signal.aborted ? "AI-controle overschreed de tijdslimiet" : `AI-controle mislukt: ${error instanceof Error ? error.message : "onbekend"}`, model });
  } finally { clearTimeout(timer); }
}
