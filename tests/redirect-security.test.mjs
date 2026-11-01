import test from "node:test";
import assert from "node:assert/strict";
import { createRedirectCookies } from "../lib/redirect-cookies.ts";
import { safePublicFetch } from "../lib/safe-fetch.ts";
import { linkOutcome, brokenLinkSummary } from "../lib/link-status.ts";
const u = s => new URL(s);

test("redirect cookies cannot leak to sibling hosts or sites sharing a public suffix", () => {
  for (const [from, to] of [["https://a.co.uk/", "https://b.co.uk/"], ["https://a.example.com/", "https://b.example.com/"], ["https://www.example.com/", "https://example.com/"], ["https://a.test/", "https://a.test.evil.test/"]]) {
    const jar = createRedirectCookies();
    jar.accept(u(from), ["session=secret; Path=/", "other=x; Domain=" + u(from).hostname.split('.').slice(1).join('.') + "; Path=/"]);
    assert.match(jar.header(u(from)), /session=secret/);
    assert.equal(jar.header(u(to)), "", to);
  }
});
test("redirect cookie path, secure, expiry, deletion, bad domain and prefix rules", () => {
  const jar = createRedirectCookies();
  jar.accept(u("https://a.test/private/start"), ["root=1; Path=/; Secure", "private=2", "wrong=3; Domain=other.test", "expired=4; Max-Age=0", "__Host-bad=5; Secure; Domain=a.test; Path=/"], 1000);
  assert.equal(jar.header(u("https://a.test/private/next"), 1000), "private=2; root=1");
  assert.equal(jar.header(u("https://a.test/private-ish"), 1000), "root=1");
  assert.equal(jar.header(u("http://a.test/"), 1000), "");
  jar.accept(u("https://a.test/"), ["root=; Path=/; Max-Age=0"], 1000);
  assert.equal(jar.header(u("https://a.test/"), 1000), "");
  jar.accept(u("https://a.test/"), ["short=1; Max-Age=1; Path=/"], 1000);
  assert.equal(jar.header(u("https://a.test/"), 2000), "");
});
test("real safe fetch keeps same-host redirect cookies but never forwards them to another host", async () => {
  const original = globalThis.fetch; const seen = [];
  try {
    globalThis.fetch = async (url, init) => {
      const cookie = new Headers(init.headers).get("cookie"); seen.push({ url: String(url), cookie });
      if (seen.length === 1) return new Response(null, {status:302,headers:{location:"/next","set-cookie":"session=1; Secure; Path=/"}});
      if (seen.length === 2) return new Response(null, {status:302,headers:{location:"https://8.8.216.34/"}});
      return new Response("done");
    };
    await safePublicFetch("https://93.184.216.34/");
    assert.equal(seen[1].cookie, "session=1");
    assert.equal(seen[2].cookie, null);
  } finally { globalThis.fetch = original; }
});
test("503 challenge stays unconfirmed; a repeated plain server error remains a server error", () => {
  for (const status of [200,403,429,500,503]) assert.equal(linkOutcome({url:"https://a.test/page",status,error:false,challenged:true}), "unconfirmed");
  assert.equal(linkOutcome({url:"https://a.test/page",status:503,error:false}), "server_error");
  const check = brokenLinkSummary([{url:"https://a.test/page",status:503,error:false,challenged:true}], "https://a.test/");
  assert.equal(check.status, "unable_to_confirm"); assert.equal(check.serverErrors, 0);
});
