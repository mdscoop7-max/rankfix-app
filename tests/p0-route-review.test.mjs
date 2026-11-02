import test from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
test('P0 independent review scenarios retain safe evidence and no false retail penalties',()=>{
 const out=spawnSync(process.execPath,['--experimental-strip-types','--no-warnings','--import','./tests/scan-matrix/register.mjs','tests/scan-matrix/run-p0-review.mjs'],{cwd:new URL('..',import.meta.url),encoding:'utf8',timeout:180000});
 const line=(out.stdout||'').split('\n').find(l=>l.startsWith('SCAN_MATRIX_RESULT '));assert.ok(line,(out.stderr||String(out.error)).slice(-1000));const result=JSON.parse(line.slice(19));assert.equal(result.total,18);assert.equal(result.failed,0,out.stdout);assert.equal(out.status,0);
});
