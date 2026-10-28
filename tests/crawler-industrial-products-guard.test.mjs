import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";

// Exercise the crawler's actual classification logic without network requests.
const source = readFileSync(new URL("../lib/crawler.ts", import.meta.url), "utf8");
const start = source.indexOf("function classify(");
const end = source.indexOf("\nfunction normalize(", start);
assert.ok(start >= 0 && end > start, "crawler classifier exists");
const classifier = source.slice(start, end)
  .replace("url:string,html:string,jsonTypes:string[]", "url,html,jsonTypes")
  .replace("):PageType{", "){");
const classify = runInNewContext(classifier + "\nclassify", {
  URL,
  stripHtml: (html) => html.replace(/<[^>]+>/g, " "),
});

test("industrial product overview is not automatically a retail category", () => {
  assert.equal(classify("https://factory.example/products/", "<h1>Industrial automation products</h1><p>Request a quote</p>", []), "generic");
});
test("real commerce products overview retains retail category", () => {
  assert.equal(classify("https://shop.example/products/", "<h1>Products</h1><button>Add to cart</button>", []), "product_category");
});
test("structured Product evidence remains product, not generic", () => {
  assert.equal(classify("https://shop.example/products/123", "<h1>Widget</h1>", ["Product"]), "product");
});
test("manufacturer products page does not become commerce through ItemList-free navigation", () => {
  assert.equal(classify("https://factory.example/products/robotics", "<h1>Robotics portfolio</h1>", []), "generic");
});

test("footer FAQ and Contact navigation must not override the actual page type", () => {
  const html = "<nav><a href='/faq'>FAQ</a><a href='/contact'>Contact</a></nav><h1>Industrial services</h1>";
  assert.equal(classify("https://factory.example/services/engineering", html, []), "service");
  assert.equal(classify("https://factory.example/faq", html, []), "faq");
  assert.equal(classify("https://factory.example/contact", html, []), "contact");
});

test("opening hours and address in shared footer do not turn services into local business", () => {
  const html = "<main><h1>Engineering services</h1></main><footer>Opening hours 9-5. Address Main Street 12345</footer>";
  assert.equal(classify("https://company.example/services/engineering", html, []), "service");
  assert.equal(classify("https://company.example/services/engineering", html, ["LocalBusiness"]), "local_business");
});

test("generic blog category does not become ecommerce category", () => {
  assert.equal(classify("https://publisher.example/category/technology", "<h1>Technology articles</h1>", []), "generic");
});
test("ItemList without purchase evidence is not ecommerce", () => {
  assert.equal(classify("https://factory.example/industries", "<h1>Industrial solutions</h1>", ["ItemList"]), "generic");
});
test("ItemList with add-to-cart evidence remains ecommerce category", () => {
  assert.equal(classify("https://shop.example/category/shoes", "<h1>Shoes</h1><button>Add to cart</button>", ["ItemList"]), "product_category");
});
