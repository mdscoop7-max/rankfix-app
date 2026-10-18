import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { wwwVariantAfterDnsMiss } from "../lib/safe-fetch.ts";

// RankFix 3.6 (G12, pilot case: a bare domain without a DNS record while the
// www host serves the site). One www/bare variant is tried only after a
// definitive NXDOMAIN; temporary DNS errors and blocked addresses never trigger it.

const nx = () => Object.assign(new Error("getaddrinfo ENOTFOUND"), { code: "ENOTFOUND" });
const dnsWith = (known, failures = {}) => async (host) => {
  if (failures[host]) throw failures[host];
  if (!known.includes(host)) throw nx();
};

test("3.6 DNS: a bare host without DNS falls back to www, path and query kept", async () => {
  const v = await wwwVariantAfterDnsMiss(new URL("https://example-site.test/fr/page?x=1"), dnsWith(["www.example-site.test"]));
  assert.equal(v?.toString(), "https://www.example-site.test/fr/page?x=1");
});

test("3.6 DNS: a www host without DNS falls back to the bare host", async () => {
  const v = await wwwVariantAfterDnsMiss(new URL("https://www.example-site.test/"), dnsWith(["example-site.test"]));
  assert.equal(v?.hostname, "example-site.test");
});

test("3.6 DNS: no fallback when the original resolves, when neither resolves, or on temporary errors", async () => {
  assert.equal(await wwwVariantAfterDnsMiss(new URL("https://ok.test/"), dnsWith(["ok.test", "www.ok.test"])), null);
  assert.equal(await wwwVariantAfterDnsMiss(new URL("https://gone.test/"), dnsWith([])), null);
  const temporary = Object.assign(new Error("getaddrinfo EAI_AGAIN"), { code: "EAI_AGAIN" });
  assert.equal(await wwwVariantAfterDnsMiss(new URL("https://flaky.test/"), dnsWith(["www.flaky.test"], { "flaky.test": temporary })), null);
});

test("3.6 DNS: a blocked (private) address never triggers or passes the fallback", async () => {
  const blocked = new Error("URL_DNS_BLOCKED");
  assert.equal(await wwwVariantAfterDnsMiss(new URL("https://internal.test/"), dnsWith(["www.internal.test"], { "internal.test": blocked })), null);
  assert.equal(await wwwVariantAfterDnsMiss(new URL("https://bare.test/"), dnsWith([], { "www.bare.test": blocked })), null);
  assert.equal(await wwwVariantAfterDnsMiss(new URL("https://93.184.216.34/"), async () => { throw nx(); }), null);
});

test("3.6 DNS: safePublicFetch tries the variant once, on the first hop, and still checks it", () => {
  const src = readFileSync(new URL("../lib/safe-fetch.ts", import.meta.url), "utf8");
  assert.match(src, /if \(redirect === 0\) \{\s*const dnsFallbackUrl = await wwwVariantAfterDnsMiss\(current, assertPublicDns\);/);
  assert.match(src, /\}\s*await assertPublicDns\(current\.hostname\);/);
  assert.match(src, /return \{ response, finalUrl: current, redirectChain, dnsFallback \}/);
});
