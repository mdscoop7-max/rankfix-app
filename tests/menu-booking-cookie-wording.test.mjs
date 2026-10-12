import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { FOOD_MENU_PATTERN } from "../lib/sector-identity.ts";
import { buildScanEvidence } from "../lib/scan-evidence.ts";

const route = () => readFile(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");

test("a navigation 'Menu' button is not food-menu evidence", () => {
  assert.equal(FOOD_MENU_PATTERN.test("Menu Zoeken Inloggen"), false);
  assert.equal(FOOD_MENU_PATTERN.test("Open menu"), false);
  for (const phrase of ["Bekijk ons menu", "Onze menukaart", "lunchkaart en dinerkaart", "Wijnkaart", "Speisekarte", "our menu"]) {
    assert.equal(FOOD_MENU_PATTERN.test(phrase), true, phrase);
  }
});

test("scan evidence: navigation menu gives no menu capability; a real menu does", () => {
  const nav = buildScanEvidence({ url: "https://news.example/", html: "<html><body><button>Menu</button><nav><a href='/sport'>Sport</a></nav><p>Het laatste nieuws</p></body></html>" });
  assert.equal(nav.inventory.menu.value, false);
  const food = buildScanEvidence({ url: "https://bistro.example/", html: "<html><body><a href='/menukaart'>Bekijk onze menukaart</a></body></html>" });
  assert.equal(food.inventory.menu.value, true);
  const schema = buildScanEvidence({ url: "https://bistro.example/", html: '<script type="application/ld+json">{"@type":"Restaurant","name":"Bistro"}</script>' });
  assert.equal(schema.inventory.menu.value, true);
});

test("scanner: local-business keyword signal no longer uses a bare 'menu'", async () => {
  const source = await route();
  assert.match(source, /localBusinessKeywordSignal \|\| FOOD_MENU_PATTERN\.test\(text\) \|\| \/\\b\(reserveren\|reservation\|openingstijden\|opening hours\)\\b\/i\.test\(text\)/);
  assert.doesNotMatch(source, /\/\\b\(menu\|menukaart\|reserveren\|reservation\|openingstijden\|opening hours\)\\b\/i/);
});

test("scanner: booking website type needs booking as primary purpose", async () => {
  const source = await route();
  assert.match(source, /&& \(\["hospitality","beauty"\]\.includes\(sectorProfile\.sector\) \|\| BOOKING_IDENTITY_PATTERN\.test\(sectorIdentitySource\)\)/);
  const pattern = new RegExp(source.match(/const BOOKING_IDENTITY_PATTERN = \/(.+)\/i;/)[1], "i");
  assert.equal(pattern.test("Universitair medisch centrum in Utrecht - UMC Utrecht"), false);
  assert.equal(pattern.test("Het boekhoudpakket voor ondernemers"), false, "'boek' inside a compound is not booking");
  assert.equal(pattern.test("Maak een afspraak bij de tandarts"), true);
  assert.equal(pattern.test("Reserveer je tafel online"), true);
});

test("scanner: a detected consent platform is never presented as legal compliance", async () => {
  const source = await route();
  const sentences = source.match(/Een consentplatform of cookiebanner laat alleen zien dat cookie-informatie aanwezig is; het is geen bewijs van juridische naleving\./g) || [];
  assert.equal(sentences.length, 2, "both PASS paths that can rely on a CMP carry the disclaimer");
});
