import { assertPublicDns, isBlockedAddress, validatePublicHttpUrl } from "@/lib/safe-fetch";

/**
 * Bounded headless rendering for JavaScript pages.
 *
 * - Optional: when Chromium is missing (e.g. Vercel serverless without a
 *   Chromium build), rendering fails fast with HEADLESS_UNAVAILABLE and the
 *   raw-HTML scan continues. A circuit breaker prevents every page of a scan
 *   from re-trying a launch that cannot work.
 * - Bounded: a per-instance concurrency limit, a queue timeout, a hard overall
 *   deadline and a forced kill of the browser process on timeout.
 * - Safe: every request is validated against the SSRF policy and any response
 *   served from an internal address discards the whole render.
 *
 * Configuration (all optional):
 *   RANKFIX_HEADLESS=off               disable rendering entirely
 *   PUPPETEER_EXECUTABLE_PATH / CHROME_PATH   explicit Chromium binary
 *   RANKFIX_HEADLESS_CONCURRENCY=2     parallel browsers per instance (1-4)
 */

export type HeadlessMode = "raw_html" | "javascript_rendered";
export type RenderedPage = { html: string; finalUrl: string; elapsedMs: number; requests: number };

export type HeadlessErrorCode =
  | "HEADLESS_DISABLED" | "HEADLESS_UNAVAILABLE" | "HEADLESS_BUSY" | "HEADLESS_TIMEOUT"
  | "HEADLESS_BLOCKED_ADDRESS" | "HEADLESS_NAVIGATION_FAILED" | "RENDERED_HTML_INVALID";

export class HeadlessRenderError extends Error {
  readonly code: HeadlessErrorCode;
  readonly detail: string | null;
  constructor(code: HeadlessErrorCode, detail: string | null = null) {
    super(code);
    this.name = "HeadlessRenderError";
    this.code = code;
    this.detail = detail;
  }
}

// Minimal structural types so tests can inject a fake browser without Chromium.
type RequestLike = { url(): string; resourceType(): string; abort(): Promise<void>; continue(): Promise<void> };
type ResponseLike = { remoteAddress(): { ip?: string } };
type PageLike = {
  setUserAgent(value: string): Promise<void>;
  setRequestInterception(value: boolean): Promise<void>;
  on(event: "request", handler: (request: RequestLike) => void): unknown;
  on(event: "response", handler: (response: ResponseLike) => void): unknown;
  setDefaultNavigationTimeout(ms: number): void;
  goto(url: string, options: { waitUntil: "domcontentloaded"; timeout: number }): Promise<ResponseLike | null>;
  waitForNetworkIdle(options: { idleTime: number; timeout: number }): Promise<void>;
  url(): string;
  content(): Promise<string>;
};
type BrowserLike = { newPage(): Promise<PageLike>; close(): Promise<void>; process?(): { kill(signal?: string): boolean } | null };
export type HeadlessLauncher = (options: { executablePath?: string; args: string[]; timeoutMs: number }) => Promise<BrowserLike>;

const ALLOWED = new Set(["document", "script", "stylesheet", "xhr", "fetch"]);
const MAX_REQUESTS = 90;
const BREAKER_MS = 10 * 60 * 1000;
const QUEUE_TIMEOUT_MS = 4000;
const LAUNCH_TIMEOUT_MS = 8000;

const state = {
  unavailableUntil: 0,
  unavailableReason: null as string | null,
  lastSuccessAt: null as number | null,
  active: 0,
  waiters: [] as Array<() => void>,
};
let launcherOverride: HeadlessLauncher | null = null;

/** Test hook: inject a launcher (or null to restore Puppeteer) and reset breaker state. */
export function __setHeadlessLauncherForTests(launcher: HeadlessLauncher | null) {
  launcherOverride = launcher;
  state.unavailableUntil = 0;
  state.unavailableReason = null;
  state.lastSuccessAt = null;
  state.active = 0;
  state.waiters = [];
}

