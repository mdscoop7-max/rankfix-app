import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { detectPrimaryBusinessIdentity } from "../lib/primary-business-identity.ts";

// Owner, 6 Nov: "alle websites in dezelfde sector moeten altijd herkend worden;
// Mollie wel, PayPal niet". Real PayPal scan (owner TestLab, commit 316ff53):
// title "Geld overmaken, winkelen, betalingen beheren ... | PayPal NL" was read as
// retail because "winkelen" / "shop online" counted as own sales.
const root = fileURLToPath(new URL("..", import.meta.url));

test("real PayPal scan replayed through /api/scan is a payment provider, not retail", { timeout: 300000 }, () => {
  const out = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", "--import", "./tests/scan-matrix/register.mjs", "tests/scan-matrix/run-route-replay.mjs", "--json"], {
    cwd: root, encoding: "utf8", timeout: 280000, env: { ...process.env, ROUTE_FIXTURE: `${root}/tests/fixtures/stored-live-replay/paypal-20261106.json.gz` },
  });
  const line = (out.stdout || "").split("\n").find((l) => l.startsWith("ROUTE_REPLAY "));
  assert.ok(line, (out.stderr || "").slice(-1500));
  const [r] = JSON.parse(line.slice(13));
  assert.equal(r.liveOld, "ecommerce", "fixture must reproduce the reported live error source");
  assert.equal(r.sector, "financial_services");
  assert.equal(r.key, "financial_payments");
});

// Payment providers of every kind (invented names, wording patterns of real
// providers): P2P wallet, BNPL, PSP, platform, payment requests, POS terminals.
const PROVIDERS = [
  ["Geld overmaken, winkelen, betalingen beheren | Walletpay NL", "Maak veilig geld over, shop online en beheer je betalingen op één plek.", ["Geld overmaken en aanvragen"], []],
  ["Walletpay: Shop, Pay, Send Money", "Shop online and pay with Walletpay. Send money to friends and family worldwide.", ["Send money and shop"], ["Personal", "Business", "Developer"]],
  ["Paylater | Shop nu, betaal later", "Shop bij je favoriete winkels en betaal later. Achteraf betalen, in 3 termijnen.", ["Betaal later bij duizenden winkels"], ["Winkels", "Zakelijk", "Ontwikkelaars"]],
  ["Payco | Payments platform for businesses", "Payco is the financial technology platform for leading businesses: online payments, point of sale and payouts.", ["Engineered for ambition"], ["Products", "Developers", "Pricing"]],
  ["Paystack | Financial Infrastructure to Grow Your Revenue", "A financial services company. Accept payments, send payouts and manage your business online.", ["Financial infrastructure"], ["Products", "Developers", "Pricing"]],
  ["Vraagje | Betaalverzoeken sturen", "Stuur een betaalverzoek en krijg je geld snel terug. Geld aanvragen bij vrienden.", ["Makkelijk geld terugvragen"], ["Zakelijk", "Particulier"]],
  ["Paybox | Betaaloplossingen voor webshops", "Paybox is een payment service provider voor online betalingen, abonnementen en betalen in de winkel.", ["Alle betaalmethoden in één platform"], ["Betaalmethoden", "Prijzen", "Developers"]],
  ["Safepay | Online betalingen voor ondernemers", "Safepay is een Nederlandse payment service provider. Accepteer alle betaalmethoden in je webshop.", ["Betalingen die je laten groeien"], ["Betaalmethoden", "Tarieven", "Ontwikkelaars"]],
  ["Tapper | Pinautomaat en kassasysteem", "Met de Tapper pinautomaat accepteer je pinbetalingen en contactloos betalen.", ["Accepteer kaartbetalingen overal"], ["Pinautomaten", "Prijzen"]],
  // Stripe live scan (6 Nov, NL): typed generic "Financiële diensten".
  ["Paystream | Financiële infrastructuur voor meer omzet", "Paystream is een financiële dienstverlener en softwareplatform. Miljoenen bedrijven gebruiken Paystream om betalingen te accepteren en uitbetalingen te verwerken.", ["Financiële infrastructuur voor meer omzet"], ["Producten", "Ontwikkelaars", "Prijzen"]],
  ["Lineworld | Payment services", "A European leader in payment services and transactional services for merchants and banks.", ["Payment services for merchants"], []],
];
test("every kind of payment provider is recognised as payments", () => {
  const missed = PROVIDERS.filter(([title, description, headings, navigation]) => detectPrimaryBusinessIdentity({ title, description, headings, navigation, schemaTypes: [] }).financialKind !== "payments").map((p) => p[0]);
  assert.deepEqual(missed, []);
});

const NOT_PAYMENTS = [
  ["Sneakers online kopen | Shoeshop", "Gratis verzending, veilig betalen met iDEAL of Walletpay. Shop online de nieuwste sneakers.", ["Nieuwe sneakers"]],
  ["Bakkerij Jansen | Brood en gebak", "Ambachtelijke bakker. Bij ons kun je pinnen en contactloos betalen.", ["Vers brood"]],
  ["Modehuis | Winkelen in de stad", "Shop online of kom winkelen in onze winkel. Gratis retourneren.", ["Nieuwe collectie"]],
  ["Accountant | Financiële administratie", "Wij verzorgen de financiële infrastructuur van uw administratie en loonadministratie.", ["Uw accountant"]],
  ["Boekhoudkantoor Jansen", "Wij verwerken uw administratie, facturen en betalingen.", ["Boekhouding"]],
  ["Cadeaukaart | Geldig bij duizenden winkels", "Betaal met de cadeaukaart bij duizenden winkels. Bestel online.", ["Cadeaukaarten"]],
];
test("shops and local businesses that mention paying are not payment providers", () => {
  const wrong = NOT_PAYMENTS.filter(([title, description, headings]) => detectPrimaryBusinessIdentity({ title, description, headings, schemaTypes: [] }).financialKind === "payments").map((p) => p[0]);
  assert.deepEqual(wrong, []);
});

import { detectEuPrimaryIdentity } from "../lib/eu-identity.ts";
test("financial-group evidence names what corroborated it, never invented bank/insurance activity", () => {
  const r = detectEuPrimaryIdentity({ title: "Finco | Financiële dienstverlener", description: "Finco is een financiële dienstverlener voor bedrijven.", h1: "Financiële diensten voor bedrijven", siteName: "Finco", hostname: "finco.example", navLabels: [], schemaTypes: [] });
  assert.equal(r?.sector, "financial_services");
  assert.doesNotMatch(r.evidence.join(" "), /bank- of verzekering/);
});
