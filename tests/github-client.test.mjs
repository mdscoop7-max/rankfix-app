// GitHub client used by the Fix Engine: bounded time, clear errors, no real network.
import test from "node:test";
import assert from "node:assert/strict";
import { githubFetch, encryptToken, decryptToken } from "../lib/github.ts";

const realFetch = globalThis.fetch;
test.afterEach(() => { globalThis.fetch = realFetch; delete process.env.GITHUB_API_TIMEOUT_MS; });

test("a hanging GitHub API call times out with a clear message", async () => {
  process.env.GITHUB_API_TIMEOUT_MS = "500";
  globalThis.fetch = (_url, init) => new Promise((_, reject) => {
    init.signal.addEventListener("abort", () => reject(init.signal.reason));
  });
  const started = Date.now();
  await assert.rejects(githubFetch("token", "/repos/a/b"), /GitHub reageerde niet op tijd/);
  assert.ok(Date.now() - started < 3000);
});

test("network failures and API errors surface as readable errors", async () => {
  globalThis.fetch = async () => { throw new TypeError("fetch failed"); };
  await assert.rejects(githubFetch("token", "/repos/a/b"), /tijdelijk niet bereikbaar/);
  globalThis.fetch = async () => new Response(JSON.stringify({ message: "Resource not accessible by integration" }), { status: 403 });
  await assert.rejects(githubFetch("token", "/repos/a/b"), /Resource not accessible by integration/);
});

test("requests carry auth and API version headers and parse JSON", async () => {
  let seen;
  globalThis.fetch = async (url, init) => { seen = { url, headers: init.headers }; return new Response(JSON.stringify({ full_name: "a/b" }), { status: 200 }); };
  const repo = await githubFetch("tok", "/repos/a/b");
  assert.equal(repo.full_name, "a/b");
  assert.equal(seen.url, "https://api.github.com/repos/a/b");
  assert.equal(seen.headers.Authorization, "Bearer tok");
  assert.ok(seen.headers["X-GitHub-Api-Version"]);
});

test("stored GitHub tokens are encrypted (AES-GCM) and tamper-evident", () => {
  process.env.SESSION_SECRET = "test-only-secret";
  const sealed = encryptToken("ghp_example");
  assert.notEqual(sealed.includes("ghp_example"), true);
  assert.equal(decryptToken(sealed), "ghp_example");
  const parts = sealed.split(".");
  const tampered = [parts[0], parts[1], parts[2].slice(0, -2) + (parts[2].endsWith("A") ? "B" : "A") + parts[2].slice(-1)].join(".");
  assert.throws(() => decryptToken(tampered));
  delete process.env.SESSION_SECRET;
});
