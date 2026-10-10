// Scanner network layer: HTTP status matrix, redirects, timeouts, TLS, DNS and SSRF.
// Uses local fixture servers and an injected resolver, so the tests are repeatable
// offline and never contact real websites.
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import https from "node:https";
import zlib from "node:zlib";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createSafeFetch, isBlockedAddress, isPrivateHost, validatePublicHttpUrl, readResponseTextLimited, SafeFetchError } from "../lib/safe-fetch.ts";
import { classifyHttpStatus, classifyFetchError, retryDecision, parseRetryAfter, scanFailureMessage, apiStatusForFailure, detectEdgeProvider, inputFailure } from "../lib/scan-failure.ts";

const LANGS = ["nl", "en", "de", "fr", "it", "es"];

function fixtureHandler(req, res) {
  const url = new URL(req.url, "http://fixture.test");
  const statusMatch = url.pathname.match(/^\/status\/(\d{3})$/);
  if (statusMatch) {
    const status = Number(statusMatch[1]);
    const headers = { "content-type": "text/html" };
    if (url.searchParams.get("retry")) headers["retry-after"] = url.searchParams.get("retry");
    if (url.searchParams.get("cf")) { headers["cf-ray"] = "abc"; headers.server = "cloudflare"; }
    res.writeHead(status, headers);
    res.end(status === 204 || status === 304 ? undefined : `<html><title>${status}</title></html>`);
    return;
  }
  switch (url.pathname) {
    case "/ok": res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end("<html><head><title>OK</title></head><body>hallo</body></html>"); return;
    case "/empty": res.writeHead(200, { "content-type": "text/html" }); res.end(""); return;
    case "/r1": res.writeHead(301, { location: "/r2" }); res.end(); return;
    case "/r2": res.writeHead(302, { location: "/r3" }); res.end(); return;
    case "/r3": res.writeHead(307, { location: "/r4" }); res.end(); return;
    case "/r4": res.writeHead(308, { location: "/ok" }); res.end(); return;
    case "/see-other": res.writeHead(303, { location: "/ok" }); res.end(); return;
    case "/loop-a": res.writeHead(302, { location: "/loop-b" }); res.end(); return;
    case "/loop-b": res.writeHead(302, { location: "/loop-a" }); res.end(); return;
    case "/no-location": res.writeHead(302); res.end(); return;
    case "/to-internal": res.writeHead(302, { location: "http://169.254.169.254/latest/meta-data/" }); res.end(); return;
    case "/to-ftp": res.writeHead(302, { location: "ftp://example.com/" }); res.end(); return;
    case "/to-port": res.writeHead(302, { location: "http://public.test:8443/" }); res.end(); return;
    case "/gzip": res.writeHead(200, { "content-type": "text/html", "content-encoding": "gzip" }); res.end(zlib.gzipSync("<html><title>gz</title></html>")); return;
    case "/br": res.writeHead(200, { "content-type": "text/html", "content-encoding": "br" }); res.end(zlib.brotliCompressSync("<html><title>br</title></html>")); return;
    case "/big": res.writeHead(200, { "content-type": "text/html" }); res.end("x".repeat(300_000)); return;
    case "/big-declared": res.writeHead(200, { "content-type": "text/html", "content-length": "99999999" }); res.end("x"); return;
    case "/slow-headers": return; // never answers
    case "/slow-body": res.writeHead(200, { "content-type": "text/html" }); res.write("<html>"); return; // never finishes
    case "/invalid-html": res.writeHead(200, { "content-type": "text/html" }); res.end("<html><head><title>Broken<body><div><p>unclosed"); return;
    case "/nonstandard": res.writeHead(999, { "content-type": "text/html" }); res.end("blocked"); return;
    case "/reset": req.socket.destroy(); return;
    default: res.writeHead(404); res.end();
  }
}

async function listen(server) {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  return server.address().port;
}

