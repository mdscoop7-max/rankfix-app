/**
 * Scan failure classification.
 *
 * Every reason a scan cannot produce trustworthy evidence is mapped to exactly
 * one category, so RankFix never confuses a real website fault with a block
 * that only affects the scanner, a temporary hiccup or a limit of the scan
 * environment. A failed fetch never produces a score.
 */

import { SafeFetchError, toSafeFetchError } from "./safe-fetch";

export type ScanFailureCategory =
  | "site_error"        // the website itself is broken (404, 500, DNS, expired certificate, redirect loop)
  | "access_blocked"    // the website refuses RankFix (401, 403, 405, 451, WAF) — says nothing about SEO/security quality
  | "temporary"         // likely to recover (429, 503, 502, 504, timeouts, resets)
  | "scan_environment"  // limit of RankFix itself (response too large, renderer unavailable, unknown network error)
  | "unsafe_target"     // SSRF guard: internal address, blocked port/protocol
  | "invalid_input";    // not a website address

export type ScanFailure = {
  category: ScanFailureCategory;
  code: string;
  httpStatus: number | null;
  retryable: boolean;
  retryAfterSeconds: number | null;
  edgeProvider: string | null;
  /** A failed scan never receives a score. */
  scoreWithheld: true;
  /** A failed scan is never charged against the customer's allowance. */
  charged: false;
};

export type ScanLanguage = "nl" | "en" | "de" | "fr" | "it" | "es";

/** Parses Retry-After (delta-seconds or HTTP-date) into whole seconds. */
export function parseRetryAfter(value: string | null | undefined, nowMs = Date.now()): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^\d{1,9}$/.test(trimmed)) return Number(trimmed);
  const date = Date.parse(trimmed);
  if (!Number.isFinite(date)) return null;
  return Math.max(0, Math.ceil((date - nowMs) / 1000));
}

type HeaderBag = { get(name: string): string | null };

/** Identifies the CDN/WAF in front of a site from response headers only. */
export function detectEdgeProvider(headers: HeaderBag | null | undefined): string | null {
  if (!headers) return null;
  const server = (headers.get("server") || "").toLowerCase();
  if (headers.get("cf-ray") || server.includes("cloudflare")) return "cloudflare";
  if (headers.get("x-akamai-transformed") || headers.get("akamai-grn") || server.includes("akamai")) return "akamai";
  if (headers.get("x-amz-cf-id") || server.includes("cloudfront")) return "cloudfront";
  if (headers.get("x-iinfo") || (headers.get("x-cdn") || "").toLowerCase().includes("imperva")) return "imperva";
  if (headers.get("x-sucuri-id") || server.includes("sucuri")) return "sucuri";
  if (headers.get("x-served-by")?.toLowerCase().includes("cache-") || server.includes("fastly")) return "fastly";
  if (headers.get("x-vercel-id")) return "vercel";
  if (headers.get("x-nf-request-id")) return "netlify";
  return null;
}

const failure = (category: ScanFailureCategory, code: string, extra: Partial<ScanFailure> = {}): ScanFailure => ({
  category,
  code,
  httpStatus: null,
  retryable: category === "temporary",
  retryAfterSeconds: null,
  edgeProvider: null,
  ...extra,
  scoreWithheld: true,
  charged: false,
});

