import type { ResponseMeasurement } from "./response-evidence";
/**
 * Internal link outcomes (F1, 7 Nov 2026), kept apart so a missing page, a server
 * error, a temporary failure, a block and a network problem are never reported as
 * the same thing. Only response data proves an error; a URL pattern never does.
 *   missing       HTTP 404/410, or HTTP 200 serving a not-found page ("soft 404")
 *   server_error  HTTP 500/501/505+ on two measurements: real for visitors (penalised)
 *   temporary     HTTP 408/502/503/504, or a 5xx measured once (Retry-After too long):
 *                 reported, never penalised, never "permanent"
 *   unconfirmed   HTTP 400/405/other 4xx, 401/403/429, a challenge, no answer, or a
 *                 URL that only LOOKS like an error page: not proven, never penalised
 *   ok            2xx with content
 * Account/login links that refuse anonymous requests are expected and skipped.
 */
export type LinkOutcome = "ok" | "missing" | "server_error" | "temporary" | "unconfirmed" | "skipped";
export type EvidenceStrength = "bewezen" | "tijdelijk" | "toegang_beperkt" | "niet_bevestigd";
export type LinkCheck = { url: string; status: number | null; error: boolean; softNotFound?: boolean; temporaryContent?: boolean; measurements?: ResponseMeasurement[]; accountLink?: boolean; challenged?: boolean; finalUrl?: string | null;
  /** HTTP measurements of this link (1 or 2). */ attempts?: number; /** Retry-After in seconds, when the site sent it. */ retryAfterSeconds?: number | null;
  /** Where the measurement comes from: the link probe or the page sample. */ source?: "probe" | "sample";
  /** The page sample fetched and audited this URL (HTTP 200, no challenge/error page). The probe's own status is kept. */
  verifiedBySample?: { url: string; status: number } | null };

/**
 * 31 Oct (PDF P4: an internal link to /pagenotfound was not reported). A link
 * whose own target or final destination IS an error page ("/pagenotfound",
 * "/404", "/not-found", "/error") is a broken link, whatever HTTP status the
 * error template returns.
 */