function testFetcher(port, overrides = {}) {
  return createSafeFetch({
    resolve: overrides.resolve || (async (host) => {
      if (host === "dead.test") { const e = new Error("nx"); e.code = "ENOTFOUND"; throw e; }
      if (host === "flaky.test") { const e = new Error("again"); e.code = "EAI_AGAIN"; throw e; }
      if (host === "mixed.test") return [{ address: "127.0.0.1", family: 4 }, { address: "10.0.0.7", family: 4 }];
      return [{ address: "127.0.0.1", family: 4 }];
    }),
    // Loopback is the fixture server; everything else uses the production address policy.
    isBlockedAddress: (ip) => ip === "127.0.0.1" ? false : isBlockedAddress(ip),
    isBlockedHost: (host) => host === "127.0.0.1" ? false : isPrivateHost(host),
    allowedPorts: new Set(["", "80", "443", String(port)]),
  });
}

let server; let port; let fetcher; let base;
test.before(async () => {
  server = http.createServer(fixtureHandler);
  port = await listen(server);
  fetcher = testFetcher(port);
  base = `http://public.test:${port}`;
});
test.after(() => { server.closeAllConnections?.(); server.close(); });

test("2xx responses are returned; empty 200 body is readable as empty text", async () => {
  const ok = await fetcher(`${base}/ok`);
  assert.equal(ok.response.status, 200);
  assert.match(await readResponseTextLimited(ok.response), /<title>OK<\/title>/);
  assert.equal(ok.remoteAddress, "127.0.0.1");
  const empty = await fetcher(`${base}/empty`);
  assert.equal(await readResponseTextLimited(empty.response), "");
  const noContent = await fetcher(`${base}/status/204`);
  assert.equal(noContent.response.status, 204);
  assert.equal(classifyHttpStatus(204), null);
});

test("redirects 301/302/303/307/308 are followed hop by hop and recorded", async () => {
  const result = await fetcher(`${base}/r1`);
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.redirectChain.map(hop => hop.status), [301, 302, 307, 308]);
  assert.equal(new URL(result.finalUrl).pathname, "/ok");
  const seeOther = await fetcher(`${base}/see-other`);
  assert.equal(seeOther.redirectChain[0].status, 303);
});

test("redirect loops, redirect limits and missing Location are classified as site errors", async () => {
  await assert.rejects(fetcher(`${base}/loop-a`), (error) => error instanceof SafeFetchError && error.code === "REDIRECT_LOOP");
  await assert.rejects(fetcher(`${base}/r1`, { maxRedirects: 2 }), (error) => error.code === "REDIRECT_LIMIT");
  assert.equal(classifyFetchError(new SafeFetchError("REDIRECT_LOOP")).category, "site_error");
  const noLocation = await fetcher(`${base}/no-location`);
  assert.equal(noLocation.response.status, 302);
  assert.equal(classifyHttpStatus(302).code, "REDIRECT_WITHOUT_LOCATION");
});

test("redirects to internal, non-http or non-standard-port destinations are refused", async () => {
  await assert.rejects(fetcher(`${base}/to-internal`), (error) => ["URL_HOST_BLOCKED", "URL_IP_BLOCKED"].includes(error.code));
  await assert.rejects(fetcher(`${base}/to-ftp`), (error) => error.code === "URL_PROTOCOL_BLOCKED");
  await assert.rejects(fetcher(`${base}/to-port`), (error) => error.code === "URL_PORT_BLOCKED");
  assert.equal(classifyFetchError(new SafeFetchError("URL_IP_BLOCKED")).category, "unsafe_target");
});

const STATUS_EXPECTATIONS = [
  [400, "access_blocked", "REQUEST_REJECTED"], [401, "access_blocked", "AUTH_REQUIRED"], [403, "access_blocked", "ACCESS_FORBIDDEN"],
  [404, "site_error", "NOT_FOUND"], [405, "access_blocked", "METHOD_NOT_ALLOWED"], [408, "temporary", "REQUEST_TIMEOUT"],
  [410, "site_error", "GONE"], [413, "scan_environment", "REQUEST_TOO_LARGE"], [429, "temporary", "RATE_LIMITED"],
  [451, "access_blocked", "LEGAL_RESTRICTION"], [500, "site_error", "SERVER_ERROR"], [502, "temporary", "BAD_GATEWAY"],
  [503, "temporary", "SERVICE_UNAVAILABLE"], [504, "temporary", "GATEWAY_TIMEOUT"], [520, "temporary", "EDGE_ORIGIN_ERROR"],
  [522, "temporary", "EDGE_ORIGIN_ERROR"], [525, "site_error", "EDGE_TLS_ERROR"], [530, "site_error", "EDGE_ORIGIN_DNS"],
  [418, "site_error", "CLIENT_ERROR"], [507, "site_error", "SERVER_ERROR"],
];

