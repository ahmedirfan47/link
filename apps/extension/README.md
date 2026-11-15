# Link for Chrome

Your Link cards in Chrome's side panel, next to a Google Meet call. The
extension reads the captions Meet shows you (turn them on with **c**), finds
the card for what the other side just said, and offers Grok for questions no
card covers. No audio leaves your computer and nothing is recorded.

## Build and install (until it is on the Chrome Web Store)

```powershell
npm install
npm run build -w @link/extension
```

1. Open `chrome://extensions` and turn on **Developer mode**.
2. **Load unpacked** and pick `apps/extension/dist`.
3. Sign in to Link in the same Chrome profile.
4. In a Meet call, click the Link icon in the toolbar; the side panel opens.

To point it at another Link address (a custom domain or local development):

```powershell
$env:LINK_URL="https://link.example.com"; npm run build -w @link/extension
```

## How it works

- `src/content-meet.ts` runs on meet.google.com and passes the latest caption
  lines to the panel. Meet has no captions API, so `src/captions.ts` finds the
  caption area by its label and speaker avatars; if Meet changes its markup,
  this is the file to update.
- `src/sidepanel.ts` loads your packs from Link with your normal sign-in
  cookie, matches captions to cards with the same search as Pocket, and calls
  Link for stars, hiding, missed questions and Ask Grok.
- Before following a call it reminds you to tell the others, with a line to
  paste in the meeting chat.

## Tests

```powershell
npm test -w @link/extension                                       # caption parsing
npx playwright test e2e/extension.spec.ts                         # from apps/web: the panel in a real Chromium
```
