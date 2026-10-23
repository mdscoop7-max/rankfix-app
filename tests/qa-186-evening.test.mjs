import test from "node:test";
import assert from "node:assert/strict";
import { sectorPageEvidence } from "../lib/sector-page-evidence.ts";
import { evidenceLevel } from "../lib/audit-score.ts";
import { speedNotMeasured } from "../lib/pagespeed.ts";
import { speedFailureMessage } from "../lib/speed-display.ts";
import { isTransientDbError, withDbRetry, databaseFailureDetail } from "../lib/db.ts";
import { schemaFingerprint } from "../lib/db-init.ts";
import { classifyNonContentPage } from "../lib/page-gate.ts";

// Regression tests for the repairs after the TestLab run of 23 Oct 2026 (evening,
// QA af918dbd): EDF/Umicore unconfirmed, bol/Agfa block pages scored, Achmea
// subtype, a report on 1 of 16 pages presented as a firm score, PageSpeed missing
// without reason, SCAN_HISTORY_SAVE_FAILED. Generic fixtures; no real domains in rules.
const page = (url, title, description = "", h1 = [], type = "other", schemaTypes = ["organization"]) =>
  ({ url, type, status: "audited", title, description, identityHeadings: h1, schemaTypes });

test("one explicit title declaration + another own page naming the sector family = probable sector (medium)", () => {
  const r = sectorPageEvidence("https://www.power.test/", [
    page("https://www.power.test/", "Power Group | Home", "", ["Together towards a low-carbon future"], "homepage"),
    page("https://www.power.test/entreprises", "Power Entreprises, fournisseur d’électricité et de gaz – Contact", "Optimisez l’efficacité de votre entreprise.", ["L'électrification, la clé de votre décarbonation"], "article", []),
    page("https://www.power.test/groupe", "Nos missions et engagements | Power", "Nucléaire, mobilité électrique et stockage : les actions du groupe au service de l’énergie.", ["Bâtir l'avenir énergétique"]),
  ]);
  assert.equal(r.reason, "explicit_page_with_family_support");
  assert.equal(r.decision?.sector, "energy_utilities");
  assert.equal(r.decision?.confidenceScore, 74);
});

test("a single declaration without corroboration, or with a contradicting page, stays unconfirmed", () => {
  const alone = sectorPageEvidence("https://www.power.test/", [
    page("https://www.power.test/", "Power Group", "", [], "homepage"),
    page("https://www.power.test/entreprises", "Power Entreprises, fournisseur d’électricité et de gaz", "", []),
    page("https://www.power.test/carrieres", "Carrières | Power", "Rejoignez nos équipes.", []),
  ]);
  assert.equal(alone.decision, null);
  assert.equal(alone.reason, "insufficient_independent_pages");
  const contradicted = sectorPageEvidence("https://www.power.test/", [
    page("https://www.power.test/entreprises", "Power Entreprises, fournisseur d’électricité et de gaz", "", []),
    page("https://www.power.test/groupe", "Le groupe | Power", "Au service de l’énergie.", []),
    page("https://www.power.test/banque", "Power Banque – banque en ligne", "Ouvrez un compte bancaire et une carte de paiement.", ["Votre banque"]),
  ]);
  assert.equal(contradicted.decision, null);
  // The body of the voting page itself is never its own corroboration.
  const self = sectorPageEvidence("https://www.power.test/", [
    page("https://www.power.test/entreprises", "Power Entreprises, fournisseur d’électricité et de gaz", "Au service de l’énergie.", []),
  ]);
  assert.equal(self.decision, null);
});

test("a market page may corroborate the company's own activity, never the market it addresses", () => {
  const materials = sectorPageEvidence("https://www.materials.test/en/", [
    page("https://www.materials.test/en/", "Home | Materials", "", ["Home"], "homepage"),
    page("https://www.materials.test/en/markets-products/", "Markets & Products | Materials", "Materials is a global leader in circular materials technology. Explore our markets including automotive, energy, electronics and more.", ["Markets & products"]),
    page("https://www.materials.test/en/markets-products/electronics-telecom/", "Electronics & Telecom | Materials", "We provide advanced materials for electronics & telecom, enhancing performance in components, LED, opto electronics, semiconductors and more", ["Electronics & Telecom"]),
    page("https://www.materials.test/en/markets-products/industrial-manufacturing/", "Industrial & Manufacturing | Materials", "Materials delivers advanced solutions for industrial manufacturing.", ["Industrial & Manufacturing"]),
  ]);
  assert.equal(materials.decision?.sector, "manufacturing_industrial");
  assert.equal(materials.reason, "corroborated_pages");
  // Only the electronics page counts: the industrial-manufacturing page names its market.
  assert.equal(materials.decision?.evidence.filter((e) => e.includes("markets-products/")).length, 2);
  assert.ok(!materials.decision?.evidence.some((e) => e.includes("industrial-manufacturing")));
});

test("market pages alone never decide a sector (software company with industry pages)", () => {
  const software = sectorPageEvidence("https://www.soft.test/", [
    page("https://www.soft.test/", "Soft – Home", "", ["Welcome"], "homepage"),
    page("https://www.soft.test/industries/hospitals", "Hospitals | Soft", "Ziekenhuis: patiëntenzorg en behandeling in ons ziekenhuis met spoedeisende hulp.", ["Ziekenhuizen"]),
    page("https://www.soft.test/industries/insurance", "Insurers | Soft", "Verzekeringen voor particulieren: autoverzekering, inboedelverzekering en reisverzekering afsluiten.", ["Verzekeraars"]),
  ]);
  assert.equal(software.decision, null);
});

