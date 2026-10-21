import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const component = readFileSync(new URL("../components/speed-promo.tsx", import.meta.url), "utf8");
const home = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const scan = readFileSync(new URL("../app/[locale]/scan/scan-client.tsx", import.meta.url), "utf8");

test("Speed promotional preview is placed below the free scan bar on both pages", () => {
  assert.match(home, /<SpeedPromo locale=\{language\} \/>/);
  assert.match(scan, /<SpeedPromo locale=\{locale\} variant="dark" \/>/);
  assert.ok(home.indexOf("<SpeedPromo locale={language} />") > home.indexOf("<form onSubmit={handleScan}"));
  assert.ok(scan.indexOf("<SpeedPromo locale={locale} variant=\"dark\" />") > scan.indexOf("lc-free-scope"));
});

test("Speed does not claim an existing free mobile or desktop speed score", () => {
  assert.match(component, /Nog in ontwikkeling: de gratis scan hierboven voert deze snelheidsmeting nog niet uit/);
  assert.match(component, /Nog niet gemeten/);
  for (const locale of ["nl", "en", "de", "fr", "it", "es"]) {
    assert.match(component, new RegExp(`\\b${locale}: \\{`));
  }
  assert.doesNotMatch(component, /(?:speedScore|lighthouseScore|PageSpeedScore)\s*=/);
});