/** Classifies a non-2xx HTTP response. Returns null for 2xx (success). 3xx without Location is a site error. */
export function classifyHttpStatus(status: number, headers?: HeaderBag | null, nowMs = Date.now()): ScanFailure | null {
  if (status >= 200 && status < 300) return null;
  const base = { httpStatus: status, edgeProvider: detectEdgeProvider(headers) };
  const retryAfterSeconds = parseRetryAfter(headers?.get("retry-after"), nowMs);
  if (status >= 300 && status < 400) return failure("site_error", "REDIRECT_WITHOUT_LOCATION", base);
  switch (status) {
    case 400: return failure("access_blocked", "REQUEST_REJECTED", base);
    case 401: return failure("access_blocked", "AUTH_REQUIRED", base);
    case 403: return failure("access_blocked", "ACCESS_FORBIDDEN", base);
    case 404: return failure("site_error", "NOT_FOUND", base);
    case 405: return failure("access_blocked", "METHOD_NOT_ALLOWED", base);
    case 408: return failure("temporary", "REQUEST_TIMEOUT", { ...base, retryAfterSeconds });
    case 410: return failure("site_error", "GONE", base);
    case 413: case 414: case 431: return failure("scan_environment", "REQUEST_TOO_LARGE", base);
    case 429: return failure("temporary", "RATE_LIMITED", { ...base, retryAfterSeconds });
    case 451: return failure("access_blocked", "LEGAL_RESTRICTION", base);
    case 500: return failure("site_error", "SERVER_ERROR", base);
    case 501: return failure("site_error", "NOT_IMPLEMENTED", base);
    case 502: return failure("temporary", "BAD_GATEWAY", { ...base, retryAfterSeconds });
    case 503: return failure("temporary", "SERVICE_UNAVAILABLE", { ...base, retryAfterSeconds });
    case 504: return failure("temporary", "GATEWAY_TIMEOUT", { ...base, retryAfterSeconds });
    case 520: case 521: case 522: case 523: case 524: case 598: case 599:
      return failure("temporary", "EDGE_ORIGIN_ERROR", { ...base, retryAfterSeconds });
    case 525: case 526: return failure("site_error", "EDGE_TLS_ERROR", base);
    case 530: return failure("site_error", "EDGE_ORIGIN_DNS", base);
  }
  if (status > 599 || status < 100) return failure("access_blocked", "NONSTANDARD_BLOCK", base);
  if (status >= 500) return failure("site_error", "SERVER_ERROR", base);
  return failure("site_error", "CLIENT_ERROR", base);
}

const UNSAFE_CODES = new Set(["URL_PROTOCOL_BLOCKED", "URL_CREDENTIALS_BLOCKED", "URL_HOST_BLOCKED", "URL_PORT_BLOCKED", "URL_IP_BLOCKED", "URL_DNS_BLOCKED", "URL_INVALID"]);
const FETCH_CATEGORY: Record<string, ScanFailureCategory> = {
  DNS_NOT_FOUND: "site_error",
  DNS_TEMPORARY_FAILURE: "temporary",
  TLS_CERT_EXPIRED: "site_error",
  TLS_CERT_INVALID: "site_error",
  TLS_HANDSHAKE_FAILED: "site_error",
  CONNECTION_REFUSED: "site_error",
  CONNECTION_RESET: "temporary",
  HOST_UNREACHABLE: "temporary",
  TIMEOUT: "temporary",
  BODY_TIMEOUT: "temporary",
  REDIRECT_LIMIT: "site_error",
  REDIRECT_LOOP: "site_error",
  PROTOCOL_ERROR: "site_error",
  RESPONSE_TOO_LARGE: "scan_environment",
  FETCH_FAILED: "scan_environment",
  EMPTY_DOCUMENT: "site_error",
  JAVASCRIPT_NOT_RENDERED: "scan_environment",
};

/** Classifies a thrown network/fetch error (DNS, TLS, connection, redirects, SSRF guard). */
export function classifyFetchError(error: unknown): ScanFailure {
  const message = error instanceof Error ? error.message : String(error || "");
  if (message === "RESPONSE_TOO_LARGE") return failure("scan_environment", "RESPONSE_TOO_LARGE");
  if (/^HEADLESS_/.test(message)) return failure("scan_environment", message);
  // Plain errors that carry a known code as message (legacy throw sites) keep their meaning.
  if (UNSAFE_CODES.has(message)) return failure("unsafe_target", message);
  if (FETCH_CATEGORY[message]) return failure(FETCH_CATEGORY[message], message);
  const safe: SafeFetchError = toSafeFetchError(error);
  if (UNSAFE_CODES.has(safe.code)) return failure("unsafe_target", safe.code);
  return failure(FETCH_CATEGORY[safe.code] || "scan_environment", safe.code);
}

export function inputFailure(code: "NOT_A_DOMAIN" | "URL_MISSING" | "URL_INVALID"): ScanFailure {
  return failure("invalid_input", code);
}

export type RetryDecision = { retry: boolean; delayMs: number; reason: string };

/**
 * Polite retry policy. Retries only temporary statuses, never more than the
 * given attempts, never sooner than the site asked (Retry-After) and never
 * longer than maxWaitMs — when a site asks for a longer pause RankFix stops and
 * reports it instead of hammering the site.
 */
