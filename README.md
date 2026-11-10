# Link

Prepare for any conversation, get the right cue instantly while you talk, and improve after every call.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how it works.

## Requirements
- Node.js 22 or newer
- A Supabase project
- Windows 10/11 for the desktop app

## Setup
```powershell
npm install
npm run typecheck
npm test
```

## Structure
- `apps/web` — Next.js dashboard and MCP endpoint (Phase 1)
- `apps/desktop` — Electron live app (Phase 2)
- `packages/core` — shared schemas and matching engine
- `supabase/migrations` — database schema