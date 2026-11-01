import { AXE_RUN_SCRIPT } from "./axe-script.ts";
import type { Browser, HTTPRequest } from "puppeteer-core";
import { createBrowserDiagnostics, type BrowserAbortCause, type BrowserDiagnostics } from "./browser-diagnostics.ts";
import { claimRender, launchSourceFor, hardenedServerlessArgs, type RenderBudget } from "@/lib/render-limits";
import { assertPublicDns, validatePublicHttpUrl } from "@/lib/safe-fetch";

export { createRenderBudget } from "@/lib/render-limits";
export type HeadlessMode = "raw_html" | "javascript_rendered";

export type AxeSummary = {
  violations: {id:string;impact:string;nodes:number}[];
  passes: number;
  incomplete: number;
  scope: "hydrated_wcag_a_aa";
};
export type RenderedPage = { html: string; finalUrl: string; elapsedMs: number; requests: number;
  /** Navigation did not reach DOMContentLoaded in time; the DOM was snapshotted as it was. The evidence gate decides if it is usable. */
  partialNavigation?: boolean;
  titlePixelWidth: number | null;
  domAccessibility: {controls:number;unnamedButtons:number;unlabeledControls:number} | null;
  axeReport: AxeSummary | null;
  /** Why axe-core did not complete (null when it ran or was not attempted). */
  axeError?: string | null;
  /** Structured-data observation mode only: how complete the observation was. */
  observation?: RenderObservation;
  /** Diagnostic evidence only; never an automatic score deduction. */
  diagnostics?: BrowserDiagnostics;
};

/**
 * 1 Nov 2026 (P5): a separate, bounded observation mode for the targeted
 * structured-data check. It waits for the full "load" event and then at most
 * `settleMs` for network quiet, skips the accessibility scan, gives no consent
 * (the crawler view) and reports every limit, so an incomplete observation can
 * never be taken as proof that JSON-LD is absent.
 */
export type RenderOptions = { mode?: "default" | "structured_data"; settleMs?: number; /** Measurement only: extra fixed wait after settling (long-window comparison). */ holdMs?: number };
export type RenderObservation = { loadReached: boolean; settledMs: number; networkQuiet: boolean; requestCapHit: boolean; abortedRequests: number; failedRequests: number; consent: "none"; window: string };

const ALLOWED = new Set(["document", "script", "stylesheet", "xhr", "fetch"]);
// Cap on requests that are actually loaded (document, script, stylesheet, xhr, fetch).
// Blocked images, fonts and media do not count: on image-heavy pages they used to use
// up the cap, after which the page's own scripts were aborted and hydration failed.
const MAX_REQUESTS = 90;
// Time kept back from navigation so a slow page can still be snapshotted.
const SNAPSHOT_RESERVE_MS = 2500;
const MAX_CONCURRENT_BROWSERS = 2;
const MAX_QUEUED_BROWSERS = 8;
const MAX_QUEUE_WAIT_MS = 15000;
let activeBrowsers = 0;
const queuedBrowsers: Array<{ grant: () => void }> = [];

// A route may audit many representative pages at the same time. Limit Chrome
// launches per Node worker so a burst cannot exhaust a small Render instance.
async function acquireBrowserSlot(): Promise<void> {
  if (activeBrowsers < MAX_CONCURRENT_BROWSERS && queuedBrowsers.length === 0) {
    activeBrowsers++;
    return;
  }
  if (queuedBrowsers.length >= MAX_QUEUED_BROWSERS) throw new Error("RENDER_BUSY");
  await new Promise<void>((resolve, reject) => {
    const waiter = {
      grant: () => {
        clearTimeout(timer);
        resolve();
      },
    };
    queuedBrowsers.push(waiter);
    const timer = setTimeout(() => {
      const index = queuedBrowsers.indexOf(waiter);
      if (index >= 0) {
        queuedBrowsers.splice(index, 1);
        reject(new Error("RENDER_BUSY"));
      }
    }, MAX_QUEUE_WAIT_MS);
  });
}

function releaseBrowserSlot() {
  const next = queuedBrowsers.shift();
  if (next) next.grant(); // Transfer the occupied slot; do not start a third browser.
  else activeBrowsers = Math.max(0, activeBrowsers - 1);
}

