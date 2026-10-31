/**
 * Internal link outcomes, kept apart so a missing page, a server error, a block
 * and a network problem are never reported as the same thing.
 *   missing       HTTP 404/410, or HTTP 200 serving a not-found page ("soft 404")
 *   server_error  HTTP 5xx on two attempts: real for visitors, but not "missing"
 *   unconfirmed   HTTP 401/403/429 or no answer: RankFix could not check it
 *   ok            anything else (2xx/3xx with content)
 * Account/login links that refuse anonymous requests are expected and skipped.
 */
export type LinkOutcome = "ok" | "missing" | "server_error" | "unconfirmed" | "skipped";
export type LinkCheck = { url: string; status: number | null; error: boolean; softNotFound?: boolean; accountLink?: boolean; challenged?: boolean; finalUrl?: string | null };

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
  if (isErrorPageUrl(link.url) || (!link.error && isErrorPageUrl(link.finalUrl))) return "missing";
  if (link.error || link.status === null) return "unconfirmed";
  if (link.status === 404 || link.status === 410) return "missing";
  if (link.status >= 500) return "server_error";
  if (link.status === 401 || link.status === 403) return link.accountLink ? "skipped" : "unconfirmed";
  if (link.status === 429) return "unconfirmed";
  // HTTP 200 is not automatically healthy: a bot-check/challenge page proves
  // nothing about the destination (QA 144), a "not found" template is missing.
  if (link.challenged) return "unconfirmed";
  if (link.softNotFound) return "missing";
  return "ok";
}

const pathOf = (url: string) => { try { const u = new URL(url); return `${u.pathname}${u.search}` || "/"; } catch { return url; } };
const reasonOf = (link: LinkCheck) => isErrorPageUrl(link.url) || (!link.error && isErrorPageUrl(link.finalUrl))
  ? "verwijst naar een foutpagina"
  : link.error || link.status === null
  ? "geen antwoord"
  : link.status === 429 ? "HTTP 429, tijdelijk beperkt"
  : link.status === 401 || link.status === 403 ? `HTTP ${link.status}, toegang geweigerd voor RankFix`
  : link.challenged ? `HTTP ${link.status} met een controle-/blokkadepagina; bestemming niet bevestigd`
  : link.softNotFound ? "HTTP 200 met een 'niet gevonden'-pagina (soft 404)"
  : `HTTP ${link.status}`;
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
export function brokenLinkSummary(links: LinkCheck[], referringPage?: string): { status: "pass" | "warning" | "unable_to_confirm" | "not_applicable"; message: string; fix: string; missing: number; serverErrors: number; unconfirmed: number; checked: number; points: number } {
  const counted = links.filter((l) => linkOutcome(l) !== "skipped");
  const missing = counted.filter((l) => linkOutcome(l) === "missing");
  const server = counted.filter((l) => linkOutcome(l) === "server_error");
  const unconfirmed = counted.filter((l) => linkOutcome(l) === "unconfirmed");
  const verified = counted.length - unconfirmed.length;
  const base = { missing: missing.length, serverErrors: server.length, unconfirmed: unconfirmed.length, checked: counted.length };
  if (!counted.length) return { ...base, status: "not_applicable", message: "Geen controleerbare interne links gevonden op deze pagina.", fix: "Controleer links opnieuw wanneer de pagina interne navigatie bevat.", points: 0 };
  const parts = [
    missing.length ? `${missing.length} verwijzen naar een ontbrekende pagina: ${list(missing)}` : "",
    server.length ? `${server.length} gaven een serverfout (ook bij een tweede poging; geen ontbrekende pagina, mogelijk tijdelijk): ${list(server)}` : "",
    unconfirmed.length ? `${unconfirmed.length} niet te bevestigen (geblokkeerd, tijdelijk beperkt of geen antwoord; geen bewijs van een fout): ${list(unconfirmed)}` : "",
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
  evidence: string;
  impact: string;
  recommendedAction: string;
};
export function brokenLinkRecords(links: LinkCheck[], sourceUrl: string): BrokenLinkRecord[] {
  return links.flatMap((link) => {
    const outcome = linkOutcome(link);
    if (outcome === "ok" || outcome === "skipped") return [];
    const evidence = outcome === "missing"
      ? isErrorPageUrl(link.url) || isErrorPageUrl(link.finalUrl) ? `De link verwijst naar een foutpagina (${link.finalUrl || link.url})`
      : (link.softNotFound ? `HTTP ${link.status} met een 'niet gevonden'-pagina (soft 404)` : `HTTP ${link.status}: de pagina bestaat niet`)
      : outcome === "server_error" ? `HTTP ${link.status} bij twee pogingen` : reasonOf(link);
    const impact = outcome === "missing"
      ? "Bezoekers en zoekmachines volgen een link naar een pagina die niet bestaat; linkwaarde gaat verloren."
      : outcome === "server_error" ? "Bezoekers krijgen mogelijk een foutpagina; zoekmachines kunnen de pagina niet indexeren zolang de fout blijft."
        : "Niet bewezen: RankFix kon de bestemming niet controleren. Dit is geen bevestigde kapotte link.";
    const recommendedAction = outcome === "missing"
      ? `Pas op ${sourceUrl} de link aan naar de juiste pagina, verwijder hem, of zet een 301-redirect van ${link.url} naar de best passende pagina.${link.softNotFound ? " Laat een 'niet gevonden'-pagina HTTP 404 geven in plaats van 200." : ""}`
      : outcome === "server_error" ? `Controleer de serverlogs voor ${link.url} en of bezoekers dezelfde fout krijgen.`
        : "Controleer deze link later opnieuw of in een browser; onderneem pas actie als een fout wordt bevestigd.";
    return [{ sourceUrl, targetUrl: link.url, finalUrl: link.finalUrl ?? null, httpStatus: link.status, outcome, proven: outcome !== "unconfirmed", evidence, impact, recommendedAction }];
  });
}
