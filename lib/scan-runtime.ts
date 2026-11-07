import { CRAWLER_VERSION, RULES_VERSION } from "./seo-rules.ts";
import { SCORE_MODEL_VERSION } from "./audit-score.ts";
import { localQaEnabled } from "./local-qa-mode.ts";

export const SECTOR_ENGINE_VERSION = "3.5.2-page-evidence-186";
export function scanRuntime() {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA || process.env.RF_QA_COMMIT_SHA || "";
  return {commitSha:/^[a-f0-9]{40}$/i.test(sha) ? sha : null,
    // 1 Nov: the secure local QA server is "local" by its own mode, not by the
    // absence of VERCEL_ENV (an inherited or .env.local "preview" made the local
    // QA server report "preview" and stopped the runners). vercelEnv stays visible.
    environment:localQaEnabled() ? "local" : (process.env.VERCEL_ENV || "local"), vercelEnv:process.env.VERCEL_ENV || null, sectorEngine:SECTOR_ENGINE_VERSION,
    crawler:CRAWLER_VERSION, rules:RULES_VERSION, scoreModel:SCORE_MODEL_VERSION};
}
