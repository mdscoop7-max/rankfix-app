import { assertPublicDns, validatePublicHttpUrl } from "@/lib/safe-fetch";
import { SCAN_BROWSER_USER_AGENT } from "@/lib/scan-user-agents";
import type { Browser } from "puppeteer-core";
import { BROWSER_IDLE_MS, LAUNCH_FAILURE_COOLDOWN_MS, MAX_CONCURRENT_PAGES, claimRender, hardenedServerlessArgs, launchSourceFor, type RenderBudget } from "@/lib/render-limits";

export { createRenderBudget, type RenderBudget } from "@/lib/render-limits";

export type HeadlessMode = "raw_html" | "javascript_rendered";
export type RenderedPage = { html: string; finalUrl: string; elapsedMs: number; requests: number };

const ALLOWED = new Set(["document", "script", "stylesheet", "xhr", "fetch"]);
const MAX_REQUESTS = 90;

// "isolated": multi-process Chromium with a fresh context per render (preferred).
// "single": fallback when the runtime cannot run multi-process Chromium; one tab at
// a time in the default context, with cookies and cache cleared before each render.
type BrowserMode = "isolated" | "single";
let browserMode: BrowserMode = process.env.RANKFIX_CHROMIUM_MODE === "single" ? "single" : "isolated";

async function launchOptions(): Promise<{ executablePath: string; args: string[] }> {
  // /dev/shm is tiny on container hosts; Chrome crashes there without this flag.
  const baseArgs = ["--disable-dev-shm-usage", "--disable-extensions", "--mute-audio", "--no-first-run", "--disable-background-networking"];
  const source = launchSourceFor(process.env);
  if (source === "executable") {
    const args = [...baseArgs];
    if (process.env.RANKFIX_CHROME_NO_SANDBOX === "1") args.push("--no-sandbox", "--disable-setuid-sandbox");
    return { executablePath: String(process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_EXECUTABLE_PATH), args };
  }
  if (source === "serverless") {
    // Serverless runtimes provide no Chrome sandbox; @sparticuz/chromium ships the
    // flags required there. Isolation comes from a fresh browser context per render
    // plus the request filter below (public HTTP(S) only, no private addresses).
    const chromium = (await import("@sparticuz/chromium")).default;
    chromium.setGraphicsMode = false;
    return { executablePath: await chromium.executablePath(), args: [...hardenedServerlessArgs(chromium.args, browserMode === "single"), ...baseArgs] };
  }
  // Local development: the full puppeteer package (dev dependency) knows where its
  // downloaded Chrome lives.
  try {
    const puppeteer = (await import("puppeteer")).default;
    const args = [...baseArgs];
    if (process.env.RANKFIX_CHROME_NO_SANDBOX === "1") args.push("--no-sandbox", "--disable-setuid-sandbox");
    return { executablePath: await puppeteer.executablePath(), args };
  } catch {
    throw new Error("BROWSER_UNAVAILABLE: no local Chrome; install dev dependencies or set PUPPETEER_EXECUTABLE_PATH");
  }
}

// One browser per warm function instance, shared by all renders of a scan.
let browserPromise: Promise<Browser> | null = null;
let launchFailedAt = 0;
let activePages = 0;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
const waiting: Array<() => void> = [];

async function getBrowser(): Promise<Browser> {
  if (launchFailedAt && Date.now() - launchFailedAt < LAUNCH_FAILURE_COOLDOWN_MS) {
    throw new Error("BROWSER_UNAVAILABLE: recent launch failure");
  }
  if (browserPromise) {
    const existing = await browserPromise.catch(() => null);
    if (existing?.connected) return existing;
    browserPromise = null;
  }
  browserPromise = (async () => {
    const { executablePath, args } = await launchOptions();
    const puppeteer = (await import("puppeteer-core")).default;
    return puppeteer.launch({ headless: true, executablePath, args, defaultViewport: { width: 1366, height: 900 }, protocolTimeout: 20_000 });
  })();
  try {
    const browser = await browserPromise;
    launchFailedAt = 0;
    browser.on("disconnected", () => { browserPromise = null; });
    return browser;
  } catch (error) {
    browserPromise = null;
    launchFailedAt = Date.now();
    throw error;
  }
}

async function acquirePage(): Promise<void> {
  if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
  if (activePages < (browserMode === "single" ? 1 : MAX_CONCURRENT_PAGES)) { activePages += 1; return; }
  await new Promise<void>((resolve) => waiting.push(resolve));
  activePages += 1;
}

function releasePage(): void {
  activePages = Math.max(0, activePages - 1);
  const next = waiting.shift();
  if (next) { next(); return; }
  if (activePages === 0 && browserPromise) {
    idleTimer = setTimeout(() => {
      const closing = browserPromise;
      browserPromise = null;
      idleTimer = null;
      void closing?.then((browser) => browser.close()).catch(() => {});
    }, BROWSER_IDLE_MS);
  }
}

export async function renderPublicPage(value: string, timeoutMs = 12000, budget?: RenderBudget): Promise<RenderedPage> {
  const target = validatePublicHttpUrl(value);
  await assertPublicDns(target.hostname);
  claimRender(budget);
  const started = Date.now();
  await acquirePage();
  let requests = 0;
  try {
    // Never wait past the scan's render deadline for a free slot or a page.
    const remainingMs = budget ? Math.max(0, budget.deadline - Date.now()) : timeoutMs;
    if (remainingMs < 3000) throw new Error("RENDER_DEADLINE_REACHED");
    const navigationTimeout = Math.min(timeoutMs, remainingMs);
    const browser = await getBrowser();
    // Preferred: a fresh context per render, so no cookies, storage or cache are
    // shared between sites. If this runtime cannot create one, switch the instance
    // to single-process mode once and retry.
    let context: Awaited<ReturnType<Browser["createBrowserContext"]>> | null = null;
    let page: Awaited<ReturnType<Browser["newPage"]>>;
    if (browserMode === "isolated") {
      try {
        context = await browser.createBrowserContext();
        page = await context.newPage();
      } catch {
        await context?.close().catch(() => {});
        context = null;
        browserMode = "single";
        browserPromise = null;
        await browser.close().catch(() => {});
        const singleBrowser = await getBrowser();
        page = await singleBrowser.newPage();
      }
    } else {
      page = await browser.newPage();
    }
    if (!context) {
      // Shared default context: clear state left by an earlier render.
      const cdp = await page.createCDPSession();
      await cdp.send("Network.clearBrowserCookies").catch(() => {});
      await cdp.send("Network.clearBrowserCache").catch(() => {});
      await cdp.detach().catch(() => {});
    }
    try {
      await page.setUserAgent({ userAgent: SCAN_BROWSER_USER_AGENT });
      await page.setRequestInterception(true);
      page.on("request", (req) => {
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
      page.setDefaultNavigationTimeout(navigationTimeout);
      await page.goto(target.toString(), { waitUntil: "domcontentloaded", timeout: navigationTimeout });
      try { await page.waitForNetworkIdle({ idleTime: 500, timeout: Math.min(2500, Math.max(500, navigationTimeout / 4)) }); } catch {}
      const finalUrl = validatePublicHttpUrl(page.url());
      await assertPublicDns(finalUrl.hostname);
      const html = await page.content();
      if (!html || html.length < 20 || html.length > 8000000) throw new Error("RENDERED_HTML_INVALID");
      return { html, finalUrl: finalUrl.toString(), elapsedMs: Date.now() - started, requests };
    } finally {
      if (context) await context.close().catch(() => {});
      else await page.close().catch(() => {});
    }
  } finally {
    releasePage();
  }
}
