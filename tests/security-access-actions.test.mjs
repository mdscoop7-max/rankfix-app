// PDF P10: action block for security and accessibility, sorted by impact.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { securityAccessibilityActions } from "../lib/security-access-actions.ts";

test("only proven findings become actions, sorted by impact, with header examples", () => {
  const actions = securityAccessibilityActions({
    isHttps: true,
    missingHeaders: ["hsts", "contentTypeOptions", "csp", "permissionsPolicy"],
    securityChecks: [
      { key: "security_https", title: "HTTPS", status: "pass", message: "ok" },
      { key: "security_script_integrity", title: "Externe scripts", status: "warning", message: "2 scripts zonder integrity", fix: "SRI" },
      { key: "security_headers", title: "Security headers", status: "warning", message: "2 van 6 headers", fix: "Voeg headers toe" },
      { key: "security_cookie_flags", title: "Cookie-beveiliging", status: "unable_to_confirm", message: "geen Set-Cookie" },
      { key: "security_outdated_libraries", title: "Verouderde bibliotheken", status: "warning", message: "jQuery 3.4.1", fix: "Bijwerken" },
      { key: "security_mixed_content", title: "Mixed content", status: "fail", message: "1 HTTP-bron", fix: "HTTPS" },
    ],
    accessibilityChecks: [
      { key: "viewport_zoom_blocked", title: "Zoomen geblokkeerd", status: "warning", message: "user-scalable=0", fix: "Sta zoomen toe" },
      { key: "accessibility_basics", title: "Basis", status: "not_applicable", message: "n.v.t." },
    ],
  });
  assert.deepEqual(actions.map((a) => `${a.impact}:${a.key}`), [
    "high:security_mixed_content", "high:security_headers", "high:viewport_zoom_blocked",
    "medium:security_outdated_libraries", "low:security_script_integrity",
  ]);
  const headers = actions.find((a) => a.key === "security_headers");
  assert.deepEqual(headers.examples.map((e) => e.split(":")[0]), ["Strict-Transport-Security", "X-Content-Type-Options", "Content-Security-Policy-Report-Only", "Permissions-Policy"]);
  assert.match(headers.evidence, /2 van 6/);
});

test("no HSTS example on HTTP, and no actions without findings", () => {
  const a = securityAccessibilityActions({ isHttps: false, missingHeaders: ["hsts", "contentTypeOptions"], securityChecks: [{ key: "security_headers", title: "Security headers", status: "warning", message: "0 van 6" }] });
  assert.deepEqual(a[0].examples, ["X-Content-Type-Options: nosniff"]);
  assert.equal(a[0].impact, "medium");
  assert.deepEqual(securityAccessibilityActions({ securityChecks: [{ key: "security_https", title: "HTTPS", status: "pass", message: "ok" }] }), []);
});

test("scan route and report wire the block", () => {
  const route = readFileSync(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
  assert.equal((route.match(/securityAccessibilityActions: securityAccessibilityActions\(/g) || []).length, 2);
  assert.match(route, /missingHeaders: missingSecurityHeaders/);
  const report = readFileSync(new URL("../app/dashboard/audit/[id]/report/page.tsx", import.meta.url), "utf8");
  assert.match(report, /<SecurityAccessActions actions=\{r\.securityAccessibilityActions\}/);
});
