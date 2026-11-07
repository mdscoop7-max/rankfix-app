import test from 'node:test';
import assert from 'node:assert/strict';
import {renderFailureCode,renderFailureText} from '../lib/report-quality.ts';
for(const [message,code] of [
 ['DNS lookup failed: ENOTFOUND','RENDER_DNS'],['net::ERR_NAME_NOT_RESOLVED','RENDER_DNS'],
 ['net::ERR_CERT_DATE_INVALID','RENDER_TLS'],['net::ERR_SSL_PROTOCOL_ERROR','RENDER_TLS'],
 ['net::ERR_CONNECTION_RESET','RENDER_NETWORK'],['Navigation timeout of 12000 ms exceeded','RENDER_TIMEOUT'],
 ['net::ERR_ACCESS_DENIED','RENDER_BLOCKED'],['URL_HOST_BLOCKED','RENDER_BLOCKED'],
 ['Target closed','BROWSER_CRASHED'],['RENDER_DEADLINE_REACHED','RENDER_LIMIT_REACHED'],
])test(`browser failure attribution: ${message}`,()=>assert.equal(renderFailureCode(new Error(message)),code));
test('DNS and TLS wording makes no website-blocking claim',()=>{
 assert.doesNotMatch(renderFailureText('RENDER_DNS'),/blokkeer/i);
 assert.doesNotMatch(renderFailureText('RENDER_TLS'),/blokkeer/i);
});
