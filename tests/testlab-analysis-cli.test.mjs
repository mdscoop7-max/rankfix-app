import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

function fixture(t, special = false) {
  const dir = mkdtempSync(join(tmpdir(), special ? 'rankfix café # % ' : 'rankfix-analysis-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const path of ['scripts/testlab', 'lib', 'run']) mkdirSync(join(dir, path), { recursive: true });
  for (const path of ['scripts/testlab/analyze-evidence.mjs', 'scripts/testlab/labels.mjs', 'lib/report-claim-audit.mjs']) {
    copyFileSync(new URL('../' + path, import.meta.url), join(dir, path));
  }
  const put = (name, value) => writeFileSync(join(dir, 'run', name), JSON.stringify(value));
  const run = () => spawnSync(process.execPath, [join(dir, 'scripts/testlab/analyze-evidence.mjs'), join(dir, 'run')], { encoding: 'utf8', timeout: 10000 });
  return { dir, put, run };
}

test('analysis CLI executes from a real path with spaces, Unicode, # and %', t => {
  const f = fixture(t, true);
  f.put('fresh144-evidence-abc.json', { commitSha: 'abc', rows: [] });
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /fresh144 bewijsanalyse @abc/);
});

test('analysis selects the active run, never the lexicographically largest SHA', t => {
  const f = fixture(t);
  f.put('fresh144.json', { currentCommit: 'aaaa', results: [] });
  f.put('fresh144-evidence-aaaa.json', { commitSha: 'aaaa', rows: [] });
  f.put('fresh144-evidence-ffff.json', { commitSha: 'ffff', rows: [] });
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /bewijsanalyse @aaaa/);
});

test('analysis fails explicitly when the current run has no export or selection is ambiguous', t => {
  const f = fixture(t);
  for (const sha of ['aaaa', 'ffff']) f.put(`fresh144-evidence-${sha}.json`, { commitSha: sha, rows: [] });
  assert.notEqual(f.run().status, 0);
  f.put('fresh144.json', { currentCommit: 'bbbb', results: [] });
  assert.notEqual(f.run().status, 0);
});

test('no full audits cannot be reported as a clean claim audit', t => {
  const f = fixture(t);
  f.put('fresh144-evidence-abc.json', { commitSha: 'abc', rows: [{ host: 'shop.test', evidenceState: 'available', verdict: 'exact', run: { status: 'success' } }] });
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /ONVOLLEDIG/);
  assert.doesNotMatch(result.stdout, /- geen overtredingen/);
});
