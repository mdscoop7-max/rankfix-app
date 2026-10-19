import test from 'node:test';
import assert from 'node:assert/strict';
import { safeGithubFixHref, issueAnchor } from '../lib/dashboard-fix-action.ts';
import { githubReturnPath, githubReturnStatus, githubOAuthConfiguration } from '../lib/github-oauth-navigation.ts';

const check = { title: 'Missing title', issue_id: 'META_TITLE_MISSING', category: 'seo', status: 'fail', confidence: 'high', evidence: { found: false } };
const policy = { action: 'github_fix', safe_type: 'meta_title' };

test('fix action keeps the exact scan and issue; a missing element is valid evidence', () => {
  const url = new URL(safeGithubFixHref(check, 'scan 123', policy), 'https://rankfix.test');
  assert.equal(url.pathname, '/dashboard/github');
  assert.equal(url.searchParams.get('scan_id'), 'scan 123');
  assert.equal(url.searchParams.get('issue_id'), check.issue_id);
  assert.notEqual(issueAnchor(check), issueAnchor({ ...check, issue_id: 'META_DESCRIPTION_MISSING' }));
});

test('fix buttons cannot expose automatic changes for unproven or unsupported issues', () => {
  for (const overrides of [{ status: 'unable_to_confirm' }, { status: 'pass' }, { confidence: 'low' }, { evidence: {} }, { fix_category: 'C' }, { fix_status: 'DONE' }]) assert.equal(safeGithubFixHref({ ...check, ...overrides }, 'scan1', policy), '');
  assert.equal(safeGithubFixHref(check, '', policy), '');
  assert.equal(safeGithubFixHref(check, 'scan1', { action: 'manual', safe_type: null }), '');
});

test('OAuth return location preserves the selected fix but never redirects outside the dashboard', () => {
  const path = '/dashboard/github?scan_id=123&issue_id=title';
  assert.equal(githubReturnPath(path), path);
  assert.equal(githubReturnStatus(path, 'connected'), path + '&github=connected');
  for (const unsafe of ['https://evil.test', '//evil.test', '/dashboard/../../account', '/dashboard\\evil.test', '/dashboardevil', '/dashboard/\nfoo']) assert.equal(githubReturnPath(unsafe), '/dashboard/github');
});

test('GitHub connect requires both credentials and a callback on the active origin', () => {
  const origin = 'https://preview.test';
  const env = { GITHUB_CLIENT_ID: 'test-id', GITHUB_CLIENT_SECRET: 'test-secret' };
  assert.equal(githubOAuthConfiguration(origin, env).ready, true);
  assert.equal(githubOAuthConfiguration(origin, { ...env, GITHUB_CLIENT_SECRET: '' }).ready, false);
  assert.equal(githubOAuthConfiguration(origin, { ...env, GITHUB_CALLBACK_URL: 'https://other-preview.test/api/github/callback' }).reason, 'callback_mismatch');
  assert.equal(githubOAuthConfiguration(origin, { ...env, GITHUB_CALLBACK_URL: origin + '/wrong' }).ready, false);
});
