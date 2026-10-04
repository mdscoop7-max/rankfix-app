export const PLAN_LIMITS = {
  free: { websites: 1, scans: 2, aiFixes: 0, competitorScans: 0, localSeo: 0 },
  start: { websites: 1, scans: 10, aiFixes: 10, competitorScans: 3, localSeo: 3 },
  business: { websites: 5, scans: 30, aiFixes: 30, competitorScans: 10, localSeo: 10 },
  "e-commerce": { websites: 5, scans: 50, aiFixes: 50, competitorScans: 15, localSeo: 15 },
  pro: { websites: 100, scans: 100, aiFixes: 100, competitorScans: 30, localSeo: 30 },
  agency: { websites: 50, scans: 300, aiFixes: 300, competitorScans: 100, localSeo: 100 },
} as const;

export type PlanCode = keyof typeof PLAN_LIMITS;

export function normalizePlan(value: unknown): PlanCode {
  const plan=String(value||"free").toLowerCase();
  return plan in PLAN_LIMITS ? plan as PlanCode : "free";
}

export function planLimits(value: unknown) {
  return PLAN_LIMITS[normalizePlan(value)];
}

export function isPaidPlan(value: unknown) {
  return normalizePlan(value)!=="free";
}
