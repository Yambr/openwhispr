---
phase: 05-route-all-realtime-asr-diarization-streaming-through-corpora
fixed_at: 2026-05-09T00:00:00Z
review_path: .planning/phases/05-route-all-realtime-asr-diarization-streaming-through-corpora/05-REVIEW.md
iteration: 1
findings_in_scope: 2
fixed: 2
skipped: 0
status: all_fixed
---

# Phase 05: Code Review Fix Report

**Fixed at:** 2026-05-09
**Source review:** .planning/phases/05-route-all-realtime-asr-diarization-streaming-through-corpora/05-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 2
- Fixed: 2
- Skipped: 0

## Fixed Issues

### WR-01: Query-string concatenation on explicit override produces malformed URL

**Files modified:** `src/helpers/openaiRealtimeStreaming.js`
**Commit:** 06e57d1
**Applied fix:** Detect existing `?` in `OPENWHISPR_REALTIME_WSS_URL`; use `&` separator when present, else `?`. Prevents malformed URLs like `...?model=foo?intent=transcription` when an operator's explicit override already includes a query string.

### WR-02: `deriveRealtimeWssUrl` silently drops query string and any non-`http:` becomes `wss:`

**Files modified:** `scripts/generate-build-config.js`
**Commit:** 166c09e
**Applied fix:** Tightened protocol check — only `https:` → `wss:` and `http:` → `ws:`; everything else returns `""` so the STREAMING auto-disable kicks in. Forward `u.search` and `u.hash` from `OPENWHISPR_BACKEND_URL` into the derived realtime URL so token-in-query gateways work.

## Verification

- `npm run verify:realtime-routing` — passed (5 derivation scenarios + source/bundle no-leak + SC-8)
- `npm run verify:feature-gating` — passed (5 scenarios, 140 greps)
- `npm run verify:oauth-gating` — passed (4 scenarios, 63 greps)
- `npm run typecheck` — passed

---

_Fixed: 2026-05-09_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
