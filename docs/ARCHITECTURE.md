# Link — Architecture

Link prepares you for a conversation, recalls the right cue instantly while you talk, and improves after every call.

## 1. Components

```
link/
├─ apps/
│  ├─ web/        Next.js dashboard on Vercel: build packs, review cues, gap interview,
│  │              rehearsal, session history. Also hosts the MCP endpoint (/api/mcp)
│  │              so Claude and ChatGPT can read and write packs.
│  └─ desktop/    Electron app for Windows: audio capture, live transcription,
│                 matching, overlay, word finder, post-call summary.
├─ packages/
│  └─ core/       Shared TypeScript: schemas, limits, text utilities, matching engine.
│                 No I/O, so it runs the same in web, desktop and tests.
├─ supabase/
│  └─ migrations/ Postgres schema, Row Level Security, storage bucket.
└─ docs/
```

## 2. Data flow

### Before the call (cloud)
1. User creates a **pack** (meeting type, counterpart, goal, language).
2. User adds **sources**: files (Supabase Storage), URLs, ChatGPT/Claude share links, chat exports, notes.
3. Server extracts text from each source.
4. Claude (pack model) returns a `GeneratedPack`: cues + gap questions, validated with zod.
5. User answers **gap questions**; answers become new cues.
6. User reviews and approves cues, then rehearses.

### During the call (desktop, local-first)
1. Two audio streams: **microphone** (you) and **system loopback** (them).
   Phone calls run through Windows Phone Link so their voice arrives as system audio.
2. Each stream goes to streaming speech-to-text (AssemblyAI for English, Soniox for Urdu-English).
3. Their stream feeds a `RollingWindow` (last ~30 words).
4. Every ~300 ms the window is embedded by a local model and passed to `CueMatcher`
   (threshold + ambiguity margin + cooldown). `keywordHits` catches names and numbers.
5. A match shows a cue card in the overlay.
6. End of turn with no match → Claude (live model) writes an "unprepared" cue.
7. Your stream drives the **word finder**: a stall mid-sentence surfaces the likely term.

### After the call
- Summary and follow-ups.
- Unmatched questions become suggested cues for the pack.
- Hesitation points are listed for rehearsal.
- Only `sessions` and `session_events` sync to the cloud. Audio and full transcripts stay on the device unless the user opts in.

## 3. Data model (Supabase)

| Table | Purpose |
|---|---|
| `profiles` | One per user, auto-created on sign-up |
| `packs` | A prepared conversation |
| `sources` | Material a pack is built from |
| `cues` | Cards: direction (incoming/outgoing), kind (question/topic/number/checklist), prompt, variants, ≤3 bullets, keywords |
| `gap_questions` | What the sources could not answer |
| `sessions` | One live call |
| `session_events` | Cue shown/dismissed, unmatched question, fallback, hesitation |

Every table has `user_id` and Row Level Security: users only read and write their own rows,
and child rows can only be attached to the user's own packs or sessions.
Uploaded files live in the private `sources` bucket under `<user_id>/<pack_id>/<file>`.

## 4. Key decisions

| Decision | Reason |
|---|---|
| Prepared bank + local matching, LLM only as fallback | Instant, predictable, cheap |
| Separate mic and system streams | Who-said-what for free, no diarization needed |
| Embeddings computed on the desktop, not stored in Postgres | Model can change without migrations; works offline |
| Live prompts kept under 100K tokens | Haiku 5.5 price is 5× above that |
| Transcripts local by default | Privacy and consent law |
| One Vercel app hosts dashboard + MCP | One deployment, one auth system |

## 5. Phases

1. **Pack engine** — web dashboard, sources, generation, review, gap interview.
2. **Live engine** — Electron, audio capture, STT, matching, overlay.
3. **Word finder, rehearsal, post-call learning.**
4. **Integrations** — MCP endpoint, chat-export and share-link import.
5. **Product** — billing, consent prompts, code signing, onboarding, macOS.