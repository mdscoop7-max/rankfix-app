/**
 * Central "is this the website itself?" gate (QA #186, 96-site run of 23 Oct 2026).
 *
 * A server, WAF or a recovered browser render can answer with a page that is
 * not the website: a bot challenge ("AntiBot", "Human Verification"), an error
 * page ("the connection was interrupted due to an error") or a maintenance
 * notice. Such pages were scored as the website (scores 65 and 83) and sampled
 * as evidence (10 of 14 pages of one site were maintenance notices). This gate
 * is used for the scanned page, for browser recoveries and for every sampled
 * page. It is language-based and structural; no site or brand rules.
 *
 * Challenge wording is decisive in the title. Error and maintenance wording is
 * only decisive on a short page, so an article ABOUT an error or maintenance
 * (long body text) is never rejected.
 */
export type NonContentKind = "challenge" | "error" | "maintenance";
export type NonContentPage = { kind: NonContentKind; reason: string };

const CHALLENGE_TITLE = /(?:\banti[- ]?bot\b|\bbot[- ]?(?:protection|detection|check|manager)\b|\bcaptcha\b|human verification|menschliche verifizierung|verify (?:you are|that you are) (?:a )?human|are you (?:a )?(?:robot|human)|robot or human|ben je een (?:robot|mens)|êtes[- ]vous un robot|sind sie ein (?:roboter|mensch)|just a moment|een ogenblik geduld|checking your browser|attention required|access denied|toegang geweigerd|zugriff verweigert|accès refusé|acceso denegado|accesso negato|request (?:rejected|blocked|unsuccessful)|pardon our interruption|security (?:check|verification)|sicherheitsüberprüfung|vérification de sécurité|verifica di sicurezza|verificación de seguridad|ddos[- ]protection|radware page|incapsula incident)/i;
const CHALLENGE_BODY = /(?:checking your browser|verify (?:you are|that you are) (?:a )?human|enable javascript and cookies to continue|performing security verification|challenge-platform|cf-chl-|captcha-delivery\.com|px-captcha|press (?:&|and) hold|incapsula incident|akamai bot manager|request unsuccessful|pardon our interruption|robot or human|are you a robot|access to this page has been denied|please verify you are a human)/i;
const ERROR_WORDING = /(?:an error (?:has )?occurred|something went wrong|connection was interrupted|the page (?:you requested )?(?:could not be found|was not found|isn't available)|\bpage not found\b|\b(?:404|500|502|503)\b.{0,30}(?:error|not found|unavailable|fout|fehler|erreur)|internal server error|bad gateway|service unavailable|er is iets (?:mis ?gegaan|fout ?gegaan)|er ging iets mis|pagina niet gevonden|es ist ein fehler aufgetreten|seite (?:wurde )?nicht gefunden|une erreur (?:s'est produite|est survenue)|page (?:introuvable|non trouvée)|si è verificato un errore|pagina non trovata|se ha producido un error|ha ocurrido un error|página no encontrada|oops[!,.]|whoops)/i;
const MAINTENANCE_WORDING = /(?:(?:undergoing|under|scheduled|currently in) maintenance|maintenance (?:mode|in progress|en cours)|(?:site|website|page) (?:is )?(?:currently )?(?:down for|in) maintenance|we(?:'| a)re (?:currently )?(?:doing|performing) maintenance|in onderhoud|wegens onderhoud|onderhoudswerkzaamheden|wartungsarbeiten|wird gewartet|wartungsmodus|en (?:cours de )?maintenance|site en maintenance|in manutenzione|en mantenimiento|temporarily (?:unavailable|down)|tijdelijk (?:niet beschikbaar|onbereikbaar)|vorübergehend nicht (?:verfügbar|erreichbar)|momentanément indisponible|temporaneamente non disponibile|temporalmente no disponible)/i;

/** Pages with fewer visible words than this are short enough for error/maintenance wording to be decisive. */
export const NON_CONTENT_MAX_WORDS = 400;

export function classifyNonContentPage(input: { title?: string | null; text?: string | null; words?: number | null }): NonContentPage | null {
  const title = String(input.title || "").slice(0, 300);
  const text = String(input.text || "").slice(0, 12000);
  const words = typeof input.words === "number" ? input.words : text.split(/\s+/).filter(Boolean).length;
  if (CHALLENGE_TITLE.test(title)) return { kind: "challenge", reason: "title_names_challenge" };
  if (CHALLENGE_BODY.test(text) && words < 350) return { kind: "challenge", reason: "body_is_challenge" };
  const short = words < NON_CONTENT_MAX_WORDS;
  if (short && MAINTENANCE_WORDING.test(title)) return { kind: "maintenance", reason: "title_names_maintenance" };
  if (short && ERROR_WORDING.test(title)) return { kind: "error", reason: "title_names_error" };
  // Body-only wording needs a very short page: real pages mention errors in FAQs.
  if (words < 120 && MAINTENANCE_WORDING.test(text)) return { kind: "maintenance", reason: "body_names_maintenance" };
  if (words < 120 && ERROR_WORDING.test(text) && !title) return { kind: "error", reason: "body_names_error" };
  return null;
}

/** Dutch reason for sample pages and reports. */
export function nonContentDetail(page: NonContentPage): string {
  return page.kind === "challenge"
    ? "De website toonde een controle- of blokkadepagina in plaats van de inhoud; deze pagina telt niet mee als bewijs of in de score."
    : page.kind === "maintenance"
      ? "De website toonde een onderhoudspagina in plaats van de inhoud; deze pagina telt niet mee als bewijs of in de score."
      : "De website toonde een foutpagina in plaats van de inhoud; deze pagina telt niet mee als bewijs of in de score.";
}
