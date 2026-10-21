import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const home = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const publicScan = readFileSync(new URL("../app/[locale]/scan/scan-client.tsx", import.meta.url), "utf8");
const scanRoute = readFileSync(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
const dashboard = readFileSync(new URL("../app/dashboard/audit/[id]/page.tsx", import.meta.url), "utf8");
const printable = readFileSync(new URL("../app/dashboard/audit/[id]/report/page.tsx", import.meta.url), "utf8");

test("Same general scan runs both device speed checks; no standalone Speed scan", () => {
  assert.match(scanRoute, /measureWebsiteSpeed\(finalUrl\.toString\(\)\)/);
  assert.match(scanRoute, /summary: scanSummary, websiteSpeed, rendering/);
  assert.match(scanRoute, /summary: scanSummary,\s*websiteSpeed,\s*rendering/);
  assert.match(home, /Website Speed: mobiel \+ desktop \(in ontwikkeling\)/);
  assert.doesNotMatch(home, /<SpeedPromo/);
  assert.doesNotMatch(publicScan, /<SpeedPromo/);
});

test("Every existing audit experience can display mobile and desktop evidence", () => {
  assert.match(home, /<SpeedAudit locale=\{language\} speed=\{result\.websiteSpeed\}/);
  assert.match(publicScan, /<SpeedAudit locale=\{locale\} speed=\{result\.websiteSpeed\}/);
  assert.match(dashboard, /<SpeedAudit locale=\{language\} speed=\{scan\.result\.websiteSpeed\}/);
  assert.match(printable, /r\.websiteSpeed\?\.\[device\]/);
});
