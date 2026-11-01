# PostgreSQL verification follow-up: confirmed versus unverified root 404

Enabling the previously skipped database tests on `de61967` exposed one test failure: run 41313666029 recorded a root HTTP 404 with body "not found" and no browser observation as UNVERIFIED_NOT_FOUND/site_blocked, while the old database fixture expected HTTP_NOT_FOUND/site_unavailable. The other three PostgreSQL scan/storage tests passed. CI correctly failed; the missing quality artifact also failed rather than silently passing.

The production behavior is supported by the already-existing independent `run-root-404.mjs` regression: ambiguous root 404 without usable browser confirmation is NOT a proven missing homepage. No production classification or score rule was relaxed.

The integration fixture now supplies an explicit owned not-found HTML template for the original confirmed-404 expectation. The ORIGINAL ambiguous body is retained as a separate unverified negative control, and a deep missing URL is checked separately. In addition to checking stored database rows, the test now checks response codes and verifies failed/unverified attempts receive no score and confirmed/unverified missing-page attempts are not charged. This strengthens the test instead of merely changing its expected answer. Eight attempt outcomes replace the old six.

The existing root-404 regression passes locally (6 scenarios) and the category/body-timeout unit file passes (4 tests). Actual PostgreSQL verification awaits the next CI run; it is not marked passed here. CI now collects the independent sector quality artifact even when the main suite fails, while retaining the original suite failure and failing on a missing artifact.

No live scans, merge or deployment. This fixture change does not tune the frozen identity validation data or alter application behavior.
