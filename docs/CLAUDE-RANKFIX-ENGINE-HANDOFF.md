# RankFix 3.1 — Claude engineering handoff (2026-10-15)

> **READ FIRST.** This is a **QA-only** brief for the RankFix scan **engine**, not a request to tweak scores or patch individual URLs. The user has spent many hours testing; do not make them repeatedly supply websites or reproduce the same failures. Continue from the branch and PR below. Do not change production or merge without explicit approval.

## Checkout and status

- GitHub repository: `mdscoop7-max/rankfix-app`
- **Continue on**: `fix/engine-primary-identity-evidence-20261015` (PR [#147](https://github.com/mdscoop7-max/rankfix-app/pull/147), **DRAFT**). This branch already includes QA work from draft [#146](https://github.com/mdscoop7-max/rankfix-app/pull/146); do not cherry-pick or duplicate blindly.
- Baseline reviewed commit: `188d876c6b38fbba0ab0e7a49904fd9695230d60`.
- Automated check on that commit: 253/253 Node tests passed; GitHub Actions test + build succeeded. Vercel preview build succeeded. **Not a real-world validation claim**.
- `main` and production must remain unchanged; do not merge or redeploy live without approval.
- Node 24 required. `npm install --no-audit --no-fund && npm test && npm run build`. Legacy lint warnings/errors may exist (CI lint is nonblocking); report actual status without hiding regressions.
- Read root `AGENTS.md` and relevant Next.js documentation from `node_modules/next/dist/docs/` as required by project instructions.
- Prior PRs #137/#144/#145 concern related work; review for gaps and duplicates before applying.

## The actual problem

The engine sometimes confuses a site's **primary business** with incidental capabilities or client/marketing content. Wrong sectors cause wrong audit modules, unjustified deductions, misleading 90%+ confidence, and misleading 100/100 when evidence is incomplete.

**Observed user-provided scan examples (diagnostic only, never add domain exceptions):**
- Telecom/service: KPN selected Telecom & Technologie correctly; raw HTML and failed render left many commerce checks unconfirmed and sometimes the printed status counts disagreed with the check list.
- Payments: PayPal's `/us/home` was incorrectly reported as `product` page / `Webshop`, although its title, H1, description and financial schema indicate payments and financial services.
- Payments: Mollie's homepage was wrongly marked `Hotel/accommodation` at 96% confidence because generic guest/arrival/departure/check-in terms were treated as primary lodging proof. Its checkout/payment feature was also mistaken for retail.
- `raw_html` vs browser rendering can be appropriate if the rendered page is an error state or poorer evidence; do not pretend JS ran successfully.

These are generic failure classes, **not** website-specific patch requests. Real EU web coverage is impossible; use portable heuristics with calibrated abstention and a representative validation matrix.

## Existing QA changes (do not undo without evidence)

- `lib/primary-business-identity.ts` — independent identity-based signals for payment/financial-service and lodging, plus generic localized homepage paths.
- `lib/commerce-applicability.ts` — distinct service/retail capability threshold; no assumption that payment processing/checkout links imply a merchandise webshop.
- `app/api/scan/route.ts` — evidence-informed primary identity, commerce applicability, page type, late reconciliation, and final report summary recomputation.
- `lib/headless-render.ts`, `lib/render-quality.ts`, `lib/report-quality.ts` — bounded hydration waiting, quality gating and truthful rendering diagnostics.
- `tests/primary-business-identity.test.mjs`, `tests/scanner-regression.test.mjs`, `tests/sector-identity.test.mjs`, `tests/feedback-19-regression.test.mjs` — regression tests and existing invariants.

## Next engineering goals — prioritize systemic correctness

1. **Audit end-to-end decision flow**: page type → primary business identity → supporting capabilities → active audit modules → evidence statuses → SEO/GEO scoring → final report JSON. Find and eliminate multiple conflicting sources of truth; confidence must be earned, not default to 90–96%.
2. **Generic sector classification**: analyze authoritative primary identity evidence (title, metadescription, H1, relevant structured data, prominent service/product descriptions). Treat body text, menus, client stories, travel/hotel examples, check-in/checkout strings and incidental links as *supporting* evidence only. On conflicting/insufficient evidence use `unknown` or `unconfirmed` with honest confidence. Do not hardcode KPN, PayPal, Mollie, domains, client names, or special URL exceptions.
3. **Sector vs activity**: distinguish sectors such as financial services, telecom, SaaS, professional services, hospitality, tourism, recruitment, healthcare, shops and hybrids. Subscriptions, reservations, shipping/payment widgets, buying hardware, lead forms and product metadata are capabilities, not necessarily a sector.
4. **Appropriate audit applicability**: only run hospitality, product inventory, Merchant Center, checkout and EU consumer checks with corresponding independent business/page evidence. Legal/EU applicability is jurisdiction-sensitive and not a legal opinion. Do not hide actually applicable checks merely to inflate scores.
5. **Report invariants**: final `passed + warning/fail + not_applicable + unable_to_confirm` must equal the final detail count (use one set and one final recomputation). Provisional 100/100 at weak coverage must be unmistakably qualified or gated; avoid conflating verified quality with unevaluated checks. Keep issue count, score breakdown, checked page coverage and full-report details consistent.
6. **Rendering**: measure real browser attempts; when DOM snapshots are unusable, preserve stronger raw HTML and explain the reason. Never bypass WAF/CAPTCHA or misrepresent lack of evidence as a confirmed pass. Cover performance budgets and SSR/SPA hybrids.
7. **Test architecture**: build a broad, repeatable fixture matrix of synthetic business profiles across languages and mixed-business scenarios. Include positive/negative/conflict/weak-evidence cases, independent structured data, locale roots, SSR vs client-only, mixed financial services + checkout and service sites with shopping links. Focus on invariants and false positives, not just passing a list of known sites.
8. **Independent checks**: run tests + build and compare old/new classification *and* applicable modules. Record failures, uncertain cases, confidence calibration, and side-effect regressions. Manual review of representative real-world sites is still necessary before release.

## Required acceptance criteria (before claiming 'fixed')

- Representative QA matrix across multiple independent sectors, languages, site structures and negative controls has documented expected-vs-actual results; no domain hardcoding.
- No known high-confidence wrong-sector assignments in that test matrix. Ambiguous input explicitly abstains.
- Homepage vs product/classification and sector/module applicability remain internally consistent, including payment-provider vs online-store and subscription vs retail.
- All report status totals and score breakdowns agree with final details; missing JS evidence never silently counted as pass.
- Existing working sector modules and security protections retain tests; `npm test`, `npm run build`, and deployment checks are green.
- Dedicated rendering comparison tests and a sample of actual websites are reported transparently; do **not** claim every website in Europe was or can be tested.
- PR #147 remains draft until owner explicitly authorizes merging; do not touch `main` or production.

## Suggested first steps for Claude

```bash
git fetch origin
git checkout fix/engine-primary-identity-evidence-20261015
npm install --no-audit --no-fund
npm test
npm run build
```

Inspect `app/api/scan/route.ts` in detail; it is large and contains both preliminary and late sector/commerce reconciliation. Identify a narrow, testable refactoring strategy into pure deterministic modules with type-safe evidence and consistent confidence, rather than stacking ad hoc regex overrides. Put tests first for cases that still fail. Commit to the **same QA branch**, keep PR #147 as draft, describe remaining uncertainty and blockers.

## Communication and access

The user explicitly requested that work continue without repetitive questions or requests for individual website examples. They may run extra website tests voluntarily. Share clear milestone updates only when meaningful and never claim done based solely on CI. Claude must have authenticated GitHub repository access in its own environment; ChatGPT cannot grant it, log into Claude, or guarantee a future Claude session automatically loads the repository.

## Status 2026-10-16 (Claude)

Consolidated draft PR #148 into this branch; #148, #144 (in #145) and #146 (in #147) are closed as duplicates.

- `lib/primary-business-identity.ts`: retailer sales language in the identity blocks financial and lodging identity (camping-gear shops, "saving money" deal shops, sofa "bank" shops stayed retail). Removed brand-shaped literals ("pay, send and save money", "saving money", "paying friends"); generic money-movement wording instead. Title + typed financial schema now proves payments. Added banking and insurance (`financialKind`). Ambiguous lodging words (camping, resort) need stay wording.
- `lib/scan-evidence.ts`: "checkout" (one word) and bare arrival/departure are no longer short-stay evidence; "pension" alone is no longer B&B.
- `lib/sector-catalog.ts`: payments entry; hotel/B&B keywords tightened.
- `app/api/scan/route.ts`: financial sub-type key/label; identity-anchored sectors education, nonprofit, energy_utilities, events_culture, fitness_sports; every catalog sector maps to a scan sector.
- Report module labels in 6 locales; `tests/sector-financial-lodging.test.mjs`.
- Checks: 260/260 tests, tsc 0, ESLint unchanged vs main (31 legacy). Live scans not run from Claude's workspace (outbound web blocked). PR #145 conflicts with this branch only in `tests/feedback-19-regression.test.mjs`.

## Status 2026-10-16, second pass (Claude) — full engine QA

Offline end-to-end matrix added: `tests/scan-matrix/` runs the real `/api/scan` route with module hooks (DB/auth stubs, no DNS, controllable headless browser). `npm test` now covers 57 synthetic sites × 3 modes, EN/DE reports, 4 rendering outcomes and 23 pathological inputs, asserting sector, page type and report invariants (status totals = details, breakdown = checks, no points for N.v.t./unconfirmed, no retail warnings on non-shops, provisional flag). On `main` the same matrix passes 5/57.

Fixed in this pass:
- Performance (also present on `main`/production): quadratic regexes stalled scans for 60 s to several minutes on long tokens (inline base64, minified JSON, digit runs, unclosed forms): email extraction, three price patterns, `<form>` block extraction, cart-form pattern. Now linear; 1.7 MB page ≈ 0.8 s, worst pathological 200 kB input ≈ 0.25 s.
- A PASS without measured evidence became `unable_to_confirm` but kept its points and pass wording; now 0 points and labelled.
- Placeholder titles ("App", "React App", "Home", "Welkom", …): warning, or unconfirmed when the JS page was not rendered.
- Health identity used truncated stems inside `\b…\b` ("fysiotherap") that never matched; physiotherapy, osteopathy, GP, psychology etc. now recognised.
- Payment providers "voor webshops" / "in je webshop" no longer read as retailers; a store "met restaurant" stays retail (facility, not identity).
- HTTP 404/410 and 5xx no longer reported as "blocked by website".

Verified locally against PostgreSQL 18: schema init (3× parallel, idempotent, 25 tables), `/api/health/db`, logged-in scan persistence, usage events, rescan comparison (delta 0, deterministic), history APIs, free-scan rate limit (8/network/hour → 429). Production build passes (webpack, Google Fonts mocked offline).

Open: preview URL is behind Vercel Authentication and the Vercel connector cannot open it; owner verifies `/api/health/db` and live scans in the preview. Provisional 100/100 at low coverage is shown as "Voorlopig" with range (owner policy: unconfirmed never lowers the score) — keep or gate is an owner decision.