export function retryDecision(status: number, headers: HeaderBag | null | undefined, attempt: number, options: { maxWaitMs?: number; nowMs?: number } = {}): RetryDecision {
  const maxWaitMs = options.maxWaitMs ?? 5000;
  const classification = classifyHttpStatus(status, headers, options.nowMs);
  if (!classification || classification.category !== "temporary") return { retry: false, delayMs: 0, reason: "not_temporary" };
  const maxAttempts = status === 429 ? 2 : 1;
  if (attempt >= maxAttempts) return { retry: false, delayMs: 0, reason: "attempts_exhausted" };
  const requested = classification.retryAfterSeconds;
  if (requested !== null && requested * 1000 > maxWaitMs) return { retry: false, delayMs: 0, reason: "retry_after_too_long" };
  const backoff = status === 429 ? 1000 * (attempt + 1) : 1500;
  const delayMs = Math.min(maxWaitMs, Math.max(500, requested !== null ? requested * 1000 : backoff));
  return { retry: true, delayMs, reason: requested !== null ? "retry_after" : "backoff" };
}

/** HTTP status the RankFix API returns to its own client for a failed scan. */
export function apiStatusForFailure(f: ScanFailure): number {
  if (f.category === "invalid_input" || f.category === "unsafe_target") return 400;
  if (f.code === "RATE_LIMITED") return 429;
  if (f.category === "temporary") return 503;
  if (f.category === "scan_environment") return 502;
  return 422;
}

// ---------------------------------------------------------------------------
// Customer-facing messages
// ---------------------------------------------------------------------------

type Copy = Record<ScanLanguage, string>;

