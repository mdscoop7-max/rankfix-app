export type ImageMetrics = {
  elementCount: number;
  uniqueImageReferences: number;
  missingAlt: number;
  detection: "html";
};

const IMAGE_EXT = /\.(?:avif|webp|jpe?g|png|gif|svg|bmp|ico)(?:[?#].*)?$/i;

function decode(value: string) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x2F;/gi, "/")
    .trim();
}

function imageReference(value: string) {
  const v = decode(value);
  if (!v || v.startsWith("data:") || v.startsWith("blob:") || v.startsWith("#")) return null;
  if (IMAGE_EXT.test(v) || /(?:^|[/?])(?:_next/image|image|images?|media|uploads?)(?:[/?]|$)/i.test(v)) {
    return v;
  }
  return null;
}

function attr(tag: string, name: string) {
  return tag.match(new RegExp(name + "\\s*=\\s*[\"']([^\"']*)[\"']", "i"))?.[1] || "";
}

function addSrcSet(set: Set<string>, value: string) {
  for (const candidate of value.split(",")) {
    const url = candidate.trim().split(/\\s+/)[0];
    const ref = imageReference(url);
    if (ref) set.add(ref);
  }
}

export function extractImageMetrics(html: string): ImageMetrics {
  const refs = new Set<string>();
  const images = [...html.matchAll(/<img\\b[^>]*>/gi)].map((m) => m[0]);
  let missingAlt = 0;

  for (const tag of images) {
    const alt = attr(tag, "alt");
    if (!alt.trim()) missingAlt++;

    for (const name of ["src", "data-src", "data-lazy-src", "data-original", "data-image"]) {
      const ref = imageReference(attr(tag, name));
      if (ref) refs.add(ref);
    }
    addSrcSet(refs, attr(tag, "srcset"));
    addSrcSet(refs, attr(tag, "data-srcset"));
  }

  for (const tag of [...html.matchAll(/<source\\b[^>]*>/gi)].map((m) => m[0])) {
    const ref = imageReference(attr(tag, "src"));
    if (ref) refs.add(ref);
    addSrcSet(refs, attr(tag, "srcset"));
  }

  // Include image URLs embedded in inline style/background-image declarations.
  for (const match of html.matchAll(/url\\(\\s*[\"']?([^\"')]+)[\"']?\\s*\\)/gi)) {
    const ref = imageReference(match[1]);
    if (ref) refs.add(ref);
  }

  // Next.js and other SSR frameworks can serialize image URLs into the HTML payload
  // without emitting an <img> until hydration. Count only URL-like image references.
  for (const match of html.matchAll(/(?:https?:)?\\/\\/[^\"'\\s<>]+|\\/_next\\/image\\?[^\"'\\s<>]+/gi)) {
    const ref = imageReference(match[0]);
    if (ref) refs.add(ref);
  }

  return {
    elementCount: images.length,
    uniqueImageReferences: Math.max(images.length, refs.size),
    missingAlt,
    detection: "html",
  };
}
