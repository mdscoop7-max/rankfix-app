# RankFix AI deployment variables

DATABASE_URL=Postgres connection string
SESSION_SECRET=long-random-secret
OPENAI_API_KEY=your-own-openai-api-key
OPENAI_MODEL=gpt-5.6-luna

# Database setup
Run db/schema.sql once against the PostgreSQL database before enabling accounts.

RESEND_API_KEY=your-resend-api-key
SCAN_REPORT_FROM=RankFix AI <verified-sender@your-domain.com>

# Scan report email
After an authenticated scan, RankFix sends the full SEO + GEO report to the user's account email. Configure a verified Resend sender in SCAN_REPORT_FROM. If these email variables are missing or delivery fails, the scan itself still succeeds and the error is logged server-side.
