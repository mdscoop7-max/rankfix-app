// Local UI acceptance test. All account and scan responses are fixtures; no real account is changed.
// Start `npm run dev -- --port 3100`, then run this file with Node 24.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import { spawn } from 'node:child_process';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';

const baseUrl = process.env.DASHBOARD_TEST_URL || 'http://127.0.0.1:3100';
const output = process.env.DASHBOARD_TEST_OUTPUT || path.join(os.tmpdir(), 'rankfix-dashboard-review');
await fs.mkdir(output, { recursive: true });
let server;
if (process.env.DASHBOARD_TEST_START === '1') {
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', new URL(baseUrl).port], { stdio: ['ignore', 'inherit', 'inherit'] });
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { if ((await fetch(baseUrl + '/dashboard')).ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  if (!ready) { server.kill(); throw new Error('Dev server did not become ready'); }
}

chromium.setGraphicsMode = false;
const browser = await puppeteer.launch({ executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || await chromium.executablePath(), args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--disable-gpu-compositing", "--use-gl=disabled", "--disable-software-rasterizer", "--no-zygote"], headless: true, pipe: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
let language = 'nl';
let scenario = 'populated';
let auditFailure = false;
let languageFailure = false;
const scans = [78, 75, 69, 65, 60, 52].map((score, index) => ({ id: `scan-${index}`, scanned_url: 'https://voorbeeld-bedrijf.nl', overall_score: score, seo_score: 82, geo_score: 71, security_score: 74, created_at: new Date(Date.UTC(2026, 9, 19 - index * 6, 8, 12)).toISOString(), open_issues: 7, critical_issues: 1 }));
const checks = [
  { title: 'Paginatitel ontbreekt op 3 pagina’s', rule_id: 'TITLE', category: 'seo', severity: 'HIGH', status: 'fail', message: 'De paginatitel ontbreekt. Bekijk de betrokken pagina’s in je audit.' },
  { title: 'Afbeeldingen zonder beschrijving', rule_id: 'ALT', category: 'seo', severity: 'MEDIUM', status: 'warning', message: 'Voeg passende beschrijvingen toe aan je afbeeldingen.' },
  { title: 'Structured data voor AI-zoekmachines', rule_id: 'SCHEMA', category: 'geo', severity: 'MEDIUM', status: 'warning', message: 'Bekijk de onderbouwing en beschikbare codevoorstellen.' },
  { title: 'Pagina laadt traag op telefoon', rule_id: 'PERFORMANCE', category: 'seo', severity: 'LOW', status: 'warning', message: 'Controleer welke onderdelen de pagina vertragen.' },
  { title: 'Beveiligingsheaders ontbreken', rule_id: 'HEADERS', category: 'security', severity: 'MEDIUM', status: 'fail', message: 'Bekijk de ontbrekende headers in je audit.' }
];
await page.setRequestInterception(true);
page.on('request', async request => {
  const url = new URL(request.url());
  if (!url.pathname.startsWith('/api/')) return request.continue();
  let status = 200;
  let body = {};
  if (url.pathname === '/api/auth/me') body = scenario === 'unauthenticated' ? { user: null } : { user: { id: 'fixture-user', name: 'Voornaam Naam', email: 'fixture@example.test' } };
  else if (url.pathname === '/api/account/language') {
    if (request.method() === 'PUT') {
      if (languageFailure) { status = 500; body = { error: 'fixture failure' }; }
      else language = JSON.parse(request.postData()).language;
    }
    body = status === 200 ? { language } : body;
  } else if (url.pathname === '/api/history') {
    if (scenario === 'history-error') status = 503;
    body = { scans: scenario === 'empty' ? [] : [scans[0]], history: scenario === 'empty' ? [] : scans, fixes: { PREPARED: 2 }, usage: { plan: scenario === 'free' ? 'free' : 'start', used: 6, limit: 15, actions: { aiFixes: { used: 6, limit: 10 } } } };
  } else if (url.pathname.startsWith('/api/history/')) {
    if (auditFailure) { status = 503; body = { error: 'fixture failure' }; }
    else body = { scan: { result: { overallScore: 78, coverage: { coveragePercent: 100 }, scoreModel: { evidenceLevel: 'complete' }, seo: { score: 82, checks }, geo: { score: 71, checks: [] }, security: { score: 74 } } } };
  } else if (url.pathname === '/api/health/admin-status') body = { admin: false };
  await request.respond({ status, contentType: 'application/json', body: JSON.stringify(body) });
});
async function open(route = '/dashboard', width = 1366, height = 850) {
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  await page.goto(baseUrl + route, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.rx-content');
  await page.waitForFunction(() => !document.querySelector('.rx-loading'));
}
async function noOverflow() {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `horizontal overflow at ${page.viewport().width}`);
  assert.equal(await page.$$eval('.rx-issue-row', elements => elements.some(element => element.scrollWidth > element.clientWidth)), false, 'issue row overflow');
}
try {
  await open();
  assert.equal(await page.$eval('.rx-score-ring strong', el => el.textContent), '78');
  assert.equal(await page.$$eval('.rx-issue-row', els => els.length), 5);
  assert.match(await page.$eval('.rx-usage-card:last-child', el => el.textContent), /4\s*\/\s*10/);
  assert.equal(await page.$$eval('.rx-sidebar .rx-main-menu>a', els => els.length), 7);
  await noOverflow();
  assert.ok(await page.$eval('.rx-chart', el => el.getBoundingClientRect().width > 200 && el.getBoundingClientRect().height > 100), 'chart should render at panel size');
  await page.screenshot({ path: path.join(output, 'desktop.png'), fullPage: true });
  await page.type('.rx-search input', 'afbeeldingen');
  await page.waitForSelector('.rx-search-results a');
  assert.match(await page.$eval('.rx-search-results', el => el.textContent), /Afbeeldingen/);
  await page.keyboard.press('Escape');
  await page.click('.rx-notification');
  assert.match(await page.$eval('.rx-notification-panel', el => el.textContent), /2 codevoorstellen/);
  await page.keyboard.press('Escape');
  languageFailure = true;
  await page.select('.rx-topbar select', 'en');
  await page.waitForSelector('.rx-language-error');
  assert.equal(language, 'nl');
  languageFailure = false;
  await page.select('.rx-topbar select', 'en');
  await page.waitForFunction(() => document.querySelector('.rx-page')?.lang === 'en');
  assert.match(await page.$eval('.rx-sidebar', el => el.textContent), /Tools & analyses/);
  await page.select('.rx-topbar select', 'nl');
  await page.waitForFunction(() => document.querySelector('.rx-page')?.lang === 'nl');
  for (const width of [320, 360, 390, 430, 768, 1024, 1440]) {
    await page.setViewport({ width, height: 900, deviceScaleFactor: 1 });
    await noOverflow();
  }
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await page.screenshot({ path: path.join(output, 'mobile.png'), fullPage: true });
  await page.click('.rx-menu-toggle');
  assert.equal(await page.$eval('.rx-menu-dialog', el => el.open), true);
  assert.match(await page.$eval('.rx-drawer', el => el.textContent), /Helpcentrum/);
  assert.match(await page.$eval('.rx-drawer', el => el.textContent), /Tools & analyses/);
  await page.screenshot({ path: path.join(output, 'mobile-menu.png'), fullPage: false });
  await page.keyboard.press('Escape');
  assert.equal(await page.$eval('.rx-menu-dialog', el => el.open), false);
  await page.click('.rx-mobile-nav button');
  assert.equal(await page.$eval('.rx-menu-dialog', el => el.open), true);
  await page.click('.rx-drawer a[href="/dashboard/tools"]');
  await page.waitForSelector('.rx-tool-card');
  assert.equal(await page.$$eval('.rx-tool-card', els => els.length), 2);
  assert.match(await page.$eval('.rx-content', el => el.textContent), /Concurrent Scan/);
  await open('/dashboard/connections');
  assert.match(await page.$eval('.rx-content', el => el.textContent), /Google Search Console/);
  assert.match(await page.$eval('.rx-content', el => el.textContent), /GitHub/);
  await open('/dashboard/websites');
  assert.equal(await page.$$eval('.rx-website-list>article', els => els.length), 1);
  assert.match(await page.$eval('.rx-website-actions a:nth-child(2)', el => el.getAttribute('href')), /scan\?url=/);
  await open('/dashboard/improvements');
  assert.equal(await page.$$eval('.rx-issue-row', els => els.length), 5);
  assert.match(await page.$eval('.rx-resolve', el => el.getAttribute('href')), /audit\/scan-0#rankfix-priorities/);
  await open('/dashboard/more');
  for (const route of ['/dashboard/reviews', '/dashboard/contact', '/dashboard/how', '/dashboard/account']) assert.ok(await page.$(`.rx-tool-card[href="${route}"]`));
  scenario = 'empty';
  await open();
  assert.equal(await page.$eval('.rx-score-ring strong', el => el.textContent), '—');
  assert.equal(await page.$$eval('.rx-issue-row', els => els.length), 0);
  await page.screenshot({ path: path.join(output, 'empty.png'), fullPage: true });
  scenario = 'populated'; auditFailure = true;
  await open();
  assert.match(await page.$eval('.rx-priorities', el => el.textContent), /konden niet worden geladen/);
  auditFailure = false;
  await page.click('.rx-priorities button');
  await page.waitForSelector('.rx-issue-row');
  scenario = 'history-error';
  await open();
  assert.ok(await page.$('.rx-error'));
  scenario = 'populated';
  await page.click('.rx-error button');
  await page.waitForSelector('.rx-issue-row');
  scenario = 'free';
  await open();
  assert.ok(await page.$('.rx-chart-empty'));
  await open('/dashboard/tools');
  assert.equal(await page.$$eval('.rx-tool-card h2 small', els => els.length), 2);
  scenario = 'populated';
  await page.goto(baseUrl + '/dashboard/help', { waitUntil: 'networkidle0' });
  assert.ok(await page.$('.rx-sidebar'));
  assert.equal(await page.$$eval('.rx-help-service a', els => els.length), 3);
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await noOverflow();
  scenario = 'unauthenticated';
  await page.goto(baseUrl + '/dashboard', { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => window.location.pathname === '/account');
  assert.deepEqual(errors, [], 'browser runtime errors');
  console.log(`PASS: responsive dashboard, 7 widths, menus, search, language persistence/failure, routes, usage, empty/error/retry, login redirect. Screenshots: ${output}`);
} finally { await browser.close(); server?.kill(); }
