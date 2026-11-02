/**
 * Detects client libraries with a known end-of-life or security-fixed version from
 * script URLs and file names. Only versions that appear literally in a URL/file name are reported.
 */
export type OutdatedLibrary = { name: string; version: string; minimumSafe: string; reason: string };

function cmp(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
}

const RULES: Array<{ name: string; patterns: RegExp[]; minimumSafe: string; reason: string }> = [
  { name: "jQuery", patterns: [/jquery[-.@/](\d+\.\d+(?:\.\d+)?)(?:\.min)?\.js/i, /jquery\/(\d+\.\d+(?:\.\d+)?)\/jquery/i], minimumSafe: "3.5.0", reason: "versies onder 3.5.0 hebben bekende XSS-kwetsbaarheden (CVE-2020-11022/11023)" },
  { name: "jQuery UI", patterns: [/jquery[-.]?ui[-.@/](\d+\.\d+(?:\.\d+)?)/i, /jqueryui\/(\d+\.\d+(?:\.\d+)?)\//i], minimumSafe: "1.13.2", reason: "versies onder 1.13.2 hebben bekende XSS-kwetsbaarheden" },
  { name: "Bootstrap", patterns: [/bootstrap[-.@/](\d+\.\d+(?:\.\d+)?)(?:\.min)?\.(?:js|css)/i, /bootstrap\/(\d+\.\d+(?:\.\d+)?)\/(?:js|css)/i], minimumSafe: "4.6.0", reason: "oudere versies hebben bekende XSS-kwetsbaarheden en geen onderhoud meer" },
  { name: "AngularJS", patterns: [/angular(?:js)?[-.@/](1\.\d+(?:\.\d+)?)(?:\.min)?\.js/i, /angularjs\/(1\.\d+(?:\.\d+)?)\//i], minimumSafe: "99.0.0", reason: "AngularJS 1.x is sinds 2022 end-of-life en krijgt geen beveiligingsupdates" },
  { name: "Moment.js", patterns: [/moment(?:\.js)?[-.@/](2\.(?:[0-9]|1\d|2[0-8])(?:\.\d+)?)(?:\.min)?\.js/i], minimumSafe: "2.29.4", reason: "versies onder 2.29.4 hebben bekende ReDoS/path-traversal-kwetsbaarheden" },
  { name: "Lodash", patterns: [/lodash(?:\.js)?[-.@/](4\.(?:\d|1[0-6])\.\d+)(?:\.min)?\.js/i], minimumSafe: "4.17.21", reason: "versies onder 4.17.21 hebben bekende prototype-pollution-kwetsbaarheden" },
];

export function detectOutdatedLibraries(html: string): OutdatedLibrary[] {
  const urls = [...html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]);
  const found = new Map<string, OutdatedLibrary>();
  for (const url of urls) {
    for (const rule of RULES) {
      for (const pattern of rule.patterns) {
        const match = pattern.exec(url);
        if (!match) continue;
        const version = match[1];
        if (cmp(version, rule.minimumSafe) < 0) found.set(rule.name, { name: rule.name, version, minimumSafe: rule.minimumSafe, reason: rule.reason });
        break;
      }
    }
  }
  return [...found.values()];
}