for (const [status, category, code] of STATUS_EXPECTATIONS) {
  test(`HTTP ${status} is classified as ${category} (${code}) end-to-end, without a score`, async () => {
    const { response } = await fetcher(`${base}/status/${status}`);
    assert.equal(response.status, status);
    const failure = classifyHttpStatus(response.status, response.headers);
    assert.equal(failure.category, category);
    assert.equal(failure.code, code);
    assert.equal(failure.scoreWithheld, true);
    assert.equal(failure.charged, false);
    assert.equal(failure.retryable, category === "temporary");
    for (const lang of LANGS) {
      const message = scanFailureMessage(failure, lang);
      assert.ok(message.length > 30, `${lang} message present`);
      assert.doesNotMatch(message, /[{}]/, `${lang} message has no unresolved placeholders`);
    }
  });
}

test("HTTP 403 never implies bad SEO or security and names the CDN when visible", async () => {
  const { response } = await fetcher(`${base}/status/403?cf=1`);
  const failure = classifyHttpStatus(response.status, response.headers);
  assert.equal(failure.edgeProvider, "cloudflare");
  const nl = scanFailureMessage(failure, "nl");
  assert.match(nl, /zegt niets over de SEO- of beveiligingskwaliteit/);
  assert.match(nl, /Cloudflare/);
  assert.match(nl, /geen score/);
  assert.equal(apiStatusForFailure(failure), 422);
});

test("non-standard status codes (e.g. 999) stay visible and count as access blocks", async () => {
  const { response } = await fetcher(`${base}/nonstandard`);
  assert.equal(response.status, 999);
  assert.equal(response.ok, false);
  assert.equal(classifyHttpStatus(999).code, "NONSTANDARD_BLOCK");
});

test("HTTP 429 respects Retry-After: short waits retry, long waits stop politely", () => {
  const short = new Headers({ "retry-after": "2" });
  assert.deepEqual(retryDecision(429, short, 0), { retry: true, delayMs: 2000, reason: "retry_after" });
  assert.equal(retryDecision(429, short, 2).retry, false, "never more than two retries");
  const long = new Headers({ "retry-after": "3600" });
  assert.equal(retryDecision(429, long, 0).retry, false);
  assert.equal(retryDecision(429, long, 0).reason, "retry_after_too_long");
  const failure = classifyHttpStatus(429, long);
  assert.equal(failure.retryAfterSeconds, 3600);
  assert.match(scanFailureMessage(failure, "nl"), /60 minuten/);
  assert.equal(apiStatusForFailure(failure), 429);
  const date = new Date(Date.now() + 3000).toUTCString();
  const fromDate = parseRetryAfter(date);
  assert.ok(fromDate >= 2 && fromDate <= 4, "HTTP-date Retry-After");
  assert.equal(retryDecision(429, null, 0).delayMs, 1000, "backoff without Retry-After");
});

test("HTTP 503/502/504 are temporary: one polite retry, then a temporary failure", () => {
  assert.equal(retryDecision(503, null, 0).retry, true);
  assert.equal(retryDecision(503, null, 1).retry, false);
  assert.equal(retryDecision(503, new Headers({ "retry-after": "120" }), 0).retry, false);
  assert.equal(retryDecision(500, null, 0).retry, false, "a 500 is a site error, not retried");
  assert.equal(retryDecision(403, null, 0).retry, false, "a 403 is never retried");
  assert.equal(apiStatusForFailure(classifyHttpStatus(503)), 503);
});

test("compressed responses are decoded and oversized bodies are capped", async () => {
  assert.match(await readResponseTextLimited((await fetcher(`${base}/gzip`)).response), /gz/);
  assert.match(await readResponseTextLimited((await fetcher(`${base}/br`)).response), /br/);
  await assert.rejects(readResponseTextLimited((await fetcher(`${base}/big`)).response, 100_000), /RESPONSE_TOO_LARGE/);
  await assert.rejects(readResponseTextLimited((await fetcher(`${base}/big-declared`)).response, 100_000), /RESPONSE_TOO_LARGE/);
  assert.equal(classifyFetchError(new Error("RESPONSE_TOO_LARGE")).category, "scan_environment");
});

