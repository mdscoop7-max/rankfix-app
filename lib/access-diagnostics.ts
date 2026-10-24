/**
 * Access diagnostics for scans that end without a report (QA #186, 24 of 96
 * websites). Explains WHY a website could not be analysed: authentication,
 * a WAF/bot-protection decision, a challenge page, a redirect loop or a
 * timeout. Diagnosis only: RankFix never rotates identities, solves CAPTCHAs
 * or otherwise evades a block. Header values are reduced to provider names and
 * never echoed verbatim (no cookies, tokens or request IDs in reports).
 */

export type BlockKind =
  | "authentication_required" // 401 or WWW-Authenticate: the site requires a login
  | "bot_protection"          // a WAF/bot manager refused or challenged the scanner
  | "access_denied"           // 403/405 without a recognisable protection layer
  | "rate_limited"            // 429: temporary, retry later
  | "geo_or_policy";          // 451: legal/geographic restriction

export type AccessDiagnosis = {
  kind: BlockKind;
  httpStatus: number | null;
  provider: string | null;
  retryable: boolean;
  /** Stable reason code for TestLab/attempt logs. */
  reason: string;
  /** What the site owner can do (Dutch; customer-facing). */
  advice: string;
};

type HeaderSource = { get(name: string): string | null } | null | undefined;

