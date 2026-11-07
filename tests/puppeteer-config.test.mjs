import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
const require=createRequire(import.meta.url);
const configPath=fileURLToPath(new URL("../.puppeteerrc.cjs",import.meta.url));
test("browser cache remains inside the project and downloads are suppressed only for CI/Vercel",()=>{
  const previous={CI:process.env.CI,VERCEL:process.env.VERCEL};
  try{
    for(const [ci,vercel,skip] of [[undefined,undefined,false],["true",undefined,true],[undefined,"1",true]]){
      for(const [key,value] of Object.entries({CI:ci,VERCEL:vercel}))if(value===undefined)delete process.env[key];else process.env[key]=value;
      delete require.cache[configPath];
      const config=require(configPath);
      assert.equal(config.cacheDirectory,join(fileURLToPath(new URL("..",import.meta.url)),".cache","puppeteer"));
      assert.equal(config.skipDownload,skip);
    }
  }finally{
    for(const [key,value] of Object.entries(previous))if(value===undefined)delete process.env[key];else process.env[key]=value;
    delete require.cache[configPath];
  }
});
