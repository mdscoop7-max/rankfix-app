// 1 Nov 2026 (security 5): redirect cookies under the browser rules (RFC 6265).
import test from "node:test";
import assert from "node:assert/strict";
import { RedirectCookieJar } from "../lib/redirect-cookies.ts";

const U = (s) => new URL(s);

test("host-only cookies stay on their host; Domain cookies cover subdomains", () => {
  const jar = new RedirectCookieJar();
  jar.store(U("https://shop.example.com/a"), ["host=1; Path=/", "dom=2; Domain=example.com; Path=/"]);
  assert.equal(jar.header(U("https://shop.example.com/x")), "host=1; dom=2");
  assert.equal(jar.header(U("https://www.example.com/x")), "dom=2");
  assert.equal(jar.header(U("https://example.com/")), "dom=2");
});

test("never to another site, also under multi-label public suffixes (co.uk, com.au)", () => {
  const jar = new RedirectCookieJar();
  jar.store(U("https://shop.co.uk/"), ["a=1; Path=/", "b=2; Domain=co.uk; Path=/"]);
  assert.equal(jar.header(U("https://other.co.uk/")), null, "a public suffix Domain is rejected, host-only stays on shop.co.uk");
  assert.equal(jar.header(U("https://shop.co.uk/")), "a=1");
  const au = new RedirectCookieJar();
  au.store(U("https://www.brand.com.au/"), ["c=3; Domain=brand.com.au; Path=/"]);
  assert.equal(au.header(U("https://checkout.brand.com.au/")), "c=3");
  assert.equal(au.header(U("https://evil.com.au/")), null);
  const other = new RedirectCookieJar();
  other.store(U("https://a.example.com/"), ["x=1; Domain=example.org"]);
  assert.equal(other.header(U("https://example.org/")), null, "a Domain that does not cover the setting host is rejected");
});

test("Secure cookies never over HTTP; Path is respected; expired cookies are removed", () => {
  const jar = new RedirectCookieJar(() => Date.parse("2026-11-01T12:00:00Z"));
  jar.store(U("https://example.com/shop/cart"), ["s=1; Secure; Path=/", "p=2; Path=/shop", "d=3"]);
  assert.equal(jar.header(U("http://example.com/")), null, "secure and path-limited cookies are not sent to http:/");
  assert.equal(jar.header(U("https://example.com/shop/x")), "p=2; d=3; s=1");
  assert.equal(jar.header(U("https://example.com/shopping")), "s=1", "/shop does not match /shopping");
  jar.store(U("https://example.com/"), ["s=gone; Max-Age=0; Secure; Path=/", "p=old; Path=/shop; Expires=Thu, 01 Jan 2026 00:00:00 GMT"]);
  assert.equal(jar.header(U("https://example.com/shop/x")), "d=3");
  // A Secure cookie cannot be set over HTTP.
  const http = new RedirectCookieJar();
  http.store(U("http://example.com/"), ["t=1; Secure"]);
  assert.equal(http.header(U("https://example.com/")), null);
});

test("safePublicFetch uses the jar (no last-two-labels shortcut left)", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../lib/safe-fetch.ts", import.meta.url), "utf8");
  assert.match(src, /new RedirectCookieJar\(\)/);
  assert.match(src, /cookieJar\.store\(current, setCookies\)/);
  assert.doesNotMatch(src, /registrableTail/);
});
