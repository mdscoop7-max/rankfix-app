// Behavioural tests for regular expressions that live inside large route files.
// The patterns are extracted from the real source and executed on realistic input,
// so a doubled escape (\\s, \\d, \\b — a literal backslash) can never silently turn
// an evidence check into "never matches" again.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const read = (rel) => readFile(path.join(root, rel), "utf8");

/** Parses the regex literal that starts at the first "/" after `anchor`. */
function literalAfter(source, anchor) {
  const at = source.indexOf(anchor);
  assert.ok(at >= 0, `anchor not found: ${anchor}`);
  let i = source.indexOf("/", at + anchor.length);
  const start = i++;
  let inClass = false;
  for (; i < source.length; i++) {
    const ch = source[i];
    if (ch === "\\") { i++; continue; }
    if (ch === "[") inClass = true;
    else if (ch === "]") inClass = false;
    else if (ch === "/" && !inClass) break;
  }
  const body = source.slice(start + 1, i);
  const flags = source.slice(i + 1).match(/^[dgimsuyv]*/)[0];
  return new RegExp(body, flags);
}

/** Evaluates the `new RegExp(...)` expression that follows `anchor`. */
function newRegExpAfter(source, anchor) {
  const at = source.indexOf(anchor);
  assert.ok(at >= 0, `anchor not found: ${anchor}`);
  const start = source.indexOf("new RegExp(", at);
  let depth = 0; let quote = null; let i = start + "new RegExp".length;
  for (; i < source.length; i++) {
    const ch = source[i];
    if (quote) { if (ch === "\\") { i++; continue; } if (ch === quote) quote = null; continue; }
    if (ch === '"' || ch === "'" || ch === "`") { quote = ch; continue; }
    if (ch === "(") depth++;
    if (ch === ")") { depth--; if (depth === 0) break; }
  }
  return new Function(`return ${source.slice(start, i + 1)}`)();
}

test("robots.txt is split into real lines so Disallow rules are recognised", async () => {
  const route = await read("app/api/scan/route.ts");
  const splitter = literalAfter(route, "const robotsGroups = robotsTxt\n      .split(");
  const lines = "User-agent: *\r\nDisallow: /private\nAllow: /\n".split(splitter);
  assert.deepEqual(lines.slice(0, 3), ["User-agent: *", "Disallow: /private", "Allow: /"]);
});

test("cookie security flags are detected per Set-Cookie record", async () => {
  const route = await read("app/api/scan/route.ts");
  const secure = literalAfter(route, "secure: ");
  const httpOnly = literalAfter(route, "httpOnly: ");
  const sameSite = literalAfter(route, "const sameSiteMatch = raw.match(");
  const strong = "sid=abc; Path=/; Secure; HttpOnly; SameSite=Lax";
  assert.equal(secure.test(strong), true);
  assert.equal(httpOnly.test(strong), true);
  assert.equal(strong.match(sameSite)?.[1].toLowerCase(), "lax");
  const weak = "sid=abc; Path=/; Max-Age=3600";
  assert.equal(secure.test(weak), false);
  assert.equal(httpOnly.test(weak), false);
  assert.equal(weak.match(sameSite), null);
  assert.equal(secure.test("sid=abc; secureflag=1"), false, "a cookie named like a flag is not the flag");
});

test("combined Set-Cookie fallback splits on a new cookie, not inside an Expires date", async () => {
  const route = await read("app/api/scan/route.ts");
  const nextCookie = literalAfter(route, `header[i] === "," && `);
  assert.equal(nextCookie.test(" b=2; Path=/"), true);
  assert.equal(nextCookie.test(" 21 Oct 2026 07:28:00 GMT"), false);
});

test("mixed content, password forms and insecure form actions are detected", async () => {
  const route = await read("app/api/scan/route.ts");
  const mixed = newRegExpAfter(route, "const mixedContentMatches");
  assert.equal([...`<img src="http://cdn.example.com/a.png"><script src='http://x.example/app.js'></script>`.matchAll(mixed)].length, 2);
  assert.equal([...`<img src="https://cdn.example.com/a.png"><a href="/http://not">x</a>`.matchAll(mixed)].length, 0);
  const forms = newRegExpAfter(route, "const forms = [...html.matchAll(");
  const html = `<form action="http://evil.example/login"><input type="password" name="p"></form><form action="/search"><input name="q"></form>`;
  const found = [...html.matchAll(forms)].map(m => m[0]);
  assert.equal(found.length, 2);
  const password = newRegExpAfter(route, "const passwordForm = forms.some(");
  const insecure = newRegExpAfter(route, "const insecureFormActions = forms.filter(");
  assert.equal(found.filter(form => password.test(form)).length, 1);
  assert.equal(found.filter(form => insecure.test(form)).length, 1);
});

