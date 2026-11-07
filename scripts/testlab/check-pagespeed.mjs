#!/usr/bin/env node
// Run with Node 24 and PAGESPEED_API_KEY supplied by the server environment.
// Never accepts or prints the secret on the command line.
import { measureWebsiteSpeed } from '../../lib/pagespeed.ts';
const url = process.argv[2];
if (!url) {
  console.error('Usage: node --experimental-strip-types scripts/testlab/check-pagespeed.mjs https://your-test-site.example/');
  process.exitCode = 2;
} else {
  const result = await measureWebsiteSpeed(url, {allowAnonymous:false});
  console.log(JSON.stringify({
    source:result.source, status:result.status,
    devices:Object.fromEntries(['mobile','desktop'].map(device => [device, {
      status:result[device].status, score:result[device].score,
      reasonCode:result[device].reasonCode, httpStatus:result[device].httpStatus,
      attempts:result[device].attempts, measuredAt:result[device].measuredAt,
    }])),
  },null,2));
  process.exitCode = result.status === 'measured' ? 0 : 2;
}
