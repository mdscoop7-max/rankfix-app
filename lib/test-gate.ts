// Password gate for a separate test deployment (for example a Render test service).
// Only active when RANKFIX_TEST_GATE_PASSWORD is set; production never sets it, so
// production behaviour is unchanged. Uses HTTP Basic auth so a browser shows its
// own login prompt and no app code or account is reachable before it.

export type GateDecision = "open" | "allow" | "challenge";

function constantTimeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

/** "open" when no gate is configured, "allow" for the right credentials, else "challenge". */
export function testGateDecision(authorization: string | null, password: string | undefined, user = "rankfix"): GateDecision {
  const expected = (password || "").trim();
  if (!expected) return "open";
  const match = /^Basic\s+([A-Za-z0-9+/=]+)$/i.exec((authorization || "").trim());
  if (!match) return "challenge";
  let decoded = "";
  try { decoded = atob(match[1]); } catch { return "challenge"; }
  const sep = decoded.indexOf(":");
  if (sep < 0) return "challenge";
  const okUser = constantTimeEqual(decoded.slice(0, sep), user);
  const okPass = constantTimeEqual(decoded.slice(sep + 1), expected);
  return okUser && okPass ? "allow" : "challenge";
}
