// Explicit .ts extension so node --experimental-strip-types tests can load it.
import { decodeHtmlEntities } from "./html-entities.ts";

export type ImageMetrics = {
  elementCount: number;
  uniqueImageReferences: number;
  missingAlt: number;
  /** Union of affected image elements; categories can overlap. */
  affectedAltImages: number;
  /** Images that are the only content of a link/button but have an empty alt: the link has no accessible name. */
  unnamedLinkImages: number;
  /** Images whose alt is a file name or a placeholder word ("IMG_1234.jpg", "image", "afbeelding"). */
  genericAlt: number;
  detection: "html";
};

const IMAGE_EXT = /\.(avif|webp|jpe?g|png|gif|svg|bmp|ico)(?:[?#].*)?$/i;

function decode(value: string): string {
  return decodeHtmlEntities(value).trim();
}

function imageReference(value: string): string | null {
  const v = decode(value);
  if (!v || v.startsWith("data:") || v.startsWith("blob:") || v.startsWith("#")) {
    return null;
  }

  const looksLikeImage =
    IMAGE_EXT.test(v) ||
    /(?:^|[/?])(?:_next\/image|image|images?|media|uploads?)(?:[/?]|$)/i.test(v);

  return looksLikeImage ? v : null;
}

function attr(tag: string, name: string): string {
  const match = tag.match(new RegExp("(?:^|\\s)" + name + "\\s*=\\s*[\\\"']([^\\\"']*)[\\\"']", "i"));
  return match?.[1] ?? "";
}

function hasAttr(tag: string, name: string): boolean {
  return new RegExp("(?:^|\\s)" + name + "(?:\\s*=|\\s|/?>)", "i").test(tag);
}

function addSrcSet(set: Set<string>, value: string): void {
  if (!value) return;

  for (const candidate of value.split(",")) {
    const url = candidate.trim().split(/\s+/)[0];
    const ref = imageReference(url);
    if (ref) set.add(ref);
  }
}

// alt text that carries no information: file names, camera names and placeholder words.
const GENERIC_ALT = /^(?:img[-_ ]?\d+|dsc[-_ ]?\d+|image(?: ?\d+)?|afbeelding(?: ?\d+)?|foto(?: ?\d+)?|photo(?: ?\d+)?|picture|bild(?: ?\d+)?|untitled|placeholder|banner|slide ?\d*|[\w-]+\.(?:jpe?g|png|webp|gif|svg|avif))$/i;

/** Links/buttons whose only content is images with an empty alt and no aria-label/title/text. */
function countUnnamedLinkImages(html: string, affected?: Set<number>): number {
  let count = 0;
  for (const match of html.matchAll(/<(a|button)\b([^>]*)>([\s\S]{0,1500}?)<\/\1>/gi)) {
    const attrs = match[2];
    const inner = match[3];
    if (/\baria-label(?:ledby)?\s*=\s*["'][^"']+["']|\btitle\s*=\s*["'][^"']+["']/i.test(attrs)) continue;
    const imgs = inner.match(/<img\b[^>]*>/gi) ?? [];
    if (!imgs.length) continue;
    const text = inner.replace(/<img\b[^>]*>/gi, " ").replace(/<(?:script|style)[\s\S]*?<\/(?:script|style)>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;|\s+/g, " ").trim();
    if (text) continue;
    const named = imgs.some((tag) => attr(tag, "alt").trim().length > 0);
    if (!named && !/\bhref\s*=\s*["']#?["']/i.test(attrs)) {
      count++;
      const innerStart=match.index!+match[0].indexOf(">")+1;
      for(const img of inner.matchAll(/<img\b[^>]*>/gi))affected?.add(innerStart+img.index!);
    }
  }
  return count;
}

export function extractImageMetrics(html: string): ImageMetrics {
  const refs = new Set<string>();
  const imageMatches = [...html.matchAll(/<img\b[^>]*>/gi)];
  const images = imageMatches.map(m=>m[0]);
  const affected = new Set<number>();
  let missingAlt = 0;
  let genericAlt = 0;

  for (const match of imageMatches) {
    const tag=match[0];
    if(!hasAttr(tag,"alt") || (attr(tag,"alt").trim() && GENERIC_ALT.test(attr(tag,"alt").trim())))affected.add(match.index!);
    const altValue = attr(tag, "alt").trim();
    if (altValue && GENERIC_ALT.test(altValue)) genericAlt++;
    // alt="" is valid for decorative images. Only a genuinely missing alt
    // attribute is an accessibility/SEO finding in a raw-HTML scan.
    if (!hasAttr(tag, "alt")) missingAlt++;

    for (const name of ["src", "data-src", "data-lazy-src", "data-original", "data-image"]) {
      const ref = imageReference(attr(tag, name));
      if (ref) refs.add(ref);
    }

    addSrcSet(refs, attr(tag, "srcset"));
    addSrcSet(refs, attr(tag, "data-srcset"));
  }

  const sources = html.match(/<source\b[^>]*>/gi) ?? [];
  for (const tag of sources) {
    const ref = imageReference(attr(tag, "src"));
    if (ref) refs.add(ref);

    addSrcSet(refs, attr(tag, "srcset"));
  }

  // Include image URLs embedded in inline style/background-image declarations.
  const styleUrls = html.match(/url\(\s*["']?([^"'\)]+)["']?\s*\)/gi) ?? [];
  for (const match of styleUrls) {
    const inner = match.replace(/^url\(\s*["']?/i, "").replace(/["']?\s*\)$/i, "");
    const ref = imageReference(inner);
    if (ref) refs.add(ref);
  }

  // Next.js and other SSR frameworks can serialize image URLs into the HTML payload.
  const serializedUrls =
    html.match(/(?:https?:)?\/\/[^"'\s<>]+|\/_next\/image\?[^"'\s<>]+/gi) ?? [];

  for (const url of serializedUrls) {
    const ref = imageReference(url);
    if (ref) refs.add(ref);
  }

  const unnamedLinkImages=countUnnamedLinkImages(html,affected);
  return {
    elementCount: images.length,
    uniqueImageReferences: Math.max(images.length, refs.size),
    missingAlt,
    affectedAltImages: affected.size,
    unnamedLinkImages,
    genericAlt,
    detection: "html",
  };
};
