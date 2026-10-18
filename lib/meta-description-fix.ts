/**
 * Meta description Fix (RankFix QA).
 *
 * One customer action — "Fix" — must lead to one predictable code change:
 *   1. a new meta description text that satisfies the scanner guideline (120–160 chars),
 *   2. a deterministic edit of ONLY that attribute/block in the source file,
 *   3. a GitHub PR that contains exactly the text the customer approved.
 *
 * The AI may phrase the text, but it never rewrites the source file. When the AI
 * service fails or returns unusable output, an evidence-bound fallback built only
 * from verified page text (current description, H1, title) is used when it meets
 * the guideline; otherwise RankFix reports a clear reason instead of a generic error.
 * Nothing here is specific to a website, brand or domain.
 */

export const META_DESCRIPTION_MIN = 120;
export const META_DESCRIPTION_MAX = 160;

const ENTITY: Record<string, string> = { "&amp;": "&", "&quot;": '"', "&#39;": "'", "&apos;": "'", "&lt;": "<", "&gt;": ">", "&nbsp;": " " };

export function normalizeDescriptionText(value: unknown): string {
  return String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&(?:amp|quot|#39|apos|lt|gt|nbsp);/g, (m) => ENTITY[m] || m)
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^["'“”„‘’]+|["'“”„‘’]+$/g, "")
    .trim();
}

const PLACEHOLDER = /\[(?:[A-Z_ ]{3,}|your[^\]]*)\]|\bTODO\b|CHANGE_ME|REPLACE_ME|INSERT_[A-Z_]+|lorem ipsum|\{\{|\{%|\$\{/i;

export function checkDescriptionCandidate(text: string, current = ""): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const value = normalizeDescriptionText(text);
  if (!value) errors.push("EMPTY");
  if (value.length < META_DESCRIPTION_MIN) errors.push("TOO_SHORT");
  if (value.length > META_DESCRIPTION_MAX) errors.push("TOO_LONG");
  if (/<[^>]+>/.test(String(text))) errors.push("HTML");
  if (PLACEHOLDER.test(value)) errors.push("PLACEHOLDER");
  if (/https?:\/\//i.test(value)) errors.push("URL");
  if (current && value.toLowerCase() === normalizeDescriptionText(current).toLowerCase()) errors.push("UNCHANGED");
  return { ok: errors.length === 0, errors };
}

/** Cuts at a word boundary without an ellipsis and closes the sentence. */
function fitToMax(text: string, max: number): string {
  if (text.length <= max) return text;
  const slice = text.slice(0, max);
  const sentence = slice.lastIndexOf(". ");
  if (sentence >= META_DESCRIPTION_MIN - 1) return slice.slice(0, sentence + 1);
  const space = slice.lastIndexOf(" ");
  const cut = (space > 0 ? slice.slice(0, space) : slice).replace(/[\s,;:–—-]+$/, "");
  return /[.!?]$/.test(cut) ? cut : cut + ".";
}

function sentence(value: string): string {
  const v = normalizeDescriptionText(value).replace(/\s*[|·]\s*/g, " – ");
  if (!v) return "";
  return /[.!?]$/.test(v) ? v : v + ".";
}

/**
 * Evidence-bound fallback: only verified page text is combined, nothing is invented.
 * Returns null when the verified text is not enough to reach the guideline.
 */
export function buildEvidenceDescription(input: { current?: string; title?: string; h1?: string; extra?: string[] }): string | null {
  const parts: string[] = [];
  const seen: string[] = [];
  const add = (raw: string | undefined) => {
    const s = sentence(raw || "");
    if (s.length < 8) return;
    const key = s.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, "").trim();
    if (!key || seen.some((k) => k.includes(key) || key.includes(k))) return;
    seen.push(key);
    parts.push(s);
  };
  add(input.current);
  add(input.h1);
  // A title like "Brand | Tagline" contributes its non-brand segments.
  const titleSegments = normalizeDescriptionText(input.title || "").split(/\s*[|–—·]\s*/).filter((s) => s.split(/\s+/).length >= 2);
  titleSegments.forEach(add);
  (input.extra || []).forEach(add);
  if (!parts.length) return null;
  // Prefer intact, source-backed sentences. A mechanically truncated summary
  // can otherwise end in nonsense such as "accessoires en.".
  const candidates=parts.slice(0,10);
  let best:string|null=null;
  let bestScore=-Infinity;
  for(let mask=1;mask<(1<<candidates.length);mask++){
    if(input.current && !(mask&1)) continue;
    const text=candidates.filter((_,index)=>Boolean(mask&(1<<index))).join(" ");
    if(!checkDescriptionCandidate(text,input.current||"").ok) continue;
    const score=(mask&1?100:0) + (candidates.length>3 && mask&(1<<(candidates.length-1))?20:0)
      - Math.abs(text.length-145) - text.split(". ").length*0.2;
    if(score>bestScore){ bestScore=score;best=text; }
  }
  if(best) return best;
  const combined=fitToMax(parts.join(" "),META_DESCRIPTION_MAX);
  if(/\b(?:en|of|de|het|een|voor|met|bij|van|in|op|naar|zoals)\.$/i.test(combined)) return null;
  return checkDescriptionCandidate(combined,input.current||"").ok?combined:null;
}

/**
 * Extract only static, visible paragraphs from the exact GitHub HTML template.
 * The Fix endpoint independently checks that the template description matches
 * the live scan before writing anything. No unrelated business facts are added.
 * Dynamic template values are deliberately excluded.
 */
export function extractSourceDescriptionEvidence(filePath: string, source: string): string[] {
  if(!/\.html?$/i.test(filePath)) return [];
  const noHead=source.replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi," ");
  const main=noHead.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1]||noHead;
  return [...main.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((match)=>match[1])
    .filter((raw)=>!/(?:\{\{|\{%|<\?|<%|\$\{|<script\b|<style\b)/i.test(raw))
    .map((raw)=>normalizeDescriptionText(raw.replace(/<[^>]*>/g," ")))
    .filter((value)=>value.length>=35&&value.length<=260&&!PLACEHOLDER.test(value))
    .slice(0,8);
}

/** Extracts the first balanced JSON object from model output (tolerates fences/prose). */
export function parseAiJsonObject(text: string): Record<string, unknown> | null {
  const clean = String(text || "").replace(/```(?:json)?/gi, "").trim();
  const start = clean.indexOf("{");
  if (start < 0) return null;
  let depth = 0, inString = false, escaped = false;
  for (let i = start; i < clean.length; i++) {
    const ch = clean[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) {
      try {
        const parsed = JSON.parse(clean.slice(start, i + 1));
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
      } catch { return null; }
    }
  }
  return null;
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export type SourcePatch =
  | { ok: true; content: string; mode: "html_attribute" | "template_block" | "html_insert" | "js_metadata"; previous: string }
  | { ok: false; code: "DYNAMIC_DESCRIPTION" | "AMBIGUOUS_DESCRIPTION" | "DESCRIPTION_NOT_FOUND" | "SCAN_MISMATCH" | "UNSUPPORTED_FILE" };

const META_TAG = /<meta\b[^>]*\bname\s*=\s*["']description["'][^>]*>/gi;
const TEMPLATE_SYNTAX = /\{\{|\{%|<\?|\$\{|<%/;

/**
 * Changes ONLY the meta description in a source file. Never touches other tags.
 * `expectedCurrent` (the description the scanner saw live) must match the static
 * value in the file, so RankFix never edits a template that did not produce the page.
 */
export function applyMetaDescriptionToSource(filePath: string, source: string, newText: string, expectedCurrent = ""): SourcePatch {
  const text = normalizeDescriptionText(newText);
  const expected = normalizeDescriptionText(expectedCurrent).toLowerCase();
  const matchesScan = (value: string) => !expected || normalizeDescriptionText(value).toLowerCase() === expected;

  if (/\.(html?|php|vue|jinja2?|j2|njk|twig|liquid|hbs)$/i.test(filePath)) {
    // 1. Child template that fills a parent's description block.
    const blocks = [...source.matchAll(/\{%-?\s*block\s+(?:meta_)?description\s*-?%\}([\s\S]*?)\{%-?\s*endblock(?:\s+\w+)?\s*-?%\}/gi)];
    const tags = [...source.matchAll(META_TAG)];
    const staticBlocks = blocks.filter((b) => !TEMPLATE_SYNTAX.test(b[1]));
    if (blocks.length === 1 && staticBlocks.length === 1 && !(tags.length === 1 && /\{%-?\s*block/.test(tags[0][0]))) {
      const block = blocks[0];
      if (!matchesScan(block[1])) return { ok: false, code: "SCAN_MISMATCH" };
      const replaced = block[0].replace(block[1], escapeAttribute(text));
      return { ok: true, content: source.replace(block[0], replaced), mode: "template_block", previous: normalizeDescriptionText(block[1]) };
    }
    if (blocks.length > 1) return { ok: false, code: "AMBIGUOUS_DESCRIPTION" };
    // 2. A single static <meta name="description" content="…">.
    if (tags.length > 1) return { ok: false, code: "AMBIGUOUS_DESCRIPTION" };
    if (tags.length === 1) {
      const tag = tags[0][0];
      const contentMatch = tag.match(/\bcontent\s*=\s*(["'])([\s\S]*?)\1/i);
      if (!contentMatch) return { ok: false, code: "DESCRIPTION_NOT_FOUND" };
      if (TEMPLATE_SYNTAX.test(contentMatch[2])) return { ok: false, code: "DYNAMIC_DESCRIPTION" };
      if (!matchesScan(contentMatch[2])) return { ok: false, code: "SCAN_MISMATCH" };
      const newTag = tag.replace(contentMatch[0], `content="${escapeAttribute(text)}"`);
      return { ok: true, content: source.replace(tag, newTag), mode: "html_attribute", previous: normalizeDescriptionText(contentMatch[2]) };
    }
    // 3. No description at all: insert one tag into this file's own <head>.
    if (!expected && /<\/head\s*>/i.test(source)) {
      return { ok: true, content: source.replace(/<\/head\s*>/i, `<meta name="description" content="${escapeAttribute(text)}">\n</head>`), mode: "html_insert", previous: "" };
    }
    return { ok: false, code: expected ? "SCAN_MISMATCH" : "DESCRIPTION_NOT_FOUND" };
  }

  if (/\.(tsx|jsx|ts|js|mjs)$/i.test(filePath)) {
    // Top-level metadata.description only; openGraph/twitter descriptions stay untouched.
    const withoutNested = source.replace(/\b(?:openGraph|twitter)\s*:\s*\{[\s\S]*?\}/gi, (m) => " ".repeat(m.length));
    const matches = [...withoutNested.matchAll(/\bdescription\s*:\s*(["'`])((?:(?!\1)[\s\S])*?)\1/g)];
    if (matches.length > 1) return { ok: false, code: "AMBIGUOUS_DESCRIPTION" };
    if (matches.length === 0) return { ok: false, code: "DESCRIPTION_NOT_FOUND" };
    const m = matches[0];
    if (m[1] === "`" && m[2].includes("${")) return { ok: false, code: "DYNAMIC_DESCRIPTION" };
    if (!matchesScan(m[2])) return { ok: false, code: "SCAN_MISMATCH" };
    const at = m.index!;
    const original = source.slice(at, at + m[0].length);
    const literal = JSON.stringify(text);
    return { ok: true, content: source.slice(0, at) + `description: ${literal}` + source.slice(at + original.length), mode: "js_metadata", previous: m[2] };
  }
  return { ok: false, code: "UNSUPPORTED_FILE" };
}

export const PATCH_ERROR_NL: Record<Exclude<SourcePatch, { ok: true }>["code"], string> = {
  DYNAMIC_DESCRIPTION: "De meta description in dit bestand wordt dynamisch gevuld (bijvoorbeeld via een templatevariabele). RankFix past dynamische waarden niet automatisch aan; pas de bron van die variabele aan of kies het juiste bestand.",
  AMBIGUOUS_DESCRIPTION: "Dit bestand bevat meer dan één meta description. RankFix wijzigt dan niets automatisch om fouten te voorkomen.",
  DESCRIPTION_NOT_FOUND: "RankFix kon de meta description niet veilig in dit bestand vinden.",
  SCAN_MISMATCH: "De meta description in dit bestand komt niet overeen met wat de scan live zag. RankFix wijzigt daarom niets; dit bestand maakt waarschijnlijk niet de gescande pagina.",
  UNSUPPORTED_FILE: "Dit bestandstype wordt niet ondersteund voor een automatische meta-description-fix.",
};

/* ------------------------------------------------------------------------- */
/* AI text generation (shared by the proposal step and the GitHub step).      */
/* ------------------------------------------------------------------------- */

export type AiFailure = "AI_UNAVAILABLE" | "AI_PROVIDER_ERROR" | "AI_INCOMPLETE" | "AI_INVALID_OUTPUT";

/**
 * One Responses-API call returning a JSON object. Reasoning models spend output
 * tokens on reasoning, so the budget is generous and effort is kept low; a model
 * that rejects the reasoning parameter is retried once without it.
 */
export async function requestAiJson(prompt: string, opts: { maxOutputTokens?: number; fetchImpl?: typeof fetch } = {}): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; code: AiFailure; status?: number }> {
  const key = process.env.OPENAI_API_KEY?.trim();
  // Invalid pasted values (newlines, duplicate keys) are not API credentials.
  // Return a safe fallback result without leaking any secret into request logs.
  if (!key || !/^sk-[A-Za-z0-9_-]+$/.test(key)) return { ok: false, code: "AI_UNAVAILABLE" };
  const model = process.env.OPENAI_MODEL?.trim() || "gpt-5.6-luna";
  const doFetch = opts.fetchImpl || fetch;
  const reasoningCapable = /^(?:gpt-5|o\d)/i.test(model);
  const call = async (withReasoning: boolean) => doFetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      input: prompt,
      max_output_tokens: opts.maxOutputTokens || 2500,
      ...(withReasoning ? { reasoning: { effort: "low" } } : {}),
    }),
  });
  let response: Response;
  try {
    response = await call(reasoningCapable);
    if (!response.ok && reasoningCapable && response.status === 400) {
      const body = await response.text().catch(() => "");
      if (/reasoning/i.test(body)) response = await call(false);
      else { console.error("RankFix AI provider error", response.status); return { ok: false, code: "AI_PROVIDER_ERROR", status: response.status }; }
    }
  } catch {
    console.error("RankFix AI provider unreachable");
    return { ok: false, code: "AI_PROVIDER_ERROR" };
  }
  if (!response.ok) {
    console.error("RankFix AI provider error", response.status);
    return { ok: false, code: "AI_PROVIDER_ERROR", status: response.status };
  }
  const raw: unknown = await response.json().catch(() => null);
  const data = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const output = Array.isArray(data.output) ? data.output : [];
  const text = typeof data.output_text === "string" && data.output_text
    ? data.output_text
    : output.flatMap((item) => {
        const rec = item && typeof item === "object" ? item as Record<string, unknown> : {};
        return Array.isArray(rec.content) ? rec.content : [];
      }).map((part) => {
        const rec = part && typeof part === "object" ? part as Record<string, unknown> : {};
        return typeof rec.text === "string" ? rec.text : "";
      }).join("");
  const parsed = parseAiJsonObject(text);
  if (!parsed) {
    const incomplete = data.status === "incomplete";
    console.error("RankFix AI output unusable", incomplete ? "incomplete" : "invalid_json");
    return { ok: false, code: incomplete ? "AI_INCOMPLETE" : "AI_INVALID_OUTPUT" };
  }
  return { ok: true, data: parsed };
}

