// Business model, separate from the sector: who the organisation serves.
// Evidence first (audience navigation such as "Particulier | Zakelijk"), then a
// labelled sector default. Never presented as certain when it is only a default.

export type BusinessModel = "B2C" | "B2B" | "B2C + B2B" | "public" | "non_profit" | "unknown";
export type BusinessModelResult = { model: BusinessModel; basis: "evidence" | "sector_default" | "none"; evidence: string[] };

const CONSUMER = /(?<![\p{L}])(?:particulier\p{L}*|priv[ée]|privatkund\p{L}*|privatperson\p{L}*|particuliers?|privati|particulares|osoby prywatne|yksityis\p{L}*|privatpersoner|privat|soukrom\p{L}*|magánszemély\p{L}*|persoane fizice|personal banking|for you|consumers?|consumenten|verbraucher)(?![\p{L}])/iu;
const BUSINESS = /(?<![\p{L}])(?:zakelijk\p{L}*|bedrijven|ondernemers?|business(?:es)?|geschäftskund\p{L}*|unternehmen|firmenkund\p{L}*|entreprises?|professionnels|imprese|aziende|empresas|negocios|firmy|przedsiębiorstw\p{L}*|yritykset|yritysasiakk\p{L}*|företag|erhverv|podnikatel\p{L}*|firmy|vállalat\p{L}*|companii|corporate|b2b)(?![\p{L}])/iu;

const SECTOR_DEFAULT: Record<string, BusinessModel> = {
  government: "public", nonprofit: "non_profit",
  manufacturing_industrial: "B2B", saas_b2b: "B2B", professional_services: "B2B",
  ecommerce: "B2C", hospitality: "B2C", beauty: "B2C", fitness_sports: "B2C", tourism_recreation: "B2C", food_local_retail: "B2C", news_media: "B2C",
};

export function detectBusinessModel(input: { sector: string; navLabels?: string[]; ownText?: string }): BusinessModelResult {
  const nav = (input.navLabels || []).join(" | ");
  const consumer = CONSUMER.test(nav);
  const business = BUSINESS.test(nav);
  if (input.sector === "government") return { model: "public", basis: "sector_default", evidence: ["Overheidsorganisatie"] };
  if (input.sector === "nonprofit") return { model: "non_profit", basis: "sector_default", evidence: ["Stichting/vereniging zonder winstoogmerk"] };
  if (consumer && business) return { model: "B2C + B2B", basis: "evidence", evidence: ["Navigatie heeft aparte ingangen voor particulieren en zakelijke klanten"] };
  if (business && !consumer && /(?<![\p{L}])(?:b2b|zakelijk\p{L}*|for business(?:es)?|für unternehmen|pour les entreprises)(?![\p{L}])/iu.test(input.ownText || "")) return { model: "B2B", basis: "evidence", evidence: ["Eigen identiteit richt zich op zakelijke klanten"] };
  const def = SECTOR_DEFAULT[input.sector];
  if (def) return { model: def, basis: "sector_default", evidence: [`Gebruikelijk model voor deze sector (niet apart bewezen)`] };
  return { model: "unknown", basis: "none", evidence: [] };
}
