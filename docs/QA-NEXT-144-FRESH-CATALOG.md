# RankFix QA — next 144 fresh websites (planning, not yet activated)

## Purpose
Replace the visible 144-site TestLab selection **only when** 144 independently checked, real, distinct hosts are available. Keep baseline and commerce fixtures, exported results, and their localStorage keys unchanged for regression comparison. Do not launch scans automatically.

## Acceptance gates
1. Exactly 144 unique normalized hostnames, with zero overlap against **both** historical TestLab catalogs (baseline and commerce). Normalize www, case, and trailing dots.
2. Every candidate is a real public site with a documented organization, country, expected broad sector, suspected subtype, and human review status. Never invent hostnames or treat a guessed sector as verified.
3. Include a balanced mix of manufacturing/B2B, finance, healthcare, real estate, services, hospitality, nonprofits, public organizations, and commerce (including hybrid businesses and non-retail product catalogs).
4. Record evidence and the source used for expected labels. Unreviewed expected labels are explicitly provisional.
5. Add the new catalog as a separate catalog ID, preserving prior selections and exports; switch the default only after integrity tests pass.
6. Internal QA authentication, preview/local-only restriction, manual Start, exact deployment SHA and rate limits must remain enforced.
7. No repeat full-site scans until engine fixes and offline regression tests pass.

## Current status
NOT READY: no new 144-site candidate dataset has been independently checked. The existing TestLab selection is intentionally unchanged to avoid displaying invented sites or deleting prior QA evidence.