export function isErrorPageUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try { return /(?:^|\/)(?:pagenotfound|page-not-found|pagina-niet-gevonden|notfound|not-found|404|404\.html|error|errorpage|error-page|foutpagina|fehlerseite)(?:[/.?#]|$)/i.test(new URL(url).pathname); }
  catch { return false; }
}

export function linkOutcome(link: LinkCheck): LinkOutcome {
  const measured = probeOutcome(link);
  // Phase A (8 Nov): an unanswered or temporary probe is settled only by a page the
  // sample REALLY fetched and audited; the probe's own status is never rewritten.
  if ((measured === "unconfirmed" || measured === "temporary") && link.verifiedBySample?.status === 200) return "ok";
  return measured;
}

function probeOutcome(link: LinkCheck): LinkOutcome {
  if (link.error || link.status === null) return "unconfirmed";
  // 6 Nov (403/404 reports): bot protection may answer 404/5xx with a
  // challenge page. That proves nothing about the destination.
  if (link.challenged) return "unconfirmed";
  const status = link.status;
  if (link.temporaryContent && status < 500) return "temporary";
  if (status === 404 || status === 410) return "missing";
  if (status === 408 || status === 502 || status === 503 || status === 504) return "temporary";
  // Proven only on two REAL measurements; a missing attempt count is one measurement.
  if (status >= 500) {
    const errors = link.measurements ? link.measurements.filter((m) => !m.error && !m.challenged && m.status !== null && m.status >= 500 && ![502,503,504].includes(m.status)).length : (link.attempts ?? 1);
    return errors >= 2 ? "server_error" : "temporary";
  }
  if (status === 401 || status === 403) return link.accountLink ? "skipped" : "unconfirmed";
  // 400, 405, 429 and every other 4xx: the request was refused or limited; the
  // page is not proven broken (and never silently healthy).
  if (status >= 400) return "unconfirmed";
  // 3xx without a usable destination after the redirect limit: not proven either way.
  if (status >= 300) return "unconfirmed";
  // HTTP 200 serving a "not found" template is missing (response content proves it).
  if (link.softNotFound) return "missing";
  if (link.temporaryContent) return "temporary";
  return "ok";
}

/** F2: evidence strength, likely cause and advice for one link, from its response data. */
export function linkEvidence(link: LinkCheck): { strength: EvidenceStrength | null; cause: string; advice: string } {
  const outcome = linkOutcome(link);
  const status = link.status;
  if (outcome === "ok" || outcome === "skipped") return { strength: null, cause: outcome === "skipped" ? "Account- of loginlink; weigert anonieme bezoekers zoals verwacht" : link.verifiedBySample && probeOutcome(link) !== "ok" ? `Bereikbaar volgens de paginasteekproef (HTTP ${link.verifiedBySample.status}); de linkcontrole zelf kreeg ${link.status === null ? "geen antwoord" : `HTTP ${link.status}`}` : "Bereikbaar", advice: "" };
  if (outcome === "missing") return { strength: "bewezen", cause: link.softNotFound ? `HTTP ${status} met een 'niet gevonden'-pagina (soft 404)` : status !== 404 && status !== 410 ? `De server stuurt de link door naar zijn foutpagina (${link.finalUrl})` : `HTTP ${status}: de pagina bestaat niet`, advice: "Pas de link aan, verwijder hem, of zet een 301-redirect naar de best passende pagina." };
  if (outcome === "server_error") return { strength: "bewezen", cause: `HTTP ${status} bij ${link.attempts || 2} metingen; mogelijk nog tijdelijk`, advice: "Controleer de serverlogs en of bezoekers dezelfde fout krijgen." };
  if (outcome === "temporary") return { strength: "tijdelijk", cause: `HTTP ${status}: tijdelijke storing of overbelasting${link.retryAfterSeconds ? ` (Retry-After ${link.retryAfterSeconds} s)` : ""}; niet bewezen permanent`, advice: "Controleer later opnieuw; onderneem pas actie als de fout blijft." };
  if (link.challenged || status === 401 || status === 403 || status === 429) return { strength: "toegang_beperkt", cause: link.challenged ? `HTTP ${status} met een controle- of blokkadepagina` : status === 429 ? "HTTP 429: de website beperkt het aantal verzoeken" : `HTTP ${status}: toegang geweigerd voor RankFix`, advice: "Geen bewijs van een kapotte link; controleer in een browser." };
  return { strength: "niet_bevestigd", cause: link.error || status === null ? "Geen antwoord (time-out, verbinding of redirectlus)" : status !== null && status >= 400 ? `HTTP ${status}: verzoek geweigerd; niet bewezen dat de pagina kapot is` : isErrorPageUrl(link.url) || isErrorPageUrl(link.finalUrl) ? "De URL lijkt op een foutpagina, maar de inhoud bevestigt dat niet" : `HTTP ${status}`, advice: "Controleer deze link later opnieuw of in een browser." };
}

const pathOf = (url: string) => { try { const u = new URL(url); return `${u.pathname}${u.search}` || "/"; } catch { return url; } };
// Short reason in the report sentence (unchanged wording where the outcome is unchanged).
const reasonOf = (link: LinkCheck) => {
  const outcome = linkOutcome(link);
  if (outcome === "missing" && !link.softNotFound && link.status !== 404 && link.status !== 410) return "verwijst naar een foutpagina";
  if (outcome === "unconfirmed" && (isErrorPageUrl(link.url) || isErrorPageUrl(link.finalUrl)) && !link.error && link.status !== null && link.status < 300) return "URL lijkt op een foutpagina, inhoud bevestigt dat niet";
  if (link.error || link.status === null) return "geen antwoord";
  if (link.status === 429) return "HTTP 429, tijdelijk beperkt";
  if (link.status === 401 || link.status === 403) return `HTTP ${link.status}, toegang geweigerd voor RankFix`;
  if (link.challenged) return `HTTP ${link.status} met een controle-/blokkadepagina; bestemming niet bevestigd`;
  if (link.softNotFound) return "HTTP 200 met een 'niet gevonden'-pagina (soft 404)";
  if (outcome === "temporary") return `HTTP ${link.status}, tijdelijke storing${link.retryAfterSeconds ? ` (Retry-After ${link.retryAfterSeconds} s)` : ""}`;
  if (outcome === "unconfirmed" && link.status >= 400) return `HTTP ${link.status}, verzoek geweigerd; niet bewezen kapot`;
  return `HTTP ${link.status}`;
};
const list = (links: LinkCheck[], max = 5) => links.slice(0, max).map((l) => `${pathOf(l.url)} (${reasonOf(l)})`).join(", ") + (links.length > max ? ` en ${links.length - max} meer` : "");

/** Deterministic evidence copy: optional AI translation must never erase URLs. */
export function localizedBrokenLinkCopy(links: LinkCheck[], referringPage: string, language: string) {
  const copy: Record<string, string[]> = {
    en: ["Referring page", "Checked links", "Missing page", "Server error after retry", "Unable to confirm", "No response", "No missing pages or server errors confirmed", "On the referring page, correct or remove links to missing pages, or configure an appropriate 301 redirect. Check server logs for server errors. Retry unconfirmed links; a block or timeout does not prove a broken link."],
    de: ["Verweisende Seite", "Geprüfte Links", "Fehlende Seite", "Serverfehler nach erneutem Versuch", "Nicht bestätigt", "Keine Antwort", "Keine fehlenden Seiten oder Serverfehler bestätigt", "Korrigiere oder entferne auf der verweisenden Seite Links zu fehlenden Seiten oder richte eine passende 301-Weiterleitung ein. Prüfe bei Serverfehlern die Serverprotokolle. Prüfe unbestätigte Links erneut; eine Sperre oder Zeitüberschreitung beweist keinen defekten Link."],
    fr: ["Page contenant le lien", "Liens vérifiés", "Page introuvable", "Erreur serveur après nouvelle tentative", "Non confirmé", "Aucune réponse", "Aucune page introuvable ni erreur serveur confirmée", "Sur la page contenant le lien, corrigez ou supprimez les liens vers les pages introuvables, ou configurez une redirection 301 adaptée. Consultez les journaux pour les erreurs serveur. Revérifiez les liens non confirmés ; un blocage ou un délai dépassé ne prouve pas un lien cassé."],
    it: ["Pagina di origine", "Link controllati", "Pagina mancante", "Errore del server dopo un nuovo tentativo", "Non confermato", "Nessuna risposta", "Nessuna pagina mancante o errore del server confermato", "Nella pagina di origine, correggi o rimuovi i link alle pagine mancanti oppure configura un reindirizzamento 301 appropriato. Controlla i log per gli errori del server. Ricontrolla i link non confermati; un blocco o timeout non dimostra un link non funzionante."],
    es: ["Página de origen", "Enlaces comprobados", "Página inexistente", "Error del servidor tras reintento", "No confirmado", "Sin respuesta", "No se confirmaron páginas inexistentes ni errores del servidor", "En la página de origen, corrige o elimina los enlaces a páginas inexistentes o configura una redirección 301 adecuada. Revisa los registros para los errores del servidor. Vuelve a comprobar los enlaces no confirmados; un bloqueo o tiempo de espera no demuestra un enlace roto."],
  };
  const c = copy[language];
  if (!c) return brokenLinkSummary(links, referringPage);
  const checked = links.filter((l) => linkOutcome(l) !== "skipped");
  const issues = checked.filter((l) => linkOutcome(l) !== "ok").map((l) => {
    const outcome = linkOutcome(l);
    const reason = outcome === "missing" ? c[2] : outcome === "server_error" ? c[3] : c[4];
    return `${l.url} (${reason}; ${l.status === null || l.error ? c[5] : `HTTP ${l.status}`}${l.softNotFound ? "; soft 404" : ""})`;
  });
  return { message: `${c[0]}: ${referringPage}. ${c[1]}: ${checked.length}. ${issues.length ? issues.join("; ") : c[6]}.`, fix: `${c[0]}: ${referringPage}. ${c[7]}` };
}

/** Check status, message and action for the broken-links check (Dutch report text). */
export function brokenLinkSummary(links: LinkCheck[], referringPage?: string): { status: "pass" | "warning" | "unable_to_confirm" | "not_applicable"; message: string; fix: string; missing: number; serverErrors: number; unconfirmed: number; temporary: number; checked: number; points: number } {
  const counted = links.filter((l) => linkOutcome(l) !== "skipped");
  const missing = counted.filter((l) => linkOutcome(l) === "missing");
  const server = counted.filter((l) => linkOutcome(l) === "server_error");
  const temporary = counted.filter((l) => linkOutcome(l) === "temporary");
  const unconfirmed = counted.filter((l) => linkOutcome(l) === "unconfirmed" || linkOutcome(l) === "temporary");
  const verified = counted.length - unconfirmed.length;
  const base = { missing: missing.length, serverErrors: server.length, unconfirmed: unconfirmed.length - temporary.length, temporary: temporary.length, checked: counted.length };
  if (!counted.length) return { ...base, status: "not_applicable", message: "Geen controleerbare interne links gevonden op deze pagina.", fix: "Controleer links opnieuw wanneer de pagina interne navigatie bevat.", points: 0 };
  const parts = [
    missing.length ? `${missing.length} verwijzen naar een ontbrekende pagina: ${list(missing)}` : "",
    server.length ? `${server.length} gaven een serverfout (ook bij een tweede poging; geen ontbrekende pagina, mogelijk tijdelijk): ${list(server)}` : "",
    temporary.length ? `${temporary.length} tijdelijk niet bereikbaar (geen bewezen fout, niet als fout meegeteld): ${list(temporary)}` : "",
    unconfirmed.length - temporary.length ? `${unconfirmed.length - temporary.length} niet te bevestigen (geblokkeerd, verzoek geweigerd of geen antwoord; geen bewijs van een fout): ${list(unconfirmed.filter((l) => linkOutcome(l) !== "temporary"))}` : "",
  ].filter(Boolean);
  // The page that contains the links, so the customer knows where to fix them.
  const head = `${counted.length} interne link(s) gecontroleerd${referringPage ? ` op ${referringPage}` : ""}`;
  if (missing.length || server.length) {
    // Same denominator as before: all checked links. Links RankFix could not check
    // must not make a proven error weigh more (they are not evidence either way).
    const ratio = (missing.length + server.length) / counted.length;
    const points = ratio <= 0.05 ? 4 : ratio <= 0.15 ? 3 : ratio <= 0.30 ? 2 : 1;
    const fix = [
      missing.length ? `Ontbrekende pagina's: pas de link${referringPage ? ` op ${referringPage}` : ""} aan naar de juiste pagina, verwijder de link, of zet een 301-redirect van de oude URL naar de best passende pagina. Een 'niet gevonden'-pagina hoort HTTP 404 te geven, niet 200.` : "",
      server.length ? "Serverfouten: controleer de serverlogs voor deze URL's en of bezoekers dezelfde fout krijgen." : "",
    ].filter(Boolean).join(" ");
    return { ...base, status: "warning", message: `${head}. ${parts.join(". ")}.`, fix, points };
  }
  // Without a proven error, "passed" needs most links really checked; otherwise unconfirmed.
  if (unconfirmed.length && verified < counted.length * 0.8) return { ...base, status: "unable_to_confirm", message: `${head}; ${verified} bevestigd zonder fout. ${parts.join(". ")}.`, fix: "Controleer deze links opnieuw; een blokkade of time-out alleen is geen bewijs van een kapotte link.", points: 0 };
  return { ...base, status: "pass", message: unconfirmed.length ? `${head}; ${verified} zonder 404, 410 of serverfout. ${parts.join(". ")}.` : `${head}; geen 404, 410, soft 404 of serverfout gevonden.`, fix: "Blijf interne links controleren bij wijzigingen en verwijderde pagina's.", points: 5 };
}

/**
 * One structured record per non-OK internal link (QA 144 brief, item 10):
 * referring page, link target, final URL after redirects, HTTP status, the
 * evidence, the impact and the recommended action. Temporary failures (no
 * answer, 401/403/429, challenge) are "unconfirmed", never a proven broken link.
 */
export type BrokenLinkRecord = {
  sourceUrl: string;
  targetUrl: string;
  finalUrl: string | null;
  httpStatus: number | null;
  outcome: Exclude<LinkOutcome, "ok" | "skipped">;
  proven: boolean;
  evidenceStrength: EvidenceStrength | null;
  evidence: string;
  impact: string;
  recommendedAction: string;
};
export function brokenLinkRecords(links: LinkCheck[], sourceUrl: string): BrokenLinkRecord[] {
  return links.flatMap((link) => {
    const outcome = linkOutcome(link);
    if (outcome === "ok" || outcome === "skipped") return [];
    const evidence = linkEvidence(link).cause;
    const impact = outcome === "missing"
      ? "Bezoekers en zoekmachines volgen een link naar een pagina die niet bestaat; linkwaarde gaat verloren."
      : outcome === "server_error" ? "Bezoekers krijgen mogelijk een foutpagina; zoekmachines kunnen de pagina niet indexeren zolang de fout blijft."
        : outcome === "temporary" ? "Tijdelijke storing: bezoekers kunnen hinder ervaren, maar een blijvende fout is niet bewezen."
        : "Niet bewezen: RankFix kon de bestemming niet controleren. Dit is geen bevestigde kapotte link.";
    const recommendedAction = outcome === "missing"
      ? `Pas op ${sourceUrl} de link aan naar de juiste pagina, verwijder hem, of zet een 301-redirect van ${link.url} naar de best passende pagina.${link.softNotFound ? " Laat een 'niet gevonden'-pagina HTTP 404 geven in plaats van 200." : ""}`
      : outcome === "server_error" ? `Controleer de serverlogs voor ${link.url} en of bezoekers dezelfde fout krijgen.`
        : "Controleer deze link later opnieuw of in een browser; onderneem pas actie als een fout wordt bevestigd.";
    return [{ sourceUrl, targetUrl: link.url, finalUrl: link.finalUrl ?? null, httpStatus: link.status, outcome, proven: outcome === "missing" || outcome === "server_error", evidenceStrength: linkEvidence(link).strength, evidence, impact, recommendedAction }];
  });
}
