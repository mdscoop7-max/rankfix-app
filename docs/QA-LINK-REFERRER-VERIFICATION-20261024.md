# QA link evidence verification — 24 October 2026

Scope: QA only. Main and production unchanged; PageSpeed remains disabled by default.
No final 144-site live run was started.

## Findings and repair

Reviewed pending commit `144a89b` on top of QA `2a6661b`. The source URL is
correctly taken from the final scanned page, whose anchors are being checked.
The check carries destination URL, source URL, HTTP status, outcome and soft-404
flag. Existing report/dashboard views display the message and remediation text.

An additional defect was reproduced: in EN/DE/FR/IT/ES the optional translation
fallback replaced the detailed message with generic text, losing both source and
destination URLs. The HTTP route matrix reported 50 assertion failures across
those five languages. Deterministic localized link copy now runs after translation
and preserves exact URLs, HTTP statuses and outcome distinctions. The same matrix
now passes all 24 scenarios, including Dutch. Scoring is unchanged by this repair.

## Replay comparison

Both versions were run through the real scan route with network fixtures:
`e3991fa` versus `144a89b` plus the localization repair.

- 93 fixture entries; 92 have identical overall, SEO and GEO values (including
  the no-report case). Rode Kruis: overall 97 → 96, SEO 96 → 95, GEO 98 → 98.
  Refused links no longer falsely pass; this is an intended evidence correction.
- No primary-sector changes.
- Sophos and Enterprise lose their secondary ecommerce activity and product
  module. Product schema without an offer no longer proves retail; this comes
  from the preceding software-product repair. Their scores are unchanged.
- EDF and citizenM retain their baseline scores.

The fixture builder only includes successful stored scans with a local scan JSON
and a homepage audit. This fixture has 93 entries, not 144. The other 51 URLs are
not covered by this replay; their individual exclusion reasons are not recorded
in the fixture. A replay reconstructs partial recorded evidence, not live HTML,
and is not a substitute for live scans or an independent sector-label review.

## Validation and next gate

- Production-mode local build succeeded (Next.js 16.3.8, TypeScript included).
- Targeted HTTP/source-page matrix: 24 scenarios, zero failures.
- Full test/replay result and QA deployment recorded in the completion response.
- Live runtime behavior and actual external-site access require separate QA
  verification; do not present offline fixtures as live website scans.
