export const PLAN_CATALOG = {
  free: { label: "Gratis", priceEur: 0, websites: 1, scans: 2, aiFixes: 0, competitorScans: 0, localSeo: 0 },
  start: { label: "Start", priceEur: 34.95, websites: 1, scans: 15, aiFixes: 10, competitorScans: 3, localSeo: 3 },
  business: { label: "Business", priceEur: 69.95, websites: 5, scans: 50, aiFixes: 30, competitorScans: 10, localSeo: 10 },
  "e-commerce": { label: "E-commerce", priceEur: 89.95, websites: 5, scans: 75, aiFixes: 50, competitorScans: 15, localSeo: 15 },
  pro: { label: "Pro", priceEur: 129.95, websites: 15, scans: 150, aiFixes: 100, competitorScans: 30, localSeo: 30 },
  agency: { label: "Agency", priceEur: 219.95, websites: 50, scans: 500, aiFixes: 300, competitorScans: 100, localSeo: 100 },
} as const;
export const PLAN_LIMITS = PLAN_CATALOG;
export type PlanCode = keyof typeof PLAN_CATALOG;
export function normalizePlan(value: unknown): PlanCode {
  const plan=String(value||"free").toLowerCase();
  return plan in PLAN_CATALOG ? plan as PlanCode : "free";
}
export function planLimits(value: unknown) { return PLAN_CATALOG[normalizePlan(value)]; }
export function isPaidPlan(value: unknown) { return normalizePlan(value)!=="free"; }
export function publicPriceSummary() {
  return (Object.keys(PLAN_CATALOG) as PlanCode[])
    .map((code)=>`${PLAN_CATALOG[code].label} € ${PLAN_CATALOG[code].priceEur.toFixed(2).replace(".",",")}${code==="free"?"":" per maand"}`)
    .join("; ");
}
