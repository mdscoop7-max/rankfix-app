import test from "node:test";
import assert from "node:assert/strict";
import { indexJsonLdIds, resolveSchemaImage } from "../lib/schema-image.ts";

test("product images: URL, ImageObject, arrays and @id references (Yoast/WooCommerce)", () => {
  const graph = { "@graph": [{ "@type": "ImageObject", "@id": "https://x.nl/p/#primaryimage", url: "https://x.nl/img.jpg" }, { "@type": "Product", image: { "@id": "https://x.nl/p/#primaryimage" } }] };
  const idx = indexJsonLdIds([graph]);
  assert.equal(resolveSchemaImage({ "@id": "https://x.nl/p/#primaryimage" }, idx), "https://x.nl/img.jpg");
  assert.equal(resolveSchemaImage("https://x.nl/a.jpg"), "https://x.nl/a.jpg");
  assert.equal(resolveSchemaImage([{ contentUrl: "https://x.nl/b.jpg" }]), "https://x.nl/b.jpg");
  assert.equal(resolveSchemaImage({ "@id": "https://x.nl/unknown" }, idx), null, "an unresolvable reference is not an image");
  assert.equal(resolveSchemaImage(undefined), null);
});
