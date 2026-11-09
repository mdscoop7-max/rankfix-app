import { classifyNonContentPage } from "./page-gate";

/** Shared response-content policy. Status, transport attempts and content are
 * independent observations; neither an error URL nor a generic error is a 404. */
export type ResponseMeasurement = { status: number | null; error: boolean; challenged?: boolean };
export function responseContentEvidence(input: { status: number; html: string; title: string; text: string }) {
  const gate = classifyNonContentPage({ ...input, words: input.text.split(/\s+/).filter(Boolean).length });
  const missingMessage = /(?:\b404\b|page not found|pagina niet gevonden|seite (?:wurde )?nicht gefunden|page (?:introuvable|non trouvée)|pagina non trovata|página no encontrada)/i.test(`${input.title} ${input.text.slice(0, 1000)}`);
  return {
    nonContent: gate?.kind,
    challenged: gate?.kind === "challenge",
    softNotFound: input.status >= 200 && input.status < 300 && gate?.kind === "error" && missingMessage,
    temporaryContent: gate?.kind === "maintenance" || (gate?.kind === "error" && !missingMessage),
  };
}