const PROVIDERS: Array<{ name: string; header?: (h: NonNullable<HeaderSource>) => boolean; body?: RegExp }> = [
  { name: "Cloudflare", header: (h) => Boolean(h.get("cf-ray") || h.get("cf-mitigated")) || /cloudflare/i.test(h.get("server") || ""), body: /challenge-platform|cf-chl-|cf_chl_|just a moment\.\.\.|attention required! \| cloudflare/i },
  { name: "Akamai", header: (h) => /akamai/i.test(h.get("server") || "") || Boolean(h.get("akamai-grn") || h.get("x-akamai-transformed")), body: /akamai bot manager|reference ?#\d+\.[0-9a-f]+\.\d+|errors\.edgesuite\.net/i },
  { name: "Imperva/Incapsula", header: (h) => Boolean(h.get("x-iinfo")) || /incap_ses|visid_incap/i.test(h.get("set-cookie") || "") || /imperva|incapsula/i.test(h.get("x-cdn") || ""), body: /incapsula incident|_incapsula_resource|imperva/i },
  { name: "DataDome", header: (h) => Boolean(h.get("x-datadome") || h.get("x-dd-b")) || /datadome/i.test(h.get("set-cookie") || ""), body: /captcha-delivery\.com|datadome/i },
  { name: "PerimeterX/HUMAN", header: (h) => /_px\d?=|_pxhd/i.test(h.get("set-cookie") || ""), body: /px-captcha|perimeterx|human security|press (?:&|and) hold/i },
  { name: "AWS WAF", header: (h) => Boolean(h.get("x-amzn-waf-action")) || /awselb|aws-waf/i.test(h.get("server") || ""), body: /aws-waf-token|awswaf/i },
  { name: "F5/BIG-IP", header: (h) => /\bbig-?ip\b/i.test(h.get("server") || "") || /^TS[0-9a-f]{6,}=/im.test(h.get("set-cookie") || ""), body: /the requested url was rejected\. please consult with your administrator|support id is/i },
  { name: "Radware", header: (h) => /radware/i.test(h.get("server") || ""), body: /radware (?:bot manager|page)|perfdrive\.com/i },
  { name: "Sucuri", header: (h) => /sucuri/i.test(h.get("server") || "") || Boolean(h.get("x-sucuri-id")), body: /sucuri website firewall/i },
];

/** The protection layer named by response headers or a challenge body, if any. */
export function detectProtectionProvider(headers: HeaderSource, body = ""): string | null {
  const snippet = String(body || "").slice(0, 60_000);
  for (const provider of PROVIDERS) {
    if (headers && provider.header?.(headers)) return provider.name;
    if (snippet && provider.body?.test(snippet)) return provider.name;
  }
  return null;
}

/** Diagnosis for a non-OK primary response that RankFix could not recover. */
export function diagnoseBlockedResponse(status: number, headers: HeaderSource, body = ""): AccessDiagnosis {
  const provider = detectProtectionProvider(headers, body);
  const authenticate = Boolean(headers?.get("www-authenticate"));
  if (status === 401 || authenticate) {
    return { kind: "authentication_required", httpStatus: status, provider, retryable: false, reason: "AUTH_REQUIRED",
      advice: "Deze website vraagt om inloggen (bijvoorbeeld een wachtwoordbeveiligde test- of intranetomgeving). Scan de openbare versie van de website." };
  }
  if (status === 429) {
    return { kind: "rate_limited", httpStatus: status, provider, retryable: true, reason: "SITE_RATE_LIMITED",
      advice: "De website beperkt tijdelijk het aantal verzoeken. Probeer de scan later opnieuw." };
  }
  if (status === 451) {
    return { kind: "geo_or_policy", httpStatus: status, provider, retryable: false, reason: "LEGAL_OR_GEO_RESTRICTION",
      advice: "De website is vanaf de RankFix-scanlocatie niet beschikbaar (juridische of geografische beperking)." };
  }
  if (provider) {
    return { kind: "bot_protection", httpStatus: status, provider, retryable: false, reason: "BOT_PROTECTION",
      advice: `De beveiliging van de website (${provider}) weigerde de RankFix-scanner. RankFix omzeilt zulke beveiliging niet. De eigenaar kan RankFixBot toestaan in de firewall/botinstellingen en daarna opnieuw scannen.` };
  }
  return { kind: "access_denied", httpStatus: status, provider: null, retryable: false, reason: "ACCESS_DENIED",
    advice: "De website weigerde de toegang voor de RankFix-scanner. RankFix omzeilt dit niet. De eigenaar kan RankFixBot toestaan en daarna opnieuw scannen." };
}

/** Diagnosis for an HTTP 200 challenge/interstitial that stays a challenge after one bounded render. */
export function diagnoseChallenge(headers: HeaderSource, body = ""): AccessDiagnosis {
  const provider = detectProtectionProvider(headers, body);
  return { kind: "bot_protection", httpStatus: 200, provider, retryable: false, reason: "CHALLENGE_PAGE",
    advice: provider
      ? `De website toonde een controle- of wachtpagina van ${provider} in plaats van de inhoud. RankFix lost geen captcha's of controles op; de eigenaar kan RankFixBot toestaan.`
      : "De website toonde een controle-, wacht- of doorstuurpagina in plaats van de inhoud. RankFix lost geen captcha's of controles op." };
}

/** Network-level failure explanation (timeouts, loops, DNS) without raw runtime text. */
export function diagnoseFetchFailure(code: string, attempts: number, elapsedMs: number): { reason: string; retryable: boolean; attempts: number; elapsedMs: number; advice: string } {
  const seconds = Math.round(elapsedMs / 1000);
  const advice: Record<string, string> = {
    FETCH_TIMEOUT: `De website stuurde na ${attempts} ${attempts === 1 ? "poging" : "pogingen"} (${seconds} s) geen antwoord. Dit gebeurt bij overbelasting of wanneer een beveiliging verzoeken van onbekende scanners stil laat verlopen. Probeer later opnieuw of laat RankFixBot toe.`,
    BODY_TIMEOUT: "De website begon te antwoorden maar leverde de pagina niet binnen de tijdslimiet. Probeer het later opnieuw.",
    REDIRECT_LOOP: "De website stuurt de scanner in een doorverwijzingslus (bijvoorbeeld via een cookie- of taalkeuze die steeds terugverwijst). Controleer de redirects van deze URL.",
    REDIRECT_LIMIT: "De website verwijst te vaak door. Controleer de doorverwijzingsketen van deze URL.",
    FETCH_DNS: "De domeinnaam kon niet worden opgezocht. Controleer de spelling van de URL.",
    FETCH_TLS: "De beveiligde verbinding (HTTPS-certificaat) kon niet worden opgezet.",
    FETCH_CONNECTION: "De verbinding met de website werd geweigerd of verbroken.",
    RESPONSE_TOO_LARGE: "De pagina is groter dan de veilige scanlimiet.",
  };
  return {
    reason: code,
    retryable: ["FETCH_TIMEOUT", "BODY_TIMEOUT", "FETCH_CONNECTION"].includes(code),
    attempts,
    elapsedMs,
    advice: advice[code] || "De website kon niet worden opgehaald. Probeer het later opnieuw.",
  };
}

/** True when a redirect chain revisits a URL it already requested (cycle, not just length). */
export function redirectChainLoops(chain: Array<{ from: string; to: string }>): boolean {
  const seen = new Set<string>();
  for (const hop of chain) {
    seen.add(normalize(hop.from));
    if (seen.has(normalize(hop.to))) return true;
  }
  return false;
}

function normalize(value: string): string {
  try {
    const url = new URL(value);
    url.hash = "";
    return `${url.protocol}//${url.host.toLowerCase()}${url.pathname.replace(/\/+$/, "") || "/"}${url.search}`;
  } catch {
    return value;
  }
}

/**
 * QA-144: the customer-facing message for a failed fetch names what actually
 * happened. "Check the URL" was shown for time-outs and certificate errors of
 * correct, existing URLs (ING, PostNL, KLM, ABB, Center Parcs), which is wrong.
 */
export function fetchFailureMessage(code: string, language: string, seconds: number): string {
  const s = Math.max(1, Math.round(seconds));
  const m: Record<string, Record<string, string>> = {
    FETCH_TIMEOUT: {
      nl: `Scan niet mogelijk: de website gaf binnen ${s} seconden geen antwoord aan de RankFix-scanner, ook niet na een tweede poging. De URL is niet per se fout: dit gebeurt bij overbelasting of wanneer een beveiliging onbekende scanners stil laat wachten. Er is geen score berekend. Probeer later opnieuw of laat RankFixBot toe.`,
      en: `Scan not possible: the website did not answer the RankFix scanner within ${s} seconds, also not on a second attempt. The URL is not necessarily wrong: this happens under load or when security lets unknown scanners wait silently. No score was calculated.`,
      de: `Scan nicht möglich: Die Website hat dem RankFix-Scanner innerhalb von ${s} Sekunden nicht geantwortet, auch nicht beim zweiten Versuch. Die URL ist nicht unbedingt falsch. Es wurde kein Score berechnet.`,
      fr: `Analyse impossible : le site n'a pas répondu au scanner RankFix en ${s} secondes, même après une seconde tentative. L'URL n'est pas forcément erronée. Aucun score n'a été calculé.`,
      it: `Scansione non possibile: il sito non ha risposto allo scanner RankFix entro ${s} secondi, nemmeno al secondo tentativo. L'URL non è necessariamente errato. Nessun punteggio calcolato.`,
      es: `Análisis no posible: el sitio no respondió al escáner de RankFix en ${s} segundos, tampoco en un segundo intento. La URL no es necesariamente incorrecta. No se calculó ninguna puntuación.`,
    },
    BODY_TIMEOUT: {
      nl: "Scan niet mogelijk: de website begon te antwoorden maar leverde de pagina niet binnen de tijdslimiet. Er is geen score berekend. Probeer het later opnieuw.",
      en: "Scan not possible: the website started to answer but did not deliver the page within the time limit. No score was calculated.",
    },
    FETCH_TLS: {
      nl: "Scan niet mogelijk: de beveiligde verbinding (HTTPS-certificaat) met de website kon niet worden opgezet. Controleer het certificaat en de certificaatketen van de website. Er is geen score berekend.",
      en: "Scan not possible: the secure connection (HTTPS certificate) to the website could not be established. Check the website's certificate and certificate chain. No score was calculated.",
      de: "Scan nicht möglich: Die sichere Verbindung (HTTPS-Zertifikat) konnte nicht aufgebaut werden. Prüfe das Zertifikat und die Zertifikatskette. Es wurde kein Score berechnet.",
      fr: "Analyse impossible : la connexion sécurisée (certificat HTTPS) n'a pas pu être établie. Vérifiez le certificat et sa chaîne. Aucun score n'a été calculé.",
    },
    FETCH_CONNECTION: {
      nl: "Scan niet mogelijk: de website weigerde of verbrak de verbinding met de RankFix-scanner. Er is geen score berekend. Probeer later opnieuw of laat RankFixBot toe.",
      en: "Scan not possible: the website refused or closed the connection to the RankFix scanner. No score was calculated.",
    },
    FETCH_DNS: {
      nl: "Scan niet mogelijk: de domeinnaam kon niet worden gevonden. Controleer de spelling van de URL.",
      en: "Scan not possible: the domain name could not be found. Check the spelling of the URL.",
    },
    REDIRECT_LOOP: {
      nl: "Scan niet mogelijk: de website stuurt de scanner in een doorverwijzingslus. Controleer de redirects van deze URL. Er is geen score berekend.",
      en: "Scan not possible: the website sends the scanner into a redirect loop. Check the redirects of this URL. No score was calculated.",
    },
  };
  const byCode = m[code];
  return byCode ? (byCode[language] || byCode.en || byCode.nl) : "";
}