test("exposed secret patterns match real token shapes and not normal text", async () => {
  const route = await read("app/api/scan/route.ts");
  const aws = literalAfter(route, `label:"AWS access key", re:`);
  const gh = literalAfter(route, `label:"GitHub token", re:`);
  const bearer = literalAfter(route, `label:"generic bearer token", re:`);
  assert.equal(aws.test("key=AKIAABCDEFGHIJKLMNOP;"), true);
  assert.equal(aws.test("XAKIAABCDEFGHIJKLMNOP"), false, "word boundary");
  assert.equal(gh.test("token ghp_" + "a".repeat(30)), true);
  assert.equal(bearer.test(`headers: { Authorization: "Bearer ${"x".repeat(32)}" }`), true);
  assert.equal(bearer.test("Authorization is required"), false);
});

test("external scripts are found and Subresource Integrity is recognised", async () => {
  const route = await read("app/api/scan/route.ts");
  const scripts = literalAfter(route, "const externalScriptTags = [...html.matchAll(");
  const integrity = literalAfter(route, "const crossOriginWithoutSri = crossOriginScripts.filter((item)=>!");
  const html = `<script src="https://cdn.example.com/a.js"></script><script async src='https://cdn.example.com/b.js' integrity="sha384-x"></script><script>inline()</script>`;
  const tags = [...html.matchAll(scripts)];
  assert.equal(tags.length, 2);
  assert.deepEqual(tags.map(m => integrity.test(m[0])), [false, true]);
});

test("Dutch phone numbers and addresses are recognised as business identity", async () => {
  const route = await read("app/api/scan/route.ts");
  const phone = literalAfter(route, "const phoneMatch = text.match(");
  const address = literalAfter(route, "const addressMatch = text.match(");
  assert.ok("Bel ons op 06 12345678 vandaag".match(phone));
  assert.ok("Telefoon: +31 6 12 34 56 78".match(phone));
  assert.ok("Telefoon 020-1234567".match(phone));
  assert.equal("Openingstijden ma-vr".match(phone), null);
  const hit = "Bezoek ons: Dorpsstraat 12 1234 AB Utrecht.".match(address);
  assert.ok(hit);
  assert.equal(hit[2], "1234 AB");
});

test("sector capability signals match their own vocabulary with word boundaries", async () => {
  const route = await read("app/api/scan/route.ts");
  const workshop = literalAfter(route, "const workshopSignal = ");
  assert.equal(workshop.test("plan uw apk en onderhoud"), true);
  assert.equal(workshop.test("bandenservice"), false, "whole words only");
  const menu = literalAfter(route, "const menuSignal = ");
  assert.equal(menu.test("bekijk de menukaart"), true);
  const listing = literalAfter(route, "const listingSignal = (");
  assert.equal(listing.test("woningaanbod te koop in Utrecht"), true);
  const author = literalAfter(route, "const authorSignal = schemaSet.has(\"person\") || ");
  assert.equal(author.test("Geschreven door Émile Janssen"), true);
  assert.equal(author.test("door de week open"), false, "needs a capitalised name");
  assert.equal(author.test("By Anna de Vries"), true);
  const email = literalAfter(route, "const emailMatch = text.match(");
  assert.ok("Mail info@bakkerij-jansen.nl voor vragen".match(email));
  assert.equal("geen adres hier".match(email), null);
});

test("representative page structure counts tags with a word boundary and detects 5xx reasons", async () => {
  const route = await read("app/api/scan/route.ts");
  const countTagLine = route.slice(route.indexOf("const countTag = (tag:string)"), route.indexOf("const pageStructureKey"));
  const make = new Function("tag", `return ${countTagLine.slice(countTagLine.indexOf("new RegExp("), countTagLine.indexOf(")||[]") )}`);
  assert.equal(("<h1>a</h1><h1 class='x'>b</h1><h10>c</h10>".match(make("h1")) || []).length, 2);
  const marker = route.indexOf(": /5");
  assert.ok(marker > 0);
  const fiveXX = literalAfter(route.slice(marker - 1), ":");
  assert.equal(fiveXX.source, "5\\d\\d");
  assert.equal(fiveXX.test("HTTP 503"), true);
  assert.equal(fiveXX.test("HTTP 404"), false);
});

test("www. prefixes are stripped consistently for host comparison", async () => {
  for (const rel of ["app/api/scan/route.ts", "app/dashboard/page.tsx"]) {
    const source = await read(rel);
    const at = source.indexOf(".replace(/^www");
    assert.ok(at > 0, `${rel} strips www.`);
    const www = literalAfter(source.slice(at), ".replace(");
    assert.equal("www.example.nl".replace(www, ""), "example.nl");
    assert.equal("wwwx.example.nl".replace(www, ""), "wwwx.example.nl");
    assert.equal(source.includes(".replace(/^www\\\\./"), false, `${rel} still has a doubled escape`);
  }
});

test("password reset accepts a normal strong password (digit check is a real digit class)", async () => {
  const source = await read("app/api/auth/reset-password/route.ts");
  const digit = literalAfter(source, "/[A-Za-z]/.test(password) && ");
  assert.equal(digit.test("Wachtwoord1!"), true);
  assert.equal(digit.test("Wachtwoord!!"), false);
});