export type DescriptionResult =
  | { ok: true; text: string; source: "ai" | "evidence"; attempts: number }
  | { ok: false; code: AiFailure | "NO_SAFE_TEXT"; attempts: number };

export async function generateMetaDescription(input: { url: string; current?: string; title?: string; h1?: string; extra?: string[]; fetchImpl?: typeof fetch }): Promise<DescriptionResult> {
  const current = normalizeDescriptionText(input.current);
  let lastCode: AiFailure | "NO_SAFE_TEXT" = "NO_SAFE_TEXT";
  let feedback = "";
  let attempts = 0;
  if (process.env.OPENAI_API_KEY?.trim()) {
    for (let i = 0; i < 2; i++) {
      attempts++;
      const prompt = [
        "You are RankFix AI. Write ONE improved meta description for the page below.",
        `Hard requirements: ${META_DESCRIPTION_MIN + 10}-${META_DESCRIPTION_MAX - 5} characters including spaces; plain text; no HTML, no quotes around it, no URLs, no emoji, no placeholders.`,
        "Write in the same language as the current description/title. Use ONLY facts present in the supplied title, H1 and current description. Never invent prices, discounts, delivery times, guarantees, ratings, awards or claims.",
        "Return ONLY JSON: {\"description\": string}.",
        `URL: ${input.url}`,
        `Title: ${normalizeDescriptionText(input.title)}`,
        `H1: ${normalizeDescriptionText(input.h1)}`,
        `Current description: ${current}`,
        ...(input.extra||[]).slice(0,4).map((v)=>`Verified visible page text: ${normalizeDescriptionText(v)}`),
        feedback,
      ].filter(Boolean).join("\n");
      const res = await requestAiJson(prompt, { fetchImpl: input.fetchImpl });
      if (!res.ok) { lastCode = res.code; if (res.code === "AI_UNAVAILABLE") break; continue; }
      const candidate = normalizeDescriptionText(res.data.description);
      const check = checkDescriptionCandidate(candidate, current);
      if (check.ok) return { ok: true, text: candidate, source: "ai", attempts };
      lastCode = "AI_INVALID_OUTPUT";
      feedback = `Your previous answer (${candidate.length} characters) was rejected: ${check.errors.join(", ")}. Fix exactly that.`;
    }
  } else lastCode = "AI_UNAVAILABLE";
  const evidence = buildEvidenceDescription({ current, title: input.title, h1: input.h1, extra: input.extra });
  if (evidence) return { ok: true, text: evidence, source: "evidence", attempts };
  return { ok: false, code: lastCode, attempts };
}

export const DESCRIPTION_ERROR_NL: Record<AiFailure | "NO_SAFE_TEXT", string> = {
  AI_UNAVAILABLE: "De AI-tekstdienst is in deze omgeving niet ingesteld en de bestaande paginatekst is te kort voor een veilige meta description van 120–160 tekens.",
  AI_PROVIDER_ERROR: "De AI-tekstdienst reageerde nu niet goed. Er is niets gewijzigd; probeer het over een minuut opnieuw.",
  AI_INCOMPLETE: "De AI-tekstdienst gaf een onvolledig antwoord. Er is niets gewijzigd; probeer het opnieuw.",
  AI_INVALID_OUTPUT: "De AI-tekstdienst gaf geen meta description die aan de eisen (120–160 tekens, zonder verzonnen claims) voldoet. Er is niets gewijzigd; probeer het opnieuw.",
  NO_SAFE_TEXT: "RankFix kon geen veilige meta description van 120–160 tekens maken uit de bevestigde paginatekst.",
};
