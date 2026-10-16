import type { Browser } from "puppeteer-core";
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
};

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

export async function renderPublicPage(value: string, timeoutMs = 12000, budget?: RenderBudget): Promise<RenderedPage> {
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
    try {
      const { access } = await import("node:fs/promises");
      await access(executablePath);
    } catch {
      throw new Error("RENDER_CHROME_NOT_INSTALLED");
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
    page.on("request", (req) => {
      void (async () => {
        try {
          if (!ALLOWED.has(req.resourceType())) {
            await req.abort();
            return;
          }
          requests++;
          if (requests > MAX_REQUESTS) {
            await req.abort();
            return;
          }
          const requestUrl = validatePublicHttpUrl(req.url());
          await checkHost(requestUrl.hostname);
          await req.continue();
        } catch {
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
      await page.goto(target.toString(), { waitUntil: "domcontentloaded", timeout: Math.max(1000, remaining() - SNAPSHOT_RESERVE_MS) });
    } catch (navigationError) {
      const message = navigationError instanceof Error ? navigationError.message : String(navigationError);
      if (!/timeout|timed out|exceeded/i.test(message) || page.url() === "about:blank") throw navigationError;
      partialNavigation = true;
    }
    // Let common hydration/XHR finish, but do not consume several extra seconds
    // per page on sites that continuously poll analytics or APIs.
    if (!partialNavigation && remaining() > 300) {
      try { await page.waitForNetworkIdle({ idleTime: 350, timeout: Math.min(1200, remaining()) }); } catch {}
    }
    // Nuxt/Next hydrate shortly after DOMContentLoaded and can still be updating
    // after a brief network-idle interval. Take a bounded, observable snapshot
    // after the app root settles; never wait indefinitely for polling scripts.
    // This does not bypass site protections or mark a degraded page as valid.
    if (!partialNavigation && remaining() > 1700) {
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
    // A partially loaded page is not a basis for an accessibility rule run.
    if (!partialNavigation) try {
      const axeCore = (await import("axe-core")).default;
      await withinTimeout(page.evaluate(axeCore.source), Math.min(2500, remaining()));
      axeReport = await withinTimeout(page.evaluate(async () => {
        const axe = (window as typeof window & { axe?: {
          run: (root: Document, options: object) => Promise<{
            violations: Array<{id:string;impact:string|null;nodes:unknown[]}>;
            passes: unknown[]; incomplete: unknown[];
          }>;
        } }).axe;
        if (!axe) throw new Error("AXE_NOT_INJECTED");
        const result = await axe.run(document, {
          runOnly: {type:"tag",values:["wcag2a","wcag2aa","wcag21a","wcag21aa"]},
        });
        return {
          violations: result.violations.slice(0,30).map(rule=>({
            id:rule.id,
            impact:rule.impact||"moderate",
            nodes:rule.nodes.length,
          })),
          passes:result.passes.length,
          incomplete:result.incomplete.length,
          scope:"hydrated_wcag_a_aa" as const,
        };
      }), Math.min(3500, remaining()));
    } catch (error) {
      console.info("RankFix axe-core fallback", {
        reason:error instanceof Error ? error.message.slice(0,80) : "AXE_UNAVAILABLE",
      });
    }
    return { html, finalUrl: finalUrl.toString(), elapsedMs: Date.now() - started, requests, ...(partialNavigation ? { partialNavigation } : {}), ...domDetails, axeReport };
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