test("subtype: specific identity votes decide the subtype; a generic vote does not overrule them", () => {
  const insurer = sectorPageEvidence("https://www.insurer.test/", [
    page("https://www.insurer.test/onze-verzekeringen", "Onze verzekeringen | Een overzicht van de producten van onze merken | Insurer", "Verzekeringen voor schade, zorg, inkomen en pensioen.", ["Onze verzekeringen"], "service"),
    page("https://www.insurer.test/advocaten", "Insurer Verzekeringsadvocaten", "Juridische hulp voor verzekerden van onze verzekeringen.", ["Insurer Verzekeringsadvocaten"]),
    page("https://www.insurer.test/organisatie", "Organisatie | Insurer", "Insurer is een financiële dienstverlener met verzekeringen en pensioenen.", ["Organisatie"]),
  ]);
  assert.equal(insurer.decision?.sector, "financial_services");
  assert.equal(insurer.decision?.key, "financial_insurance");
  // Disagreeing specific votes (insurance and banking): main sector only, no subtype guess.
  const group = sectorPageEvidence("https://www.insurer.test/", [
    page("https://www.insurer.test/onze-verzekeringen", "Onze verzekeringen | Insurer", "Verzekeringen voor schade, zorg, inkomen en pensioen.", ["Onze verzekeringen"], "service"),
    page("https://www.insurer.test/advocaten", "Insurer Verzekeringsadvocaten", "Juridische hulp voor verzekerden van onze verzekeringen.", ["Insurer Verzekeringsadvocaten"]),
    page("https://www.insurer.test/bank", "Insurer Bank – sparen en hypotheken bij onze bank", "Spaarrekening openen en betaalrekening bij de bank.", ["Bank"]),
  ]);
  assert.equal(group.decision?.sector, "financial_services");
  assert.equal(group.decision?.key, "financial_services");
});

test("evidence level: a report on fewer than a quarter of a real sample is only an indication", () => {
  const base = { coveragePercent: 91, javascriptRequiredButNotRendered: false, unconfirmed: 4 };
  assert.equal(evidenceLevel({ ...base, pageSample: { selected: 16, fetched: 1 } }).level, "insufficient");
  assert.equal(evidenceLevel({ ...base, pageSample: { selected: 14, fetched: 4 } }).level, "provisional");
  assert.equal(evidenceLevel({ ...base, pageSample: { selected: 3, fetched: 0 } }).level, "provisional");
  assert.equal(evidenceLevel({ coveragePercent: 95, javascriptRequiredButNotRendered: false, unconfirmed: 0, pageSample: { selected: 20, fetched: 19 } }).level, "complete");
});

test("PageSpeed: a refused page gets an explicit 'not measured' for mobile and desktop, never a value", () => {
  const speed = speedNotMeasured("https://www.shop.test/", 403);
  for (const device of [speed.mobile, speed.desktop]) {
    assert.equal(device.status, "unavailable");
    assert.equal(device.score, null);
    assert.equal(device.reasonCode, "site_refused_scanner");
    assert.match(speedFailureMessage(device, "nl"), /weigerde/);
  }
  assert.equal(speedNotMeasured("https://x.test/", 504).mobile.reasonCode, "site_not_reached");
  assert.match(speedFailureMessage(null, "nl"), /geen snelheidsmeting uitgevoerd/);
});

test("database retry: only transient errors are repeated; detail never carries a connection string", async () => {
  for (const e of [{ code: "40P01" }, { code: "57P01" }, { code: "ECONNRESET" }, { message: "Connection terminated unexpectedly" }, { code: "08006" }]) assert.ok(isTransientDbError(e), JSON.stringify(e));
  for (const e of [{ code: "22P02" }, { code: "23505" }, { message: "invalid input syntax for type json" }, new TypeError("x is undefined")]) assert.ok(!isTransientDbError(e), JSON.stringify(e));
  let n = 0;
  assert.equal(await withDbRetry(async () => { if (++n < 3) throw Object.assign(new Error("deadlock detected"), { code: "40P01" }); return "ok"; }, { wait: async () => {} }), "ok");
  assert.equal(n, 3);
  n = 0;
  await assert.rejects(withDbRetry(async () => { n++; throw Object.assign(new Error("deadlock detected"), { code: "40P01" }); }, { wait: async () => {} }));
  assert.equal(n, 3, "bounded attempts");
  assert.ok(!/secret/.test(databaseFailureDetail(new Error("connect failed postgres://user:secret@host/db")) || ""));
});

test("schema fingerprint: stable for the same SQL, different when the SQL changes", () => {
  assert.equal(schemaFingerprint(), schemaFingerprint());
  assert.notEqual(schemaFingerprint(["CREATE TABLE a (x int)"]), schemaFingerprint(["CREATE TABLE a (x bigint)"]));
});

test("page gate on the two templates that were scored as websites, and on ordinary pages", () => {
  assert.equal(classifyNonContentPage({ title: "shop", text: "shop IP address is blocked IP adres is geblokkeerd Your access to shop has been temporarily blocked due to possible abuse from this IP address.", words: 186 })?.kind, "challenge");
  assert.equal(classifyNonContentPage({ title: "", text: "This question is for testing whether you are a human visitor and to prevent automated spam submission. What code is in the image? submit Your support ID is: 699070390611420714 .", words: 37 })?.kind, "challenge");
  assert.equal(classifyNonContentPage({ title: "Hulp | Bank", text: "Als je toegang tot de app is geblokkeerd na drie foute pincodes, bel ons. Waarom is mijn IP-adres geblokkeerd? Lees verder.", words: 120 }), null);
  assert.equal(classifyNonContentPage({ title: "Firewall products | Vendor", text: "Our firewall makes sure an attacker's IP address is blocked automatically. ".repeat(3) + "Product details ".repeat(400), words: 1300 }), null);
});
