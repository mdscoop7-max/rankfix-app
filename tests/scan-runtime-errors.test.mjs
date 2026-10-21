import test from "node:test";
import assert from "node:assert/strict";
import {classifyScanInfrastructureFailure} from "../lib/scan-runtime-errors.ts";

test("database quota is an infrastructure outage, not a website SEO defect",()=>{
 const x=classifyScanInfrastructureFailure(new Error('NeonDbError: Server error (HTTP status 402): {"message":"Your account or project has exceeded the quota."}'));
 assert.equal(x?.code,"DATABASE_QUOTA_EXCEEDED");
 assert.equal(x?.httpStatus,503);
 assert.equal(x?.retryable,false);
 assert.equal(x?.charged,false);
 assert.match(x?.message.nl||"",/geen SEO\/GEO-fout/);
});
test("missing DATABASE_URL has a distinct safe customer message",()=>{
 const x=classifyScanInfrastructureFailure(new Error("DATABASE_URL ontbreekt."));
 assert.equal(x?.code,"SCAN_DATABASE_UNCONFIGURED");
 assert.equal(x?.httpStatus,503);
 assert.doesNotMatch(x?.message.nl||"",/postgres:\/\//);
});
test("timeouts, blocked websites and ordinary scan errors are not mislabeled as database outages",()=>{
 assert.equal(classifyScanInfrastructureFailure(new Error("Website fetch timeout")),null);
 assert.equal(classifyScanInfrastructureFailure(new Error("HTTP 402 on the target URL")),null);
 assert.equal(classifyScanInfrastructureFailure(new Error("Challenged by CDN")),null);
});
