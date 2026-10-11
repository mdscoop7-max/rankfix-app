# RankFix

RankFix is a Next.js 16 application for evidence-based SEO, GEO/AI-search, technical, commerce and passive security audits.

## Production

- Runtime: Node.js 24
- Hosting: Vercel (production deploys from `main`; Render is no longer used)
- Production URL: https://rankfix-app.vercel.app/
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

## Browser rendering

JavaScript sites are rendered with `puppeteer-core` and `@sparticuz/chromium` on Vercel (`lib/headless-render.ts`). Locally the full `puppeteer` dev dependency is used, or `PUPPETEER_EXECUTABLE_PATH`. Rendering is bounded; when a render is refused or fails, the scan keeps the raw-HTML evidence and the report says why.

| Variable | Default | Purpose |
| --- | --- | --- |
| `RANKFIX_MAX_RENDERS_PER_SCAN` | 10 | Browser renders allowed in one scan |
| `RANKFIX_RENDER_DEADLINE_MS` | 150000 | No new render starts after this much scan time |
| `RANKFIX_RENDER_CONCURRENCY` | 2 | Simultaneous tabs in one browser |
| `RANKFIX_CHROMIUM_MODE` | `isolated` | `single` forces single-process Chromium (one tab at a time) |
