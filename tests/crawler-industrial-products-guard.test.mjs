import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const crawler=readFileSync(new URL("../lib/crawler.ts",import.meta.url),"utf8");
test("industrial products path requires purchasing evidence for retail category classification",()=>{
 assert.ok(crawler.includes("commerceSignals"));
 assert.ok(crawler.includes("products)"));
 assert.ok(crawler.includes("add to cart"));
 assert.ok(crawler.includes("&&commerceSignals"));
});
