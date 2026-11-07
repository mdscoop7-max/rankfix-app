// Main-content text for AI sector verification (owner request 7 Nov 2026):
// navigation, header, footer, sidebars, menus, breadcrumbs, cookie banners and
// forms never count as evidence of what a business does. One linear pass over
// the tags (no lazy cross-page patterns: see tests/html-linear-scans-*).

const DROP_TAGS = new Set(["script", "style", "noscript", "template", "svg", "nav", "header", "footer", "aside", "menu", "form", "select", "button", "iframe", "dialog"]);
const DROP_ROLE = /\brole\s*=\s*["'](?:navigation|banner|contentinfo|menu|menubar|complementary|dialog|search)["']/i;
const DROP_HOOK = /\b(?:class|id)\s*=\s*["'][^"']*?(?<![\w])(?:nav|navbar|navigation|menu|mega-?menu|breadcrumbs?|footer|header|site-header|site-footer|sidebar|cookie\w*|consent\w*|skip-?link|topbar|offcanvas)(?![\w])/i;
const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
const BLOCK = new Set(["p", "li", "h1", "h2", "h3", "h4", "h5", "h6", "div", "section", "article", "main", "td", "th", "blockquote", "dd", "dt", "figcaption", "br", "tr", "ul", "ol", "table"]);

const decode = (s: string) => s.replace(/&nbsp;|&#160;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, "\"").replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">");

/** Readable sentences from the page's own content; menus and chrome removed. */
export function aiContentText(html: string, maxChars = 3000): string {
  const source = String(html || "").slice(0, 1_500_000);
  const tag = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*>/g;
  const stack: { name: string; drop: boolean }[] = [];
  let dropDepth = 0, last = 0, block = "";
  const blocks: string[] = [];
  const flush = () => { const t = decode(block).replace(/\s+/g, " ").trim(); if (t.split(" ").length >= 5) blocks.push(t); block = ""; };
  for (let m = tag.exec(source); m; m = tag.exec(source)) {
    if (!dropDepth) block += source.slice(last, m.index);
    last = m.index + m[0].length;
    if (!m[2]) continue; // comment
    const name = m[2].toLowerCase(), closing = m[1] === "/";
    if (VOID.has(name) || m[0].endsWith("/>")) { if (BLOCK.has(name) && !dropDepth) flush(); continue; }
    if (!closing) {
      const drop = DROP_TAGS.has(name) || DROP_ROLE.test(m[0]) || DROP_HOOK.test(m[0]);
      if (BLOCK.has(name) && !dropDepth) flush();
      stack.push({ name, drop });
      if (drop) dropDepth++;
      // Raw-text elements: skip to their end tag in one search.
      if (name === "script" || name === "style") {
        const endTag = name === "script" ? /<\/script/gi : /<\/style/gi;
        endTag.lastIndex = last;
        const end = endTag.exec(source);
        last = end ? end.index : source.length; tag.lastIndex = last;
      }
    } else {
      // Look back at most 64 open elements: real end tags close something near
      // the top; anything further is a stray end tag (keeps the pass linear).
      let at = -1;
      for (let i = stack.length - 1; i >= Math.max(0, stack.length - 64); i--) if (stack[i].name === name) { at = i; break; }
      if (at < 0) continue; // stray end tag
      for (const e of stack.splice(at)) if (e.drop) dropDepth--;
      if (BLOCK.has(name) && !dropDepth) flush();
    }
    if (blocks.join(" ").length > maxChars * 2) break;
  }
  if (!dropDepth) block += source.slice(last);
  flush();
  return [...new Set(blocks)].join(" · ").slice(0, maxChars);
}
