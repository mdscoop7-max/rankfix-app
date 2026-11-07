// Isolated, loopback-only development server for the real local QA browser test.
import {spawn,execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const dir=mkdtempSync(join(tmpdir(),'rankfix-local-qa-browser-'));
const token=randomBytes(32).toString('hex'),tokenFile=join(dir,'session');
writeFileSync(tokenFile,token,{mode:0o600});
const env={...process.env,RF_LOCAL_QA_TOKEN:token,RF_QA_COMMIT_SHA:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),NEXT_TELEMETRY_DISABLED:'1'};
delete env.VERCEL;delete env.VERCEL_ENV;delete env.DATABASE_URL;delete env.NODE_ENV;
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--hostname','127.0.0.1','--port','3102'],{env,stdio:['ignore','pipe','pipe']});
let serverLog='';
for(const stream of [server.stdout,server.stderr])stream.on('data',chunk=>{serverLog=(serverLog+chunk.toString().split(token).join('[local-qa-token]')).slice(-8000);});
try {
 let ready=false;
 for(let i=0;i<60;i++){
  if(server.exitCode!==null)throw new Error('Local QA server exited early');
  try{const r=await fetch('http://127.0.0.1:3102/api/scan/version',{signal:AbortSignal.timeout(1000)});if(r.ok&&(await r.json()).environment==='local'){ready=true;break;}}catch{}
  await new Promise(resolve=>setTimeout(resolve,1000));
 }
 if(!ready)throw new Error('Local QA server did not become ready within 60 checks');
 const child=spawn(process.execPath,['tests/manual/testlab-local-catalogs.browser.mjs'],{env:{...process.env,RF_BASE:'http://127.0.0.1:3102',RF_QA_TOKEN_FILE:tokenFile},stdio:'inherit'});
 const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve);});
 if(code!==0)throw new Error('Local QA browser regression failed with exit '+code);
} catch(error){console.error(serverLog);throw error;}
finally {server.kill('SIGTERM');await new Promise(resolve=>{if(server.exitCode!==null)resolve();else server.once('exit',resolve);});rmSync(dir,{recursive:true,force:true});}
