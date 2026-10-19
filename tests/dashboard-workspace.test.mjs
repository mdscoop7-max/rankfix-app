import test from 'node:test';
import assert from 'node:assert/strict';
import { priorityChecks, comparableScans, remaining, websiteHost } from '../app/dashboard/workspace-model.ts';

test('dashboard priorities deduplicate a rule within its category and retain the worst status', () => {
  const fail = { title: 'Title', rule_id: 'TITLE', category: 'seo', status: 'fail', severity: 'HIGH' };
  const result = priorityChecks({ seo: { checks: [{ ...fail, status: 'pass' }, fail] }, geo: { checks: [{ ...fail, status: 'warning' }, { ...fail, category: 'geo' }] } });
  assert.equal(result.length, 2);
  assert.ok(result.every(check => check.status === 'fail'));
});

test('dashboard priorities exclude passes and unconfirmed checks, then rank critical issues first', () => {
  const result = priorityChecks({ seo: { checks: [
    { title: 'Low', status: 'warning', severity: 'LOW' },
    { title: 'Unknown', status: 'unable_to_confirm', severity: 'CRITICAL' },
    { title: 'Critical', status: 'fail', severity: 'CRITICAL' },
    { title: 'Pass', status: 'pass' },
    { title: 'Medium', status: 'fail', severity: 'MEDIUM' }
  ] } });
  assert.deepEqual(result.map(check => check.title), ['Critical', 'Medium', 'Low']);
});

test('progress compares only the same canonical host and sorts chronologically', () => {
  const scan = (id, url, date, score = 70, final_url) => ({ id, scanned_url: url, final_url, created_at: date, overall_score: score });
  const latest = scan('last', 'https://www.example.test/', '2026-10-19', 78);
  const previous = scan('first', 'http://old.example/', '2026-10-01', 60, 'https://example.test/');
  const other = scan('other', 'https://different.test', '2026-10-10', 99);
  const invalid = scan('invalid', latest.scanned_url, 'invalid');
  assert.deepEqual(comparableScans([latest, other, previous, invalid], latest).map(item => item.id), ['first', 'last']);
  assert.equal(websiteHost(latest), 'example.test');
});

test('usage never shows negative remaining credits and preserves unlimited plans', () => {
  assert.equal(remaining(10, 6), 4);
  assert.equal(remaining(2, 4), 0);
  assert.equal(remaining(0, 0), 0);
  assert.equal(remaining(null, 100), null);
});