function settings() {
  const executablePath = (process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_PATH || "").trim() || undefined;
  const concurrency = Number(process.env.RANKFIX_HEADLESS_CONCURRENCY || 2);
  const serverless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NETLIFY);
  return {
    disabled: /^(?:off|false|0|disabled)$/i.test(String(process.env.RANKFIX_HEADLESS || "").trim()),
    executablePath,
    maxConcurrent: Number.isFinite(concurrency) ? Math.min(4, Math.max(1, Math.round(concurrency))) : 2,
    // Full Puppeteer downloads Chrome into a cache that serverless bundles do not ship.
    serverlessWithoutChromium: serverless && !executablePath && !launcherOverride,
  };
}

export function headlessStatus() {
  const config = settings();
  const now = Date.now();
  const unavailable = config.disabled || config.serverlessWithoutChromium || state.unavailableUntil > now;
  return {
    enabled: !config.disabled,
    available: unavailable ? false : state.lastSuccessAt ? true : null,
    reason: config.disabled ? "disabled_by_configuration" : config.serverlessWithoutChromium ? "serverless_without_chromium" : state.unavailableUntil > now ? state.unavailableReason : null,
    executablePathConfigured: Boolean(config.executablePath),
    maxConcurrent: config.maxConcurrent,
    active: state.active,
    queued: state.waiters.length,
  };
}

function launchArgs() {
  const args = [
    "--no-first-run", "--no-default-browser-check", "--disable-dev-shm-usage", "--disable-gpu",
    "--disable-extensions", "--disable-background-networking", "--disable-sync", "--mute-audio",
    "--hide-scrollbars", "--disable-features=Translate,MediaRouter,OptimizationHints",
  ];
  // Chromium refuses to start its sandbox as root (typical in containers).
  if (typeof process.getuid === "function" && process.getuid() === 0) args.push("--no-sandbox");
  return args;
}

const defaultLauncher: HeadlessLauncher = async ({ executablePath, args, timeoutMs }) => {
  const puppeteer = await import("puppeteer");
  return puppeteer.default.launch({ headless: true, executablePath, args, timeout: timeoutMs }) as unknown as BrowserLike;
};

async function acquireSlot(maxConcurrent: number, queueTimeoutMs = QUEUE_TIMEOUT_MS) {
  if (state.active < maxConcurrent) { state.active += 1; return; }
  await new Promise<void>((resolve, reject) => {
    const waiter = () => { clearTimeout(timer); state.active += 1; resolve(); };
    const timer = setTimeout(() => {
      state.waiters = state.waiters.filter(item => item !== waiter);
      reject(new HeadlessRenderError("HEADLESS_BUSY"));
    }, queueTimeoutMs);
    state.waiters.push(waiter);
  });
}

function releaseSlot() {
  state.active = Math.max(0, state.active - 1);
  const next = state.waiters.shift();
  if (next) next();
}

const isLaunchFailure = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error || "");
  return /could not find (?:chrome|chromium|expected browser)|failed to launch|browser process|ENOENT|executable|spawn|libnss|shared libraries|Timed out after \d+ ms while waiting for the WS endpoint/i.test(message);
};

export type RenderOptions = { deadlineMs?: number; queueTimeoutMs?: number };

