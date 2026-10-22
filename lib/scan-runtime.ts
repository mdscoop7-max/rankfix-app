import { CRAWLER_VERSION, RULES_VERSION } from "./seo-rules.ts";
import { SCORE_MODEL_VERSION } from "./audit-score.ts";

export const SECTOR_ENGINE_VERSION = "3.5.2-page-evidence-186";
export function scanRuntime() {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA || process.env.RF_QA_COMMIT_SHA || "";
  return {commitSha:/^[a-f0-9]{40}$/i.test(sha) ? sha : null,
    environment:process.env.VERCEL_ENV || "local", sectorEngine:SECTOR_ENGINE_VERSION,
    crawler:CRAWLER_VERSION, rules:RULES_VERSION, scoreModel:SCORE_MODEL_VERSION};
}
