/**
 * The primary website type is decided by proven business identity, not by the
 * presence of a payment button, commerce SDK or incidental shop asset.
 * Ancillary commerce is a capability, not a new primary industry.
 */
export type MainWebsiteType = "Website" | "Webshop" | "Recruitmentwebsite" | "Boekings-/afsprakenwebsite";

export function resolvePrimaryWebsiteType(input: {
  primarySector: string;
  primaryKey: string;
  commerceConfirmed: boolean;
  technologySiteType: "Website" | "Webshop" | "Landingpage";
  businessModels: readonly string[];
}): MainWebsiteType {
  if (input.primarySector === "ecommerce" && input.commerceConfirmed) return "Webshop";
  if (input.primaryKey === "recruitment" && input.businessModels.includes("recruitment")) return "Recruitmentwebsite";
  if (input.primarySector !== "ecommerce" && input.businessModels.some(model =>
    model === "appointments" || model === "reservations" || model === "bookings")) return "Boekings-/afsprakenwebsite";
  // A technology-only commerce signal cannot establish the main site as a shop.
  return "Website";
}
