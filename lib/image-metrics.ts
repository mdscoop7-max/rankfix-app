export type ImageMetrics = {
  elementCount: number;
  uniqueImageReferences: number;
  missingAlt: number;
  detection: "html";
};

const IMAGE_EXT = /\.(avif|webp|jpe?g|png|gif|svg|bmp|ico)(?:[?#].*)?$/i;

function decode(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x2F;/gi, "/")
    .trim();
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

/**
 * One key per image, not per delivered variant: responsive srcset widths (?imwidth=320,
 * -320x240, @2x), absolute vs. relative URLs and format alternatives (.avif/.webp/.jpg of
 * the same file) all describe the same picture. Counting each variant inflated large
 * retail homepages to thousands of "images".
 */
function variantKey(ref: string): string {
  return ref
    .replace(/[?#].*$/, "")
    .replace(/^(?:https?:)?\/\/[^/]+/i, "")
    .replace(/(?:-\d{2,5}x\d{2,5}|@[1-4]x|_(?:s|w)\d{2,5})(?=\.[a-z0-9]+$)/i, "")
    .replace(/\.(avif|webp|jpe?g|png|gif)$/i, "")
    .toLowerCase();
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
    if (ref) set.add(variantKey(ref));
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
      if (ref) refs.add(variantKey(ref));
    }

    addSrcSet(refs, attr(tag, "srcset"));
    addSrcSet(refs, attr(tag, "data-srcset"));
  }

  const sources = html.match(/<source\b[^>]*>/gi) ?? [];
  for (const tag of sources) {
    const ref = imageReference(attr(tag, "src"));
    if (ref) refs.add(variantKey(ref));

    addSrcSet(refs, attr(tag, "srcset"));
  }

  // Include image URLs embedded in inline style/background-image declarations.
  const styleUrls = html.match(/url\(\s*["']?([^"'\)]+)["']?\s*\)/gi) ?? [];
  for (const match of styleUrls) {
    const inner = match.replace(/^url\(\s*["']?/i, "").replace(/["']?\s*\)$/i, "");
    const ref = imageReference(inner);
    if (ref) refs.add(variantKey(ref));
  }

  // Next.js and other SSR frameworks can serialize image URLs into the HTML payload.
  const serializedUrls =
    html.match(/(?:https?:)?\/\/[^"'\s<>]+|\/_next\/image\?[^"'\s<>]+/gi) ?? [];

  for (const url of serializedUrls) {
    const ref = imageReference(url);
    if (ref) refs.add(variantKey(ref));
  }

  return {
    elementCount: images.length,
    uniqueImageReferences: Math.max(images.length, refs.size),
    missingAlt,
    detection: "html",
  };
};
