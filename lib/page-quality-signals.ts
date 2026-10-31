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
export function ymylExpertiseEvidence(input: { text: string; navigation: string[]; schemaTypes: string[] }): string[] {
  const t = input.text, nav = input.navigation.join(" | ");
  const found: string[] = [];
  if (/(over ons|about us|über uns|qui sommes|chi siamo|quiénes somos|sobre nós|organisatie|organisation|organization|unternehmen)/iu.test(nav)) found.push("over-ons/organisatiepagina in navigatie");
  if (/(specialisten|artsen|medisch specialist|behandelaars|ons team|our team|unser team|notre équipe|il nostro team|nuestro equipo|doctors|physicians|ärzte|médecins|medici|médicos|advocaten|lawyers|anwälte|avocats|avvocati|abogados|adviseurs|advisors|berater)/iu.test(t + " " + nav)) found.push("team/specialisten genoemd");
  if (/(\bbig[- ]?(?:nummer|registratie|register)\b|\bagb[- ]?code\b|\bafm\b|\bdnb\b|\bkifid\b|\bwft\b|\bbafin\b|\bfca\b|\bfinma\b|\bacpr\b|\bconsob\b|nederlandse orde van advocaten|rechtsanwaltskammer|barreau|ordine degli avvocati|\bjci\b|\bniaz\b|qualitätszertifikat|accredit|geaccrediteerd|akkreditiert|vergunning|licen[cs]e[d]? by|zugelassen|registered with|ingeschreven bij|e-money institution|elektronischgeldinstelling|betaalinstelling|payment institution|zahlungsinstitut|établissement de paiement)/iu.test(t)) found.push("vergunning, registratie of accreditatie genoemd");
  if (input.schemaTypes.some((s) => /^(hospital|medicalorganization|physician|dentist|legalservice|attorney|financialservice|bankorcreditunion|insuranceagency|accountingservice|medicalclinic)$/i.test(s))) found.push("sectorspecifiek organisatieschema");
  return found;
}
