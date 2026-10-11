export type RepresentativeCandidate = { url: string; type: string };

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
): T[] {
  const selected: T[] = [];
  const seenTemplates = new Set<string>();
  for (const item of seeds) {
    const normalized = normalizeUrl(item.url);
    const key = `${item.type}:${templateKey(normalized)}`;
    if (selected.some((existing) => normalizeUrl(existing.url) === normalized)) continue;
    if (seenTemplates.has(key)) continue;
    seenTemplates.add(key);
    selected.push(item);
    if (selected.length >= limit) break;
  }
  if (selected.length < limit) {
    const seenUrls = new Set(selected.map((item) => normalizeUrl(item.url)));
    for (const item of ranked) {
      const normalized = normalizeUrl(item.url);
      if (seenUrls.has(normalized)) continue;
      seenUrls.add(normalized);
      selected.push(item);
      if (selected.length >= limit) break;
    }
  }
  return selected;
}
