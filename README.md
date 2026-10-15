# RankFix

RankFix is a Next.js 16 application for evidence-based SEO, GEO/AI-search, technical, commerce and passive security audits.

## Production

- Runtime: Node.js 24
- Hosting: Vercel
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

## Evidentie en browser-rendering

De audit herkent Nuxt, Next, React, Vue en Angular en probeert binnen een begrensd budget de gerenderde DOM met server-HTML samen te voegen. Vercel gebruikt `@sparticuz/chromium` en `puppeteer-core`, met Chromium via `outputFileTracingIncludes`. Rendering heeft een timeout, een beperkte retry en standaard maximaal 35 pogingen binnen 240 seconden (instelbaar met `RANKFIX_MAX_RENDERS_PER_SCAN` en `RANKFIX_RENDER_DEADLINE_MS`). Bij falen worden afhankelijke signalen niet als bewezen afwezig beschouwd, maar blijft de oorzaak zichtbaar.

De vaste SEO/GEO-kernscore is onafhankelijk van later toegevoegde sectorcontroles; aanvullende controles verschijnen apart. De rapportage toont de bewijsdekking, een voorlopig bereik, bevestigde versus onbevestigde steekproeven, en selecties per paginatype. Testfixtures staan in `tests/feedback-19-regression.test.mjs` en zijn geen vervanging van een echte productie-audit.
