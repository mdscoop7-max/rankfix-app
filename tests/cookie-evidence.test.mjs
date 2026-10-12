import test from "node:test";
import assert from "node:assert/strict";
import { detectCookieInformation } from "../lib/cookie-evidence.ts";

const page = (body) => `<!doctype html><html><head><title>t</title></head><body>${body}</body></html>`;

test("a cookie link is the strongest evidence", () => {
  const r = detectCookieInformation({ html: page(""), hasCookieLink: true, cookieLinkDetail: '"Cookies" → /cookies' });
  assert.deepEqual([r.found, r.source], [true, "link"]);
});

test("consent platforms count as cookie information", () => {
  for (const [vendor, html] of [
    ["Cookiebot", '<script id="Cookiebot" src="https://consent.cookiebot.com/uc.js"></script>'],
    ["OneTrust", '<script src="https://cdn.cookielaw.org/scripttemplates/otSDKStub.js"></script>'],
    ["Didomi", '<script>window.didomiConfig={}</script><script src="https://sdk.privacy-center.org/loader.js"></script>'],
    ["Usercentrics", '<script src="https://app.usercentrics.eu/browser-ui/latest/loader.js"></script>'],
    ["Complianz", '<div id="cmplz-cookiebanner-container"></div>'],
    ["IAB TCF", "<script>window.__tcfapi=function(){}</script>"],
  ]) {
    const r = detectCookieInformation({ html: page(html), hasCookieLink: false });
    assert.equal(r.source, "cmp", vendor);
    assert.match(r.detail, new RegExp(vendor === "IAB TCF" ? "IAB TCF" : vendor));
  }
});

test("a generic consent banner or cookie-settings control counts", () => {
  assert.equal(detectCookieInformation({ html: page('<div class="cookie-banner">We gebruiken cookies</div>'), hasCookieLink: false }).source, "banner");
  assert.equal(detectCookieInformation({ html: page('<button type="button">Cookie-instellingen</button>'), hasCookieLink: false }).source, "control");
  assert.equal(detectCookieInformation({ html: page('<button aria-label="Cookievoorkeuren wijzigen"></button>'), hasCookieLink: false }).source, "control");
});

test("privacy statement that covers cookies counts", () => {
  const r = detectCookieInformation({ html: page(""), hasCookieLink: false, privacyStatementMentionsCookies: true });
  assert.equal(r.source, "privacy_statement");
});

test("nothing detected is reported as not found, never as proof of absence", () => {
  const r = detectCookieInformation({ html: page("<footer><a href='/privacy'>Privacy</a></footer>"), hasCookieLink: false });
  assert.deepEqual([r.found, r.source], [false, null]);
});

test("the word 'cookie' in a product name is not a consent control", () => {
  const r = detectCookieInformation({ html: page("<h2>Cookie jar met deksel</h2><p>Bewaar je cookies vers.</p>"), hasCookieLink: false });
  assert.equal(r.found, false);
});

test("scanner: a cookies-only gap is unable to confirm, not a warning", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
  assert.match(source, /hasPrivacyLink && hasContactLink && !hasCookieInfo\s*\n[^\n]*\n[^\n]*\n[^\n]*\n\s*\? check\("unable_to_confirm","trust_legal_signals"/);
  assert.match(source, /const cookieOk = hasCookieInfo \|\| Boolean\(cookiePage\);/);
  assert.match(source, /privacyOk && contactOk && !cookieOk && trustLegalCheck\.status==="warning"/);
});
