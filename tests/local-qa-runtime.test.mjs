// 1 Nov 2026: the secure local QA server must report environment "local" by its
// own mode, also when VERCEL_ENV was inherited or set in .env.local. Security
// conditions are unchanged: development + not on Vercel + 64-hex token.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { scanRuntime } from "../lib/scan-runtime.ts";
import { localQaEnabled } from "../lib/local-qa-mode.ts";

const TOKEN = "a".repeat(64);
const withEnv = (env, fn) => {
  const keys = ["NODE_ENV", "VERCEL", "VERCEL_ENV", "RF_LOCAL_QA_TOKEN", "RF_QA_COMMIT_SHA"];
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  for (const k of keys) delete process.env[k];
  Object.assign(process.env, env);
  try { return fn(); } finally { for (const k of keys) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } }
};

test("local QA server with an inherited VERCEL_ENV=preview reports local, and keeps vercelEnv visible", () => {
  const r = withEnv({ NODE_ENV: "development", VERCEL_ENV: "preview", RF_LOCAL_QA_TOKEN: TOKEN, RF_QA_COMMIT_SHA: "b".repeat(40) }, () => scanRuntime());
  assert.equal(r.environment, "local");
  assert.equal(r.vercelEnv, "preview");
  assert.equal(r.commitSha, "b".repeat(40));
});

test("security unchanged: no token, a bad token, production or a real Vercel deployment are never local QA", () => {
  assert.equal(withEnv({ NODE_ENV: "development", VERCEL_ENV: "preview" }, () => scanRuntime().environment), "preview");
  assert.equal(withEnv({ NODE_ENV: "development", VERCEL_ENV: "preview", RF_LOCAL_QA_TOKEN: "short" }, () => scanRuntime().environment), "preview");
  assert.equal(withEnv({ NODE_ENV: "production", VERCEL_ENV: "preview", RF_LOCAL_QA_TOKEN: TOKEN }, () => scanRuntime().environment), "preview");
  assert.equal(withEnv({ NODE_ENV: "development", VERCEL: "1", VERCEL_ENV: "preview", RF_LOCAL_QA_TOKEN: TOKEN }, () => scanRuntime().environment), "preview");
  assert.equal(withEnv({ NODE_ENV: "production", VERCEL: "1", VERCEL_ENV: "production" }, () => scanRuntime().environment), "production");
  assert.equal(withEnv({ NODE_ENV: "development", VERCEL: "1", RF_LOCAL_QA_TOKEN: TOKEN }, () => localQaEnabled()), false);
  // Plain local development without Vercel variables stays "local" (unchanged).
  assert.equal(withEnv({ NODE_ENV: "development" }, () => scanRuntime().environment), "local");
});

test("access control and the version endpoint share one mode definition; the starter clears inherited Vercel variables", () => {
  const qa = readFileSync(new URL("../lib/local-qa.ts", import.meta.url), "utf8");
  assert.match(qa, /import \{ localQaEnabled \} from "\.\/local-qa-mode"/);
  assert.doesNotMatch(qa, /export function localQaEnabled/);
  const starter = readFileSync(new URL("../Start-RankFix-TestLab.ps1", import.meta.url), "utf8");
  assert.match(starter, /set "VERCEL=" && set "VERCEL_ENV=" && set "VERCEL_URL=" && set "RF_QA_COMMIT_SHA=' \+ \$sha/);
  // The starter and the runners still require environment=local and the QA probe.
  assert.match(starter, /\$v\.environment -eq 'local'/);
  assert.match(starter, /\$probe\.authorized -eq \$true -and \$probe\.mode -eq 'local-qa'/);
  assert.match(readFileSync(new URL("../scripts/testlab/run-probe-route.mjs", import.meta.url), "utf8"), /environment !== "local" \|\| v\.data\?\.commitSha !== sha/);
});
