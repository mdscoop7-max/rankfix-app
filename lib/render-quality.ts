// Guards for browser-rendered evidence. A headless render can itself be blocked
// (bot challenge, empty shell) while still returning HTTP 200 and a <title>.
// Such a document is not evidence of the website and must never replace better
// evidence or count as a successful recovery.

export function visibleWordCount(html: string): number {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ");
  return text.split(/\s+/).filter(Boolean).length;
}

// Minimum visible content for a recovered page to count as the website itself.
export const MIN_RECOVERED_WORDS = 40;

export function isSubstantiveRender(html: string | null | undefined): boolean {
  return Boolean(html) && visibleWordCount(html as string) >= MIN_RECOVERED_WORDS;
}

// A render replaces the raw HTML only when the raw HTML was a thin client shell or
// the render keeps at least half of the raw visible content.
export function renderImprovesEvidence(rawWords: number, rawThinShell: boolean, renderedHtml: string): boolean {
  const renderedWords = visibleWordCount(renderedHtml);
  if (rawThinShell) return renderedWords >= Math.min(MIN_RECOVERED_WORDS, rawWords + 1);
  return renderedWords >= rawWords * 0.5;
}
