# Link

Prepare for any conversation, get the right cue instantly while you talk, and improve after every call.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how it works.

## Requirements
- Node.js 22 or newer
- The Supabase project `link` (schema in `supabase/migrations`)
- An xAI (Grok) API key
- Windows 10/11 for the desktop app (Phase 2)

## Setup
1. Create `apps/web/.env.local` (see `.env.example`).
2. Install and run:
```powershell
npm install
npm run typecheck
npm test
npm run dev
```
3. Open http://localhost:3000

## Tests
```powershell
npm test                                   # unit tests (packages/core)
npx playwright install chromium            # once, for browser tests
npm run test:e2e -w @link/web              # browser tests; starts a dev server on port 3100
```
Signed-in browser tests need a test account: set `E2E_EMAIL` and `E2E_PASSWORD` first.
To test a deployed site instead, set `E2E_BASE_URL=https://your-site.vercel.app`.

## Structure
- `apps/web` — Next.js dashboard: packs, sources, cue generation, gap questions, review, rehearsal
- `apps/desktop` — Electron live app (Phase 2)
- `packages/core` — shared schemas, sanitizer and matching engine
- `supabase/migrations` — database schema