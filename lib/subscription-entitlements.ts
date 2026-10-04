export type RankFixAddon = {
  key: string;
  monthlyPriceEur: number;
  label: string;
};

export const TEST_ADDONS: RankFixAddon[] = [
  { key: "monitoring", label: "Monitoring", monthlyPriceEur: 2.95 },
  { key: "local_seo", label: "Local SEO", monthlyPriceEur: 2.95 },
  { key: "competitors", label: "Concurrentenanalyse", monthlyPriceEur: 3.95 },
  { key: "search_console", label: "Search Console Insights", monthlyPriceEur: 2.95 },
  { key: "reports", label: "PDF + e-mailrapporten", monthlyPriceEur: 2.95 },
  { key: "extra_website", label: "Extra website", monthlyPriceEur: 4.95 },
  { key: "product_optimizer", label: "Product Optimizer", monthlyPriceEur: 4.95 },
  { key: "checkout_audit", label: "E-commerce/Checkout Audit", monthlyPriceEur: 4.95 },
  { key: "ai_fixes", label: "AI Fixes", monthlyPriceEur: 5.95 },
  { key: "github_autofix", label: "GitHub AutoFix", monthlyPriceEur: 6.95 },
];

// Future entitlement order:
// sector relevance -> base plan entitlements -> purchased add-ons -> effective capabilities.
// Prices above are temporary test prices until subscription/payment launch.
export function effectiveCapabilityKeys(base: string[], addons: string[], sectorRelevant: string[]) {
  const allowed = new Set([...base, ...addons]);
  return sectorRelevant.filter((key) => allowed.has(key));
}
