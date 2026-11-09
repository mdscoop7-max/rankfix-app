// Sector peers (31 Oct 2026, "Mollie wordt herkend, PayPal niet"): sites with the
// same sector and function must get the same sector, website type and module
// gating through the REAL /api/scan route. Fixtures: tests/fixtures/sector-peers/*.json
// (realistic homepages, no network). Every group also holds negative controls.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
const DIR = new URL("../fixtures/sector-peers/", import.meta.url);
const groups = process.env.FIXTURE_FILE ? [JSON.parse(readFileSync(process.env.FIXTURE_FILE, "utf8"))] : readdirSync(DIR).filter((f) => f.endsWith(".json")).filter((f) => !process.env.GROUP || f.startsWith(process.env.GROUP)).map((f) => JSON.parse(readFileSync(new URL(f, DIR), "utf8")));
const SITES = Object.assign({}, ...groups.map((g) => g.sites));
const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const page = (s) => `<!doctype html><html lang="${s.lang || "nl"}"><head><meta charset="utf-8"><title>${esc(s.title)}</title>${s.desc ? `<meta name="description" content="${esc(s.desc)}">` : ""}${s.head || ""}</head><body><header><nav>${(s.nav || []).map((n, i) => `<a href="${s.navLinks?.[i] || "/" + encodeURIComponent(n.toLowerCase())}">${esc(n)}</a>`).join("")}</nav></header><main>${s.h1 ? `<h1>${esc(s.h1)}</h1>` : ""}${(s.h2 || []).map((h) => `<h2>${esc(h)}</h2><p>${esc(s.desc)}</p>`).join("")}${s.body || ""}</main><footer>${s.footer || ""}<a href="/privacy">Privacy</a><a href="/contact">Contact</a></footer></body></html>`;
// Optional sampled pages per site: { "/path": { title, desc, h1, body } } (linked from the nav).
globalThis.fetch = async (i) => {
  const u = new URL(typeof i === "string" ? i : i.url); const s = SITES[u.host];
  if (!s) return new Response("nf", { status: 404 });
  const sub = s.pages?.[u.pathname];
  if (u.pathname === "/" || sub) return new Response(page(sub ? { lang: s.lang, nav: s.nav, navLinks: s.navLinks, footer: s.footer, ...sub } : s), { status: 200, headers: { "content-type": "text/html" } });
  return new Response("nf", { status: 404 });
};
globalThis.__RF_RENDER = async () => { throw new Error("no"); };
const { POST } = await import(new URL("../../app/api/scan/route.ts", import.meta.url)); console.info = console.warn = console.error = () => {};
const problems = []; const got = {}; const reports = {};
for (const [host, site] of Object.entries(SITES)) {
  const j = await (await POST(new Request("http://localhost/api/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: `https://${host}/`, mode: "both", language: "nl" }) }))).json();
  reports[host] = j;
  const shop = [...(j.seo?.checks || []), ...(j.geo?.checks || [])].filter((c) => /commerce|product|cart|checkout|shop/i.test(c.key || "")).map((c) => c.status);
  const r = { sector: j.sectorProfile?.sector, key: j.sectorProfile?.key, type: j.websiteProfile?.websiteType?.value, platform: j.websiteProfile?.cms?.value || j.technologyProfile?.cms || null, coverage: j.coverage?.coveragePercent, shop: [...new Set(shop)], discount: j.seo?.checks?.find((c) => c.key === "eu_discount_reference_signal")?.status, schema: [...(j.seo?.checks || []), ...(j.geo?.checks || [])].find((c) => c.key === "schema")?.fix || "" };
  got[host] = r;
  const e = site.expect || (process.env.ASSERT_CATALOG_EXPECTATIONS && site.evaluation ? { sector: site.evaluation.expectedSector,
    modules: site.evaluation.retail ? ["ecommerce","product","checkout"] : [],
    noModules: site.evaluation.retail ? [] : ["ecommerce","product","checkout","merchant"],
  } : {});
  if (r.sector === "unknown" && (j.sectorProfile?.confidence !== "low" || !(j.sectorProfile?.confidenceScore >= 0 && j.sectorProfile.confidenceScore <= 35))) problems.push(`${host}: unknown sector with unsupported certainty`);
  // The same fixture input is retained. The owner now requires uncertainty to
  // survive the FINAL identity gate; a candidate sector cannot prove absence.
  const weakIdentity = Number(j.sectorProfile?.confidenceScore || 0) < 80
    && j.commerceApplicability?.state === "unconfirmed";
  const modules = j.sectorProfile?.applicableModules || [];
  for (const expectedModule of e.modules || []) if (!modules.includes(expectedModule)) problems.push(`${host}: missing module ${expectedModule}`);
  for (const unexpectedModule of e.noModules || []) if (modules.includes(unexpectedModule)) problems.push(`${host}: unexpected module ${unexpectedModule}`);
  if (e.noCheckout && (j.evidenceLayer?.evidence?.commerce?.checkout?.value || j.metrics?.checkoutFunnel?.checkoutLink)) problems.push(`${host}: lead form mistaken for checkout`);
  if (e.sampleProduct) {
    const product = j.metrics?.productOptimizer;
    if (product?.product?.sku !== "MK-17" || product?.product?.price !== "49.95" || product?.product?.currency !== "EUR" || !product?.sampleUrl?.endsWith("/products/kraan")) problems.push(`${host}: sampled product evidence/provenance missing`);
    if (j.metrics?.checkoutFunnel?.interactiveFlowExecuted !== false) problems.push(`${host}: static fixture claimed runtime checkout`);
    if (!j.metrics?.checkoutFunnel?.sampledCheckoutDestinations?.some(x => x.url.endsWith("/products/kraan"))) problems.push(`${host}: sampled checkout destination provenance missing`);
  }
  if (e.sector && r.sector !== e.sector) problems.push(`${host}: sector ${r.sector}/${r.key}, expected ${e.sector}`);
  if (e.key && r.key !== e.key) problems.push(`${host}: subtype ${r.key}, expected ${e.key}`);
  // A service that also sells a real product (Product schema + offer) keeps product checks possible.
  if (e.notShopChecks === "not_applicable_only" && r.shop.length && r.shop.every((x) => x === "not_applicable")) problems.push(`${host}: verified product sale but all shop checks N.v.t.`);
  const channel = j.sectorProfile?.salesChannel?.channel ?? null;
  const classType = j.classification?.websiteType ?? null;
  const profileLabel = j.websiteProfile?.websiteType?.label ?? null;
  if (e.channel && channel !== e.channel) problems.push(`${host}: sales channel ${channel}, expected ${e.channel}`);
  if (e.notChannel && channel === e.notChannel) problems.push(`${host}: sales channel ${channel} (${(j.sectorProfile?.salesChannel?.physicalPresence?.evidence || []).join("; ")})`);
  // One website identity: a specific classification label must match the website profile.
  if (e.consistentType && classType && !/^(?:Website|Webshop)$/.test(classType) && classType !== profileLabel) problems.push(`${host}: classification "${classType}" vs websiteProfile "${profileLabel}"`);
  // Transport or other service sales are not a webshop: no retail checks left "unable to confirm".
  if (weakIdentity && (e.notShopUnconfirmed || e.commerceNot === "unconfirmed") && j.commerceApplicability?.state !== "unconfirmed") problems.push(`${host}: insufficient final identity must remain unconfirmed, got ${j.commerceApplicability?.state}`);
  if (e.notShopUnconfirmed && !weakIdentity && r.shop.includes("unable_to_confirm")) problems.push(`${host}: retail checks unconfirmed (${[...(j.seo?.checks || []), ...(j.geo?.checks || [])].filter((c) => /commerce|product|cart|checkout|shop|merchant/i.test(c.key || "") && c.status === "unable_to_confirm").map((c) => c.key).join(",")}); commerce ${j.commerceApplicability?.state}/${j.commerceApplicability?.reason}`);
  const geoCheck = (key) => (j.geo?.checks || []).find((c) => c.key === key);
  if (e.schemaStatus && geoCheck("schema")?.status !== e.schemaStatus) problems.push(`${host}: schema check ${geoCheck("schema")?.status} ${geoCheck("schema")?.points}/${geoCheck("schema")?.maxPoints} "${String(geoCheck("schema")?.message).slice(0, 140)}", expected ${e.schemaStatus}`);
  if (e.orgStatus && geoCheck("organization_website")?.status !== e.orgStatus) problems.push(`${host}: organization_website ${geoCheck("organization_website")?.status}, expected ${e.orgStatus}`);
  if (e.microdataType && !(j.structuredDataEvidence?.microdata?.types || []).includes(e.microdataType)) problems.push(`${host}: microdata types ${JSON.stringify(j.structuredDataEvidence?.microdata)}`);
  if (e.rdfaType && !(j.structuredDataEvidence?.rdfa?.types || []).includes(e.rdfaType)) problems.push(`${host}: rdfa types ${JSON.stringify(j.structuredDataEvidence?.rdfa)}`);
  if (e.noAbsenceClaim && /Geen (?:geldige JSON-LD )?structured data gevonden/.test(geoCheck("schema")?.message || "")) problems.push(`${host}: claims missing structured data although ${JSON.stringify(j.structuredDataEvidence)}`);
  if (e.orgDeductedOnce && geoCheck("organization_website")?.status === "warning" && !/telt één keer/.test(geoCheck("organization_website")?.message || "")) problems.push(`${host}: organization_website deduction not linked to the shared cause`);
  if (e.commerceNot && !weakIdentity && j.commerceApplicability?.state === e.commerceNot) problems.push(`${host}: commerce ${j.commerceApplicability?.state}/${j.commerceApplicability?.reason}; samples ${JSON.stringify(j.sitewideCommerceEvidence?.evidence || j.evidenceLayer?.sitewideCommerceEvidence?.evidence || null)?.slice(0, 300)}`);
  if (e.notClassType && classType === e.notClassType) problems.push(`${host}: classification ${classType}`);
  if (e.notSector && r.sector === e.notSector) problems.push(`${host}: must not be sector ${e.notSector}`);
  if (e.notKey && r.key === e.notKey) problems.push(`${host}: must not be ${e.notKey}`);
  if (e.type && r.type !== e.type) problems.push(`${host}: website type ${r.type}, expected ${e.type}`);
  if (e.shopChecks && r.shop.some((x) => x !== (weakIdentity && e.shopChecks === "not_applicable" ? "unable_to_confirm" : e.shopChecks))) problems.push(`${host}: shop checks ${r.shop.join("/")}, expected ${weakIdentity && e.shopChecks === "not_applicable" ? "unable_to_confirm (insufficient final identity)" : e.shopChecks}`);
  if (e.platform && r.platform !== e.platform) problems.push(`${host}: platform ${r.platform}, expected ${e.platform}`);
  if (e.noPlatform && r.platform) problems.push(`${host}: platform ${r.platform} from text only`);
  if (e.discountCheck === "active" && r.discount === "not_applicable") problems.push(`${host}: visible discount but the EU discount check is N.v.t.`);
  if (e.notSchemaType && new RegExp(`\\b${e.notSchemaType}\\b`).test(r.schema)) problems.push(`${host}: schema advice "${r.schema.slice(0, 120)}" must not name ${e.notSchemaType}`);
  if (e.schemaType && !new RegExp(`\\b${e.schemaType}\\b`).test(r.schema)) problems.push(`${host}: schema advice "${r.schema.slice(0, 120)}", expected ${e.schemaType}`);
  if (e.minCoverage && !(r.coverage >= e.minCoverage)) problems.push(`${host}: coverage ${r.coverage}%, expected ≥ ${e.minCoverage}%`);
}
for (const p of problems) console.log(" - " + p);
if (process.env.VERBOSE) for (const [h, r] of Object.entries(got)) console.log(h, JSON.stringify(r));
console.log("SCAN_MATRIX_RESULT " + JSON.stringify({ total: Object.keys(SITES).length, failed: problems.length }));
if (process.env.REPORT_FILE) writeFileSync(process.env.REPORT_FILE, JSON.stringify({ got, problems, reports }, null, 2));
process.exit(problems.length ? 1 : 0);
