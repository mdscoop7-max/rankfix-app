import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { isCountrySelectionPortal } from "../lib/seo-rules.ts";

const portal = (heading, words, url="https://example.com/")=>isCountrySelectionPortal({
  heading, pageUrl:url, html:"<html><body><h1>"+heading+"</h1><main>"+words+"</main></body></html>"
});
test("international country list without hreflang is detected on entry root",()=>{
  assert.equal(portal("Zalando is available in the following countries","Austria Belgium Denmark France Germany Netherlands Norway Poland Sweden Switzerland United Kingdom"),true);
  assert.equal(portal("Choose your country","Austria Belgium France Germany Netherlands"),true);
});
test("normal local retail homepage or support article stays retail/content",()=>{
  assert.equal(portal("Clothes and fashion online","Austria Belgium Denmark France Germany Netherlands"),false);
  assert.equal(portal("Zalando is available in the following countries","Netherlands"),false);
  assert.equal(portal("Zalando is available in the following countries","Austria Belgium France Germany Netherlands","https://example.com/faq/shipping"),false);
  assert.equal(portal("Choose your country","Austria Belgium France Germany <script>Netherlands Sweden Poland</script>"),false);
});
test("route marks the portal and keeps the score provisional",async()=>{
  const route=await readFile(new URL("../app/api/scan/route.ts",import.meta.url),"utf8");
  assert.match(route,/isCountrySelectionPortal\(\{ heading: h1s\.join/);
  assert.match(route,/marketSelectorPage = isMarketSelectorPage.*\|\| countrySelectionPortal/);
  assert.match(route,/technologyProfile\.siteType = "Landkeuzeportaal"/);
  assert.match(route,/scoreModel\.provisional = marketSelectorPage \|\| overallCoverage\.coveragePercent < 90/);
});
