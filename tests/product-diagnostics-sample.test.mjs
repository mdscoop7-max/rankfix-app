import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const route = readFileSync(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");

test("diagnostics report a product page when the sample audited one, even without Product data", () => {
  const rule = route.match(/const auditedProductPages = auditedMultiPages\.filter\(\(item\)=>item\.type==="product"\);\s*if \(finalCommerceDecision\.confirmed && auditedProductPages\.length && !isProductPage\) \{\s*checkoutFunnelEvidence\.productPage = true;/);
  assert.ok(rule, "productPage must follow audited product pages, not only pages with Product schema");
  assert.doesNotMatch(rule[0], /commerceEvidence\?\.product\b/, "the rule must not require Product structured data");
  assert.ok(route.indexOf(rule[0]) < route.indexOf("representativeProductPage?.commerceEvidence?.product && !isProductPage"), "rule runs before the schema-based enrichment");
});
