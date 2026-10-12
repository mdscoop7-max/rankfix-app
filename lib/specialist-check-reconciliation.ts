/**
 * The sector is evidence-based: a provisional homepage classification may be
 * replaced after checking representative pages. Keep the SEO array and the
 * separate scoring/report array synchronized with the final sector checks.
 * Old evidence objects are removed, not converted to misleading N/A statuses.
 */
export function replaceSpecialistChecks<T>(
  seoChecks: T[],
  displayedChecks: T[],
  originalSpecialistChecks: readonly T[],
  finalSpecialistChecks: readonly T[],
  includeSeoInDisplayed: boolean,
): void {
  const previous = new Set(originalSpecialistChecks);
  for (const target of new Set([seoChecks, displayedChecks])) {
    for (let i = target.length - 1; i >= 0; i--) {
      if (previous.has(target[i])) target.splice(i, 1);
    }
  }
  seoChecks.push(...finalSpecialistChecks);
  if (includeSeoInDisplayed) displayedChecks.push(...finalSpecialistChecks);
}
