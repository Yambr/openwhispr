# v1.7.20 Corp Live-Verify Runbook (260604-tsa cloud embeddings)

**Run this on the corp machine** (network access to the prod server + OIDC login).
Goal: prove the LOCKDOWN client routes embeddings to the in-perimeter `/api/embeddings`
(semantic search works end-to-end) and the meeting realtime stays on the self-hosted
relay (no OpenAI path / reconnect storm). This is the ONLY gate left before tagging v1.7.20.

Server is already in prod (1.2.3, `features.embeddings=true`, dim 1024). Code is on main.

---

## Part A — Build the lockdown client (on any build machine, Node 24)

```bash
nvm exec 24 npm ci                       # if deps not installed
OPENWHISPR_PROVIDER_LOCKDOWN=true \
OPENWHISPR_BACKEND_URL=<corp-prod-base-url> \
OPENWHISPR_AUTH_URL=<corp-oidc-auth-url> \
  npm run pack                           # unsigned pack is fine for live-verify
# (or the full signed build if you want to verify the exact release artifact)
```

This regenerates `build-config.generated.*` with `PROVIDER_LOCKDOWN_ENABLED=true`
and bakes the corp host defaults. The built app lands in `dist/mac-arm64/OpenWhispr.app`
(adjust per platform).

> If you prefer, set the corp Server URL at runtime in onboarding instead of baking
> `OPENWHISPR_BACKEND_URL` — both work; baking is more representative of the operator build.

## Part B — Enable debug logging (so the main-process proof is captured)

The decisive proof (the `/api/embeddings` POST) is in the MAIN process — renderer-CDP
cannot see it. The app logs it. Enable debug logging before launch:

```bash
export OPENWHISPR_LOG_LEVEL=debug
```

The debug log is written to the platform app-data dir. On macOS:
`~/Library/Application Support/open-whispr/` (look for the newest `debug-*.log`),
or wherever your build's `userData` points (the corp build used `open-whispr`).

## Part C — Launch under CDP + sign in

```bash
OPENWHISPR_LOG_LEVEL=debug \
  /path/to/dist/mac-arm64/OpenWhispr.app/Contents/MacOS/OpenWhispr \
  --remote-debugging-port=9223
```

In the app: complete onboarding, set the corp Server URL if not baked, and **sign in
via OIDC** to the corp server. Confirm you're signed in (you have a session).

## Part D — Run the automated CDP probe

From this repo on the same machine (needs `ws` from node_modules — `npm ci` covers it):

```bash
node scripts/cdp-embeddings-verify.mjs
```

It will:
1. assert an auth token + serverUrl are present (fails fast if not signed in),
2. create a note "Quarterly revenue projections",
3. run a full `semanticReindexAll()`,
4. run a SYNONYM semantic search ("financial forecast outlook") — this only matches
   the note via **embeddings similarity**, not keyword, so a hit proves the vector path.

**Expected renderer-side output (PASS):**
- `reindex success: YES`
- `semantic hits: 1` (titles include "Quarterly revenue projections")
- `embeddings reachable: LIKELY YES`

**FAIL signatures:**
- `reindex-all: {"success":false,"error":"notes.embeddings.cloudUnavailable"}`
  → server returned `features.embeddings=false` or 502/503. Check the server / capability.
- `semantic hits: 0` with reindex success → embeddings produced but search mismatch;
  re-check the synonym query matched (a keyword query would also hit via FTS5 — use the
  synonym one to isolate the vector path).

## Part E — The decisive main-process proof (grep the debug log)

```bash
LOG=$(ls -t ~/Library/Application\ Support/open-whispr/debug-*.log | head -1)
grep -nE "embeddings: routing to cloud provider|embeddings: semantic indexing unavailable|embeddings: recreating qdrant collection|/api/embeddings|capabilit" "$LOG"
```

**PASS requires:**
- `embeddings: routing to cloud provider (lockdown + capabilities)` — caps-true, cloud selected.
- (on first run with a stale 384 collection) `embeddings: recreating qdrant collection at new dim` — dim migration fired 384→1024.
- NO line `embeddings: semantic indexing unavailable` (that's the caps-false / stub path).

## Part F — Realtime (#1) spot-check (meeting transcription)

Start a meeting recording (or dictation) in the app and watch the debug log:

```bash
grep -nE "Streaming providers catalog not loaded|OpenAI Realtime connecting|/v1/realtime|api.openai.com|reconnect" "$LOG"
```

**PASS:**
- realtime connects to `wss://<corp-server>/v1/realtime` (the configured host).
- NO `api.openai.com`, NO `falling back to OpenAI default` reconnect storm.
- transcripts appear (server pins the in-perimeter model).

---

## Verdict → tag

If Part D (renderer) + Part E (`routing to cloud provider`, no `unavailable`) + Part F
(self-hosted relay, no OpenAI) are all green → live-verify PASSED. Send me the
`cdp-embeddings-verify.mjs` output + the grepped log lines; I'll record the checkpoint
and tag v1.7.20. Then ping the server peer to fix the pair (server 1.2.3 + client 1.7.20).

If anything is red → send me the exact log lines; it's a real finding, not a tag-blocker
to paper over.
