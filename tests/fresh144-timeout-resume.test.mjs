import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

// Offline regression of the actual terminal runner, not a live website scan.
test('fresh144 resume settles a repeated SCAN_TIMEOUT and continues, retaining database errors as pending', t => {
  const dir = mkdtempSync(join(tmpdir(), 'rankfix-resume-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const path of ['scripts/testlab', 'lib', 'qa-results/fresh144-latest', 'RankFix-QA']) mkdirSync(join(dir, path), { recursive: true });
  for (const path of ['scripts/testlab/run-fresh144-local.mjs', 'scripts/testlab/labels.mjs', 'lib/testlab-evidence-export.mjs', 'lib/dimension-score-display.mjs', 'lib/testlab-outcome.mjs', 'lib/sector-catalog-candidates.mjs', 'lib/incident-attribution.mjs']) copyFileSync(new URL('../' + path, import.meta.url), join(dir, path));
  execFileSync('git', ['init', '--quiet', dir]);
  execFileSync('git', ['-C', dir, '-c', 'user.name=QA', '-c', 'user.email=qa@example.invalid', 'commit', '--quiet', '--allow-empty', '-m', 'fixture']);
  const sha = execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const sites = Array.from({ length: 144 }, (_, i) => ({ host: `site${i}.test`, expected: 'industry' }));
  const reportPath = join(dir, 'qa-results/fresh144-latest/fresh144.json');
  const results = sites.map(s => ({ commitSha: sha, host: s.host, status: 'success' }));
  results[0] = { ...results[0], status: 'api_error', pending: true, reason: 'SCAN_TIMEOUT' };
  results[1] = { ...results[1], status: 'api_error', pending: true, reason: 'DATABASE_TIMEOUT' };
  writeFileSync(reportPath, JSON.stringify({ catalogId: 'fresh144', currentCommit: sha, results }));
  writeFileSync(join(dir, 'RankFix-QA/local-session-token.txt'), 'a'.repeat(64));
  writeFileSync(join(dir, 'mock.mjs'), `
    const sites = ${JSON.stringify(sites)};
    globalThis.fetch = async (url, options) => {
      let data, status = 200;
      if (url.endsWith('/api/scan/version')) data = { environment: 'local', commitSha: ${JSON.stringify(sha)} };
      else if (url.includes('/api/testlab/catalog')) data = { catalogId: 'fresh144', sites };
      else { status = 503; data = { code: JSON.parse(options.body).url.includes('site0.') ? 'SCAN_TIMEOUT' : 'DATABASE_TIMEOUT', incident: { attribution: 'rankfix_infrastructure' } }; }
      return new Response(JSON.stringify(data), { status });
    };
  `);
  const run = spawnSync(process.execPath, ['--import', './mock.mjs', 'scripts/testlab/run-fresh144-local.mjs'], { cwd: dir, env: { ...process.env, LOCALAPPDATA: dir, RF_QA_PAUSE_MS: '0' }, encoding: 'utf8', timeout: 10000 });
  assert.equal(run.status, 1, 'an unresolved database failure must fail the QA command');
  const after = JSON.parse(readFileSync(reportPath, 'utf8'));
  assert.equal(after.results.find(r => r.host === 'site0.test').outcome, 'timeout');
  assert.equal(after.results.find(r => r.host === 'site0.test').pending, false);
  assert.equal(after.results.find(r => r.host === 'site1.test').pending, true);
  assert.equal(after.results.find(r => r.host === 'site1.test').outcome, 'infrastructuur');
});
