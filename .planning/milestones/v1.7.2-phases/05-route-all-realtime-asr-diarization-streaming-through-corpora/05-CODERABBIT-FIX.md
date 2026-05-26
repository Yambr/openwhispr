---
phase: 05
fixed_at: 2026-05-09
review_path: .planning/phases/05-route-all-realtime-asr-diarization-streaming-through-corpora/05-CODERABBIT-REVIEW.md
iteration: 1
findings_in_scope: 3
fixed: 3
skipped: 0
status: all_fixed
---

# Phase 05: CodeRabbit Review Fix Report

**Fixed at:** 2026-05-09
**Source review:** `.planning/phases/05-route-all-realtime-asr-diarization-streaming-through-corpora/05-CODERABBIT-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope: 3
- Fixed: 3
- Skipped: 0

All 4 verify gates (`verify:oauth-gating`, `verify:pack-regen`, `verify:feature-gating`, `verify:realtime-routing`) and `typecheck` pass post-fix.

## Fixed Issues

### CR-01: Reconcile contradictory streaming-default statements in SELF_HOSTING.md

**Files modified:** `docs/SELF_HOSTING.md`
**Commit:** fb9d3e4
**Applied fix:** Replaced the two adjacent contradictory blockquote paragraphs (lines 29 and 31) with a single coherent post-Phase-05 statement. The first paragraph now describes the corporate-minimal default with only Stripe billing UI and referrals as flags-off (streaming removed from this list because it is no longer off-by-default). The second paragraph documents the Phase 05 reality: `OPENWHISPR_STREAMING=true` by default, derives `OPENWHISPR_REALTIME_WSS_URL` from `OPENWHISPR_BACKEND_URL`, with B1 auto-disable safety net.

### CR-02: Merge contradictory streaming rows in README comparison table

**Files modified:** `README.md`
**Commit:** 1117e22
**Applied fix:** Collapsed the two adjacent contradictory rows (`AssemblyAI / Deepgram streaming` and `Realtime ASR routing (Phase 05)`) into a single unified row titled "Realtime ASR streaming (Phase 05)". The merged row notes that AssemblyAI/Deepgram code is physically removed from the bundle, that `OPENWHISPR_STREAMING` defaults to `true`, that realtime routes through the corporate backend, and that B1 auto-disable forces it off when no backend URL is configured.

### CR-03: Drop URL fragment from `deriveRealtimeWssUrl` (real correctness bug)

**Files modified:** `scripts/generate-build-config.js`
**Commit:** d6b4ec7
**Applied fix:** Removed `${u.hash}` from the derived URL template in `deriveRealtimeWssUrl` (line 130). Now emits only `${protocol}//${u.host}${pathPrefix}/v1/realtime${u.search}`. Updated the function's contract comment block to document the new behavior: query string preserved (legitimate for token-in-query gateways), fragment dropped (fragments don't make sense for WebSocket endpoints, and downstream code at `openaiRealtimeStreaming.js:67` appends `?intent=transcription` / `&intent=...` — preserving the fragment would swallow that suffix). Verified via `verify:realtime-routing` gate which exercises 5 derivation scenarios.

---

_Fixed: 2026-05-09_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