const REASONS: Record<string, Copy> = {
  REQUEST_REJECTED: { nl: "het verzoek van RankFix werd geweigerd (HTTP 400)", en: "the website rejected RankFix's request (HTTP 400)", de: "die Anfrage von RankFix wurde abgelehnt (HTTP 400)", fr: "la requête de RankFix a été refusée (HTTP 400)", it: "la richiesta di RankFix è stata rifiutata (HTTP 400)", es: "la solicitud de RankFix fue rechazada (HTTP 400)" },
  AUTH_REQUIRED: { nl: "inloggen is vereist (HTTP 401)", en: "a login is required (HTTP 401)", de: "eine Anmeldung ist erforderlich (HTTP 401)", fr: "une connexion est requise (HTTP 401)", it: "è richiesto l’accesso (HTTP 401)", es: "se requiere iniciar sesión (HTTP 401)" },
  ACCESS_FORBIDDEN: { nl: "toegang verboden (HTTP 403)", en: "access forbidden (HTTP 403)", de: "Zugriff verweigert (HTTP 403)", fr: "accès interdit (HTTP 403)", it: "accesso negato (HTTP 403)", es: "acceso prohibido (HTTP 403)" },
  METHOD_NOT_ALLOWED: { nl: "verzoek niet toegestaan (HTTP 405)", en: "request method not allowed (HTTP 405)", de: "Anfrage nicht erlaubt (HTTP 405)", fr: "méthode non autorisée (HTTP 405)", it: "metodo non consentito (HTTP 405)", es: "método no permitido (HTTP 405)" },
  LEGAL_RESTRICTION: { nl: "wettelijke of regionale beperking (HTTP 451)", en: "legal or regional restriction (HTTP 451)", de: "rechtliche oder regionale Einschränkung (HTTP 451)", fr: "restriction légale ou régionale (HTTP 451)", it: "restrizione legale o regionale (HTTP 451)", es: "restricción legal o regional (HTTP 451)" },
  NONSTANDARD_BLOCK: { nl: "afwijkende blokkadecode (HTTP {status})", en: "non-standard blocking status (HTTP {status})", de: "nicht standardmäßiger Sperrstatus (HTTP {status})", fr: "code de blocage non standard (HTTP {status})", it: "codice di blocco non standard (HTTP {status})", es: "código de bloqueo no estándar (HTTP {status})" },
  NOT_FOUND: { nl: "de pagina bestaat niet (HTTP 404)", en: "the page does not exist (HTTP 404)", de: "die Seite existiert nicht (HTTP 404)", fr: "la page n’existe pas (HTTP 404)", it: "la pagina non esiste (HTTP 404)", es: "la página no existe (HTTP 404)" },
  GONE: { nl: "de pagina is definitief verwijderd (HTTP 410)", en: "the page was permanently removed (HTTP 410)", de: "die Seite wurde dauerhaft entfernt (HTTP 410)", fr: "la page a été définitivement supprimée (HTTP 410)", it: "la pagina è stata rimossa definitivamente (HTTP 410)", es: "la página se eliminó definitivamente (HTTP 410)" },
  SERVER_ERROR: { nl: "serverfout (HTTP {status})", en: "server error (HTTP {status})", de: "Serverfehler (HTTP {status})", fr: "erreur serveur (HTTP {status})", it: "errore del server (HTTP {status})", es: "error del servidor (HTTP {status})" },
  NOT_IMPLEMENTED: { nl: "de server ondersteunt dit verzoek niet (HTTP 501)", en: "the server does not support this request (HTTP 501)", de: "der Server unterstützt diese Anfrage nicht (HTTP 501)", fr: "le serveur ne prend pas en charge cette requête (HTTP 501)", it: "il server non supporta questa richiesta (HTTP 501)", es: "el servidor no admite esta solicitud (HTTP 501)" },
  CLIENT_ERROR: { nl: "foutstatus HTTP {status}", en: "error status HTTP {status}", de: "Fehlerstatus HTTP {status}", fr: "statut d’erreur HTTP {status}", it: "stato di errore HTTP {status}", es: "estado de error HTTP {status}" },
  REDIRECT_WITHOUT_LOCATION: { nl: "redirect zonder bestemming (HTTP {status})", en: "redirect without a destination (HTTP {status})", de: "Weiterleitung ohne Ziel (HTTP {status})", fr: "redirection sans destination (HTTP {status})", it: "reindirizzamento senza destinazione (HTTP {status})", es: "redirección sin destino (HTTP {status})" },
  REQUEST_TIMEOUT: { nl: "de server reageerde niet op tijd (HTTP 408)", en: "the server did not respond in time (HTTP 408)", de: "der Server hat nicht rechtzeitig geantwortet (HTTP 408)", fr: "le serveur n’a pas répondu à temps (HTTP 408)", it: "il server non ha risposto in tempo (HTTP 408)", es: "el servidor no respondió a tiempo (HTTP 408)" },
  RATE_LIMITED: { nl: "te veel verzoeken (HTTP 429)", en: "too many requests (HTTP 429)", de: "zu viele Anfragen (HTTP 429)", fr: "trop de requêtes (HTTP 429)", it: "troppe richieste (HTTP 429)", es: "demasiadas solicitudes (HTTP 429)" },
  BAD_GATEWAY: { nl: "gatewayfout (HTTP 502)", en: "bad gateway (HTTP 502)", de: "Gateway-Fehler (HTTP 502)", fr: "erreur de passerelle (HTTP 502)", it: "errore di gateway (HTTP 502)", es: "error de puerta de enlace (HTTP 502)" },
  SERVICE_UNAVAILABLE: { nl: "dienst tijdelijk niet beschikbaar (HTTP 503)", en: "service temporarily unavailable (HTTP 503)", de: "Dienst vorübergehend nicht verfügbar (HTTP 503)", fr: "service temporairement indisponible (HTTP 503)", it: "servizio temporaneamente non disponibile (HTTP 503)", es: "servicio temporalmente no disponible (HTTP 503)" },
  GATEWAY_TIMEOUT: { nl: "gateway-timeout (HTTP 504)", en: "gateway timeout (HTTP 504)", de: "Gateway-Zeitüberschreitung (HTTP 504)", fr: "délai de passerelle dépassé (HTTP 504)", it: "timeout del gateway (HTTP 504)", es: "tiempo de espera de la puerta de enlace (HTTP 504)" },
  EDGE_ORIGIN_ERROR: { nl: "het CDN kon de server van de website niet bereiken (HTTP {status})", en: "the CDN could not reach the website's server (HTTP {status})", de: "das CDN konnte den Server der Website nicht erreichen (HTTP {status})", fr: "le CDN n’a pas pu joindre le serveur du site (HTTP {status})", it: "il CDN non ha raggiunto il server del sito (HTTP {status})", es: "la CDN no pudo alcanzar el servidor del sitio (HTTP {status})" },
  EDGE_TLS_ERROR: { nl: "TLS-fout tussen CDN en server (HTTP {status})", en: "TLS error between CDN and server (HTTP {status})", de: "TLS-Fehler zwischen CDN und Server (HTTP {status})", fr: "erreur TLS entre le CDN et le serveur (HTTP {status})", it: "errore TLS tra CDN e server (HTTP {status})", es: "error TLS entre la CDN y el servidor (HTTP {status})" },
  EDGE_ORIGIN_DNS: { nl: "het CDN kon de server niet vinden (HTTP {status})", en: "the CDN could not find the server (HTTP {status})", de: "das CDN konnte den Server nicht finden (HTTP {status})", fr: "le CDN n’a pas trouvé le serveur (HTTP {status})", it: "il CDN non ha trovato il server (HTTP {status})", es: "la CDN no encontró el servidor (HTTP {status})" },
  REQUEST_TOO_LARGE: { nl: "verzoek of headers te groot (HTTP {status})", en: "request or headers too large (HTTP {status})", de: "Anfrage oder Header zu groß (HTTP {status})", fr: "requête ou en-têtes trop volumineux (HTTP {status})", it: "richiesta o intestazioni troppo grandi (HTTP {status})", es: "solicitud o encabezados demasiado grandes (HTTP {status})" },
  DNS_NOT_FOUND: { nl: "het domein bestaat niet of heeft geen DNS-records", en: "the domain does not exist or has no DNS records", de: "die Domain existiert nicht oder hat keine DNS-Einträge", fr: "le domaine n’existe pas ou n’a pas d’enregistrement DNS", it: "il dominio non esiste o non ha record DNS", es: "el dominio no existe o no tiene registros DNS" },
  DNS_TEMPORARY_FAILURE: { nl: "DNS reageerde tijdelijk niet", en: "DNS did not respond temporarily", de: "DNS hat vorübergehend nicht geantwortet", fr: "le DNS n’a temporairement pas répondu", it: "il DNS temporaneamente non ha risposto", es: "el DNS no respondió temporalmente" },
  TLS_CERT_EXPIRED: { nl: "het SSL-certificaat is verlopen", en: "the SSL certificate has expired", de: "das SSL-Zertifikat ist abgelaufen", fr: "le certificat SSL a expiré", it: "il certificato SSL è scaduto", es: "el certificado SSL ha caducado" },
  TLS_CERT_INVALID: { nl: "het SSL-certificaat is ongeldig of niet vertrouwd", en: "the SSL certificate is invalid or not trusted", de: "das SSL-Zertifikat ist ungültig oder nicht vertrauenswürdig", fr: "le certificat SSL est invalide ou non fiable", it: "il certificato SSL non è valido o attendibile", es: "el certificado SSL no es válido o no es de confianza" },
  TLS_HANDSHAKE_FAILED: { nl: "er kon geen beveiligde verbinding worden opgezet", en: "no secure connection could be established", de: "es konnte keine sichere Verbindung aufgebaut werden", fr: "aucune connexion sécurisée n’a pu être établie", it: "non è stato possibile stabilire una connessione sicura", es: "no se pudo establecer una conexión segura" },
  CONNECTION_REFUSED: { nl: "de server weigert verbindingen", en: "the server refuses connections", de: "der Server verweigert Verbindungen", fr: "le serveur refuse les connexions", it: "il server rifiuta le connessioni", es: "el servidor rechaza las conexiones" },
  CONNECTION_RESET: { nl: "de verbinding werd onderbroken", en: "the connection was interrupted", de: "die Verbindung wurde unterbrochen", fr: "la connexion a été interrompue", it: "la connessione è stata interrotta", es: "la conexión se interrumpió" },
  HOST_UNREACHABLE: { nl: "de server is niet bereikbaar", en: "the server is unreachable", de: "der Server ist nicht erreichbar", fr: "le serveur est injoignable", it: "il server non è raggiungibile", es: "el servidor no es accesible" },
  TIMEOUT: { nl: "de server reageerde niet binnen de tijdslimiet", en: "the server did not respond within the time limit", de: "der Server hat nicht innerhalb des Zeitlimits geantwortet", fr: "le serveur n’a pas répondu dans le délai imparti", it: "il server non ha risposto entro il limite di tempo", es: "el servidor no respondió dentro del límite de tiempo" },
  BODY_TIMEOUT: { nl: "de pagina laadde niet volledig binnen de tijdslimiet", en: "the page did not finish loading within the time limit", de: "die Seite wurde nicht innerhalb des Zeitlimits vollständig geladen", fr: "la page ne s’est pas chargée entièrement dans le délai", it: "la pagina non si è caricata completamente entro il limite", es: "la página no terminó de cargar dentro del límite" },
  REDIRECT_LOOP: { nl: "de website stuurt door in een oneindige redirectlus", en: "the website redirects in an endless loop", de: "die Website leitet in einer Endlosschleife weiter", fr: "le site redirige en boucle infinie", it: "il sito reindirizza in un ciclo infinito", es: "el sitio redirige en un bucle infinito" },
  REDIRECT_LIMIT: { nl: "te veel opeenvolgende redirects", en: "too many consecutive redirects", de: "zu viele aufeinanderfolgende Weiterleitungen", fr: "trop de redirections successives", it: "troppi reindirizzamenti consecutivi", es: "demasiadas redirecciones consecutivas" },
  PROTOCOL_ERROR: { nl: "de server stuurde een ongeldige HTTP-response", en: "the server sent an invalid HTTP response", de: "der Server hat eine ungültige HTTP-Antwort gesendet", fr: "le serveur a envoyé une réponse HTTP invalide", it: "il server ha inviato una risposta HTTP non valida", es: "el servidor envió una respuesta HTTP no válida" },
  RESPONSE_TOO_LARGE: { nl: "de pagina is groter dan de veilige scanlimiet", en: "the page exceeds the safe scan size limit", de: "die Seite überschreitet das sichere Scan-Limit", fr: "la page dépasse la limite de taille sécurisée", it: "la pagina supera il limite di dimensione sicuro", es: "la página supera el límite de tamaño seguro" },
  EMPTY_DOCUMENT: { nl: "de pagina bevat geen inhoud (geen titel, beschrijving of tekst)", en: "the page contains no content (no title, description or text)", de: "die Seite enthält keinen Inhalt (kein Titel, keine Beschreibung, kein Text)", fr: "la page ne contient aucun contenu (ni titre, ni description, ni texte)", it: "la pagina non contiene contenuti (nessun titolo, descrizione o testo)", es: "la página no tiene contenido (sin título, descripción ni texto)" },
  JAVASCRIPT_NOT_RENDERED: { nl: "de pagina toont alleen inhoud via JavaScript en JavaScript kon in deze scan niet worden uitgevoerd", en: "the page only shows content through JavaScript, which could not be executed in this scan", de: "die Seite zeigt Inhalte nur per JavaScript, das in diesem Scan nicht ausgeführt werden konnte", fr: "la page n’affiche son contenu que via JavaScript, qui n’a pas pu être exécuté lors de cette analyse", it: "la pagina mostra i contenuti solo tramite JavaScript, che non è stato possibile eseguire in questa scansione", es: "la página solo muestra contenido mediante JavaScript, que no se pudo ejecutar en este análisis" },
  FETCH_FAILED: { nl: "onbekende netwerkfout", en: "unknown network error", de: "unbekannter Netzwerkfehler", fr: "erreur réseau inconnue", it: "errore di rete sconosciuto", es: "error de red desconocido" },
  URL_HOST_BLOCKED: { nl: "het adres is intern of lokaal", en: "the address is internal or local", de: "die Adresse ist intern oder lokal", fr: "l’adresse est interne ou locale", it: "l’indirizzo è interno o locale", es: "la dirección es interna o local" },
  URL_IP_BLOCKED: { nl: "het IP-adres is intern of gereserveerd", en: "the IP address is internal or reserved", de: "die IP-Adresse ist intern oder reserviert", fr: "l’adresse IP est interne ou réservée", it: "l’indirizzo IP è interno o riservato", es: "la dirección IP es interna o reservada" },
  URL_DNS_BLOCKED: { nl: "het domein verwijst naar een intern of gereserveerd netwerkadres", en: "the domain points to an internal or reserved network address", de: "die Domain verweist auf eine interne oder reservierte Netzwerkadresse", fr: "le domaine pointe vers une adresse réseau interne ou réservée", it: "il dominio punta a un indirizzo di rete interno o riservato", es: "el dominio apunta a una dirección de red interna o reservada" },
  URL_PORT_BLOCKED: { nl: "alleen poort 80 en 443 zijn toegestaan", en: "only ports 80 and 443 are allowed", de: "nur die Ports 80 und 443 sind erlaubt", fr: "seuls les ports 80 et 443 sont autorisés", it: "sono consentite solo le porte 80 e 443", es: "solo se permiten los puertos 80 y 443" },
  URL_PROTOCOL_BLOCKED: { nl: "alleen http en https zijn toegestaan", en: "only http and https are allowed", de: "nur http und https sind erlaubt", fr: "seuls http et https sont autorisés", it: "sono consentiti solo http e https", es: "solo se permiten http y https" },
  URL_CREDENTIALS_BLOCKED: { nl: "inloggegevens in de URL zijn niet toegestaan", en: "credentials in the URL are not allowed", de: "Zugangsdaten in der URL sind nicht erlaubt", fr: "les identifiants dans l’URL ne sont pas autorisés", it: "le credenziali nell’URL non sono consentite", es: "no se permiten credenciales en la URL" },
  URL_INVALID: { nl: "de URL is ongeldig", en: "the URL is invalid", de: "die URL ist ungültig", fr: "l’URL est invalide", it: "l’URL non è valido", es: "la URL no es válida" },
};

