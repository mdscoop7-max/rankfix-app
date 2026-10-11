export type RepresentativeCandidate = { url: string; type: string };
// Optional cap for page kinds that can crowd out other evidence (Sector Motor 3.0
// limits FAQ/help-center pages this way).
export type RepresentativeCap = { matches: (normalizedUrl: string) => boolean; limit: number };

// Prefer template diversity first: query-string variants and near-identical
// listing pages should not consume the limited sample twice. A site can still
// have many important pages sharing one template, so remaining slots are filled
// with distinct high-relevance URLs up to the cap. Small sites stay small.
export function selectRepresentativePages<T extends RepresentativeCandidate>(
  seeds: T[],
  ranked: T[],
  limit: number,
  normalizeUrl: (url: string) => string,
  templateKey: (normalizedUrl: string) => string,
  cap?: RepresentativeCap,
): T[] {
  const selected: T[] = [];
  const seenTemplates = new Set<string>();
  let capped = 0;
  const overCap = (normalized: string) => Boolean(cap && cap.matches(normalized) && capped >= cap.limit);
  const countCap = (normalized: string) => { if (cap && cap.matches(normalized)) capped++; };
  for (const item of seeds) {
    const normalized = normalizeUrl(item.url);
    const key = `${item.type}:${templateKey(normalized)}`;
    if (selected.some((existing) => normalizeUrl(existing.url) === normalized)) continue;
    if (seenTemplates.has(key)) continue;
    if (overCap(normalized)) continue;
    countCap(normalized);
    seenTemplates.add(key);
    selected.push(item);
    if (selected.length >= limit) break;
  }
  if (selected.length < limit) {
    const seenUrls = new Set(selected.map((item) => normalizeUrl(item.url)));
    for (const item of ranked) {
      const normalized = normalizeUrl(item.url);
      if (seenUrls.has(normalized)) continue;
      if (overCap(normalized)) continue;
      countCap(normalized);
      seenUrls.add(normalized);
      selected.push(item);
      if (selected.length >= limit) break;
    }
  }
  return selected;
}
