// Local performance guards: evidence extraction and the regexes fixed for doubled escapes
// must stay fast on very large and adversarial pages (no catastrophic backtracking).
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildScanEvidence } from "../lib/scan-evidence.ts";
import { arbitratePrimarySector, arbiterEvidenceFromScan } from "../lib/sector-arbiter.ts";

const timeIt = (fn) => { const started = performance.now(); fn(); return performance.now() - started; };

function literalAfter(source, anchor) {
  const at = source.indexOf(anchor);
  let i = source.indexOf("/", at + anchor.length);
  const start = i++;
  let inClass = false;
  for (; i < source.length; i++) {
    const ch = source[i];
    if (ch === "\\") { i++; continue; }
    if (ch === "[") inClass = true; else if (ch === "]") inClass = false; else if (ch === "/" && !inClass) break;
  }
  return new RegExp(source.slice(start + 1, i), source.slice(i + 1).match(/^[dgimsuyv]*/)[0]);
}

test("evidence extraction and sector decision on a 4 MB catalogue page stay under 3 seconds", () => {
  const card = `<div class="card"><a href="/p/item-123/">Artikel met een lange naam</a><span>€ 199,99</span><button>In winkelwagen</button></div>`;
  const html = `<html><head><title>Shop</title></head><body><a href="/winkelwagen">W</a>${card.repeat(Math.ceil(4_000_000 / card.length))}</body></html>`;
  let decision;
  const ms = timeIt(() => {
    const evidence = buildScanEvidence({ url: "https://www.voorbeeld.nl/", html });
    decision = arbitratePrimarySector({ current: { sector: "unknown", key: "unknown", label: "", confidenceScore: 0 }, ...arbiterEvidenceFromScan(evidence, { siteSampleProduct: false, previouslyConfirmed: false }), shortStayIdentity: false, identity: [], bodySectors: [], labels: {} });
  });
  assert.equal(decision.sector, "ecommerce");
  assert.ok(ms < 3000, `took ${Math.round(ms)} ms`);
});

test("fixed route regexes stay linear-time on 2 MB adversarial input", async () => {
  const route = await readFile(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
  const cases = [
    ["phone", literalAfter(route, "const phoneMatch = text.match("), "0" + " (1)-".repeat(400_000) + "x"],
    ["address", literalAfter(route, "const addressMatch = text.match("), ("Straatnaam ".repeat(8) + "12 ").repeat(30_000)],
    ["email", literalAfter(route, "const emailMatch = text.match("), "a".repeat(2_000_000) + "@"],
    ["external scripts", literalAfter(route, "const externalScriptTags = [...html.matchAll("), "<script " + " src=x".repeat(300_000)],
    ["author", literalAfter(route, `const authorSignal = schemaSet.has("person") || `), "door ".repeat(400_000)],
    ["bearer", literalAfter(route, `label:"generic bearer token", re:`), "authorization: bearer ".repeat(90_000)],
    ["price count", literalAfter(route, "const visiblePriceCount = (text.match("), "1,".repeat(1_000_000) + "x"],
    ["explicit price", literalAfter(route, "const hasExplicitPriceSignal = "), "1".repeat(2_000_000) + "x"],
    ["robots sitemap", literalAfter(route, "const declared = [...robotsTxt.matchAll("), " ".repeat(500_000) + "!"],
  ];
  for (const [label, re, input] of cases) {
    const ms = timeIt(() => { re.lastIndex = 0; re.global ? [...input.matchAll(re)] : re.test(input); });
    assert.ok(ms < 1500, `${label}: ${Math.round(ms)} ms`);
  }
});

test("evidence engine price detection stays linear on long number runs and still counts real prices", () => {
  const ms = timeIt(() => buildScanEvidence({ url: "https://www.voorbeeld.nl/", html: "<p>" + "1.".repeat(1_000_000) + "</p>" }));
  assert.ok(ms < 1500, `took ${Math.round(ms)} ms`);
  const evidence = buildScanEvidence({ url: "https://www.voorbeeld.nl/", html: "<p>Stoel 49,99 €</p><p>Tafel € 199</p><p>Lamp 1.299,00 EUR</p>" });
  assert.equal(evidence.commerce.prices.value.count, 3);
});
