import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Exercise the exact standalone rule-based helper from the QA GitHub Fix route.
// This is deliberately source-bound: the test fails if the guard is removed,
// the handler is renamed, or its safe preview behavior changes.
const route = readFileSync(new URL("../app/api/github/fix/route.ts", import.meta.url), "utf8");
const name = "function buildVerifiedWebsiteSchemaFix(";
const start = route.indexOf(name);
assert.ok(start >= 0, "verified schema fallback must remain available");
const firstNewline = route.indexOf("\n", start);
const end = route.indexOf("\n}\n", firstNewline);
assert.ok(end > firstNewline, "standalone fallback must have an intact body");
const helper = "function buildVerifiedWebsiteSchemaFix(filePath,current,issueId,targetUrl) {" +
  route.slice(firstNewline, end + 2);
const makePreview = new Function(helper + "\nreturn buildVerifiedWebsiteSchemaFix;")();

const jinjaHost = "{{ request.url_root.rstrip('/') }}/";
const source = `<!doctype html>
<html lang="nl"><head><meta charset="utf-8"><title>TrendMix | Slimme gadgets en meer</title>
<link rel="canonical" href="${jinjaHost}">
</head><body><header><a class="wordmark" href="/">Trend<span>Mix</span></a></header></body></html>`;
const scannedUrl = "https://trendmix-q6fx.vercel.app/";

test("verified TrendMix homepage can preview Organization + WebSite JSON-LD without AI", () => {
  const result = makePreview("templates/index.html", source, "ORGANIZATION_WEBSITE_SCHEMA", scannedUrl);
  assert.ok(result, "realistic TrendMix metadata must yield a safe proposal");
  const tag = result.content.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(tag, "schema must be inside one JSON-LD script");
  const graph = JSON.parse(tag[1])["@graph"];
  assert.deepEqual(graph.map(entry => entry["@type"]), ["Organization", "WebSite"]);
  assert.equal(graph[0].name, "TrendMix");
  assert.equal(graph[0].url, jinjaHost, "derive domain at render time; do not pin temporary preview host");
  assert.equal(graph[1].publisher["@id"], graph[0]["@id"]);
  assert.equal(result.content.replace(tag[0] + "\n", ""), source, "the rest of the storefront must be unchanged");
  assert.ok(!result.content.includes(scannedUrl), "do not hard-code the temporary deployment URL");
});

test("schema proposal supports missing schema findings and is idempotent", () => {
  const first = makePreview("templates/index.html", source, "STRUCTURED_DATA_MISSING", scannedUrl);
  assert.ok(first);
  assert.equal(makePreview("templates/index.html", first.content, "STRUCTURED_DATA_MISSING", scannedUrl), null);
});

test("schema fallback fails closed without independently matching brand evidence", () => {
  const wrongBrand = source.replace("Trend<span>Mix</span>", "Andere Winkel");
  assert.equal(makePreview("templates/index.html", wrongBrand, "ORGANIZATION_WEBSITE_SCHEMA", scannedUrl), null);
  assert.equal(makePreview("templates/index.html", source, "identity", scannedUrl), null);
  assert.equal(makePreview("app/layout.tsx", source, "ORGANIZATION_WEBSITE_SCHEMA", scannedUrl), null);
  assert.equal(makePreview("templates/index.html", source, "ORGANIZATION_WEBSITE_SCHEMA", scannedUrl + "checkout"), null);
});
