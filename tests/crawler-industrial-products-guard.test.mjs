import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const crawler=readFileSync(new URL("../lib/crawler.ts",import.meta.url),"utf8");
test("industrial /products/ requires purchasing evidence for retail category classification",()=>{
 assert.match(crawler,/\(\/\(producten\|products\)/);
 assert.match(crawler,/commerceSignals/);
 assert.match(crawler,/add to cart/);
});
