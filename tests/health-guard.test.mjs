// Health Guard: runtime detection and alert thresholds (no real e-mail, no network to sites).
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { overallHealth } from "../lib/rankfix-health.ts";

test("deployment check recognises Render and Vercel runtimes", async () => {
  const source = await readFile(new URL("../lib/rankfix-health.ts", import.meta.url), "utf8");
  assert.match(source, /process\.env\.RENDER\?"Render":process\.env\.VERCEL\?/);
  assert.doesNotMatch(source, /level:process\.env\.RENDER\?"green":"orange"/);
});

test("overall health is the worst subsystem level", () => {
  assert.equal(overallHealth([{ key: "a", label: "a", level: "green", message: "" }]), "green");
  assert.equal(overallHealth([{ key: "a", label: "a", level: "green", message: "" }, { key: "b", label: "b", level: "orange", message: "" }]), "orange");
  assert.equal(overallHealth([{ key: "a", label: "a", level: "orange", message: "" }, { key: "b", label: "b", level: "red", message: "" }]), "red");
});

test("internal health alerts need three consecutive failures per subsystem and e-mail configuration", async () => {
  const route = await readFile(new URL("../app/api/internal/health/run/route.ts", import.meta.url), "utf8");
  assert.match(route, /const FAILURE_THRESHOLD=3;/);
  assert.match(route, /if\(nextCount>=FAILURE_THRESHOLD&&!incident\.alerted_at\)/);
  assert.match(route, /incidentKey=`rankfix-production:\$\{check\.key\}`/);
  const email = await readFile(new URL("../lib/email.ts", import.meta.url), "utf8");
  assert.match(email, /RESEND_API_KEY/);
});
