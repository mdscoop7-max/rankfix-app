import { assertPublicDns, validatePublicHttpUrl } from "@/lib/safe-fetch";

export type HeadlessMode = "raw_html" | "javascript_rendered";
export type RenderedPage = { html: string; finalUrl: string; elapsedMs: number; requests: number };

const ALLOWED = new Set(["document", "script", "stylesheet", "xhr", "fetch"]);
const MAX_REQUESTS = 90;

export async function renderPublicPage(value: string, timeoutMs = 12000): Promise<RenderedPage> {
  const target = validatePublicHttpUrl(value);
  await assertPublicDns(target.hostname);
  const puppeteer = await import("puppeteer");
  const started = Date.now();
  const browser = await puppeteer.default.launch({ headless: true });
  let requests = 0;
  try {
    const page = await browser.newPage();
    await page.setUserAgent("RankFixBrowser/1.0");
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
    page.setDefaultNavigationTimeout(timeoutMs);
    await page.goto(target.toString(), { waitUntil: "domcontentloaded", timeout: timeoutMs });
    try { await page.waitForNetworkIdle({ idleTime: 500, timeout: 2500 }); } catch {}
    const finalUrl = validatePublicHttpUrl(page.url());
    await assertPublicDns(finalUrl.hostname);
    const html = await page.content();
    if (!html || html.length < 20 || html.length > 8000000) throw new Error("RENDERED_HTML_INVALID");
    return { html, finalUrl: finalUrl.toString(), elapsedMs: Date.now() - started, requests };
  } finally { await browser.close(); }
}
