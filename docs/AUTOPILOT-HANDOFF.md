# RankFix AutoPilot — Claude + Codex

## Status
Prepared on standalone QA branch only. No merge to main or existing motor PR, no production changes, no continuous cloud agent, no paid model API, no scheduled scanning.

## Start now using existing CI
GitHub > Actions > **RankFix CI** > Run workflow > choose this QA branch. The existing workflow is on main; the new manual workflow in this branch will NOT be selectable until that workflow file is merged to main with explicit owner permission. Do not merge automatically.

## Shared handoff
Read issue #154 (AutoPilot) and issue #151 (EU-81 findings) before changes. Motor PR #147 is the current QA motor. One agent owns one working branch at a time; Claude or Codex records what changed, tests, blockers, reproduction and next actions in #154. Open draft PR for changes, no auto merge or production deployment.

## Measure a real pilot
Export test-only Neon rows using SELECT: `SELECT scanned_url, overall_score, created_at, result FROM scans;` and `SELECT requested_url, outcome, category, error_code, created_at FROM scan_attempts;`. Save JSON arrays locally (never commit raw dumps to this **public** repository). Command:

`node scripts/pilot-handoff.mjs --scans scans.json --attempts attempts.json --since 2026-10-17T00:00:00Z --deployment VERIFIED_VERCEL_SHA --output handoff.md`

Choose actual pilot start, verify Vercel commit SHA, prevent old scans being attributed to 3.5. `3.1-stable-core-evidence` is a score-model name, not an engine version. The script makes no network calls, does no scans, requires no API keys and writes no database entries. Share only sanitized summary.

## Costs / guardrails
GitHub public repo uses free standard runners, not larger paid runners; keep artifacts minimal. Vercel Hobby uses quotas; this branch disables Vercel Git deployment via its own isolated `vercel.json` (never merge that config to main). No Vercel SSO bypass. Codex and Claude can each continue within their existing respective subscription usage, not beyond limits.
