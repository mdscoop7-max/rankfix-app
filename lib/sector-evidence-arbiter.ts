/**
 * Sector Motor — generic, provenance-aware weak-identity reconciliation.
 *
 * This is deliberately a SECONDARY path: existing strong first-party identity
 * and proven commerce decisions win. It may only resolve an otherwise unknown
 * primary sector, with medium confidence. No domains or named brands here.
 */
export type SectorDefinition<S extends string> = {
  sector: S;
  label: string;
  primary: RegExp;
  support: readonly RegExp[];
  modules: readonly string[];
};
export type SectorSourceInput = {
  title?: string;
  description?: string;
  h1s?: readonly string[];
  ogTitle?: string;
  h2s?: readonly string[];
  navLabels?: readonly string[];
};
export type SectorSourceDecision<S extends string> = {
  sector: S;
  key: S;
  label: string;
  confidence: "medium";
  confidenceScore: number;
  evidence: string[];
  applicableModules: string[];
  sourceIds: string[];
};

const ownStatement = /(?:^|\b)(?:wij zijn|we are|we're|ons bedrijf is|onze organisatie is|our organization is|our organisation is|wir sind|nous sommes|somos|siamo)\b/iu;
const matches = (pattern: RegExp, value: string) => {
  if (!value) return false;
  const safe = new RegExp(pattern.source, pattern.flags.replace(/g/g, ""));
  return safe.test(value);
};

export function inferSectorFromIndependentSources<S extends string>(
  input: SectorSourceInput,
  definitions: readonly SectorDefinition<S>[],
): SectorSourceDecision<S> | null {
  // og:title and <title> often mirror each other: one metadata source.
  // Multiple H1/H2 elements are one source per kind.
  const ownSources: Array<[string, string]> = [
    ["metadata", (input.title || input.ogTitle || "").slice(0, 400)],
    ["description", (input.description || "").slice(0, 1000)],
    ["h1", (input.h1s || []).slice(0, 4).join(" · ").slice(0, 600)],
  ];
  const nav = (input.navLabels || []).slice(0, 60).join(" · ").slice(0, 2200);
  const heading2 = (input.h2s || []).slice(0, 12).join(" · ").slice(0, 1000);
  // A first-person heading can be first-party self-identification.
  const selfDescribingH2 = (input.h2s || []).slice(0, 12)
    .filter(h => ownStatement.test(h)).join(" · ").slice(0, 600);
  if (selfDescribingH2) ownSources.push(["self-description heading", selfDescribingH2]);
  const contextualSources: Array<[string, string]> = [...ownSources, ["navigation", nav], ["section headings", heading2]];
  const proposals = definitions.flatMap(def => {
    const primary = ownSources.filter(([, value]) => matches(def.primary, value)).map(([name]) => name);
    if (primary.length === 0) return [];
    const support = contextualSources
      .filter(([name, value]) => !primary.includes(name) && def.support.some(re => matches(re, value)))
      .map(([name]) => name);
    // Repetition inside one source is never corroboration.
    if (primary.length < 2 && support.length === 0) return [];
    const sourceIds = [...new Set([...primary, ...support])];
    const confidenceScore = Math.min(79, 68 + primary.length * 4 + Math.min(2, support.length) * 3);
    return [{
      sector: def.sector, key: def.sector, label: def.label,
      confidence: "medium" as const, confidenceScore,
      evidence: [
        "Primaire sectoridentiteit in " + primary.join(", "),
        ...(support.length ? ["Onafhankelijke ondersteuning in " + support.join(", ")] : []),
        "Voorlopig: meerdere bronnen, maar geen sectorspecifieke definitieve vaststelling",
      ],
      applicableModules: [...new Set(["core_seo", "geo", "technical", ...def.modules])],
      sourceIds,
    }];
  });
  // In a conflict between plausible sectors, abstain rather than pick by order.
  const sectors = new Set(proposals.map(p => p.sector));
  if (sectors.size !== 1) return null;
  return proposals[0] || null;
}
