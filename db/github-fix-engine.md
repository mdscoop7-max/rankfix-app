# GitHub Fix Engine

Phase 5 uses a server-side GitHub OAuth connection. Users authorize RankFix, RankFix encrypts the OAuth token in PostgreSQL, and the AI creates a new branch plus Pull Request. RankFix never auto-merges the PR.

## Render variables

GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
GITHUB_CALLBACK_URL=https://YOUR-DOMAIN/api/github/callback
APP_URL=https://YOUR-DOMAIN
SESSION_SECRET=...
DATABASE_URL=...
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-5.6-luna

## GitHub OAuth setup

Create a GitHub OAuth App and set its Authorization callback URL to GITHUB_CALLBACK_URL.

For production, migrate this connection to a GitHub App with the narrowest repository permissions possible. GitHub recommends GitHub Apps for finer-grained permissions.

## Flow

1. User connects GitHub.
2. RankFix receives and encrypts the user's access token.
3. User selects a repository and target file.
4. RankFix reads only that file.
5. OpenAI generates a complete replacement file with the smallest required change.
6. RankFix creates a rankfix/* branch.
7. RankFix commits the change.
8. RankFix opens a Pull Request.
9. User reviews and merges the PR manually.
