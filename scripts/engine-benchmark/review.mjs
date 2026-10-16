// Manual review sample for scorecard v2 criteria 2–5 (docs/SCORECARD-3.5.md §3).
//   node --experimental-strip-types scripts/engine-benchmark/review.mjs template pilot.scans.json > review.json
// Fill every "truth"/"verdict" field (null = not reviewed), then pass review.json to
//   eu81.mjs v2 <scans> <attempts> review.json
// The sample is deterministic (sorted URLs), so it cannot be cherry-picked afterwards.
import { readFileSync } from "node:fs";

const PAGE_TYPES = ["homepage", "product", "category", "article", "event", "service", "contact", "form", "legal", "support", "listing", "corporate", "other"];

export function reviewTemplate(scans, perSite = { pages: 5, findings: 5 }) {
  const latest = new Map();
  for (const s of scans) { const k = new URL(s.scanned_url).hostname.replace(/^www\./, ""); if (!latest.has(k) || new Date(s.created_at) > new Date(latest.get(k).created_at)) latest.set(k, s); }
  const sites = {};
  for (const [host, s] of [...latest.entries()].sort()) {
    const r = s.result || {};
    const pages = [...(r.multiPage?.pageAudits || [])].filter((p) => p.status === "audited").sort((a, b) => a.url.localeCompare(b.url)).slice(0, perSite.pages);
    const checks = [...(r.seo?.checks || []), ...(r.geo?.checks || [])].filter((c) => (c.status === "warning" || c.status === "fail") && c.maxPoints > 0).sort((a, b) => a.key.localeCompare(b.key)).slice(0, perSite.findings);
    const t = r.technologyProfile || {};
    sites[host] = {
      pages: pages.map((p) => ({ url: p.url, engineType: p.type, truthType: null })),
      platform: { engineCms: t.cms ?? null, enginePlatform: t.commercePlatform ?? null, truthCms: null, truthPlatform: null },
      findings: checks.map((c) => ({ key: c.key, status: c.status, deduction: c.maxPoints - c.points, message: String(c.message || "").slice(0, 200), verdict: null })),
      modules: { engine: r.sectorProfile?.applicableModules || [], correct: null, note: "" },
    };
  }
  return { instructions: `truthType ∈ ${PAGE_TYPES.join("|")}; truthCms/truthPlatform = what the page source proves ("none" if none); verdict = "correct" | "incorrect"; modules.correct = true | false.`, sites };
}

export function summarizeReview(review) {
  const out = {};
  for (const [id, s] of Object.entries(review?.sites || {})) {
    const pages = (s.pages || []).filter((p) => p.truthType);
    const finds = (s.findings || []).filter((f) => f.verdict);
    const norm = (v) => (v == null || v === "" ? "none" : String(v).toLowerCase());
    const platformReviewed = s.platform && s.platform.truthCms !== null && s.platform.truthPlatform !== null;
    out[id] = {
      pages: { correct: pages.filter((p) => p.truthType === p.engineType).length, total: pages.length },
      platformCorrect: platformReviewed ? norm(s.platform.engineCms) === norm(s.platform.truthCms) && norm(s.platform.enginePlatform).replace(/ \(headless\)/, "") === norm(s.platform.truthPlatform).replace(/ \(headless\)/, "") : undefined,
      findings: { correct: finds.filter((f) => f.verdict === "correct").length, total: finds.length },
      modulesCorrect: typeof s.modules?.correct === "boolean" ? s.modules.correct : undefined,
    };
  }
  return { sites: out };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [mode, file] = process.argv.slice(2);
  if (mode === "template") console.log(JSON.stringify(reviewTemplate(JSON.parse(readFileSync(file, "utf8"))), null, 1));
  else if (mode === "summary") console.log(JSON.stringify(summarizeReview(JSON.parse(readFileSync(file, "utf8"))), null, 1));
  else { console.error("usage: review.mjs template <scans.json> | summary <review.json>"); process.exit(2); }
}
