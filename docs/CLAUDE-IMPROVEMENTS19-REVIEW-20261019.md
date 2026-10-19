# Claude improvements19 review — 2026-10-19 (QA only)

Source: user-supplied `rankfix-improvements19.zip`, Claude analysis of Concertgebouw, Vogelbescherming and Monumenten reports, and Monumenten RankFix report dated 2026-10-19.

**Decision: Do not copy the standalone `detectSector()` or scoring library into the production scanner.** It uses separate sector taxonomies and hand-picked confidence floors; the live RankFix repo already has `lib/primary-business-identity.ts`, `lib/sector-identity.ts`, `lib/sector-catalog.ts`, `lib/sector-motor-decisions.ts`, `lib/commerce-applicability.ts`, `lib/audit-score.ts` and broad scanner regression tests. A fallback `general` sector with nonzero confidence must **not** be advertised as successfully recognized; abstention remains required for weak/conflicting evidence. The extracted Claude library is not a drop-in patch.

## Evidence-backed unresolved checks

1. **False commerce trigger:** monumenten.nl is informational and has `GovernmentOrganization` JSON-LD; a literal `kopen` within a monument-purchase article path is not retail/cart evidence. Yet the report calls shop functionality unconfirmed and places about 18 shop-only controls under unconfirmed. Trace signal provenance through scan route -> `commerceApplicability` -> final module assignment. Preserve uncertainty for thin JS shells and confirmed secondary stores.
2. **Sector disagreement:** final profile says sector unconfirmed (0%), while structured data check recognizes GovernmentOrganization. Investigate how validated structured data is shared with primary-identity classifier; do not turn every GovernmentOrganization citation into full site identity without corroboration.
3. **Weak score presentation:** overall 99/100 with evidence coverage 72%, while 20 checks are unresolved. The report already marks it provisional and gives 71–100. Product decision required whether headline should prioritize range or gate high numbers; do not silently change scoring contract.
4. **Sample rounding:** 28 x 100 and 1 x 96 across 29 pages produces 99.862..., displayed as 100. The report simultaneously says 100 needs all applicable checks confirmed; reconcile `siteSampleScore` display with this invariant, separately from SEO/GEO.
5. **Meta description:** 16/29 pages overlong, up to 816 chars. A 61-char description costs 4 points, while 500–800 chars are often advisory only. Review deterministic severity policy and test 61, 158, 320, 816, and 10882 chars. Long descriptions are not categorically Google penalties; any custom deduction must be transparent.
6. **Site-wide duplicates:** identical **lengths are not proof of identical text**. Compare normalized actual title/description contents for duplicate-pattern actions. Multiple H1 is not automatically an SEO error; flag recurring template issue as advice only when justified.
7. **Internal links:** 16 redirects were checked yet broken links were unconfirmed; ensure per-check link counts, request/status evidence, sampling limitations and unique uncertainty reasons. 1/16 is a sample, not whole-site prevalence.
8. **Form detection:** /contact sampled, but that alone does not prove a usable contact form. Inspect actual form evidence before changing N.v.t. to Pass/Warning.
9. **Breadcrumbs:** deep paths do not prove breadcrumbs exist; status should depend on actual navigation/markup and selected-check applicability.
10. **Security:** security 96 with cookie check unconfirmed; show a separate verified/possible-points coverage figure and test the current core-header weighting before changing it.
11. **Raw HTML title:** report showed 97- and 108-character titles without any rendered pixel guidance. Add calibrated *advice*, not an invented pixel measurement, where rendering is unavailable.
12. **Report coherence:** final list counts, module eligibility, sector certainty, sample scores, warning actions, headline and PDF/text exports must derive from reconciled final evidence.

## QA scenarios to add to existing scanner matrix

- GovernmentOrganization + historical monument articles including `/monumenten-kopen/` and no product/price/cart.
- Actual shop with Product+Offer, product price and purchase flow.
- Nonprofit with a separate shop route (hybrid identity and capability).
- Ticketed cultural venue (Event schema, tickets not retail goods).
- Payment service with checkout marketing (financial sector, not shop).
- Productless JS shell (abstain, not N.v.t. by assumption).
- 29 sample pages: 28 perfect and one 96 => no false claim that every page is fully perfect.
- Equal-length but distinct meta descriptions (must **not** flag duplicate); exact repeat descriptions (should flag).
- Contact route without form vs contact route with verified contact form.

## Release gate

Work on existing `fix/engine-primary-identity-evidence-20261015` / draft PR #147; do not merge or deploy automatically. Test existing Node suite, build, synthetic cross-sector matrix, and independent representative live scans before promoting engine changes. Claude's zip claimed 38 isolated tests, **not** validated inside RankFix; the zip itself has not been integrated in this commit.

This document is a review and reproduction checklist, not a claim that engine defects are fixed.
