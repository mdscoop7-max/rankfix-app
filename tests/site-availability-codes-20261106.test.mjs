import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { classifyScanOutcome, dnsDomainMissing, fetchFailureCode, tlsFailureReason } from "../lib/scan-attempts.ts";
import { attributeIncident } from "../lib/scan-incident.ts";
import { classifyScanAnswer } from "../lib/testlab-outcome.mjs";

// MKB-48 on 316ff53 (owner TestLab, 6 Nov): thewaxingcompany.nl answered HTTP 402
// and was reported as "site blokkeert RankFix"; 2× FETCH_TLS and 3× FETCH_DNS were
// all "network" although several are provable faults of the website/domain.
const tlsError = (code, message = "fetch failed") => Object.assign(new TypeError(message), { cause: { code, message: code } });

test("certificate faults are named and attributed to the website", () => {
  assert.equal(tlsFailureReason(tlsError("CERT_HAS_EXPIRED")), "certificate_expired");
  assert.equal(tlsFailureReason(tlsError("ERR_TLS_CERT_ALTNAME_INVALID")), "hostname_mismatch");
  assert.equal(tlsFailureReason(tlsError("DEPTH_ZERO_SELF_SIGNED_CERT")), "self_signed");
  assert.equal(tlsFailureReason(tlsError("UNABLE_TO_VERIFY_LEAF_SIGNATURE")), "incomplete_chain");
  assert.equal(tlsFailureReason(tlsError("ERR_SSL_WRONG_VERSION_NUMBER")), "handshake");
  assert.equal(fetchFailureCode(tlsError("CERT_HAS_EXPIRED")), "FETCH_TLS");
  assert.equal(attributeIncident(422, "SITE_TLS_INVALID"), "target_site");
  assert.equal(classifyScanOutcome(422, "SITE_TLS_INVALID"), "site_unavailable");
  assert.equal(attributeIncident(502, "FETCH_TLS"), "network");
});

test("a domain without DNS record is a domain fact; a resolver hiccup stays network", () => {
  assert.equal(dnsDomainMissing(Object.assign(new Error("getaddrinfo ENOTFOUND nosuchsite.example"), { code: "ENOTFOUND" })), true);
  assert.equal(dnsDomainMissing(Object.assign(new Error("getaddrinfo EAI_AGAIN example.nl"), { code: "EAI_AGAIN" })), false);
  assert.equal(dnsDomainMissing(new Error("URL_DNS_BLOCKED")), false);
  assert.equal(attributeIncident(422, "SITE_DOMAIN_NOT_FOUND"), "target_site");
  assert.equal(classifyScanAnswer({ ok: false, data: { code: "SITE_DOMAIN_NOT_FOUND", incident: { attribution: "target_site" } } }), "site_onbereikbaar");
});

test("HTTP 402 of the website is 'unavailable', never 'blocked' and never a RankFix quota", () => {
  assert.equal(attributeIncident(422, "HTTP_PAYMENT_REQUIRED"), "target_site");
  assert.equal(classifyScanOutcome(422, "HTTP_PAYMENT_REQUIRED"), "site_unavailable");
  assert.equal(classifyScanAnswer({ ok: false, data: { code: "HTTP_PAYMENT_REQUIRED", incident: { attribution: "target_site" } } }), "site_onbereikbaar");
  assert.equal(classifyScanAnswer({ ok: false, data: { code: "HTTP_BLOCKED", incident: { attribution: "target_site" } } }), "site_geblokkeerd");
  const route = readFileSync(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
  assert.match(route, /sitePaymentRequired \? "HTTP_PAYMENT_REQUIRED"/);
  assert.match(route, /&& !sitePaymentRequired;/);
});
