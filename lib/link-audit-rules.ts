/**
 * Generic rules for the internal link audit (no site-specific exceptions).
 * - error-page slugs that answer HTTP 200 (soft 404) are broken link targets
 * - hidden / honeypot anchors are never followed or counted
 * - the same anchor text pointing to different targets is reported
 */

const ERROR_SLUG = /(?:^|\/)(?:page-?not-?found|pagina-?niet-?gevonden|not-?found|404|error-?404|error|seite-?nicht-?gefunden|page-?introuvable|pagina-?no-?encontrada|pagina-?non-?trovata)(?:\.[a-z0-9]+)?(?:\/|$)/i;

export function isErrorPagePath(pathname: string): boolean {
  return ERROR_SLUG.test(pathname);
}

const HIDDEN_STYLE = /display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0(?:[;\s"']|$)|(?:left|top|text-indent)\s*:\s*-\d{3,}px|(?:height|width)\s*:\s*0(?:px)?\s*(?:;|$)|font-size\s*:\s*0(?:px)?\s*(?:;|$)/i;
const HIDDEN_CLASS = /(?:^|[\s_-])(?:honey-?pot|hp-?field|hidden-?link|secret-?link|sr-?trap|visually-?hidden-?trap|d-none|hidden|hide)(?:$|[\s_-])/i;
const HIDDEN_TEXT = /^(?:secret[\s-]?link|honey-?pot|do not click|niet klikken)$/i;

/** True when the anchor is invisible to people (a honeypot/trap or a hidden utility link). */
export function isHiddenAnchor(openTagAttributes: string, anchorText = ""): boolean {
  const attrs = openTagAttributes;
  const withoutValues = attrs.replace(/\b[a-z-]+\s*=\s*(?:"[^"]*"|'[^']*')/gi, " ");
  if (/(?:^|\s)hidden(?=\s|$)/i.test(withoutValues)) return true;
  if (/\baria-hidden\s*=\s*["']?true/i.test(attrs) && /\btabindex\s*=\s*["']?-1/i.test(attrs)) return true;
  const style = /\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(attrs);
  if (style && HIDDEN_STYLE.test(style[1] ?? style[2] ?? "")) return true;
  const cls = /\bclass\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(attrs);
  if (cls && /honey-?pot|hp-?field|secret-?link|hidden-?link/i.test(cls[1] ?? cls[2] ?? "")) return true;
  if (cls && HIDDEN_CLASS.test(cls[1] ?? cls[2] ?? "") && /\btabindex\s*=\s*["']?-1/i.test(attrs)) return true;
  if (HIDDEN_TEXT.test(anchorText.trim())) return true;
  return false;
}

const GENERIC_ANCHOR_TEXT = /^(?:lees\s+meer|meer\s+(?:info|informatie|lezen)|klik\s+hier|bekijk|bekijk\s+alles|read\s+more|learn\s+more|more|click\s+here|view|view\s+all|details?|weiterlesen|mehr|en\s+savoir\s+plus|leer\s+m[aá]s|scopri\s+di\s+pi[uù]|>|»|›|→|next|previous|volgende|vorige|terug|back|home|menu|sluiten|close|\d+)$/i;

export type AnchorTarget = { text: string; url: string };

/** Same (non-generic) anchor text that points to more than one different internal target. */
export function findConflictingAnchorTargets(anchors: AnchorTarget[]): Array<{ text: string; targets: string[] }> {
  const byText = new Map<string, { text: string; targets: Set<string> }>();
  for (const anchor of anchors) {
    const text = anchor.text.replace(/\s+/g, " ").trim();
    if (text.length < 4 || text.length > 60 || GENERIC_ANCHOR_TEXT.test(text)) continue;
    const key = text.toLowerCase();
    let targetKey: string;
    try {
      const parsed = new URL(anchor.url);
      targetKey = `${parsed.hostname.replace(/^www\./, "")}${parsed.pathname.replace(/\/+$/, "") || "/"}`;
    } catch { continue; }
    const entry = byText.get(key) ?? { text, targets: new Set<string>() };
    entry.targets.add(targetKey);
    byText.set(key, entry);
  }
  return [...byText.values()]
    .filter((entry) => entry.targets.size > 1)
    .map((entry) => ({ text: entry.text, targets: [...entry.targets].slice(0, 4) }));
}

/** Backoff for the second attempt: transient failures are retried before a link is called unconfirmed. */
export const LINK_RETRY_DELAY_MS = 600;

export type LinkOutcome = { status: number | null; error: boolean };

/**
 * Classifies a link result. Only an HTTP response proves a link broken; a network
 * failure or time-out is "unconfirmed" and never lowers the score. A target that the
 * page fetch itself retrieved with HTTP 200 is never broken.
 */
export function classifyLinkOutcome(outcome: LinkOutcome, url: string, knownGoodUrls: Set<string> = new Set()): "ok" | "broken" | "soft_error_page" | "unconfirmed" {
  if (outcome.error || outcome.status === null) return knownGoodUrls.has(url) ? "ok" : "unconfirmed";
  if (outcome.status === 404 || outcome.status === 410) return knownGoodUrls.has(url) ? "ok" : "broken";
  if (outcome.status >= 500) return knownGoodUrls.has(url) ? "ok" : "broken";
  try {
    if (outcome.status >= 200 && outcome.status < 400 && isErrorPagePath(new URL(url).pathname)) return "soft_error_page";
  } catch { /* ignore */ }
  return "ok";
}
