/** Bookkeeping only. A representative sample never proves whole-site coverage. */
export function sampleInventory(input: {
  candidateUrls: string[]; selectedUrls: string[]; checked: number; scored: number;
  excluded: number; notConfirmed: number; missing: number; duplicates: number; pageLimit: number;
}) {
  const known = new Set([...input.candidateUrls, ...input.selectedUrls]);
  const selected = new Set(input.selectedUrls);
  return {
    mode: "representative_sample" as const, fullWebsiteConfirmed: false as const,
    discovered: known.size, discoveredIsLowerBound: true as const,
    selected: input.selectedUrls.length, checked: input.checked, scored: input.scored,
    excluded: input.excluded, notConfirmed: input.notConfirmed, notFound: input.missing, duplicates: input.duplicates,
    knownNotSelected: [...known].filter(url => !selected.has(url)).length,
    pageLimit: input.pageLimit,
    limitation: "Alleen geselecteerde representatieve pagina's zijn beoordeeld; het totale aantal websitepagina's is niet vastgesteld.",
  };
}