test("Fix Engine recognises icon assets so they are never used as content images", async () => {
  const source = await read("app/api/github/fix/route.ts");
  const icon = literalAfter(source, ")/i.test(normalized)\n      || ");
  for (const value of ["/icon-192.png", "/assets/icon192x192.webp", "icon.svg"]) assert.equal(icon.test(value), true, value);
  for (const value of ["/images/hero.png", "/iconic-sofa.jpg", "/blog/icon-design.html"]) assert.equal(icon.test(value), false, value);
});

test("no regex literal or new RegExp string in app/, lib/ or components/ contains a doubled escape", async () => {
  const require = createRequire(import.meta.url);
  const ts = require(path.join(root, "node_modules/typescript"));
  const DOUBLE = /\\\\[bdswrnpBDSW.]/;
  const files = [];
  const walk = async (dir) => {
    for (const entry of await readdir(path.join(root, dir), { withFileTypes: true })) {
      const rel = path.join(dir, entry.name);
      if (entry.isDirectory()) { if (!["node_modules", ".next"].includes(entry.name)) await walk(rel); }
      else if (/\.(ts|tsx)$/.test(entry.name)) files.push(rel);
    }
  };
  await walk("app"); await walk("lib"); await walk("components");
  const offenders = [];
  for (const rel of files) {
    const text = await read(rel);
    const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, rel.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const visit = (node) => {
      if (node.kind === ts.SyntaxKind.RegularExpressionLiteral) {
        const raw = node.getText(sf);
        if (DOUBLE.test(raw.slice(1, raw.lastIndexOf("/")))) offenders.push(`${rel}:${sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1} ${raw.slice(0, 60)}`);
      }
      if (ts.isNewExpression(node) && node.expression.getText(sf) === "RegExp" && node.arguments?.length) {
        const arg = node.arguments[0];
        if ((ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) && DOUBLE.test(arg.text)) offenders.push(`${rel}:${sf.getLineAndCharacterOfPosition(arg.getStart(sf)).line + 1} ${arg.getText(sf).slice(0, 60)}`);
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  assert.deepEqual(offenders, [], "doubled escapes match a literal backslash and silently disable the check");
});

test("robots.txt rules are applied: SEO check sees Disallow, crawler obeys RankFixBot/* groups", async () => {
  const route = await read("app/api/scan/route.ts");
  const start = route.indexOf("    const robotsPath = finalUrl.pathname");
  const end = route.indexOf("    const htmlDeclaredSitemapUrls");
  assert.ok(start > 0 && end > start);
  const body = route.slice(start, end)
    .replace(/: Array<\{ agents: string\[\]; rules: Array<\{ kind: "allow" \| "disallow"; path: string \}> \}>/g, "")
    .replace(/ as "allow" \| "disallow"/g, "")
    .replace(/\(rulePath: string, candidatePath: string\)/g, "(rulePath, candidatePath)")
    .replace(/\(candidatePath: string\)/g, "(candidatePath)");
  const run = (robotsTxt, scannedPath) => new Function("robotsTxt", "finalUrl", "robotsStatus",
    `${body}\nreturn { robotsPathBlocked, robotsAllowsRankFix };`)(robotsTxt, new URL(`https://www.voorbeeld.nl${scannedPath}`), "PASS");

  const general = "User-agent: *\nDisallow: /account\nDisallow: /checkout\nAllow: /checkout/help\n";
  const a = run(general, "/");
  assert.equal(a.robotsPathBlocked, false);
  assert.equal(a.robotsAllowsRankFix("/account/orders"), false);
  assert.equal(a.robotsAllowsRankFix("/checkout"), false);
  assert.equal(a.robotsAllowsRankFix("/checkout/help"), true, "longest matching Allow wins");
  assert.equal(a.robotsAllowsRankFix("/producten/stoel"), true);
  assert.equal(run(general, "/account").robotsPathBlocked, true, "SEO check now sees the Disallow");

  const named = "User-agent: *\nDisallow: /\n\nUser-agent: RankFixBot\nDisallow: /intern\n";
  const b = run(named, "/");
  assert.equal(b.robotsAllowsRankFix("/producten"), true, "a group naming RankFixBot replaces the * group");
  assert.equal(b.robotsAllowsRankFix("/intern/x"), false);

  const googleOnly = "User-agent: Googlebot\nDisallow: /zoeken\n";
  assert.equal(run(googleOnly, "/").robotsAllowsRankFix("/zoeken"), true, "Googlebot-only rules do not bind RankFix");
});

test("representative crawl skips robots-disallowed pages and marks them unconfirmed", async () => {
  const route = await read("app/api/scan/route.ts");
  const audit = route.slice(route.indexOf("const auditMultiPage = async"), route.indexOf("const fetched = await safePublicFetch(page.url"));
  assert.match(audit, /if \(!robotsAllowsRankFix\(robotsCandidatePath\)\)/);
  assert.match(audit, /status:"unable_to_confirm"/);
  assert.match(audit, /key:"robots",status:"UNABLE_TO_CONFIRM"/);
});
