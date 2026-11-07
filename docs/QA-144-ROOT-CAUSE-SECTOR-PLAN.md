# RankFix QA — 144-site root-cause review and first fix

Date: 23 October 2026. **QA only**, separate branch `qa/homepage-multipage-sector-20261023`. Do not merge or deploy to production without verification.

## Baseline from uploaded TestLab HTML

Run 23 October 2026, 20:01:49–21:15:46 UTC, QA commit `af918dbd13b5570cfc0cc6e7af8ca3c9773a3694`, engine `3.5.2-page-evidence-186`.

| Class in TestLab | Sites |
|---|---:|
| Compatible primary sector (broad family) | 67 |
| Sector to review | 22 |
| Sector unconfirmed | 23 |
| Access blocked by the website | 29 |
| Timeout | 2 |
| Server error | 1 |
| **Total** | **144** |

112/144 returned full reports; only 67/112 had a broadly compatible primary sector. The 48 brand-new-sector cases (rounds E/F) had 22 to review, 19 unconfirmed, six blocked and one server error. These are **not** proof that 45 sectors were objectively wrong: expected labels and exact subtypes require independent validation. For the old four rounds, 67/96 were family-compatible.

## Root causes distinguished

1. **Business identity vs capability.** Cart, checkout, an information catalogue or a category page can coexist with a primary company activity. Treating them as an industry directly leads to wrong retail labels.
2. **Missing exact families.** Cybersecurity, recycling, ports, airports, agriculture and sports governing bodies had no appropriate confirmed site-level identity in the final engine. Museum, law, charity, architecture and veterinary identities need more precise subtypes.
3. **Representative sampling bias.** `about us`, `over ons` and organisation pages were scored as utility links and de-prioritised, even though they often declare the site's primary business.
4. **Access vs correctness.** Twenty-nine site-side blocks are not defects in a site. RankFix must not bypass a WAF; show a non-score with honest reasons. Investigate two timeouts and one server error separately. The existing QA branch already has earlier page-gate, persistence and speed fixes that need regression testing.
5. **Score interpretation.** A 99 or 100 is a score for the confirmed audit checks, not 99–100% correct sector recognition. Uncertain sector/page coverage must remain visible.

## New QA behavior under review

- The scanner starts with the homepage identity (title, description, heading, typed metadata).
- It reads the **already selected** representative same-site pages. No second crawl or added network step.
- A specific industry must appear on at least two different independently identified own pages, **including a matching homepage vote**, or on at least three own pages when the homepage gives no identifiable vote.
- Different sector declarations, news/blog posts, market/customer-industry pages, partial fetches, duplicate headings and external domains prevent confirmation.
- The identity result is reconciled **before** the final commerce gate. Shop features on law firms, airports and cybersecurity sites are assessed as possible secondary capabilities, not proof of the business sector.
- Known/confirmed webshops are protected: a verified explicit online-store identity is not overridden by incidental service words.
- The report consistency catalogue accepts the new families. This does NOT magically add sector-specific SEO checklists for all new families.
- A pure EU company-register gate supports exact matching by country + legal identifier + optionally legal name. It returns a **registered-activity hint only**, never direct proof of website activity. No new external API calls, credentials or paid service have been enabled.

## Verification required BEFORE using new 144-site TestLab

1. Run the new fixture tests, full existing unit/regression tests, strict typecheck and Next.js build on exact QA commit. Workflow: `.github/workflows/qa-sector-validation.yml`. Do not claim all green before CI confirms.
2. Use recorded 144-site results as a historical baseline; compare with real QA replays on the same sites **without penalizing WAF refusals as sector failures**. Inspect no-regression for all 67 former compatible primary sectors.
3. Independently review ground truth for legal/charity/museum/airports/ports/cybersecurity and multiple multilingual negative examples (selling cyber devices != cybersecurity consultancy; airport parking != airport operator; software for law firms != law firm).
4. Verify subtype as a separate metric from broad industry; holdout websites must not be reused for rule tuning.
5. Confirm PageSpeed mobile/desktop status, sample completeness, database retry/idempotency and blocked/challenge detection independently; this patch alone does **not** certify those unrelated subsystems.
6. Only after these gates, run a new 144-URL **disjoint** holdout with transportation, hotels, accommodation, car hire, restaurants, Shopify and WooCommerce stores, plus unrelated sectors and countries. Compare exact industry, subtype, platform technology, scan completion, evidence coverage and calibration.

## Registry API policy

- Netherlands: official KVK developer API requires a subscription/API key. See https://developers.kvk.nl/nl/apis.
- France: official public business search API https://recherche-entreprises.api.gouv.fr/docs/ has rate limits and incomplete coverage.
- EU: BRIS is a register-interconnection service, not a universal free production REST endpoint. VIES validates VAT identifiers, not a site's primary commercial sector.
- Never scrape restricted registries, infer a registration from brand name alone, or equate NACE/SBI/NAF activity with website offerings. Use an explicit availability/unconfirmed state.

**Status:** code authored in an isolated QA branch. The local 9-case smoke check for the pure sector algorithm and the 8-case registry-gate check passed. Full CI, live site replay and before/after effectiveness are **not yet verified**.