const TEMPLATES: Record<ScanFailureCategory, Copy> = {
  site_error: {
    nl: "De website gaf een fout: {reason}. Dit is een probleem van de website zelf. Er is geen score berekend.",
    en: "The website returned an error: {reason}. This is a problem with the website itself. No score was calculated.",
    de: "Die Website hat einen Fehler gemeldet: {reason}. Das ist ein Problem der Website selbst. Es wurde keine Bewertung berechnet.",
    fr: "Le site a renvoyé une erreur : {reason}. Il s’agit d’un problème du site lui-même. Aucun score n’a été calculé.",
    it: "Il sito ha restituito un errore: {reason}. Si tratta di un problema del sito stesso. Non è stato calcolato alcun punteggio.",
    es: "El sitio devolvió un error: {reason}. Es un problema del propio sitio. No se calculó ninguna puntuación.",
  },
  access_blocked: {
    nl: "De website weigert RankFix de toegang: {reason}{provider}. Dit zegt niets over de SEO- of beveiligingskwaliteit van de website. Er is daarom geen score berekend.",
    en: "The website denies RankFix access: {reason}{provider}. This says nothing about the website's SEO or security quality, so no score was calculated.",
    de: "Die Website verweigert RankFix den Zugriff: {reason}{provider}. Das sagt nichts über die SEO- oder Sicherheitsqualität aus. Daher wurde keine Bewertung berechnet.",
    fr: "Le site refuse l’accès à RankFix : {reason}{provider}. Cela ne dit rien de la qualité SEO ou sécurité du site ; aucun score n’a donc été calculé.",
    it: "Il sito nega l’accesso a RankFix: {reason}{provider}. Questo non dice nulla sulla qualità SEO o di sicurezza del sito, quindi non è stato calcolato alcun punteggio.",
    es: "El sitio deniega el acceso a RankFix: {reason}{provider}. Esto no dice nada sobre la calidad SEO o de seguridad del sitio, por eso no se calculó ninguna puntuación.",
  },
  temporary: {
    nl: "De website is tijdelijk niet goed bereikbaar: {reason}. Probeer het later opnieuw{retry}. Er is geen score berekend en de scan is niet in rekening gebracht.",
    en: "The website is temporarily not reachable: {reason}. Please try again later{retry}. No score was calculated and the scan was not charged.",
    de: "Die Website ist vorübergehend nicht erreichbar: {reason}. Bitte später erneut versuchen{retry}. Es wurde keine Bewertung berechnet und der Scan wurde nicht berechnet.",
    fr: "Le site est temporairement inaccessible : {reason}. Réessayez plus tard{retry}. Aucun score n’a été calculé et l’analyse n’a pas été décomptée.",
    it: "Il sito è temporaneamente non raggiungibile: {reason}. Riprova più tardi{retry}. Non è stato calcolato alcun punteggio e la scansione non è stata addebitata.",
    es: "El sitio no está disponible temporalmente: {reason}. Inténtalo más tarde{retry}. No se calculó ninguna puntuación y el análisis no se ha cobrado.",
  },
  scan_environment: {
    nl: "De scan kon niet worden voltooid door een beperking van de RankFix-scanomgeving: {reason}. Dit is geen fout van de website. Er is geen score berekend.",
    en: "The scan could not be completed because of a limit of the RankFix scan environment: {reason}. This is not a website fault. No score was calculated.",
    de: "Der Scan konnte wegen einer Einschränkung der RankFix-Scanumgebung nicht abgeschlossen werden: {reason}. Das ist kein Fehler der Website. Es wurde keine Bewertung berechnet.",
    fr: "L’analyse n’a pas pu aboutir en raison d’une limite de l’environnement RankFix : {reason}. Ce n’est pas une erreur du site. Aucun score n’a été calculé.",
    it: "La scansione non è stata completata per un limite dell’ambiente RankFix: {reason}. Non è un errore del sito. Non è stato calcolato alcun punteggio.",
    es: "El análisis no se pudo completar por un límite del entorno de RankFix: {reason}. No es un fallo del sitio. No se calculó ninguna puntuación.",
  },
  unsafe_target: {
    nl: "Deze URL kan niet veilig worden gescand: {reason}.",
    en: "This URL cannot be scanned safely: {reason}.",
    de: "Diese URL kann nicht sicher gescannt werden: {reason}.",
    fr: "Cette URL ne peut pas être analysée en toute sécurité : {reason}.",
    it: "Questo URL non può essere analizzato in sicurezza: {reason}.",
    es: "Esta URL no se puede analizar de forma segura: {reason}.",
  },
  invalid_input: {
    nl: "Vul een websiteadres in, bijvoorbeeld bedrijf.nl. Een bedrijfsnaam zonder domein kan RankFix niet betrouwbaar aan een website koppelen.",
    en: "Enter a website address, for example company.com. RankFix cannot reliably link a business name without a domain to a website.",
    de: "Gib eine Website-Adresse ein, zum Beispiel firma.de. Einen Firmennamen ohne Domain kann RankFix nicht zuverlässig einer Website zuordnen.",
    fr: "Saisissez une adresse de site, par exemple entreprise.fr. RankFix ne peut pas associer de façon fiable un nom d’entreprise sans domaine à un site.",
    it: "Inserisci l’indirizzo di un sito, ad esempio azienda.it. RankFix non può collegare in modo affidabile un nome aziendale senza dominio a un sito.",
    es: "Introduce la dirección de un sitio web, por ejemplo empresa.es. RankFix no puede vincular de forma fiable un nombre de empresa sin dominio a un sitio.",
  },
};

