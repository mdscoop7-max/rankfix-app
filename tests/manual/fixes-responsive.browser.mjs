
import assert from "node:assert/strict";
import {existsSync} from "node:fs";
import puppeteer from "puppeteer";

// Runs only against the local CI server. Every data request is intercepted:
// no real account, GitHub token, customer scan or website is changed.
const BASE="http://127.0.0.1:3100";
const binaries=[
  process.env.RF_BROWSER,
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser"
].filter(Boolean);
const chrome=binaries.find(existsSync);
if(!chrome)throw Error("No local Chrome binary on CI runner; responsive browser test cannot be skipped");
const browser=await puppeteer.launch({headless:true,executablePath:chrome,args:["--no-sandbox","--disable-dev-shm-usage"]});
const scans=[
 {id:"old-site-id",scanned_url:"https://trendmix-q6fx.vercel.app/",created_at:"2026-10-17T20:00:00Z",open_issues:1,overall_score:95},
 {id:"latest-site-id",scanned_url:"https://trendmix-q6fx.vercel.app/",created_at:"2026-10-18T20:00:00Z",open_issues:2,overall_score:89}
];
try{
 for(const mode of [{name:"mobile",width:390,height:844,isMobile:true,hasTouch:true},{name:"desktop",width:1366,height:800,isMobile:false,hasTouch:false}]){
   const page=await browser.newPage();
   await page.setViewport(mode);
   await page.setRequestInterception(true);
   page.on("request",req=>{
     const path=new URL(req.url()).pathname;
     if(path==="/api/history"){
       void req.respond({status:200,contentType:"application/json",body:JSON.stringify({history:scans,usage:{plan:"start"}})});
     }else if(path==="/api/account/language"){
       void req.respond({status:200,contentType:"application/json",body:JSON.stringify({language:"nl"})});
     }else if(path==="/api/auth/me"){
       void req.respond({status:200,contentType:"application/json",body:JSON.stringify({user:{name:"QA"}})});
     }else{
       void req.continue();
     }
   });
   const response=await page.goto(BASE+"/dashboard/fixes",{waitUntil:"networkidle2",timeout:30000});
   assert.equal(response.status(),200,mode.name+" Fixes page must load");
   await page.waitForFunction(()=>document.querySelectorAll("article.rf-card").length===1,{timeout:15000});
   const ui=await page.evaluate(()=>{
     const nav=document.querySelector(".rf-nav");
     const top=document.querySelector(".rf-desktop-nav");
     const a=document.querySelector("article.rf-card a[href*='/dashboard/audit/']");
     return {
       title:document.querySelector("h1")?.textContent,
       count:document.querySelectorAll("article.rf-card").length,
       auditLink:a?.getAttribute("href"),
       navDisplay:nav?getComputedStyle(nav).display:null,
       desktopDisplay:top?getComputedStyle(top).display:null,
       width:document.documentElement.scrollWidth,
       viewport:window.innerWidth
     };
   });
   assert.match(ui.title||"",/Mijn Fixes/,mode.name+" title");
   assert.equal(ui.count,1,mode.name+" one latest scan per website");
   assert.equal(ui.auditLink,"/dashboard/audit/latest-site-id",mode.name+" latest scan not older success");
   assert.ok(ui.width<=ui.viewport+2,mode.name+" must not scroll horizontally: "+JSON.stringify(ui));
   if(mode.isMobile){
     assert.notEqual(ui.navDisplay,"none","mobile Fixes bottom navigation is visible");
     assert.equal(ui.desktopDisplay,"none","desktop menu must be hidden on mobile");
   }else{
     assert.equal(ui.navDisplay,"none","mobile navigation hidden on desktop");
     assert.notEqual(ui.desktopDisplay,"none","desktop navigation visible");
   }
   const menu=mode.isMobile?".rf-nav a[href='/dashboard/fixes']":".rf-desktop-nav a[href='/dashboard/fixes']";
   await page.click(menu);
   await page.waitForFunction(()=>location.pathname==="/dashboard/fixes");
   assert.equal(new URL(page.url()).pathname,"/dashboard/fixes",mode.name+" Fixes menu points to selection page");
   const blank=await page.goto(BASE+"/dashboard/github",{waitUntil:"networkidle2",timeout:30000});
   assert.equal(blank.status(),200,mode.name+" missing-context Fix URL has a safe recovery page");
   await page.waitForFunction(()=>document.querySelector("a[href='/dashboard/fixes']")?.textContent.includes("Fixes"));
   const recovery=await page.evaluate(()=>({
     title:document.querySelector("h1")?.textContent,
     hasRecovery:!!document.querySelector(".rf-fix-engine a[href='/dashboard/fixes']"),
     width:document.documentElement.scrollWidth,
     viewport:window.innerWidth
   }));
   assert.match(recovery.title||"",/Kies eerst een verbeterpunt/);
   assert.ok(recovery.hasRecovery,mode.name+" has a recoverable Fixes action");
   assert.ok(recovery.width<=recovery.viewport+2,mode.name+" missing-context view must not overflow");
   console.log("PASS",mode.name,ui.auditLink,"responsive navigation + missing-scan recovery");
   await page.close();
 }
}finally{
 await browser.close();
}
