// 31 Oct 2026 (PDF P10): one "Beveiliging en toegankelijkheid" action block,
// sorted by impact. It only reuses findings that the passive security and
// accessibility checks proved (status warning/fail with evidence); unconfirmed or
// N.v.t. items never become actions. Examples are generic configuration snippets.

export type ActionCheck = { key: string; title: string; status: string; message: string; fix?: string; points?: number; maxPoints?: number };
export type SecurityAccessAction = { key: string; area: "security" | "accessibility"; impact: "high" | "medium" | "low"; status: "fail" | "warning"; title: string; evidence: string; action: string; examples: string[] };

const HEADER_EXAMPLES: Record<string, string> = {
  hsts: "Strict-Transport-Security: max-age=31536000; includeSubDomains",
  contentTypeOptions: "X-Content-Type-Options: nosniff",
  csp: "Content-Security-Policy-Report-Only: default-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'  (eerst als Report-Only testen)",
  frameOptions: "X-Frame-Options: SAMEORIGIN",
  referrerPolicy: "Referrer-Policy: strict-origin-when-cross-origin",
  permissionsPolicy: "Permissions-Policy: camera=(), microphone=(), geolocation=()",
};
// Order inside the header action: protection value first.
const HEADER_ORDER = ["hsts", "contentTypeOptions", "csp", "frameOptions", "referrerPolicy", "permissionsPolicy"];

const HIGH = new Set(["security_https", "security_mixed_content", "security_exposed_secrets", "security_forms", "viewport_zoom_blocked"]);
const LOW = new Set(["security_script_integrity"]);

function impactOf(c: ActionCheck): SecurityAccessAction["impact"] {
  if (c.status === "fail" || HIGH.has(c.key)) return "high";
  if (LOW.has(c.key)) return "low";
  // Headers: only "high" when the transport-level header (HSTS) is missing.
  return "medium";
}

export function securityAccessibilityActions(input: { securityChecks?: ActionCheck[]; accessibilityChecks?: ActionCheck[]; missingHeaders?: string[]; isHttps?: boolean }): SecurityAccessAction[] {
  const out: SecurityAccessAction[] = [];
  const add = (c: ActionCheck, area: SecurityAccessAction["area"]) => {
    if (c.status !== "fail" && c.status !== "warning") return;
    if (!c.message) return;
    const examples = c.key === "security_headers"
      ? HEADER_ORDER.filter((h) => (input.missingHeaders || []).includes(h) && !(h === "hsts" && input.isHttps === false)).map((h) => HEADER_EXAMPLES[h])
      : [];
    let impact = impactOf(c);
    if (c.key === "security_headers" && (input.missingHeaders || []).includes("hsts") && input.isHttps !== false) impact = "high";
    out.push({ key: c.key, area, impact, status: c.status as "fail" | "warning", title: c.title, evidence: c.message, action: c.fix || "", examples });
  };
  for (const c of input.securityChecks || []) add(c, "security");
  for (const c of input.accessibilityChecks || []) add(c, "accessibility");
  const rank = { high: 0, medium: 1, low: 2 } as const;
  return out.sort((a, b) => rank[a.impact] - rank[b.impact] || (a.status === b.status ? 0 : a.status === "fail" ? -1 : 1) || (a.area === b.area ? 0 : a.area === "security" ? -1 : 1));
}

export const IMPACT_LABEL_NL: Record<SecurityAccessAction["impact"], string> = { high: "Hoge impact", medium: "Middelhoge impact", low: "Lage impact" };