export async function renderPublicPage(value: string, timeoutMs = 12000, options: RenderOptions = {}): Promise<RenderedPage> {
  const config = settings();
  if (config.disabled) throw new HeadlessRenderError("HEADLESS_DISABLED");
  if (config.serverlessWithoutChromium) throw new HeadlessRenderError("HEADLESS_UNAVAILABLE", "serverless_without_chromium");
  if (state.unavailableUntil > Date.now()) throw new HeadlessRenderError("HEADLESS_UNAVAILABLE", state.unavailableReason);

  const target = validatePublicHttpUrl(value);
  await assertPublicDns(target.hostname);
  await acquireSlot(config.maxConcurrent, options.queueTimeoutMs);

  const started = Date.now();
  let browser: BrowserLike | null = null;
  let deadline: ReturnType<typeof setTimeout> | null = null;
  let aborted = false;
  const kill = () => { try { browser?.process?.()?.kill("SIGKILL"); } catch {} };
  try {
    const work = (async () => {
      try {
        browser = await (launcherOverride || defaultLauncher)({ executablePath: config.executablePath, args: launchArgs(), timeoutMs: LAUNCH_TIMEOUT_MS });
      } catch (error) {
        if (isLaunchFailure(error)) {
          state.unavailableUntil = Date.now() + BREAKER_MS;
          state.unavailableReason = (error instanceof Error ? error.message : "launch_failed").slice(0, 120);
          throw new HeadlessRenderError("HEADLESS_UNAVAILABLE", state.unavailableReason);
        }
        throw error;
      }
      if (aborted) {
        // The deadline passed while Chromium was still starting: never leave it running.
        const late = browser as BrowserLike;
        await late.close().catch(() => {});
        try { late.process?.()?.kill("SIGKILL"); } catch {}
        throw new HeadlessRenderError("HEADLESS_TIMEOUT");
      }
      let requests = 0;
      let blockedPeer = false;
      const page = await browser.newPage();
      await page.setUserAgent("RankFixBrowser/1.0");
      await page.setRequestInterception(true);
      page.on("request", (req: RequestLike) => {
        void (async () => {
          try {
            requests += 1;
            if (requests > MAX_REQUESTS || !ALLOWED.has(req.resourceType())) { await req.abort(); return; }
            const requestUrl = validatePublicHttpUrl(req.url());
            await assertPublicDns(requestUrl.hostname);
            await req.continue();
          } catch { try { await req.abort(); } catch {} }
        })();
      });
      // DNS rebinding guard for the browser: Chromium resolves names itself, so verify the
      // address every response actually came from and discard the render on any internal peer.
      page.on("response", (response: ResponseLike) => {
        try {
          const ip = response.remoteAddress()?.ip;
          if (ip && isBlockedAddress(ip)) blockedPeer = true;
        } catch {}
      });
      page.setDefaultNavigationTimeout(timeoutMs);
      try {
        await page.goto(target.toString(), { waitUntil: "domcontentloaded", timeout: timeoutMs });
      } catch (error) {
        throw new HeadlessRenderError("HEADLESS_NAVIGATION_FAILED", error instanceof Error ? error.message.slice(0, 120) : null);
      }
      try { await page.waitForNetworkIdle({ idleTime: 500, timeout: 2500 }); } catch {}
      if (blockedPeer) throw new HeadlessRenderError("HEADLESS_BLOCKED_ADDRESS");
      const finalUrl = validatePublicHttpUrl(page.url());
      await assertPublicDns(finalUrl.hostname);
      const html = await page.content();
      if (blockedPeer) throw new HeadlessRenderError("HEADLESS_BLOCKED_ADDRESS");
      if (!html || html.length < 20 || html.length > 8000000) throw new HeadlessRenderError("RENDERED_HTML_INVALID");
      state.lastSuccessAt = Date.now();
      return { html, finalUrl: finalUrl.toString(), elapsedMs: Date.now() - started, requests };
    })();
    const timeout = new Promise<never>((_, reject) => {
      deadline = setTimeout(() => { kill(); reject(new HeadlessRenderError("HEADLESS_TIMEOUT")); }, options.deadlineMs ?? timeoutMs + LAUNCH_TIMEOUT_MS + 3000);
    });
    work.catch(() => {});
    return await Promise.race([work, timeout]);
  } finally {
    aborted = true;
    if (deadline) clearTimeout(deadline);
    const opened = browser as BrowserLike | null;
    if (opened) {
      await Promise.race([opened.close().catch(() => {}), new Promise(resolve => setTimeout(resolve, 2000))]);
      kill();
    }
    releaseSlot();
  }
}