async function withinTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("RENDER_TIMEOUT")), Math.max(1, timeoutMs));
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function renderPublicPage(value: string, timeoutMs = 12000, budget?: RenderBudget, options: RenderOptions = {}): Promise<RenderedPage> {
  const structuredMode = options.mode === "structured_data";
  const settleMs = Math.max(0, Math.min(options.settleMs ?? 3000, 5000));
  const requestCap = structuredMode ? 150 : MAX_REQUESTS;
  let cappedRequests = 0;
  let failedRequests = 0;
  const diagnostics = createBrowserDiagnostics(value);
  const abortCauses = new WeakMap<HTTPRequest, BrowserAbortCause>();
  const interceptionErrors = new WeakMap<HTTPRequest, string>();
  let lastObservedUrl = value;
  let navigationFailure: BrowserDiagnostics["navigationError"] = null;
  const target = validatePublicHttpUrl(value);
  await assertPublicDns(target.hostname);
  claimRender(budget);
  await acquireBrowserSlot();

  let browser: Browser | undefined;
  const started = Date.now();
  const budgetMs = Number.isFinite(timeoutMs) ? Math.max(1000, Math.min(timeoutMs, 15000)) : 12000;
  const deadline = started + budgetMs;
  const remaining = () => {
    const ms = deadline - Date.now();
    if (ms <= 0) throw new Error("RENDER_TIMEOUT");
    return ms;
  };

  try {
    // Vercel has no Puppeteer-managed Chrome cache. Ship and trace a
    // Lambda-compatible Chromium instead; keep locally installed Chrome for dev.
    const source = launchSourceFor(process.env);
    let executablePath: string;
    let args = ["--disable-dev-shm-usage"];
    if (source === "serverless") {
      const chromium = (await import("@sparticuz/chromium")).default;
      chromium.setGraphicsMode = false;
      executablePath = await chromium.executablePath();
      args = [...hardenedServerlessArgs(chromium.args, false), ...args];
    } else if (source === "executable") {
      executablePath = (process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_EXECUTABLE_PATH || "").trim();
      if (process.env.RANKFIX_CHROME_NO_SANDBOX === "1") args.push("--no-sandbox", "--disable-setuid-sandbox");
    } else {
      const local = (await import("puppeteer")).default;
      executablePath = await local.executablePath();
    }
    // Local QA machines can have Chrome or Edge installed without a Puppeteer
    // cache. Never use this fallback in serverless mode.
    const { access } = await import("node:fs/promises");
    try {
      await access(executablePath);
    } catch {
      if (source !== "serverless") {
        const { platform } = await import("node:os");
        const { join } = await import("node:path");
        const candidates = platform() === "win32"
          ? [
              join(process.env.PROGRAMFILES || "C:\\Program Files", "Google", "Chrome", "Application", "chrome.exe"),
              join(process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)", "Google", "Chrome", "Application", "chrome.exe"),
              join(process.env.PROGRAMFILES || "C:\\Program Files", "Microsoft", "Edge", "Application", "msedge.exe"),
              join(process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)", "Microsoft", "Edge", "Application", "msedge.exe"),
            ]
          : platform() === "darwin"
            ? ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"]
            : ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"];
        const found = await Promise.all(candidates.map(async p => {
          try { await access(p); return p; } catch { return null; }
        }));
        executablePath = found.find((p): p is string => p !== null) || executablePath;
      }
      try { await access(executablePath); } catch { throw new Error("RENDER_CHROME_NOT_INSTALLED"); }
    }
    const puppeteer = (await import("puppeteer-core")).default;
    browser = await puppeteer.launch({
      headless: true, args, executablePath,
      timeout: Math.min(8000, remaining()), protocolTimeout: 20000,
    });
    const page = await browser.newPage();
    // A bare custom UA breaks sites expecting browser capabilities. Keep Chrome's
    // real user agent and identify our automated scanner without evading bot checks.
    await page.setUserAgent(`${await browser.userAgent()} RankFixBot/2.1`);
    await page.setRequestInterception(true);
    let requests = 0;
    // One DNS check per host per render (same public-address check, not repeated for
    // every script and XHR of that host, which serialised and slowed heavy pages).
    const dnsChecks = new Map<string, Promise<void>>();
    const checkHost = (hostname: string) => {
      let pending = dnsChecks.get(hostname);
      if (!pending) { pending = assertPublicDns(hostname); dnsChecks.set(hostname, pending); }
      return pending;
    };
    page.on("requestfailed", (req) => {
      // Images/fonts/media are intentionally never loaded, not network failures.
      if (!ALLOWED.has(req.resourceType())) return;
      failedRequests++;
      diagnostics.failed({ url: req.url(), resourceType: req.resourceType(), errorText: req.failure()?.errorText, abortCause: abortCauses.get(req), interceptionError: interceptionErrors.get(req) });
    });
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) lastObservedUrl = frame.url();
    });
    page.on("response", (response) => {
      const req = response.request();
      // Only HTTP redirects of the top-level document, not iframes or API calls.
      if (!req.isNavigationRequest() || req.frame() !== page.mainFrame() || response.status() < 300 || response.status() >= 400) return;
      const location = response.headers().location;
      if (location) try { diagnostics.redirected(response.url(), new URL(location, response.url()).toString(), response.status()); } catch {}
    });
    page.on("request", (req) => {
      void (async () => {
        try {
          if (!ALLOWED.has(req.resourceType())) {
            diagnostics.filtered();
            await req.abort();
            return;
          }
          requests++;
          if (requests > requestCap) {
            cappedRequests++;
            abortCauses.set(req, "request_cap");
            await req.abort();
            return;
          }
          try {
            const requestUrl = validatePublicHttpUrl(req.url());
            await checkHost(requestUrl.hostname);
          } catch (error) {
            abortCauses.set(req, "public_url_guard");
            throw error;
          }
          await req.continue();
        } catch (error) {
          interceptionErrors.set(req, error instanceof Error ? error.message : String(error));
          if (!abortCauses.has(req)) abortCauses.set(req, "interception_error");
          try { await req.abort(); } catch {}
        }
      })();
    });

    page.setDefaultNavigationTimeout(remaining());
    // A heavy page can miss DOMContentLoaded within the budget while its content is
    // already in the DOM. Keep time for one snapshot instead of failing outright;
    // renderImprovesEvidence/isSubstantiveRender still decide whether it is usable.
    let partialNavigation = false;
    try {
      await page.goto(target.toString(), { waitUntil: structuredMode ? "load" : "domcontentloaded", timeout: Math.max(1000, remaining() - SNAPSHOT_RESERVE_MS) });
    } catch (navigationError) {
      const message = navigationError instanceof Error ? navigationError.message : String(navigationError);
      const timedOut = /timeout|timed out|exceeded/i.test(message);
      navigationFailure = { name: navigationError instanceof Error ? navigationError.name : "Error", message: message.slice(0, 300), category: timedOut ? "timeout" : "other" };
      if (!timedOut || page.url() === "about:blank") throw navigationError;
      partialNavigation = true;
    }
    // Structured-data mode: after "load", wait at most settleMs for 750 ms of
    // network quiet (tag managers fire on load); stop early when quiet.
    let networkQuiet = false;
    let settledMs = 0;
    if (structuredMode && !partialNavigation && remaining() > SNAPSHOT_RESERVE_MS) {
      const settleStarted = Date.now();
      try { await page.waitForNetworkIdle({ idleTime: 750, timeout: Math.max(1, Math.min(settleMs, remaining() - SNAPSHOT_RESERVE_MS)) }); networkQuiet = true; } catch {}
      const hold = Math.max(0, Math.min(options.holdMs ?? 0, 8000, remaining() - SNAPSHOT_RESERVE_MS));
      if (hold > 0) await new Promise((resolve) => setTimeout(resolve, hold));
      settledMs = Date.now() - settleStarted;
    }
    // Let common hydration/XHR finish, but do not consume several extra seconds
    // per page on sites that continuously poll analytics or APIs.
    if (!structuredMode && !partialNavigation && remaining() > 300) {
      try { await page.waitForNetworkIdle({ idleTime: 350, timeout: Math.min(1200, remaining()) }); } catch {}
    }
    // Nuxt/Next hydrate shortly after DOMContentLoaded and can still be updating
    // after a brief network-idle interval. Take a bounded, observable snapshot
    // after the app root settles; never wait indefinitely for polling scripts.
    // This does not bypass site protections or mark a degraded page as valid.
    if (!structuredMode && !partialNavigation && remaining() > 1700) {
      try {
        await withinTimeout(page.evaluate(() => new Promise<void>((resolve) => {
          const appRoot = document.querySelector("#__nuxt, #__next, [ng-version], [data-reactroot]");
          if (!appRoot || typeof MutationObserver === "undefined") { resolve(); return; }
          let quietTimer = 0;
          let maxTimer = 0;
          let finished = false;
          const observer = new MutationObserver(() => {
            if (quietTimer) window.clearTimeout(quietTimer);
            quietTimer = window.setTimeout(done, 350);
          });
          function done() {
            if (finished) return;
            finished = true;
            observer.disconnect();
            if (quietTimer) window.clearTimeout(quietTimer);
            if (maxTimer) window.clearTimeout(maxTimer);
            resolve();
          }
          observer.observe(appRoot, {subtree:true, childList:true, characterData:true});
          quietTimer = window.setTimeout(done, 350);
          maxTimer = window.setTimeout(done, 1250);
        })), Math.min(1600, remaining()));
      } catch {
        // Browser snapshot remains best-effort. The evidence-quality gate below
        // still decides whether hydrated markup can replace raw HTML.
      }
    }
    const finalUrl = validatePublicHttpUrl(page.url());
    await assertPublicDns(finalUrl.hostname);
    const html = await withinTimeout(page.content(), remaining());
    if (!html || html.length < 20 || html.length > 8000000) throw new Error("RENDERED_HTML_INVALID");
    // Only inspect the actually hydrated DOM; this is a bounded basic accessible
    // name inspection, not a WCAG/axe-core certification.
    const domDetails = await withinTimeout(page.evaluate(() => {
      const t = document.title || "";
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.font = "20px Arial";
      const titlePixelWidth = ctx && t ? ctx.measureText(t).width : null;
      const controls = [...document.querySelectorAll("button,input:not([type=hidden]),select,textarea")];
      let unnamedButtons = 0;
      let unlabeledControls = 0;
      for (const el of controls) {
        const element = el as HTMLElement;
        if (element.closest("[hidden],[aria-hidden='true']")) continue;
        const labelledBy = (element.getAttribute("aria-labelledby") || "").split(/\s+/).filter(Boolean)
          .map(id => document.getElementById(id)?.textContent?.trim() || "").join(" ").trim();
        const labelText = element.getAttribute("aria-label")?.trim() || labelledBy
          || element.getAttribute("title")?.trim()
          || ("labels" in element && element.labels ? [...element.labels as NodeListOf<HTMLLabelElement>].map(label => label.textContent?.trim() || "").join(" ").trim() : "")
          || element.textContent?.trim() || "";
        if (element.tagName === "BUTTON") {
          const iconImage = element.querySelector("img[alt]:not([alt=''])");
          if (!labelText && !iconImage) unnamedButtons++;
        } else if (!labelText) unlabeledControls++;
      }
      return {titlePixelWidth,domAccessibility:{controls:controls.length,unnamedButtons,unlabeledControls}};
    }), remaining());
    // axe-core runs locally inside the already hydrated DOM. It is optional:
    // a slow rule run must not turn an otherwise good rendered page into a
    // failed crawl. In that case the report explicitly falls back to the
    // limited accessible-name inspection, not a WCAG conformance claim.
    let axeReport: AxeSummary | null = null;
    let axeError: string | null = partialNavigation ? "PARTIAL_NAVIGATION" : null;
    // A partially loaded page is not a basis for an accessibility rule run.
    if (!partialNavigation && !structuredMode) try {
      const axeCore = (await import("axe-core")).default;
      await withinTimeout(page.evaluate(axeCore.source), Math.min(2500, remaining()));
      // Passed as a STRING, not a function: a bundled/transpiled async function
      // carries helper references (e.g. "t") that do not exist in the page and
      // failed with "t is not defined" (QA 144). A string is evaluated as-is.
      axeReport = await withinTimeout(page.evaluate(AXE_RUN_SCRIPT) as Promise<AxeSummary>, Math.min(3500, remaining()));
    } catch (error) {
      axeError = error instanceof Error ? error.message.slice(0,80) : "AXE_UNAVAILABLE";
      console.info("RankFix axe-core fallback", { reason: axeError });
    }
    const observation: RenderObservation | undefined = structuredMode ? {
      loadReached: !partialNavigation, settledMs, networkQuiet, requestCapHit: cappedRequests > 0,
      abortedRequests: cappedRequests, failedRequests, consent: "none",
      window: `load${partialNavigation ? " (niet bereikt)" : ""} + ${settledMs} ms${networkQuiet ? " tot netwerkrust" : " (geen netwerkrust)"}`,
    } : undefined;
    return { html, finalUrl: finalUrl.toString(), diagnostics: diagnostics.snapshot(finalUrl.toString(), navigationFailure), elapsedMs: Date.now() - started, requests, ...(partialNavigation ? { partialNavigation } : {}), ...domDetails, axeReport, axeError, ...(observation ? { observation } : {}) };
  } catch (error) {
    // Preserve request evidence even when navigation fails before a DOM snapshot.
    if (error instanceof Error) Object.assign(error, { browserDiagnostics: diagnostics.snapshot(lastObservedUrl, navigationFailure) });
    throw error;
  } finally {
    if (browser) {
      try { await withinTimeout(browser.close(), 2000); }
      catch {
        // If Chrome stops responding, do not keep a leaking process alive.
        try { browser.process()?.kill("SIGKILL"); } catch {}
      }
    }
    releaseBrowserSlot();
  }
}
