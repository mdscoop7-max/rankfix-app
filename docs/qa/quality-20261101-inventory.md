# Quality improvement 2: bounded, resumable inventory

Baseline: QA `1d7d753`. No live websites scanned.

The existing crawler's HTML/metadata/schema/accessibility parsers and site-audit rules are retained. The traversal now reads robots and bounded sitemap indexes (including gzip), follows anchor links, head pagination and same-site hreflang, records exclusions and missing/refused pages, and resumes from a server/operator-owned checkpoint. Canonical links nominate targets; they never erase the source without fetching it. Redirect-equivalent pages are separately counted. Pagination is permitted in inventory mode without changing the representative sample's exclusion policy.

Each batch has a deadline, page and HTTP-request limits; redirect hops consume the same request budget. Optional JavaScript navigation uses the existing renderer, at most twice per batch, with its full 90-request default allowance reserved before launch. No WAF/robots bypass. Unknown robots stops document crawling. Discovery is capped at 5,000 URLs, 20 sitemap files and 200 links per page; hitting a cap makes counts a lower bound, never a full-site claim. QUICK retains lightweight link sampling without automatic sitemap traversal. Defaults: 25 page attempts per batch, 120 request units, 30 seconds. HTTP requests are counted; browser work is conservatively charged its reserved cap, not a claimed exact network measurement.

Coverage partitions discovered URLs into checked, excluded, unconfirmed, not found, duplicate and pending. `fullWebsiteConfirmed` is always false: even an exhausted discovered inventory cannot prove there are no hidden URLs. Plan/page limits leave explicit pending counts. The main `/api/scan` remains a representative audit and now exposes the same honest scope in `multiPage.inventory`; its score formulas are unchanged.

The existing site-audit aggregation now includes evidence for PASS results, source URLs for confirmed 404/410 targets and unconfirmed access outcomes. JSON-LD not found in executable HTML stays unconfirmed. Informational Product markup without an Offer no longer triggers retail Offer/SKU requirements; actual incomplete Offers still fail.

Operator entry point (not executed against live sites):

    node --experimental-strip-types --import ./scripts/register-project.mjs scripts/site-inventory.mjs --url https://example.org/ --state /trusted/path/state.json --out /trusted/path/report.json --max-pages 100 --batch-pages 10 --allow-network

The operator alias resolver above does not stub DNS, authentication or browser transport. Do not use the offline test loader for live work. The CLI is an operator/QA tool, not a new public API or commercial package entitlement. It writes private files atomically and takes an exclusive process lock; after a crash an operator must verify/remove a stale lock. Cookies/HTML/auth data are not stored in checkpoints. Checkpoint files must remain operator-owned. New tenant-facing database/job/dashboard wiring is deliberately not claimed as delivered; the current dashboard remains representative.

Reproduction: 40 focused unit/regression tests pass; the existing P5 scan-route matrix remains 25/25 with the temporary Web Response adapter. On the SAME scripted homepage/sitemap inventory, baseline found/checked 1 page and considered its small discovered graph complete; candidate found/checked all 3 pages through sitemap discovery and explicitly scopes completion to discovered inventory. See `docs/qa/results/quality-20261101-inventory.json`.

Remaining verification: real Chromium, actual database-backed job/resume integration, Next build/typecheck, large real-site sitemap behavior and UI operator integration. The source repo has no installed Next docs/package in this environment; no new Next API/convention was introduced. No 9/10 claim, merge or deployment.