test("invalid HTML is still returned as text (parsers decide; the fetcher never crashes)", async () => {
  const text = await readResponseTextLimited((await fetcher(`${base}/invalid-html`)).response);
  assert.match(text, /unclosed/);
});

test("header timeout and body timeout stop slow servers", async () => {
  const started = Date.now();
  await assert.rejects(fetcher(`${base}/slow-headers`, { timeoutMs: 600 }), (error) => error.code === "TIMEOUT");
  assert.ok(Date.now() - started < 3000);
  const slow = await fetcher(`${base}/slow-body`, { timeoutMs: 2000, bodyTimeoutMs: 600 });
  await assert.rejects(readResponseTextLimited(slow.response), (error) => error.code === "BODY_TIMEOUT" || /BODY_TIMEOUT/.test(String(error?.message)));
  assert.equal(classifyFetchError(new SafeFetchError("TIMEOUT")).category, "temporary");
});

test("connection refused, connection reset and DNS failures are classified", async () => {
  const closed = http.createServer(); const closedPort = await listen(closed); await new Promise(resolve => closed.close(resolve));
  const refusedFetcher = testFetcher(closedPort);
  await assert.rejects(refusedFetcher(`http://public.test:${closedPort}/`), (error) => error.code === "CONNECTION_REFUSED");
  await assert.rejects(fetcher(`${base}/reset`), (error) => error.code === "CONNECTION_RESET" || error.code === "PROTOCOL_ERROR");
  await assert.rejects(fetcher(`http://dead.test:${port}/`), (error) => error.code === "DNS_NOT_FOUND");
  await assert.rejects(fetcher(`http://flaky.test:${port}/`), (error) => error.code === "DNS_TEMPORARY_FAILURE");
  assert.equal(classifyFetchError(new SafeFetchError("DNS_NOT_FOUND")).category, "site_error");
  assert.equal(classifyFetchError(new SafeFetchError("DNS_TEMPORARY_FAILURE")).category, "temporary");
  assert.equal(classifyFetchError(new SafeFetchError("CONNECTION_REFUSED")).category, "site_error");
  assert.equal(classifyFetchError(new SafeFetchError("CONNECTION_RESET")).category, "temporary");
});

test("TLS: self-signed certificates are rejected and classified as a site error", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "rankfix-tls-"));
  try {
    execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", path.join(dir, "k.pem"), "-out", path.join(dir, "c.pem"), "-days", "1", "-subj", "/CN=public.test"], { stdio: "ignore" });
  } catch { t.skip("openssl unavailable"); return; }
  const tlsServer = https.createServer({ key: readFileSync(path.join(dir, "k.pem")), cert: readFileSync(path.join(dir, "c.pem")) }, (req, res) => { res.end("secret"); });
  const tlsPort = await listen(tlsServer);
  try {
    const tlsFetcher = testFetcher(tlsPort);
    await assert.rejects(tlsFetcher(`https://public.test:${tlsPort}/`), (error) => error.code === "TLS_CERT_INVALID");
    const failure = classifyFetchError(new SafeFetchError("TLS_CERT_INVALID"));
    assert.equal(failure.category, "site_error");
    assert.match(scanFailureMessage(failure, "nl"), /SSL-certificaat/);
    assert.equal(classifyFetchError(Object.assign(new Error("x"), { code: "CERT_HAS_EXPIRED" })).code, "TLS_CERT_EXPIRED");
  } finally { tlsServer.close(); }
});

test("DNS rebinding: the socket connects to the address that was validated (one resolution per hop)", async () => {
  let calls = 0;
  const rebinding = testFetcher(port, {
    resolve: async () => { calls += 1; return calls === 1 ? [{ address: "127.0.0.1", family: 4 }] : [{ address: "10.0.0.5", family: 4 }]; },
  });
  const result = await rebinding(`http://rebind.test:${port}/ok`);
  assert.equal(result.response.status, 200);
  assert.equal(result.remoteAddress, "127.0.0.1");
  assert.equal(calls, 1, "no second DNS lookup between check and connect");
});

