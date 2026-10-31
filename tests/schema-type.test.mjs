import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSchemaType } from "../lib/schema-type.ts";

test("schema.org type names and URLs are kept, component paths are not types", () => {
  assert.equal(normalizeSchemaType("Organization"), "Organization");
  assert.equal(normalizeSchemaType("https://schema.org/Product"), "Product");
  assert.equal(normalizeSchemaType("http://schema.org/LocalBusiness"), "LocalBusiness");
  assert.equal(normalizeSchemaType("schema:FAQPage"), "FAQPage");
  assert.equal(normalizeSchemaType(" WebSite "), "WebSite");
  for (const junk of ["mi-aem-homepage-spa/components/content/universal-footer", "my component", "", "1Thing", "https://example.com/Thing", null, 42, {}])
    assert.equal(normalizeSchemaType(junk), null, String(junk));
});
