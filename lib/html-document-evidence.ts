import { decodeHtmlEntities } from "./html-entities";

/** Attribute order, case and quotation style must not change scan evidence. */
export function htmlAttributes(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const start = tag.match(/^<\/?[\w:-]+\b/i);
  const tail = tag.slice(start?.[0].length || 0).replace(/\/?\s*>$/, "");
  const matcher = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|\x27([^\x27]*)\x27|([^\s>]+)))?/g;
  let m: RegExpExecArray | null;
  while ((m = matcher.exec(tail))) {
    const name = m[1].toLowerCase();
    if (!(name in attrs)) attrs[name] = decodeHtmlEntities(m[2] ?? m[3] ?? m[4] ?? "");
  }
  return attrs;
}

export function htmlOpeningTags(html: string, name: string): string[] {
  const safe = name.replace(/[^a-z0-9:-]/gi, "");
  if (!safe) return [];
  // The alternating quoted branches preserve > inside attribute values.
  const re = new RegExp("<" + safe + "\\b(?:[^>\\\"\x27]|\\\"[^\\\"]*\\\"|\x27[^\x27]*\x27)*>", "gi");
  return [...html.matchAll(re)].map(m => m[0]);
}

export function htmlHead(html: string): string {
  const start = /<head\b[^>]*>/i.exec(html);
  if (!start || start.index === undefined) return "";
  const after = html.slice(start.index + start[0].length);
  const closing = /<\/head\s*>/i.exec(after);
  return closing ? after.slice(0, closing.index) : after.slice(0, 1_000_000);
}

export type HeadEvidence = {
  title: string; description: string; descriptionPresent: boolean; canonical: string;
  viewport: string; lang: string; robots: string; metas: Array<{ property:string; name:string; content:string }>;
  headComplete: boolean; simultaneousCoreAbsence: boolean;
};

export function inspectHeadEvidence(html: string): HeadEvidence {
  const head = htmlHead(html);
  const metas = htmlOpeningTags(head, "meta").map(tag => {
    const a = htmlAttributes(tag);
    return { name:(a.name || "").toLowerCase(), property:(a.property || "").toLowerCase(), content:a.content || "" };
  });
  const byMeta = (key: string) => metas.find(m => (m.name === key || m.property === key) && m.content.trim())?.content.trim() || "";
  const descriptionPresent = metas.some(m => m.name === "description" || m.property === "description");
  const canonical = htmlOpeningTags(head, "link").map(htmlAttributes).find(a => (a.rel || "").toLowerCase().split(/\s+/).includes("canonical") && Boolean(a.href))?.href || "";
  const lang = htmlOpeningTags(html.slice(0, 150_000), "html").map(htmlAttributes)[0]?.lang || "";
  const titleMatch = head.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i);
  const title = decodeHtmlEntities(titleMatch?.[1] || "").trim();
  const description = byMeta("description");
  const viewport = byMeta("viewport");
  const headComplete = /<\/head\s*>/i.test(html);
  const simultaneousCoreAbsence = !title && !description && !canonical && !viewport;
  return { title, description, descriptionPresent, canonical, viewport, lang, robots:byMeta("robots"), metas, headComplete, simultaneousCoreAbsence };
}

/** Collect link labels independently from position of href, aria-label or title. */
export function htmlAnchors(html: string): Array<{ href:string; label:string; aria:string; title:string }> {
  const result: Array<{ href:string; label:string; aria:string; title:string }> = [];
  const re = /<a\b((?:[^>\\"\x27]|\\"[^\\"]*\\"|\x27[^\x27]*\x27)*)>([\s\S]*?)<\/a\s*>/gi;
  for (const m of html.matchAll(re)) {
    const a = htmlAttributes("<a " + m[1] + ">");
    if (!a.href) continue;
    result.push({ href:a.href, label:decodeHtmlEntities(m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()), aria:a["aria-label"] || "", title:a.title || "" });
  }
  return result;
}
