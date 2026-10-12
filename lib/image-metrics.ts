// Explicit .ts extension so node --experimental-strip-types tests can load it.
import { decodeHtmlEntities } from "./html-entities.ts";

export type ImageMetrics = {
  elementCount: number;
  uniqueImageReferences: number;
  missingAlt: number;
  detection: "html";
};

const IMAGE_EXT = /\.(avif|webp|jpe?g|png|gif|svg|bmp|ico)(?:[?#].*)?$/i;

function decode(value: string): string {
  return decodeHtmlEntities(value).trim();
}

// One image, many URLs: responsive width variants (srcset, ?width=, Shopify
// _400x, WordPress -300x200, @2x) and optimiser wrappers (/_next/image?url=)
// all point to the same picture. The count is of pictures, not of variants.
export function canonicalImageKey(value: string): string {
  let v = value;
  const nextImage = v.match(/\/_next\/image\?(?:[^#]*&)?url=([^&#]+)/i);
  if (nextImage) {
    try { v = decodeURIComponent(nextImage[1]); } catch { v = nextImage[1]; }
  }
  v = v.replace(/^https?:/i, "").replace(/[?#].*$/, "");
  v = v.replace(/(?:_(?:\d+x\d*|\d*x\d+)(?:_crop_[a-z]+)?|-\d+x\d+|@\dx)(?=\.[a-z0-9]+$)/i, "");
  return v.toLowerCase();
}

function imageReference(value: string): string | null {
  const v = decode(value);
  if (!v || v.startsWith("data:") || v.startsWith("blob:") || v.startsWith("#")) {
    return null;
  }

  const looksLikeImage =
    IMAGE_EXT.test(v) ||
    /(?:^|[/?])(?:_next\/image|image|images?|media|uploads?)(?:[/?]|$)/i.test(v);

  return looksLikeImage ? canonicalImageKey(v) : null;
}

function attr(tag: string, name: string): string {
  const match = tag.match(new RegExp(name + "\\s*=\\s*[\\\"']([^\\\"']*)[\\\"']", "i"));
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

export function extractImageMetrics(html: string): ImageMetrics {
  const refs = new Set<string>();
  const images = html.match(/<img\b[^>]*>/gi) ?? [];
  let missingAlt = 0;

  for (const tag of images) {
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

  // A client-side shell without any image elements can still serialize its
  // image URLs into the payload. On a page that does render image elements,
  // payload URLs (product feeds, JSON state, preload lists) are not images on
  // the page and are not counted.
  if (images.length === 0 && sources.length === 0) {
    const serializedUrls =
      html.match(/(?:https?:)?\/\/[^"'\s<>]+|\/_next\/image\?[^"'\s<>]+/gi) ?? [];

    for (const url of serializedUrls) {
      const ref = imageReference(url);
      if (ref) refs.add(ref);
    }
  }

  return {
    elementCount: images.length,
    uniqueImageReferences: Math.max(images.length, refs.size),
    missingAlt,
    detection: "html",
  };
};
