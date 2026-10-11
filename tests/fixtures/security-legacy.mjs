// Frozen copy of the passive security logic on main (f53c0a5), regex text copied
// verbatim, including the double-escaped patterns that never matched. Used only to
// document security results before and after the fixes on the test branch.
const splitLegacy = (header) => {
  const out = []; let from = 0; let inExpires = false;
  for (let i = 0; i < header.length; i++) {
    const tail = header.slice(i).toLowerCase();
    if (tail.startsWith("expires=")) inExpires = true;
    if (inExpires && header[i] === ";") inExpires = false;
    if (!inExpires && header[i] === "," && /^\\s*[^;,=\\s]+=[^;,]*/.test(header.slice(i+1))) { out.push(header.slice(from,i).trim()); from=i+1; }
  }
  out.push(header.slice(from).trim());
  return out.filter(Boolean);
};
const award = (status, points, max) => status === "pass" ? Math.min(points, max) : status === "warning" ? Math.min(points, Math.max(0, max - 1)) : 0;
const r = (status, points, max) => ({ status, points: award(status, points, max), maxPoints: max });

export function legacyPassiveSecurity({ isHttps, html, pageUrl, joinedSetCookie }) {
  const mixed = isHttps ? [...html.matchAll(new RegExp("(?:src|href)\\\\s*=\\\\s*[\\\"']http://[^\\\"'\\\\s>]+[\\\"']", "gi"))].map((m)=>m[0]).slice(0,5) : [];
  const mixedContent = !isHttps ? r("not_applicable",0,4) : mixed.length === 0 ? r("pass",4,4) : r("fail",4,4);
  const cookies = (joinedSetCookie ? splitLegacy(joinedSetCookie) : []).map((raw) => {
    const name = (raw.split(";")[0] || "").split("=")[0]?.trim() || "cookie";
    const sameSiteMatch = raw.match(/(?:^|;\\s*)samesite=(lax|strict|none)(?:;|$)/i);
    const antiCsrf = /(?:csrf|xsrf|verification[-_]?token|requestverificationtoken)/i.test(name);
    return { name, secure: /(?:^|;\\s*)secure(?:;|$)/i.test(raw), httpOnly: /(?:^|;\\s*)httponly(?:;|$)/i.test(raw), sameSite: sameSiteMatch ? sameSiteMatch[1].toLowerCase() : "missing",
      sessionLike: !antiCsrf && /(?:^|[-_.])(session|sess|auth|jwt|login|sid)(?:$|[-_.])/i.test(name) };
  });
  const issues = cookies.filter((c)=>isHttps && !c.secure).length + cookies.filter((c)=>c.sameSite==="missing").length + cookies.filter((c)=>c.sessionLike && !c.httpOnly).length;
  const cookieFlags = !joinedSetCookie ? r("unable_to_confirm",0,5) : issues === 0 ? r("pass",5,5) : r("warning",Math.max(1,5-Math.min(4,issues)),5);
  const forms = [...html.matchAll(new RegExp("<form\\\\b[\\\\s\\\\S]*?</form>", "gi"))].map((m)=>m[0]);
  const insecure = forms.filter((form)=>new RegExp("action\\\\s*=\\\\s*[\\\"']http://", "i").test(form)).length;
  const formsResult = forms.length === 0 ? r("not_applicable",0,5) : insecure > 0 ? r("fail",5,5) : isHttps ? r("pass",5,5) : r("warning",2,5);
  const secretPatterns = [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i, /\\bAKIA[0-9A-Z]{16}\\b/, /\\bgh[pousr]_[A-Za-z0-9_]{20,}\\b/, /authorization\\s*[:=]\\s*["']?bearer\\s+[A-Za-z0-9._~-]{20,}/i];
  const secretLabels = ['private key', 'AWS access key', 'GitHub token', 'generic bearer token'].filter((_, i) => secretPatterns[i].test(html));
  const exposedSecrets = secretLabels.length ? r("fail",8,8) : r("pass",8,8);
  const page = new URL(pageUrl);
  const scripts = [...html.matchAll(/<script\\b[^>]*\\bsrc\\s*=\\s*["']([^"']+)["'][^>]*>/gi)].map((m)=>({tag:m[0],src:m[1]}));
  const cross = scripts.filter((s)=>{ try { return new URL(s.src,page).origin !== page.origin; } catch { return false; } });
  const missing = cross.filter((s)=>!/\\bintegrity\\s*=/i.test(s.tag));
  const scriptIntegrity = cross.length === 0 ? r("pass",4,4) : missing.length === 0 ? r("pass",4,4) : r("warning",2,4);
  return { mixedContent, cookieFlags, forms: formsResult, exposedSecrets, scriptIntegrity, detail: { mixed, cookies, forms: forms.length, insecure, secretLabels, crossOrigin: cross.length } };
}