const PROVIDER_COPY: Copy = { nl: " via beveiliging van {provider}", en: " via {provider} protection", de: " über den Schutz von {provider}", fr: " via la protection {provider}", it: " tramite la protezione di {provider}", es: " mediante la protección de {provider}" };
const RETRY_COPY: Record<ScanLanguage, (seconds: number) => string> = {
  nl: s => s >= 120 ? ` (de website vraagt ongeveer ${Math.ceil(s / 60)} minuten te wachten)` : ` (de website vraagt ongeveer ${s} seconden te wachten)`,
  en: s => s >= 120 ? ` (the website asks to wait about ${Math.ceil(s / 60)} minutes)` : ` (the website asks to wait about ${s} seconds)`,
  de: s => s >= 120 ? ` (die Website bittet um etwa ${Math.ceil(s / 60)} Minuten Wartezeit)` : ` (die Website bittet um etwa ${s} Sekunden Wartezeit)`,
  fr: s => s >= 120 ? ` (le site demande d’attendre environ ${Math.ceil(s / 60)} minutes)` : ` (le site demande d’attendre environ ${s} secondes)`,
  it: s => s >= 120 ? ` (il sito chiede di attendere circa ${Math.ceil(s / 60)} minuti)` : ` (il sito chiede di attendere circa ${s} secondi)`,
  es: s => s >= 120 ? ` (el sitio pide esperar unos ${Math.ceil(s / 60)} minutos)` : ` (el sitio pide esperar unos ${s} segundos)`,
};
const PROVIDER_NAMES: Record<string, string> = { cloudflare: "Cloudflare", akamai: "Akamai", cloudfront: "Amazon CloudFront", imperva: "Imperva", sucuri: "Sucuri", fastly: "Fastly", vercel: "Vercel", netlify: "Netlify" };

export function scanFailureMessage(f: ScanFailure, language: string): string {
  const lang = (["nl", "en", "de", "fr", "it", "es"].includes(language) ? language : "nl") as ScanLanguage;
  const reasonCopy = REASONS[f.code];
  const reason = (reasonCopy ? reasonCopy[lang] : (REASONS.FETCH_FAILED[lang])).replace("{status}", String(f.httpStatus ?? ""));
  const provider = f.category === "access_blocked" && f.edgeProvider ? PROVIDER_COPY[lang].replace("{provider}", PROVIDER_NAMES[f.edgeProvider] || f.edgeProvider) : "";
  const retry = f.category === "temporary" && f.retryAfterSeconds && f.retryAfterSeconds > 0 ? RETRY_COPY[lang](f.retryAfterSeconds) : "";
  return TEMPLATES[f.category][lang].replace("{reason}", reason).replace("{provider}", provider).replace("{retry}", retry);
}

/** Serialisable payload returned to the RankFix client for a failed scan. */
export function scanFailurePayload(f: ScanFailure, language: string, extra: Record<string, unknown> = {}) {
  return {
    error: scanFailureMessage(f, language),
    code: f.code,
    failure: f,
    retryable: f.retryable,
    charged: false,
    ...extra,
  };
}
