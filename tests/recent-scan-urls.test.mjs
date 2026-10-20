import test from "node:test";
import assert from "node:assert/strict";
import {cleanScanUrl,mergeRecentScanUrls,readRecentScanUrls} from "../lib/recent-scan-urls.ts";

test("recent websites normalize, combine duplicates and retain most recent first",()=>{
  let list=[];
  list=mergeRecentScanUrls(list,"monumenten.nl");
  list=mergeRecentScanUrls(list,"https://www.monumenten.nl/");
  assert.equal(list.length,1);
  assert.equal(list[0],"https://www.monumenten.nl/");
  list=mergeRecentScanUrls(list,"https://www.monumenten.nl/en/");
  assert.equal(list.length,2);
  assert.equal(list[0],"https://www.monumenten.nl/en/");
});

test("recent scan history caps at twelve and never stores unsafe URLs",()=>{
  let list=[];
  for(let i=0;i<30;i++) list=mergeRecentScanUrls(list,"https://example"+i+".nl");
  assert.equal(list.length,12);
  assert.ok(list[0].includes("example29.nl"));
  assert.ok(!list.some(x=>x.includes("example0.nl")));
  assert.equal(cleanScanUrl("ftp://example.nl"),null);
  assert.equal(cleanScanUrl("https://user:secret@example.nl"),null);
  assert.deepEqual(mergeRecentScanUrls(list,"not a URL"),list);
});

test("browser-only history is empty during server-side rendering",()=>{
  assert.deepEqual(readRecentScanUrls(),[]);
});
