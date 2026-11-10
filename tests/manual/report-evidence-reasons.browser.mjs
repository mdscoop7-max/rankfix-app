import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';

// UI regression only: intercepted history, no customer account or live website.
const base=process.env.RF_BASE||'http://127.0.0.1:3100';
const message='JavaScript is uitgevoerd, maar Consent Mode-interacties zijn niet onderzocht.';
const scan={scanned_url:'https://report.test/',created_at:'2026-11-10T12:00:00Z',result:{
  finalUrl:'https://report.test/',overallScore:80,
  seo:{score:80,checks:[{key:'consent_mode_readiness',category:'seo',title:'Consent Mode signaal',status:'unable_to_confirm',reasonCode:'needs_js',message,points:0,maxPoints:5}]},
  geo:{score:80,checks:[]},rendering:{mode:'javascript_rendered',javascriptExecuted:true},
}};
const browser=await puppeteer.launch({headless:true,executablePath:process.env.CHROME_EXECUTABLE_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});
try {
  const page=await browser.newPage();
  await page.setRequestInterception(true);
  page.on('request',req=>{
    const path=new URL(req.url()).pathname;
    if(!path.startsWith('/api/'))return void req.continue();
    const data=path==='/api/history/qa-report-reasons'?{scan}:path==='/api/account/language'?{language:'nl'}:{};
    void req.respond({status:200,contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.goto(base+'/dashboard/audit/qa-report-reasons/report',{waitUntil:'networkidle0',timeout:60000});
  await page.waitForSelector('.report-wrap');
  const text=await page.$eval('.report-wrap',el=>el.innerText);
  assert.match(text,/JavaScript uitgevoerd/);
  assert.ok(text.includes(message),'recorded limitation must survive report grouping');
  assert.doesNotMatch(text,/deze scan gebruikte raw HTML/);
  console.log('PASS rendered report preserves recorded Consent Mode limitation');
} finally {await browser.close();}
