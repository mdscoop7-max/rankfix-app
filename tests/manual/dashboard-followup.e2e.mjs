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
let githubConfigured = true;
let githubConnected = true;
let scanRequest;
const fixRequests = [];
const checks = [
  { title: 'Paginatitel ontbreekt op 3 pagina’s', rule_id: 'META_TITLE_MISSING', issue_id: 'META_TITLE_MISSING', confidence: 'high', evidence: { found: false }, fix: '<title>Voorbeeldbedrijf</title>', category: 'seo', severity: 'HIGH', status: 'fail', message: 'De paginatitel ontbreekt. Bekijk de betrokken pagina’s in je audit.' },
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
  else if (url.pathname === '/api/assistant/scan') body = {issues:[checks[0]]};
  else if (url.pathname === '/api/assistant') body = { answer: 'Dit is het antwoord van de testassistent.' };
  else if (url.pathname === '/api/github/configuration') body = { ready: githubConfigured };
  else if (url.pathname === '/api/github/status') body = { connected: githubConnected, connection: { github_login: 'fixture' } };
  else if (url.pathname === '/api/github/repos') body = { repos: [{ full_name: 'fixture/website', default_branch: 'main', private: true }] };
  else if (url.pathname === '/api/github/site-repository') body = { mapped: true, repository: 'fixture/website', baseBranch: 'main' };
  else if (url.pathname === '/api/github/fix') {
    const payload = JSON.parse(request.postData()); fixRequests.push(payload);
    body = payload.preview ? { status:'preview', proposal_id:'proposal-fixture', proposal_hash:'hash-fixture', path:'index.html', preview:{startLine:1,before:['<title></title>'],after:['<title>Voorbeeldbedrijf</title>'],changedLines:1} } : { status:'pr_created', pr:{number:1,url:'https://github.com/fixture/website/pull/1'}, merge:{merged:false,reason:'Review required'} };
  }
  else if (url.pathname === '/api/scan') { scanRequest = request; return; }
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
    else body = { scan: { id: 'scan-0', scanned_url: 'https://voorbeeld-bedrijf.nl', created_at: '2026-10-19T12:00:00Z', result: { overallScore: 78, coverage: { coveragePercent: 100 }, scoreModel: { evidenceLevel: 'complete' }, seo: { score: 82, checks }, geo: { score: 71, checks: [] }, security: { score: 74 } } } };
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
  await open('/dashboard',1440,1000);
  await page.waitForSelector('a.rx-resolve[href*="issue_id=META_TITLE_MISSING"]');
  assert.equal(await page.$eval('.rx-resolve', el=>new URL(el.href).searchParams.get('scan_id')), 'scan-0');
  assert.equal(await page.$eval('.rx-resolve', el=>el.textContent), 'Fix maken');
  await page.click('.rf-ai-launcher');
  await page.waitForSelector('.rf-ai-input');
  await page.type('.rf-ai-input','Waarom is mijn score laag?');
  const inputStyle=await page.$eval('.rf-ai-input', el=>({color:getComputedStyle(el).color,font:parseFloat(getComputedStyle(el).fontSize)}));
  assert.equal(inputStyle.color,'rgb(255, 255, 255)'); assert.ok(inputStyle.font>=16);
  await page.keyboard.press('Enter');
  await page.waitForFunction(()=>document.querySelector('.rf-ai-messages')?.textContent.includes('testassistent'));
  await page.click('.rx-sidebar a[href="/dashboard/websites"]');
  await page.waitForFunction(()=>location.pathname==='/dashboard/websites');
  assert.equal(await page.$eval('.rf-ai-messages',el=>el.textContent.includes('testassistent')),true,'conversation persists across client navigation');
  assert.equal(await page.$$('.rf-ai-launcher').then(x=>x.length),1);
  await page.keyboard.press('Escape');
  await page.goto(baseUrl+'/dashboard/help',{waitUntil:'networkidle0'});
  await page.waitForSelector('.rx-help-search input');
  await page.type('.rx-help-search input','GitHub koppelen');
  assert.equal(await page.$$('.rx-help-topic').then(x=>x.length),1);
  await page.screenshot({path:path.join(output,'help-desktop.png'),fullPage:true});
  await page.goto(baseUrl+'/dashboard/github?scan_id=scan-0&issue_id=META_TITLE_MISSING',{waitUntil:'networkidle0'});
  await page.waitForSelector('form button[type="submit"]:not([disabled])');
  await page.click('form button[type="submit"]');
  await page.waitForFunction(()=>document.body.textContent.includes('Preview klaar'));
  assert.equal(fixRequests.length,1);assert.equal(fixRequests[0].scan_id,'scan-0');assert.equal(fixRequests[0].issue_id,'META_TITLE_MISSING');assert.equal(fixRequests[0].preview,true);
  await page.click('form button[type="submit"]');
  await page.waitForFunction(()=>document.body.textContent.includes('Pull Request klaar'));
  assert.equal(fixRequests.length,2);assert.equal(fixRequests[1].proposal_id,'proposal-fixture');assert.equal(fixRequests[1].proposal_hash,'hash-fixture');assert.equal(fixRequests[1].preview,false);
  githubConfigured=false;githubConnected=false;
  await page.goto(baseUrl+'/dashboard/github?scan_id=scan-0&issue_id=META_TITLE_MISSING',{waitUntil:'networkidle0'});
  await page.waitForSelector('.rf-github-connect-button[aria-disabled="true"]');
  assert.match(await page.$eval('.rf-github-config-notice',el=>el.textContent),/testomgeving/);
  await page.setViewport({width:1440,height:600,deviceScaleFactor:1});
  await page.goto(baseUrl+'/dashboard/help',{waitUntil:'networkidle0'});
  await page.evaluate(()=>window.scrollTo({top:300,behavior:'instant'}));
  await page.waitForFunction(()=>window.scrollY>=299);
  await page.click('.rx-sidebar a[href="/dashboard/websites"]');
  await page.waitForFunction(()=>location.pathname==='/dashboard/websites');
  await page.click('.rx-return-back');
  await page.waitForFunction(()=>location.pathname==='/dashboard/help' && Math.abs(window.scrollY-300)<=3);
  assert.ok(await page.$eval('.rx-help-service a',el=>getComputedStyle(el).color!=='rgb(247, 251, 255)'),'service links remain readable');
  for (const width of [320,360,390,430,768,1024,1440]) {
    await page.setViewport({width,height:920,deviceScaleFactor:1});
    for (const route of ['/dashboard','/dashboard/scan','/dashboard/help','/dashboard/github']) {
      await page.goto(baseUrl+route,{waitUntil:'networkidle0'});
      await noOverflow();
      assert.equal(await page.$$('.rf-ai-launcher').then(x=>x.length),1,route+' has one assistant');
      assert.equal(await page.$$('.rx-return-back').then(x=>x.length),1,route+' has a back button');
      if(width===390&&route==='/dashboard/help')await page.screenshot({path:path.join(output,'help-mobile.png'),fullPage:true});
      if(width===1440&&route==='/dashboard/scan')await page.screenshot({path:path.join(output,'scan-desktop.png'),fullPage:true});
    }
  }
  await page.setViewport({width:390,height:844,deviceScaleFactor:1});
  await page.goto(baseUrl+'/dashboard/scan',{waitUntil:'networkidle0'});
  await page.click('.rx-scan-entry button[type="submit"]');
  await page.waitForSelector('.rf-live-scan');
  await noOverflow();
  assert.match(await page.$eval('.rf-live-scan h2',el=>el.textContent),/controleren/);
  await page.screenshot({path:path.join(output,'scan-meter-mobile.png'),fullPage:true});
  await page.setViewport({width:1440,height:1000,deviceScaleFactor:1});
  await page.screenshot({path:path.join(output,'scan-meter-desktop.png'),fullPage:true});
  await scanRequest.respond({status:500,contentType:'application/json',body:JSON.stringify({error:'Testfout: probeer opnieuw.'})});
  await page.waitForSelector('.rf-alert');
  assert.equal(await page.$('.rf-live-scan'),null);
  assert.match(await page.$eval('.rf-alert',el=>el.textContent),/Testfout/);
  assert.deepEqual(errors,[]);
  console.log('PASS: global AI, readable input, persistent conversation, help search, exact fix payload/approval, configuration error, desktop/mobile layouts and scan overlay.');
} finally { await browser.close();server?.kill(); }
