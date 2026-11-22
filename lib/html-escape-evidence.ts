// Visible double-encoded text ("Tom &amp; Jerry" shown literally to visitors).
// Only real text nodes count. A naive tag strip (/<[^>]+>/) leaks attribute
// values that contain ">" (JSON, data-*, srcdoc; browsers do not escape ">" in
// serialized attributes), and those values are never visible. Returns a short
// sample around the first visible escape, or null.
import { decodeHtmlEntities } from "./html-entities.ts";

const INVISIBLE_BLOCKS = /<(script|style|noscript|template|textarea|svg|iframe|object)\b[\s\S]*?<\/\1\s*>/gi;
// A tag with quote-aware attributes: "…" and '…' may contain ">".
const TAG = /<\/?[a-zA-Z][^\s/>]*(?:\s+(?:[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?|\/))*\s*\/?>/g;
const ENTITY = /&(?:amp|quot|lt|gt|apos|nbsp|#(?:x[0-9a-f]+|\d+));/i;

export function visibleTextOf(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(INVISIBLE_BLOCKS, " ")
    .replace(TAG, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function visibleEscapeSample(html: string): string | null {
  // Serialized HTML encodes "&" once; one decode gives the text a visitor sees.
  const text = decodeHtmlEntities(visibleTextOf(html));
  const match = ENTITY.exec(text);
  if (!match) return null;
  const start = Math.max(0, match.index - 40);
  return text.slice(start, match.index + match[0].length + 40).trim();
}
