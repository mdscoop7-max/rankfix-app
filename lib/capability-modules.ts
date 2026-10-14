import type { ScanEvidence, EvidenceFact } from "./scan-evidence";

/**
 * Sector-independent capability gate.
 * A sector label never enables an audit module. Only evidenced capabilities do.
 * "unknown" means insufficient proof, not proof of absence.
 */
export type CapabilityState = "detected" | "likely" | "unknown";
export type CapabilityId =
  | "physical_commerce" | "checkout" | "booking" | "local"
  | "editorial" | "vehicle_inventory" | "property_inventory" | "jobs";
export type CapabilityDecision = {
  id: CapabilityId;
  state: CapabilityState;
  evidence: string[];
  modules: string[];
};
export type CapabilityReport = {
  capabilities: CapabilityDecision[];
  enabledModules: string[];
  pendingModules: string[];
};

const BASE = ["core_seo", "geo", "technical", "business_identity", "quality_trust"] as const;
const yes = (fact: EvidenceFact): boolean => fact.value === true && fact.confidence !== "low";
const proof = (fact: EvidenceFact, name: string): string[] =>
  yes(fact) ? [name, ...fact.evidence].slice(0, 4) : [];

export function detectAuditCapabilities(e: ScanEvidence): CapabilityReport {
  const c = e.commerce;
  const productDetail = yes(c.productPage) && (yes(c.products) || e.schema.product);
  const purchaseAction = yes(c.addToCart);
  // Cart links, platform fingerprints and Offer schema alone are never enough.
  const physicalCommerce = productDetail && purchaseAction;
  const commerceHint = yes(c.cart) || purchaseAction || productDetail;
  const checkout = physicalCommerce && yes(c.checkout);
  const booking = yes(e.appointments.booking) || yes(e.appointments.reservation);
  const local = yes(e.organization.address) &&
    (yes(e.organization.openingHours) || e.schema.localBusiness);
  const editorial = yes(e.sectorDetails.media.article) &&
    (yes(e.sectorDetails.media.author) || yes(e.sectorDetails.media.publishedDate));

  const decisions: CapabilityDecision[] = [];
  function add(id: CapabilityId, detected: boolean, hinted: boolean, evidence: string[], modules: string[]) {
    decisions.push({
      id,
      state: detected ? "detected" : hinted ? "likely" : "unknown",
      evidence: [...new Set(evidence)],
      modules,
    });
  }
  add("physical_commerce", physicalCommerce, commerceHint,
    [...proof(c.productPage, "product_detail"), ...proof(c.addToCart, "purchase_action")],
    ["ecommerce", "product", "merchant"]);
  add("checkout", checkout, physicalCommerce || yes(c.checkout),
    proof(c.checkout, "checkout_flow"), ["checkout"]);
  add("booking", booking, yes(e.appointments.appointment),
    [...proof(e.appointments.booking, "booking"), ...proof(e.appointments.reservation, "reservation")],
    ["booking_flow"]);
  add("local", local, yes(e.organization.address) || yes(e.organization.openingHours),
    [...proof(e.organization.address, "address"), ...proof(e.organization.openingHours, "hours")],
    ["local_seo"]);
  add("editorial", editorial, yes(e.sectorDetails.media.article),
    [...proof(e.sectorDetails.media.article, "article"), ...proof(e.sectorDetails.media.author, "author"),
      ...proof(e.sectorDetails.media.publishedDate, "published_date")],
    ["content_quality", "author_signals", "freshness"]);
  add("vehicle_inventory", yes(e.inventory.vehicles), false,
    proof(e.inventory.vehicles, "vehicles"), ["vehicle_details"]);
  add("property_inventory", yes(e.inventory.properties), false,
    proof(e.inventory.properties, "properties"), ["listing_quality"]);
  // A generic careers link must not classify a company as a recruitment agency.
  add("jobs", yes(e.inventory.jobs) && e.inventory.jobs.confidence === "high" &&
    e.inventory.jobs.sources.includes("structured_data"), yes(e.inventory.jobs),
    proof(e.inventory.jobs, "job_posting"), ["job_listing_quality"]);

  return {
    capabilities: decisions,
    enabledModules: [...new Set([...BASE, ...decisions.filter(d => d.state === "detected").flatMap(d => d.modules)])],
    pendingModules: [...new Set(decisions.filter(d => d.state === "likely").flatMap(d => d.modules))],
  };
}
