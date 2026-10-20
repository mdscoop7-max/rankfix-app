/**
 * Primary identity of a heritage knowledge platform.
 *
 * Never infer this from articles that merely discuss monuments: all evidence
 * must be in the homepage's own title, description and H1s. A provider which
 * sells restoration, accommodation or property remains in its own sector.
 */
export function heritageKnowledgeIdentity(input: {
  title?: string | null;
  description?: string | null;
  headings?: string[];
  homepage: boolean;
}): { key: "heritage_information"; label: string; evidence: string[] } | null {
  if (!input.homepage) return null;
  const name = [input.title || "", ...(input.headings || [])].join(" ");
  const description = input.description || "";
  const identity = [name, description].join(" ");
  const topicInName = /\b(?:monument(?:en)?|rijksmonument(?:en)?|erfgoed|cultural heritage|heritage)\b/i.test(name);
  const knowledgePurpose = /\b(?:wegwijs|informatie(?:platform)?|kennis(?:platform|bank)?|gids|platform|alles over|informatie over|voor monumenteigenaren|monumentenland|monumentenzorg)\b/i.test(identity);
  const heritageScope = /\b(?:monument(?:en)?|erfgoed|restauratie|monumenteigenaren|monumentenzorg|historische gebouwen|cultural heritage)\b/i.test(description);
  // Service providers and physical destinations can publish informative pages.
  // They must not become information platforms due to the word "monument".
  const explicitCommercialIdentity = /\b(?:hotel|restaurant|museum|restauratiebedrijf|bouwbedrijf|aannemersbedrijf|makelaar|vastgoedkantoor|autobedrijf|monumentenmakelaar|webshop|winkel)\b/i.test(name);
  if (!topicInName || !knowledgePurpose || !heritageScope || explicitCommercialIdentity) return null;
  return {
    key: "heritage_information",
    label: "Erfgoed & monumenteninformatie",
    evidence: [
      "Titel of H1 noemt erfgoed of monumenten",
      "De homepage omschrijft een informatie-/kennisfunctie",
      "Beschrijving bevestigt inhoudelijke erfgoedfocus",
    ],
  };
}
