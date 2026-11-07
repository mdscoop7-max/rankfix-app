// Local QA browser → real auth/catalog/version → real UI/storage/export.
// Only /api/scan is simulated; this is UI regression evidence, not a live scan.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import puppeteer from 'puppeteer-core';
const base=process.env.RF_BASE||'http://127.0.0.1:3002';
assert.equal(new URL(base).hostname,'127.0.0.1');
const token=readFileSync(process.env.RF_QA_TOKEN_FILE,'utf8').trim();
const browser=await puppeteer.launch({executablePath:process.env.CHROME_EXECUTABLE_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const log=[];
try {
 const page=await browser.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/dashboard/testlab?catalog=mkb48');
 const denied=await page.evaluate(async()=>{const r=await fetch('/api/testlab/catalog?catalog=mkb48');return {status:r.status,data:await r.json()};});
 assert.equal(denied.status,401);assert.equal(denied.data.error,'LOCAL_QA_SESSION_REQUIRED');
 log.push({check:'unauthenticated catalog denied',status:401});
 await page.goto(base+'/api/testlab/local-session?token='+encodeURIComponent(token));
 await page.waitForFunction(()=>location.pathname==='/dashboard/testlab'&&location.search.includes('mkb48'));
 await page.waitForFunction(()=>document.querySelector('.rf-lab-count')?.textContent?.startsWith('48'));
 const groups=await page.$$eval('optgroup[label="Sector"] option',es=>es.map(e=>e.value));
 assert.equal(groups.length,12);
 for(const group of groups){await page.select('select',group);assert.match(await page.$eval('.rf-lab-count',e=>e.textContent),/^4\D/);}
 log.push({check:'real MKB catalog and all sector filters',sites:48,groups:12,perGroup:4});
 // A client navigation must replace catalog and state, not reuse mount-only data.
 await page.click('a[href="/dashboard/testlab"]');
 await page.waitForFunction(()=>document.querySelector('.rf-lab-count')?.textContent?.startsWith('144'));
 await page.click('a[href="/dashboard/testlab?catalog=mkb48"]');
 await page.waitForFunction(()=>document.querySelector('.rf-lab-count')?.textContent?.startsWith('48'));
 log.push({check:'client catalog switch 48→144→48',passed:true});
 await page.select('select','dentist');
 let calls=0;
 await page.setRequestInterception(true);
 page.on('request',req=>{
  if(new URL(req.url()).pathname!=='/api/scan')return req.continue();
  calls++;
  return req.respond({status:200,contentType:'application/json',body:JSON.stringify({success:true,scanId:'browser-fixture',sectorProfile:{sector:'health_wellness',key:'dentist',confidenceScore:90},websiteProfile:{websiteType:{value:'services'}},overallScore:75,seo:{score:75},geo:{score:75},scoreModel:{evidenceLevel:'provisional'}})});
 });
 await page.evaluate(()=>{
  window.__exports=[];const create=URL.createObjectURL.bind(URL);
  URL.createObjectURL=b=>{if(b instanceof Blob)b.text().then(t=>window.__exports.push(t));return create(b);};
 });
 await page.click('.rf-lab-primary');
 await page.waitForFunction(()=>document.querySelector('.rf-lab-status')?.textContent?.includes('4/4 websites'),{timeout:90000});
 assert.equal(calls,4);
 await page.evaluate(()=>[...document.querySelectorAll('button')].find(e=>e.textContent.startsWith('Exporteer JSON')).click());
 await page.waitForFunction(()=>window.__exports.length>0);
 const exported=await page.evaluate(()=>JSON.parse(window.__exports.at(-1)));
 assert.equal(exported.catalogId,'mkb48');
 assert.equal(exported.sites.length,48);
 assert.equal(exported.sites.filter(s=>s.result?.status==='succes').length,4);
 assert.equal(exported.sites.filter(s=>s.result?.status==='succes').every(s=>s.group==='dentist'),true);
 log.push({check:'selected-group start, completion and JSON export',simulatedScans:calls,exportedSites:48});
 assert.deepEqual(errors,[]);
 if(process.env.RF_BROWSER_REPORT)writeFileSync(process.env.RF_BROWSER_REPORT,JSON.stringify({kind:'browser-regression-with-simulated-scans',checks:log,pageErrors:errors},null,2)+'\n');
 console.log(JSON.stringify(log));console.log('TESTLAB_LOCAL_CATALOGS_OK');
}finally{await browser.close();}
