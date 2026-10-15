import type { Browser } from "puppeteer";
import { assertPublicDns, validatePublicHttpUrl } from "@/lib/safe-fetch";

export type HeadlessMode = "raw_html" | "javascript_rendered";
export type AxeSummary = {
  violations: {id:string;impact:string;nodes:number}[];
  passes: number;
  incomplete: number;
  scope: "hydrated_wcag_a_aa";
};
export type RenderedPage = { html: string; finalUrl: string; elapsedMs: number; requests: number;
  titlePixelWidth: number | null;
  domAccessibility: {controls:number;unnamedButtons:number;unlabeledControls:number} | null;
  axeReport: AxeSummary | null;
};

const ALLOWED = new Set(["document", "script", "stylesheet", "xhr", "fetch"]);
const MAX_REQUESTS = 90;
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

export async function renderPublicPage(value: string, timeoutMs = 12000): Promise<RenderedPage> {
  const target = validatePublicHttpUrl(value);
  await assertPublicDns(target.hostname);
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
    const puppeteer = await import("puppeteer");
    // /dev/shm is small on container hosts. Leave the sandbox enabled by default.
    const args = ["--disable-dev-shm-usage"];
    if (process.env.RANKFIX_CHROME_NO_SANDBOX === "1") args.push("--no-sandbox", "--disable-setuid-sandbox");
    let executablePath: string;
    try {
      executablePath = process.env.RANKFIX_CHROME_EXECUTABLE_PATH?.trim() || await puppeteer.default.executablePath();
      const { access } = await import("node:fs/promises");
      await access(executablePath);
    } catch {
      throw new Error("RENDER_CHROME_NOT_INSTALLED");
    }

    browser = await puppeteer.default.launch({
      headless: true,
      args,
      executablePath,
      timeout: Math.min(8000, remaining()),
    });
    const page = await browser.newPage();
    // A bare custom UA breaks sites expecting browser capabilities. Keep Chrome's
    // real user agent and identify our automated scanner without evading bot checks.
    await page.setUserAgent(`${await browser.userAgent()} RankFixBot/2.1`);
    await page.setRequestInterception(true);
    let requests = 0;
    page.on("request", (req) => {
      void (async () => {
        try {
          requests++;
          if (requests > MAX_REQUESTS || !ALLOWED.has(req.resourceType())) {
            await req.abort();
            return;
          }
          const requestUrl = validatePublicHttpUrl(req.url());
          await assertPublicDns(requestUrl.hostname);
          await req.continue();
        } catch {
          try { await req.abort(); } catch {}
        }
      })();
    });

    page.setDefaultNavigationTimeout(remaining());
    await page.goto(target.toString(), { waitUntil: "domcontentloaded", timeout: remaining() });
    // Let common hydration/XHR finish, but do not consume several extra seconds
    // per page on sites that continuously poll analytics or APIs.
    if (remaining() > 300) {
      try { await page.waitForNetworkIdle({ idleTime: 350, timeout: Math.min(1200, remaining()) }); } catch {}
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
    try {
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
    return { html, finalUrl: finalUrl.toString(), elapsedMs: Date.now() - started, requests, ...domDetails, axeReport };
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
