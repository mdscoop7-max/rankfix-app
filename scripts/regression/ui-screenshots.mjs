#!/usr/bin/env node
// Desktop + mobile screenshots of the score presentation on a locally started
// RankFix server: public scan result, dashboard audit page and report page.
// Throwaway accounts on a throwaway database; read-only scans.
// Usage: APP_DIR=app127 BASE_URL=http://127.0.0.1:3100 OUT_DIR=shots node scripts/regression/ui-screenshots.mjs
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const appDir = resolve(process.env.APP_DIR || "app127");
const require = createRequire(resolve(appDir, "package.json"));
const puppeteer = require("puppeteer-core");
const base = (process.env.BASE_URL || "http://127.0.0.1:3100").replace(/\/$/, "");
const out = resolve(process.env.OUT_DIR || "shots");
mkdirSync(out, { recursive: true });
const log = [];
const note = (line) => { console.log(line); log.push(line); };

const sites = [
  { id: "provisional", url: "https://www.zalando.de/" },
  { id: "confirmed", url: "https://www.acupunctuurdijkstra.nl/" },
];
const viewports = [
  { id: "desktop", width: 1366, height: 900, isMobile: false },
  { id: "mobile", width: 390, height: 844, isMobile: true, deviceScaleFactor: 2, hasTouch: true },
];

async function api(path, body, cookie = "") {
  const response = await fetch(base + path, { method: "POST", headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}), "x-forwarded-for": `10.88.0.${Math.floor(Math.random() * 200) + 1}` }, body: JSON.stringify(body), signal: AbortSignal.timeout(310000) });
  const setCookie = response.headers.get("set-cookie") || "";
  let json = null; try { json = await response.json(); } catch {}
  return { status: response.status, json, cookie: setCookie.split(";")[0] };
}

const browser = await puppeteer.launch({ headless: true, executablePath: process.env.CHROME_PATH, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
try {
  for (const site of sites) {
    // Dashboard: one throwaway account per site (Free plan: one website).
    const email = `ui-${site.id}-${Date.now()}@rankfix.test`;
    await api("/api/auth/register", { name: "UI test", email, password: "Start-Wachtw00rd!", language: "nl" });
    const login = await api("/api/auth/login", { email, password: "Start-Wachtw00rd!", language: "nl" });
    const scan = await api("/api/scan", { url: site.url, mode: "both", language: "nl", dashboard: true }, login.cookie);
    note(`${site.id}: login ${login.status} · dashboard scan ${scan.status} · scanId ${scan.json?.scanId || "-"} · score ${scan.json?.overallScore ?? "-"} · presentation ${JSON.stringify(scan.json?.scorePresentation || null)}`);
    const [name, value] = login.cookie.split("=");

    // One public scan per site; the rendered result is captured at both viewports.
    const page = await browser.newPage();
    await page.setViewport(viewports[0]);
    await page.goto(base + "/", { waitUntil: "networkidle2", timeout: 60000 });
    const input = await page.$("form input");
    let publicOk = false;
    if (input) {
      await input.click({ clickCount: 3 });
      await input.type(site.url);
      await page.keyboard.press("Enter");
      try { await page.waitForFunction(() => /Grade [A-E]/.test(document.body.innerText), { timeout: 240000 }); publicOk = true; }
      catch (error) { note(`public ${site.id}: ${error instanceof Error ? error.message.slice(0, 120) : error}`); }
    }
    for (const vp of viewports) {
      if (!publicOk) break;
      await page.setViewport(vp);
      await new Promise((r) => setTimeout(r, 800));
      const card = await page.evaluateHandle(() => [...document.querySelectorAll("div")].find((el) => /^Grade [A-E]$/.test(el.textContent?.trim() || ""))?.closest(".rounded-3xl"));
      const el = card.asElement();
      if (el) { await el.scrollIntoView(); await el.screenshot({ path: `${out}/public-${site.id}-${vp.id}-card.png` }); }
      await page.screenshot({ path: `${out}/public-${site.id}-${vp.id}-viewport.png` });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      note(`public ${site.id} ${vp.id}: ok · horizontal overflow ${overflow}px`);
    }
    await page.close();
    for (const vp of viewports) {
      if (!scan.json?.scanId || !name || !value) break;
      const dash = await browser.newPage();
      await dash.setViewport(vp);
      await dash.setCookie({ name, value, url: base });
      await dash.goto(`${base}/dashboard/audit/${scan.json.scanId}`, { waitUntil: "networkidle2", timeout: 60000 });
      try {
        await dash.waitForSelector(".rf-audit-score-hero", { timeout: 30000 });
        const hero = await dash.$(".rf-audit-score-hero");
        await hero.scrollIntoView();
        await hero.screenshot({ path: `${out}/audit-${site.id}-${vp.id}-hero.png` });
        await dash.screenshot({ path: `${out}/audit-${site.id}-${vp.id}-viewport.png` });
        const overflow = await dash.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        note(`audit ${site.id} ${vp.id}: ok · horizontal overflow ${overflow}px`);
      } catch (error) { note(`audit ${site.id} ${vp.id}: ${error instanceof Error ? error.message.slice(0, 120) : error}`); }
      await dash.goto(`${base}/dashboard/audit/${scan.json.scanId}/report`, { waitUntil: "networkidle2", timeout: 60000 });
      try {
        await dash.waitForSelector(".report-header", { timeout: 30000 });
        await (await dash.$(".report-header")).screenshot({ path: `${out}/report-${site.id}-${vp.id}-header.png` });
        note(`report ${site.id} ${vp.id}: ok`);
      } catch (error) { note(`report ${site.id} ${vp.id}: ${error instanceof Error ? error.message.slice(0, 120) : error}`); }
      await dash.close();
    }
  }
} finally {
  await browser.close();
  writeFileSync(`${out}/log.txt`, log.join("\n") + "\n");
}
