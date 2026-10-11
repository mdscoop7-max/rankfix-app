// Pure limits and launch decisions for browser rendering. No imports, so they are
// unit-tested directly (tests/render-limits.test.mjs).

// ---------------------------------------------------------------------------
// Limits. Rendering is the most expensive part of a scan (CPU, memory, duration),
// so it is bounded per scan, per function instance and in time. Every limit makes
// a render fail fast; callers then keep the raw HTML result.
// ---------------------------------------------------------------------------
const envNumber = (name: string, fallback: number, min: number, max: number) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= min && value <= max ? value : fallback;
};
// Simultaneous pages in one browser. Each Chromium tab costs ~100–200 MB.
export const MAX_CONCURRENT_PAGES = envNumber("RANKFIX_RENDER_CONCURRENCY", 2, 1, 4);
// Renders allowed in one scan (main page + representative pages + listings).
const DEFAULT_RENDERS_PER_SCAN = envNumber("RANKFIX_MAX_RENDERS_PER_SCAN", 10, 0, 40);
// After this much scan time no new render starts, so the function finishes
// well inside Vercel's duration limit.
const DEFAULT_RENDER_DEADLINE_MS = envNumber("RANKFIX_RENDER_DEADLINE_MS", 150_000, 10_000, 280_000);
// Close an idle browser so a warm function instance does not keep ~300 MB.
export const BROWSER_IDLE_MS = 15_000;
// After a failed launch, do not retry (slow) launches for this long.
export const LAUNCH_FAILURE_COOLDOWN_MS = 60_000;

export type RenderBudget = { remaining: number; deadline: number };

export function createRenderBudget(maxRenders = DEFAULT_RENDERS_PER_SCAN, maxDurationMs = DEFAULT_RENDER_DEADLINE_MS, now = Date.now()): RenderBudget {
  return { remaining: Math.max(0, maxRenders), deadline: now + maxDurationMs };
}

// Takes one render from the budget, or throws a coded error the caller treats as
// "keep raw HTML".
export function claimRender(budget: RenderBudget | undefined, now = Date.now()): void {
  if (!budget) return;
  if (now >= budget.deadline) throw new Error("RENDER_DEADLINE_REACHED");
  if (budget.remaining <= 0) throw new Error("RENDER_BUDGET_EXHAUSTED");
  budget.remaining -= 1;
}

// ---------------------------------------------------------------------------
// Browser source: serverless Chromium on Vercel/Lambda, an explicit executable,
// or the full puppeteer package in local development.
// ---------------------------------------------------------------------------
export type LaunchSource = "serverless" | "executable" | "local" | "unavailable";

export function launchSourceFor(env: Record<string, string | undefined>): LaunchSource {
  if (env.PUPPETEER_EXECUTABLE_PATH || env.CHROME_EXECUTABLE_PATH) return "executable";
  if (env.VERCEL || env.AWS_LAMBDA_FUNCTION_NAME || env.RANKFIX_SERVERLESS_CHROMIUM === "1") return "serverless";
  return "local";
}

// Flags from @sparticuz/chromium that RankFix does not want: --single-process
// breaks isolated browser contexts (verified: Target.createTarget crashes), and the
// two web-security flags would relax same-origin rules inside rendered pages.
const DROPPED_SERVERLESS_ARGS = new Set(["--single-process", "--disable-web-security", "--allow-running-insecure-content"]);

export function hardenedServerlessArgs(args: string[], singleProcess: boolean): string[] {
  return args.filter((arg) => !DROPPED_SERVERLESS_ARGS.has(arg) || (singleProcess && arg === "--single-process"));
}

