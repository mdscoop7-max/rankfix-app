import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readProcessResult } from './helpers/process-result.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const route = new URL('../app/api/scan/route.ts', import.meta.url).href;
for (const scenario of [
  { name: 'missing', tag: '<meta content="index,follow" name="robots">', expected: '', state: 'missing' },
  { name: 'empty', tag: '<meta name="description" content="">', expected: '', state: 'empty' },
  { name: 'reversed', tag: `<meta content='Advies voor "mkb" &amp; zzp' property='description'>`, expected: 'Advies voor "mkb" & zzp', state: 'present' },
  { name: 'outside-head', tag: '', bodyTag: '<meta content="Eigen organisatie in streaming SSR" name="description">', expected: '', state: 'missing' },
]) {
  test(`scan metadata: ${scenario.name} description cannot backtrack across a large quoted script`, () => {
    const script = `
      const scenario = ${JSON.stringify(scenario)};
      const html = '<!doctype html><html lang="nl"><head><title>Advies voor ondernemers</title>' + scenario.tag
        + '<script>const data = [' + '"payload",'.repeat(50000) + '];</script></head><body>'
        + (scenario.bodyTag || '') + '<h1>Advies voor ondernemers</h1><p>' + 'Advies en ondersteuning voor ondernemers. '.repeat(80) + '</p></body></html>';
      globalThis.fetch = async input => {
        const u = new URL(typeof input === 'string' ? input : input.url);
        return new Response(u.pathname === '/' ? html : 'Not found', { status: u.pathname === '/' ? 200 : 404, headers: { 'content-type': 'text/html; charset=utf-8' } });
      };
      globalThis.__RF_RENDER = async () => { throw new Error('RENDER_UNAVAILABLE_IN_TEST'); };
      const { POST } = await import(${JSON.stringify(route)});
      console.info = console.warn = console.error = () => {};
      const started = Date.now();
      const res = await POST(new Request('http://localhost/api/scan', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: 'https://metadata-runtime.test/', mode: 'both', language: 'nl' }) }));
      const data = await res.json();
      console.log('META_RUNTIME_RESULT ' + JSON.stringify({ status: res.status, success: data.success, description: data.metrics?.description, state: data.metrics?.descriptionState, elapsedMs: Date.now() - started }));
      process.exit(0);
    `;
    // A blocked JS event loop cannot execute a scan timeout. The parent process
    // enforces this regression deadline even against the original unsafe regex.
    const out = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', '--import', './tests/scan-matrix/register.mjs', '--input-type=module', '-e', script], {
      cwd: root, env: { ...process.env, NODE_ENV: 'development', DATABASE_URL: '', RF_REAL_DB: '', RF_LOCAL_QA_TOKEN: '' }, encoding: 'utf8', timeout: 12000,
    });
    const result = readProcessResult(out, 'META_RUNTIME_RESULT ', scenario.name);
    assert.equal(result.status, 200, out.stdout);
    assert.equal(result.success, true);
    assert.equal(result.description, scenario.expected);
    assert.equal(result.state, scenario.state);
  });
}
