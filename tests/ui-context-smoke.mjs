// Real Chromium against the local production build. All API responses are fixtures;
// this verifies UI lifecycle/hydration, not scans of third-party websites.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

const require=createRequire(import.meta.url);
const origin="http://127.0.0.1:3187";
const server=spawn(process.execPath,[require.resolve("next/dist/bin/next"),"start","--hostname","127.0.0.1","--port","3187"],{stdio:["ignore","pipe","pipe"]});
let serverLog="",browser;
server.stdout.on("data",chunk=>{serverLog+=chunk});
server.stderr.on("data",chunk=>{serverLog+=chunk});
try {
  const deadline=Date.now()+30000;
  while(true){
    try{const r=await fetch(origin);if(r.ok)break;}catch{}
    if(Date.now()>deadline||server.exitCode!==null)throw new Error("Local production server unavailable: "+serverLog.slice(-4000));
    await new Promise(resolve=>setTimeout(resolve,200));
  }
  browser=await puppeteer.launch({executablePath:await chromium.executablePath(),args:chromium.args,headless:true});
  const page=await browser.newPage();
  const errors=[],requests=[];
  page.on("pageerror",error=>errors.push(error.message));
  page.on("console",message=>{if(message.type()==="error"&&/hydrat|react error|maximum update/i.test(message.text()))errors.push(message.text());});
  await page.setRequestInterception(true);
  page.on("request",request=>{
    const url=new URL(request.url());
    if(url.origin!==origin){void request.abort();return;}
    if(!url.pathname.startsWith("/api/")){void request.continue();return;}
    requests.push({path:url.pathname,body:request.postData()});
    let body={};
    if(url.pathname==="/api/auth/me")body={user:null};
    if(url.pathname==="/api/account/language")body={language:"en"};
    if(url.pathname==="/api/history")body={usage:{plan:"pro"},scans:[]};
    if(url.pathname==="/api/github/status")body={connected:false};
    if(url.pathname==="/api/reviews/public")body={reviews:[]};
    if(url.pathname==="/api/history/first")body={scan:{scanned_url:"https://first.example/",result:{seo:{checks:[{issue_id:"H1_MISSING",title:"Heading",fix:"<h1>First verified proposal</h1>"}]}}}};
    if(url.pathname==="/api/history/second")body={scan:{scanned_url:"https://second.example/",result:{seo:{checks:[{issue_id:"H1_MISSING",title:"Heading",fix:"<h1>Second verified proposal</h1>"}]}}}};
    void request.respond({status:200,contentType:"application/json",body:JSON.stringify(body)});
  });
  const history=[{url:"https://saved.example/",status:"success",score:61}];
  await page.evaluateOnNewDocument(value=>{
    localStorage.setItem("rankfix:last-scan-url","https://remembered.example/");
    localStorage.setItem("rankfix-free-scan-test-sites-v1",JSON.stringify(value));
  },history);
  await page.goto(origin+"/en/scan",{waitUntil:"networkidle0"});
  assert.equal(await page.$eval("#lc-url",el=>el.value),"https://remembered.example/");
  await page.click("#lc-url",{clickCount:3});
  await page.keyboard.press("Backspace");
  await page.type("#lc-url","https://edited.example/");
  await page.evaluate(()=>{localStorage.setItem("rankfix:last-scan-url","https://other-tab.example/");window.dispatchEvent(new StorageEvent("storage",{key:"rankfix:last-scan-url"}));});
  assert.equal(await page.$eval("#lc-url",el=>el.value),"https://edited.example/","storage changes cannot overwrite an edited URL");
  console.log("UI PASS: remembered scan URL survives SSR/hydration");

  await page.goto(origin+"/account/reset-password?token=verified-token&lang=de",{waitUntil:"networkidle0"});
  assert.equal(await page.$eval("main",el=>el.lang),"de");
  const passwords=await page.$$("input[type=password]");
  for(const input of passwords)await input.type("Valid123!");
  await page.click("button[type=submit], form button");
  await page.waitForFunction(()=>document.body.innerText.includes("Passwort wurde"));
  const reset=requests.find(r=>r.path==="/api/auth/reset-password");
  assert.ok(reset,"password form submitted");
  assert.deepEqual(JSON.parse(reset.body),{token:"verified-token",password:"Valid123!",language:"de"});
  console.log("UI PASS: URL language and reset token reach the request intact");

  await page.goto(origin+"/account?mode=register&lang=fr",{waitUntil:"networkidle0"});
  assert.equal(await page.$eval("main",el=>el.lang),"fr");
  assert.ok(await page.$('input[autocomplete="name"], input[name="name"]'),"registration mode exposes name field");
  console.log("UI PASS: account mode and locale follow URL defaults");

  await page.goto(origin+"/dashboard/github?scan_id=first&issue_id=H1_MISSING",{waitUntil:"networkidle0"});
  await page.waitForFunction(()=>document.body.innerText.includes("First verified proposal"));
  // App Router updates the query without a full document reload.
  await page.evaluate(()=>window.history.pushState(null,"","/dashboard/github?scan_id=second&issue_id=H1_MISSING"));
  await page.waitForFunction(()=>document.body.innerText.includes("Second verified proposal"));
  assert.equal(await page.evaluate(()=>document.body.innerText.includes("First verified proposal")),false);
  assert.equal(requests.filter(r=>r.path==="/api/github/fix").length,0,"viewing proposals never publishes a fix");
  console.log("UI PASS: changing scan context replaces the old proposal without publication");

  await page.goto(origin+"/",{waitUntil:"networkidle0"});
  assert.equal(await page.evaluate(()=>localStorage.getItem("rankfix-free-scan-test-sites-v1")),JSON.stringify(history));
  assert.ok(await page.evaluate(()=>document.body.innerText.includes("saved.example")),"saved history visible");
  assert.deepEqual(errors,[],"no hydration failures, render loops or browser exceptions");
  console.log("UI PASS: saved history preserved; no hydration errors or render loops");
} finally {
  if(browser)await browser.close();
  server.kill("SIGTERM");
}
