// 31 Oct 2026 (PDF P9): evidence helpers for new or tightened checks. Each one
// reads only the HTML/response already fetched; nothing here probes the site.

const norm = (v: string) => v.replace(/\s+/g, " ").trim().toLowerCase();

// Framer/Webflow and other builders render the same H1 once per breakpoint and
// hide the others with CSS. Identical texts are one H1, not "3 H1's".
export function distinctH1s(h1s: string[]): { distinct: string[]; duplicateCopies: number } {
  const seen = new Map<string, string>();
  for (const h of h1s) { const k = norm(h); if (k && !seen.has(k)) seen.set(k, h); }
  return { distinct: [...seen.values()], duplicateCopies: Math.max(0, h1s.filter((h) => norm(h)).length - seen.size) };
}

export const LARGE_HTML_BYTES = 2 * 1024 * 1024;
export function htmlByteSize(html: string): number {
  return new TextEncoder().encode(html).length;
}

// Publicly documented security advisories; a version is only judged when it is
// visible in a script/link URL. Unknown versions are never guessed.
type LibRule = { name: string; fixedIn: string; advisory: string; urlPatterns: RegExp[]; eol?: boolean; appliesFrom?: string };
const LIB_RULES: LibRule[] = [
  { name: "jQuery", fixedIn: "3.5.0", advisory: "CVE-2020-11022 / CVE-2020-11023 (XSS)", urlPatterns: [/\/jquery[-.](\d+\.\d+\.\d+)(?:\.slim)?(?:\.min)?\.js/i, /\/jquery@(\d+\.\d+\.\d+)\//i, /\/ajax\/libs\/jquery\/(\d+\.\d+\.\d+)\//i, /\/jquery\/(\d+\.\d+\.\d+)\/jquery(?:\.slim)?(?:\.min)?\.js/i, /wp-includes\/js\/jquery\/jquery(?:\.min)?\.js\?ver=(\d+\.\d+\.\d+)/i] },
  { name: "jQuery UI", fixedIn: "1.13.2", advisory: "CVE-2021-41182/41183/41184, CVE-2022-31160 (XSS)", urlPatterns: [/\/jquery-ui[-.](\d+\.\d+\.\d+)(?:\.custom)?(?:\.min)?\.js/i, /\/jqueryui\/(\d+\.\d+\.\d+)\//i, /\/jquery-ui@(\d+\.\d+\.\d+)\//i, /\/jquery-ui\/(\d+\.\d+\.\d+)\//i, /wp-includes\/js\/jquery\/ui\/[a-z-]+(?:\.min)?\.js\?ver=(\d+\.\d+\.\d+)/i] },
  { name: "Bootstrap 3", fixedIn: "3.4.1", advisory: "CVE-2019-8331 (XSS)", appliesFrom: "3.0.0", urlPatterns: [/\/bootstrap[-.@\/](3\.\d+\.\d+)(?:\/|(?:\.bundle)?(?:\.min)?\.js)/i] },
  { name: "Bootstrap 4", fixedIn: "4.3.1", advisory: "CVE-2019-8331 (XSS)", appliesFrom: "4.0.0", urlPatterns: [/\/bootstrap[-.@\/](4\.\d+\.\d+)(?:\/|(?:\.bundle)?(?:\.min)?\.js)/i] },
  { name: "Moment.js", fixedIn: "2.29.4", advisory: "CVE-2022-31129 (ReDoS)", urlPatterns: [/\/moment[-.@\/](\d+\.\d+\.\d+)(?:\/|(?:\.min)?\.js)/i] },
  { name: "AngularJS 1.x", fixedIn: "", advisory: "end-of-life sinds 31 december 2021, geen beveiligingsupdates meer", eol: true, urlPatterns: [/\/angular(?:js)?[-.@\/](1\.\d+\.\d+)(?:\/|(?:\.min)?\.js)/i] },
];
const cmp = (a: string, b: string) => { const x = a.split(".").map(Number), y = b.split(".").map(Number); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); } return 0; };

export type LibraryFinding = { name: string; version: string; fixedIn: string; advisory: string; url: string; outdated: boolean };
export function detectLibraryVersions(html: string): LibraryFinding[] {
  const urls = [...html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]);
  const out = new Map<string, LibraryFinding>();
  for (const url of urls) {
    if (/jquery[-.]migrate/i.test(url)) continue;
    for (const rule of LIB_RULES) {
      // "jquery-ui" must not be read as jQuery itself.
      if (rule.name === "jQuery" && /jquery[-.]?ui|\/ui\//i.test(url)) continue;
      for (const p of rule.urlPatterns) {
        const v = url.match(p)?.[1]; if (!v) continue;
        if (rule.appliesFrom && cmp(v, rule.appliesFrom) < 0) continue;
        const outdated = rule.eol ? true : cmp(v, rule.fixedIn) < 0;
        const key = `${rule.name}@${v}`;
        if (!out.has(key)) out.set(key, { name: rule.name, version: v, fixedIn: rule.fixedIn, advisory: rule.advisory, url, outdated });
        break;
      }
    }
  }
  return [...out.values()];
}

// YMYL (Your Money or Your Life): health, finance, legal and insurance. On such
// homepages expertise and accountability are judged from organisation-level
// evidence, not from an article byline. Multilingual, no domain lists.
export function isYmylSector(sector?: string | null, key?: string | null): boolean {
  return /^(health_wellness|financial_services)$/.test(String(sector || "")) || /^(legal|accounting|insurance|pharmacy|dentist|medical_clinic|healthcare|healthcare_academic|financial_payments|banking|bank|finance|senior_care|veterinary)$/.test(String(key || ""));
}
export function ymylExpertiseEvidence(input: { text: string; navigation: string[]; schemaTypes: string[]; host?: string }): string[] {
  const t = input.text, nav = input.navigation.join(" | ");
  const found: string[] = [];
  // Fixed phrases ("Over ons", "About us", "Chi siamo") always; "Over/About/Über …
  // <name>" only when <name> is the site's own brand from its domain ("Over
  // Argenta" on argenta.be), never a topic ("Over beleggen").
  const FIXED_ABOUT = /^(?:over ons|about(?: us)?|über uns|ueber uns|qui sommes[- ]nous|à propos|chi siamo|quiénes somos|sobre (?:nosotros|nós)|onze organisatie|organisatie|organisation|organization|unternehmen|wie (?:zijn wij|wij zijn))$/iu;
  const brand = String(input.host || "").toLowerCase().replace(/^www\./, "").split(".").slice(0, -1).pop() || "";
  const ABOUT_BRAND = /^(?:over|about|über(?:\s+(?:die|den|das))?|à propos de|a proposito di|acerca de|sobre)\s+(.{2,40})$/iu;
  const brandAbout = (label: string) => { const m = ABOUT_BRAND.exec(label); if (!m || brand.length < 3) return false; const name = m[1].toLowerCase().normalize("NFD").replace(/[^a-z0-9]/g, ""); return name.length >= 3 && (brand.replace(/[^a-z0-9]/g, "").includes(name) || name.includes(brand.replace(/[^a-z0-9]/g, ""))); };
  if (/(over ons|about us|über uns|qui sommes|chi siamo|quiénes somos|sobre nós|organisatie|organisation|organization|unternehmen)/iu.test(nav) || input.navigation.some((label) => FIXED_ABOUT.test(String(label).trim()) || brandAbout(String(label).trim()))) found.push("over-ons/organisatiepagina in navigatie of footer");
  if (/(specialisten|artsen|medisch specialist|behandelaars|ons team|our team|unser team|notre équipe|il nostro team|nuestro equipo|doctors|physicians|ärzte|médecins|medici|médicos|advocaten|lawyers|anwälte|avocats|avvocati|abogados|adviseurs|advisors|berater)/iu.test(t + " " + nav)) found.push("team/specialisten genoemd");
  if (/(\bbig[- ]?(?:nummer|registratie|register)\b|\bagb[- ]?code\b|\bafm\b|\bdnb\b|\bkifid\b|\bwft\b|\bbafin\b|\bfca\b|\bfinma\b|\bacpr\b|\bconsob\b|nederlandse orde van advocaten|rechtsanwaltskammer|barreau|ordine degli avvocati|\bjci\b|\bniaz\b|qualitätszertifikat|accredit|geaccrediteerd|akkreditiert|vergunning|licen[cs]e[d]? by|zugelassen|registered with|ingeschreven bij|e-money institution|elektronischgeldinstelling|betaalinstelling|payment institution|zahlungsinstitut|établissement de paiement)/iu.test(t)) found.push("vergunning, registratie of accreditatie genoemd");
  if (input.schemaTypes.some((s) => /^(hospital|medicalorganization|physician|dentist|legalservice|attorney|financialservice|bankorcreditunion|insuranceagency|accountingservice|medicalclinic)$/i.test(s))) found.push("sectorspecifiek organisatieschema");
  return found;
}

// 31 Oct (five-site QA, P6/P9): YMYL expertise is usually shown on the
// organisation, team/expert, contact and legal pages, not on the homepage.
// Only the site's own sampled pages count; every signal names its URL.
type SamplePage = { url: string; type?: string; status?: string; title?: string | null; ownIdentityText?: string | null; identityText?: string | null; accountabilitySnippet?: string | null };
const ORG_PAGE = /(?:over ons|wie (?:zijn|wij zijn) wij|onze organisatie|about(?: us)?|who we are|our (?:company|organi[sz]ation)|über uns|unternehmen|leitbild|struktur(?:,| und) organisation|leitungsgremien|vorstand|qui sommes|notre (?:entreprise|organisation)|chi siamo|la nostra azienda|quiénes somos|nuestra empresa|bestuur|raad van bestuur|board of directors|management team|governance)/iu;
const TEAM_PAGE = /(?:specialisten|artsen|behandelaars|ons team|our team|unser team|notre équipe|il nostro team|nuestro equipo|experts?\b|expertinnen|experten|ärzt(?:e|innen)|médecins|medici|médicos|doctors|physicians|advocaten|lawyers|anwält|avocats|avvocati|abogados|adviseurs|advisors|berater|ansprechpartner(?:innen)?|contactpersonen|contact persons)/iu;
const OVERSIGHT = /(?:aufsichtsbeh(?:ö|oe)rde|toezichthouder|onder toezicht|supervis(?:ed|ory authority)|regulated by|authori[sz]ed (?:and regulated )?by|zugelassen|bafin|\bafm\b|\bdnb\b|\bfca\b|\bfinma\b|\bacpr\b|\bconsob\b|\bkifid\b|big[- ]?regist|handelsregister|kvk[- ]?nummer|kamer van koophandel|registered (?:in|with)|ingeschreven (?:bij|in)|numéro (?:siren|rcs)|partita iva|registro (?:mercantil|delle imprese)|e-money institution|payment institution|betaalinstelling|zahlungsinstitut|kreditinstitut|krankenhausträger|körperschaft des öffentlichen rechts)/iu;
const LEGAL_PATH = /(?:impressum|colofon|imprint|legal(?:-notice)?|mentions-legales|note-legali|aviso-legal|disclaimer|juridisch)/i;
// Privacy statements always name a DATA-protection authority; only a NAMED
// financial or medical supervisor there is accountability evidence.
const PRIVACY_PATH = /(?:privacy|privacyverklaring|datenschutz|confidentialit[eé]|informativa|privacidad)/i;
const NAMED_SUPERVISOR = /(?:nationale bank van belgi|\bnbb\b|\bfsma\b|de nederlandsche bank|\bdnb\b|\bafm\b|\bbafin\b|\bfca\b|\bpra\b|\bfinma\b|\bacpr\b|\bamf\b|\bconsob\b|banca d'italia|\bivass\b|banco de españa|\bcnmv\b|\bcssf\b|\bkifid\b|\bbig[- ]?regist|inspectie gezondheidszorg|\bigj\b|ärztekammer|landesärztekammer|ordre des médecins|riziv|\binami\b|\bcqc\b)/iu;

export function ymylSampleEvidence(pages: SamplePage[], host: string): { label: string; url: string }[] {
  const out = new Map<string, { label: string; url: string }>();
  const own = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, "") === host.replace(/^www\./, ""); } catch { return false; } };
  for (const page of pages || []) {
    if (page.status && page.status !== "audited") continue;
    if (!page.url || !own(page.url)) continue;
    let path = "/"; try { path = new URL(page.url).pathname; } catch { /* keep */ }
    if (path === "/" || path === "") continue;
    const ownText = `${page.title || ""} ${page.ownIdentityText || ""}`;
    const fullText = `${ownText} ${page.identityText || ""}`.slice(0, 6000);
    if (!out.has("org") && (page.type === "corporate" || ORG_PAGE.test(ownText))) out.set("org", { label: "organisatie-/over-ons-pagina", url: page.url });
    if (!out.has("team") && TEAM_PAGE.test(ownText)) out.set("team", { label: "team-/specialisten- of contactpersonenpagina", url: page.url });
    if (!out.has("oversight") && (LEGAL_PATH.test(path) || page.type === "legal") && OVERSIGHT.test(fullText)) out.set("oversight", { label: "toezicht, vergunning of registratie in de juridische informatie", url: page.url });
    if (!out.has("oversight") && page.accountabilitySnippet) out.set("oversight", { label: "financiële of medische toezichthouder genoemd in de privacy-/juridische informatie", url: page.url });
    if (!out.has("oversight") && PRIVACY_PATH.test(path) && NAMED_SUPERVISOR.test(fullText)) out.set("oversight", { label: "financiële of medische toezichthouder genoemd in de privacy-/juridische informatie", url: page.url });
    if (!out.has("oversight") && OVERSIGHT.test(ownText)) out.set("oversight", { label: "toezicht, vergunning of registratie genoemd", url: page.url });
  }
  return [...out.values()];
}

/**
 * For legal/privacy pages only: a short excerpt (≤ 240 chars) around a supervisor
 * or registration mention anywhere in the page text, so the sample does not have
 * to store full page texts. Privacy pages need a NAMED financial/medical supervisor.
 */
export function accountabilitySnippet(url: string, text: string): string | null {
  let path = ""; try { path = new URL(url).pathname; } catch { return null; }
  const legal = LEGAL_PATH.test(path), privacy = PRIVACY_PATH.test(path);
  if (!legal && !privacy) return null;
  const body = String(text || "").slice(0, 60000);
  const m = (privacy && !legal ? NAMED_SUPERVISOR : new RegExp(`${OVERSIGHT.source}|${NAMED_SUPERVISOR.source}`, "iu")).exec(body);
  if (!m) return null;
  return body.slice(Math.max(0, m.index - 110), m.index + m[0].length + 110).replace(/\s+/g, " ").trim().slice(0, 240);
}
