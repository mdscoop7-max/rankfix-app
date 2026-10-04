# RankFix production launch runbook

This document is the operational checklist for moving RankFix from test infrastructure to production.

## 1. PostgreSQL migration / upgrade
- Do not delete the current database before a verified backup exists.
- Upgrade or migrate `rankfix-db` before the current free database expires.
- Keep the old database untouched until the new database has passed validation.
- Update `DATABASE_URL` only after the target database is ready.
- Re-run System Health after the switch and verify connection count, latency, queue and database size.
- Run a customer-data smoke test: login, website list, scan history, audit report and fixes.

## 2. Backup and restore proof
RankFix must not claim that recovery is verified only because a backup exists.
- Create a real production backup/snapshot.
- Restore that backup into an isolated test database.
- Verify schema and representative records.
- Record the successful verification time in `DATABASE_BACKUP_VERIFIED_AT`.
- Record the successful restore-test time in `DATABASE_RESTORE_TESTED_AT`.
- Never store credentials, database dumps or connection strings in Git.

## 3. Security Engine
Security checks are evidence based. A missing header is not automatically a vulnerability.
Current engine checks:
- HTTPS
- HSTS
- Content-Security-Policy
- X-Content-Type-Options
- frame protection
- mixed-content references in static HTML
- insecure HTTP form actions
- exposed Server / X-Powered-By headers

The scanner must use PASS, WARNING, FAIL, NOT_APPLICABLE or UNABLE_TO_CONFIRM and must not claim that a website is fully secure.

## 4. Final release gate
Before commercial launch:
- scanner regression tests pass;
- Fix Engine works proposal -> PR -> deploy -> rescan;
- NL/EN/FR/DE/IT/ES checked;
- 403/429/503/timeouts checked;
- monitoring and email alerts checked;
- subscription/VAT/legal flows checked;
- desktop/mobile performance checked;
- production backup and restore verified;
- database is on a production-suitable plan;
- final go/no-go review completed.