test("DNS answers that contain any internal address are refused entirely", async () => {
  await assert.rejects(fetcher(`http://mixed.test:${port}/ok`), (error) => error.code === "URL_DNS_BLOCKED");
});

test("address policy blocks private, metadata, CGNAT, reserved and IPv6-embedded internal ranges", () => {
  const blocked = [
    "127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "100.127.255.254",
    "0.0.0.0", "192.0.0.192", "198.18.0.1", "224.0.0.1", "240.0.0.1", "255.255.255.255", "192.0.2.10",
    "::1", "::", "fe80::1", "fc00::1", "fd00:ec2::254", "ff02::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:169.254.169.254",
    "64:ff9b::a9fe:a9fe", "2002:7f00:1::1", "2001:db8::1", "2001::1", "not-an-ip",
  ];
  for (const ip of blocked) assert.equal(isBlockedAddress(ip), true, `${ip} must be blocked`);
  const allowed = ["8.8.8.8", "93.184.215.14", "151.101.1.69", "172.32.0.1", "100.128.0.1", "2606:4700:4700::1111", "2a00:1450:4001:80b::200e", "::ffff:8.8.8.8", "64:ff9b::808:808"];
  for (const ip of allowed) assert.equal(isBlockedAddress(ip), false, `${ip} must be allowed`);
});

test("URL validation covers schemes, credentials, ports, internal hostnames and numeric IP encodings", () => {
  for (const url of ["http://localhost/", "http://foo.localhost/", "http://printer.local/", "http://metadata.google.internal/", "http://2130706433/", "http://0x7f.0.0.1/", "http://0177.0.0.1/", "http://[::1]/", "http://[::ffff:127.0.0.1]/", "http://169.254.169.254/latest"]) {
    assert.throws(() => validatePublicHttpUrl(url), /URL_HOST_BLOCKED/, url);
  }
  assert.throws(() => validatePublicHttpUrl("javascript:alert(1)"), /URL_PROTOCOL_BLOCKED/);
  assert.throws(() => validatePublicHttpUrl("file:///etc/passwd"), /URL_PROTOCOL_BLOCKED/);
  assert.throws(() => validatePublicHttpUrl("https://a:b@example.com/"), /URL_CREDENTIALS_BLOCKED/);
  assert.throws(() => validatePublicHttpUrl("https://example.com:22/"), /URL_PORT_BLOCKED/);
  // International domains are converted to punycode and allowed; query strings are preserved.
  const idn = validatePublicHttpUrl("https://bücher.de/zoek?q=boek&p=2");
  assert.equal(idn.hostname, "xn--bcher-kva.de");
  assert.equal(idn.search, "?q=boek&p=2");
  assert.equal(validatePublicHttpUrl("https://shop.example.co.uk:443/").hostname, "shop.example.co.uk");
});

test("CDN/WAF providers are recognised from headers only", () => {
  assert.equal(detectEdgeProvider(new Headers({ "cf-ray": "1" })), "cloudflare");
  assert.equal(detectEdgeProvider(new Headers({ server: "AkamaiGHost" })), "akamai");
  assert.equal(detectEdgeProvider(new Headers({ "x-amz-cf-id": "1" })), "cloudfront");
  assert.equal(detectEdgeProvider(new Headers({ server: "nginx" })), null);
});

test("business names without a domain get a clear input message in every language", () => {
  const failure = inputFailure("NOT_A_DOMAIN");
  assert.equal(apiStatusForFailure(failure), 400);
  for (const lang of LANGS) assert.ok(scanFailureMessage(failure, lang).length > 40);
  assert.match(scanFailureMessage(failure, "nl"), /bedrijfsnaam zonder domein/);
});

test("plain errors carrying a known code keep their category (legacy throw sites)", () => {
  assert.equal(classifyFetchError(new Error("URL_PROTOCOL_BLOCKED")).category, "unsafe_target");
  assert.equal(classifyFetchError(new Error("REDIRECT_LIMIT")).category, "site_error");
  assert.equal(classifyFetchError(new Error("something unexpected")).category, "scan_environment");
});
