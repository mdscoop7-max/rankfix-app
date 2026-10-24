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
export type LinkCheck = { url: string; status: number | null; error: boolean; softNotFound?: boolean; accountLink?: boolean };

export function linkOutcome(link: LinkCheck): LinkOutcome {
  if (link.error || link.status === null) return "unconfirmed";
  if (link.status === 404 || link.status === 410) return "missing";
  if (link.status >= 500) return "server_error";
  if (link.status === 401 || link.status === 403) return link.accountLink ? "skipped" : "unconfirmed";
  if (link.status === 429) return "unconfirmed";
  if (link.softNotFound) return "missing";
  return "ok";
}

const pathOf = (url: string) => { try { const u = new URL(url); return `${u.pathname}${u.search}` || "/"; } catch { return url; } };
const reasonOf = (link: LinkCheck) => link.error || link.status === null
  ? "geen antwoord"
  : link.status === 429 ? "HTTP 429, tijdelijk beperkt"
  : link.status === 401 || link.status === 403 ? `HTTP ${link.status}, toegang geweigerd voor RankFix`
  : link.softNotFound ? "HTTP 200 met een 'niet gevonden'-pagina (soft 404)"
  : `HTTP ${link.status}`;
const list = (links: LinkCheck[], max = 5) => links.slice(0, max).map((l) => `${pathOf(l.url)} (${reasonOf(l)})`).join(", ") + (links.length > max ? ` en ${links.length - max} meer` : "");

/** Check status, message and action for the broken-links check (Dutch report text). */
export function brokenLinkSummary(links: LinkCheck[]): { status: "pass" | "warning" | "unable_to_confirm" | "not_applicable"; message: string; fix: string; missing: number; serverErrors: number; unconfirmed: number; checked: number; points: number } {
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
  const head = `${counted.length} interne link(s) gecontroleerd`;
  if (missing.length || server.length) {
    const ratio = (missing.length + server.length) / Math.max(1, verified);
    const points = ratio <= 0.05 ? 4 : ratio <= 0.15 ? 3 : ratio <= 0.30 ? 2 : 1;
    const fix = [
      missing.length ? "Ontbrekende pagina's: pas de link aan naar de juiste pagina, verwijder de link, of zet een 301-redirect van de oude URL naar de best passende pagina. Een 'niet gevonden'-pagina hoort HTTP 404 te geven, niet 200." : "",
      server.length ? "Serverfouten: controleer de serverlogs voor deze URL's en of bezoekers dezelfde fout krijgen." : "",
    ].filter(Boolean).join(" ");
    return { ...base, status: "warning", message: `${head}. ${parts.join(". ")}.`, fix, points };
  }
  // Without a proven error, "passed" needs most links really checked; otherwise unconfirmed.
  if (unconfirmed.length && verified < counted.length * 0.8) return { ...base, status: "unable_to_confirm", message: `${head}; ${verified} bevestigd zonder fout. ${parts.join(". ")}.`, fix: "Controleer deze links opnieuw; een blokkade of time-out alleen is geen bewijs van een kapotte link.", points: 0 };
  return { ...base, status: "pass", message: unconfirmed.length ? `${head}; ${verified} zonder 404, 410 of serverfout. ${parts.join(". ")}.` : `${head}; geen 404, 410, soft 404 of serverfout gevonden.`, fix: "Blijf interne links controleren bij wijzigingen en verwijderde pagina's.", points: 5 };
}
