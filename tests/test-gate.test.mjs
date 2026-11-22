import test from "node:test";
import assert from "node:assert/strict";
import { testGateDecision } from "../lib/test-gate.ts";

const basic = (user, pass) => `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;

test("test gate is open when no password is configured (production)", () => {
  assert.equal(testGateDecision(null, undefined), "open");
  assert.equal(testGateDecision(null, "  "), "open");
});

test("test gate challenges missing, malformed and wrong credentials", () => {
  assert.equal(testGateDecision(null, "s3cret-value"), "challenge");
  assert.equal(testGateDecision("Bearer abc", "s3cret-value"), "challenge");
  assert.equal(testGateDecision("Basic !!!", "s3cret-value"), "challenge");
  assert.equal(testGateDecision(basic("rankfix", "wrong"), "s3cret-value"), "challenge");
  assert.equal(testGateDecision(basic("admin", "s3cret-value"), "s3cret-value"), "challenge");
  assert.equal(testGateDecision(basic("rankfix", "s3cret-valu"), "s3cret-value"), "challenge");
});

test("test gate allows the right user and password, including colons in the password", () => {
  assert.equal(testGateDecision(basic("rankfix", "s3cret-value"), "s3cret-value"), "allow");
  assert.equal(testGateDecision(basic("rankfix", "a:b:c"), "a:b:c"), "allow");
});
