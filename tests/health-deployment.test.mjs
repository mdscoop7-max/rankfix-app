import test from "node:test";
import assert from "node:assert/strict";
import { getDeploymentStatus, getHealthAppUrl } from "../lib/health-deployment.ts";

test("Vercel Preview is recognized without a Render variable", () => {
  const result = getDeploymentStatus({ VERCEL: "1", VERCEL_ENV: "preview" });
  assert.equal(result.level, "green");
  assert.match(result.message, /Vercel-runtime/);
  assert.match(result.message, /preview/);
  assert.doesNotMatch(result.message, /Render-runtime/);
});

test("Vercel Production is recognized and does not claim application uptime", () => {
  const result = getDeploymentStatus({ VERCEL: "1", VERCEL_ENV: "production" });
  assert.equal(result.level, "green");
  assert.match(result.message, /apart gecontroleerd/);
});

test("Render is recognized only when its own runtime signal is present", () => {
  const result = getDeploymentStatus({ RENDER: "true" });
  assert.equal(result.level, "green");
  assert.match(result.message, /Render-runtime/);
});

test("Unknown hosting remains unverified, not falsely healthy", () => {
  const result = getDeploymentStatus({});
  assert.equal(result.level, "orange");
  assert.match(result.message, /niet bevestigd/);
});

test("APP_URL is respected when configured", () => {
  assert.equal(getHealthAppUrl({ APP_URL: "https://custom.example/ " }), "https://custom.example");
});

test("Vercel production domain prevents an obsolete Render fallback", () => {
  assert.equal(getHealthAppUrl({ VERCEL: "1", VERCEL_PROJECT_PRODUCTION_URL: "rankfix-app.vercel.app" }), "https://rankfix-app.vercel.app");
  assert.equal(getHealthAppUrl({ VERCEL: "1" }), "https://rankfix-app.vercel.app");
});

test("The Render fallback is limited to actual Render runtime", () => {
  assert.equal(getHealthAppUrl({ RENDER: "true" }), "https://rankfix-app.onrender.com");
});
