// Findings from the first real preview scan (large retail homepage): identity schema subtypes,
// image counting and FAQ evidence must reflect what the page really contains.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { extractImageMetrics } from "../lib/image-metrics.ts";
import { isOrganizationType, organizationTypeIn } from "../lib/schema-types.ts";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("schema.org subtypes of Organization count as Organization identity", () => {
  for (const type of ["Organization", "OnlineStore", "FurnitureStore", "Store", "ElectronicsStore", "Corporation", "LocalBusiness",
    "Dentist", "Restaurant", "Hotel", "AutoRepair", "RealEstateAgent", "AccountingService", "HairSalon", "NGO", "https://schema.org/OnlineStore"]) {
    assert.equal(isOrganizationType(type), true, type);
  }
  for (const type of ["WebSite", "WebPage", "ImageObject", "Country", "Product", "Offer", "BreadcrumbList", "Person", "Place", ""]) {
    assert.equal(isOrganizationType(type), false, type);
  }
  assert.equal(organizationTypeIn(["WebSite", "OnlineStore", "FurnitureStore", "ImageObject", "Country"]), "OnlineStore");
  assert.equal(organizationTypeIn(["WebSite", "ImageObject"]), null);
});

test("Organization + WebSite check and identity fields use the subtype-aware helper", async () => {
  const route = await read("app/api/scan/route.ts");
  assert.match(route, /const organizationSchemaPresent = Boolean\(organizationSchemaType\);/);
  assert.doesNotMatch(route, /const organizationSchemaPresent = schemaSet\.has\("organization"\);/);
  assert.match(route, /const hasOrg = \[\.\.\.homepageTypes\]\.some\(isOrganizationType\);/);
  assert.match(route, /\.filter\(\(item\) => schemaTypesOf\(item\)\.some\(isOrganizationType\)\)/);
  assert.match(route, /een schema\.org-subtype van Organization/);
});

test("responsive image variants are one image, distinct images stay distinct", () => {
  const widths = [160, 320, 480, 640, 750, 900, 1100, 1400];
  const picture = (name) => `<picture>
    <source type="image/avif" srcset="${widths.map(w => `https://cdn.example.com/images/${name}.avif?imwidth=${w} ${w}w`).join(", ")}">
    <source type="image/webp" srcset="${widths.map(w => `https://cdn.example.com/images/${name}.webp?imwidth=${w} ${w}w`).join(", ")}">
    <img src="https://cdn.example.com/images/${name}.jpg?imwidth=640" srcset="${widths.map(w => `https://cdn.example.com/images/${name}.jpg?imwidth=${w} ${w}w`).join(", ")}" alt="${name}">
  </picture>`;
  const html = ["sofa", "kast", "lamp"].map(picture).join("") +
    `<img src="/uploads/bed-320x240.jpg" srcset="/uploads/bed-320x240.jpg 320w, /uploads/bed-640x480.jpg 640w, /uploads/bed@2x.jpg 2x" alt="bed">`;
  const metrics = extractImageMetrics(html);
  assert.equal(metrics.elementCount, 4);
  assert.equal(metrics.uniqueImageReferences, 4, "3 pictures with 24 variants each + 1 image with 3 variants");
  assert.equal(metrics.missingAlt, 0);
  assert.equal(extractImageMetrics('<img src="/a.jpg" alt=""><img src="/b.jpg" alt=""><img src="/a.jpg?v=2" alt="">').uniqueImageReferences, 3, "element count is the floor");
});

test("FAQ content passes only with FAQ schema or at least two visible question blocks", async () => {
  const route = await read("app/api/scan/route.ts");
  const block = route.slice(route.indexOf("const faqQuestionBlocks ="), route.indexOf("const hasFaqStructure"));
  const patterns = [...block.matchAll(/html\.match\((\/.*?\/gi)\)/g)].map(m => new Function(`return ${m[1]}`)());
  assert.equal(patterns.length, 3);
  const count = (html) => patterns.reduce((sum, re) => sum + (html.match(re) || []).length, 0);
  assert.equal(count('<footer><a href="/klantenservice/veelgestelde-vragen">Veelgestelde vragen</a></footer><details><summary>Menu</summary></details>'), 0, "a FAQ link or menu is not Q&A");
  assert.equal(count("<h2>Hoe lang duurt de levering?</h2><p>2 dagen.</p><h3>Kan ik retourneren?</h3><p>Ja.</p>"), 2);
  assert.equal(count("<details><summary>Wat kost verzending?</summary>Gratis</details><dl><dt>Is montage mogelijk?</dt><dd>Ja</dd></dl>"), 2);
  assert.match(route, /const hasFaqStructure = hasFaqSchema \|\| schemaSet\.has\("qapage"\) \|\| faqQuestionBlocks >= 2;/);
  assert.match(route, /geoChecks\.push\(hasFaqStructure\n/);
  assert.match(route, /Alleen een verwijzing naar veelgestelde vragen gevonden/);
});
