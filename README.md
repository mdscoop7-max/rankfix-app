# RankFix

RankFix is a Next.js 16 application for evidence-based SEO, GEO/AI-search, technical, commerce and passive security audits.

## Production

- Runtime: Node.js 24
- Hosting: Render
- Production URL: https://rankfix-app.onrender.com/
- Database: PostgreSQL
- Main branch: `main`

## Local verification

```bash
npm install
npm test
npm run lint
npm run build
```

The scanner treats `unable_to_confirm` as insufficient evidence and `not_applicable` only as genuinely out of scope. Passive security checks never perform exploit, brute-force or active vulnerability testing.

## Operational rules

Customer plan prices and website/scan limits are defined in `lib/plans.ts`. Do not duplicate those numeric limits in API code.

Internal monitoring and health endpoints require `MONITOR_SECRET`. Internal validation bypasses must use the explicit `RANKFIX_INTERNAL_TEST_USER_ID` or `RANKFIX_INTERNAL_TEST_EMAIL` settings. Do not add plan-wide or domain-specific bypasses.
