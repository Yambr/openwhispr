---
phase: 05
plan: 04
subsystem: docs
tags: [docs, backend-spec, self-hosting, build-config, realtime, no-tdd]
requirements: [CFG-04, CFG-05, CFG-09]
dependency-graph:
  requires:
    - "Phase 05-01 (OPENWHISPR_REALTIME_WSS_URL build var + derivation)"
    - "Phase 05-02 (openaiRealtimeStreaming.js routes via build-config + empty-URL guard)"
    - "Phase 05-03 (STREAMING default flip + B1 auto-disable safety net)"
  provides:
    - "Maintainer-facing docs for OPENWHISPR_REALTIME_WSS_URL (BUILD_CONFIG.md)"
    - "Wire-level Realtime WebSocket Contract section in BACKEND_SPEC.md"
    - "Self-hosting walkthrough with realtime requirements + 503 graceful-degradation guidance (SELF_HOSTING.md)"
    - "README comparison-table row + build-your-own paragraph for Phase 05 routing change"
  affects:
    - "Third-party backend implementers can now build a wire-compatible realtime relay from spec"
    - "Self-hosters know how to opt out (STREAMING=false) when their backend lacks the relay"
tech-stack:
  added: []
  patterns:
    - "Cross-document linking triangle: BUILD_CONFIG ↔ BACKEND_SPEC ↔ SELF_HOSTING"
    - "Inline-amendment style for evolving env-var defaults (Phase 04.1 → Phase 05 STREAMING flip)"
key-files:
  created:
    - ".planning/phases/05-route-all-realtime-asr-diarization-streaming-through-corpora/05-04-SUMMARY.md"
  modified:
    - "docs/BUILD_CONFIG.md"
    - "docs/BACKEND_SPEC.md"
    - "docs/SELF_HOSTING.md"
    - "README.md"
decisions:
  - "Committed each doc separately (per user instruction) instead of the single docs commit suggested in the plan body — finer-grained git history makes revert / cherry-pick easier."
  - "Added the B1 auto-disable rule narrative to BUILD_CONFIG.md OPENWHISPR_STREAMING row (beyond the plan's literal text) because Phase 05-03's safety net is the operator-facing answer to 'what happens if I run npm run build with no env vars?' — the docs now answer that question."
  - "Linked Speaches Realtime API docs (https://speaches.ai/usage/realtime-api/) directly in BACKEND_SPEC §Realtime WebSocket Contract so third-party implementers have a concrete external reference for OpenAI Realtime compatibility."
  - "README got both a comparison-table row and a build-your-own paragraph — table row is the at-a-glance signal, paragraph is the actionable how-to. Plan suggested either/or; both was clearer."
  - "Path-preserving derivation rule (https://api.example.com/v1 → wss://api.example.com/v1/v1/realtime) explicitly documented in BUILD_CONFIG.md and BACKEND_SPEC.md — this is non-obvious behavior implementers will hit when their backend mounts at a sub-path."
metrics:
  duration: "~12min"
  tasks: 4
  files: 4
  completed: "2026-05-09"
---

# Phase 05 Plan 04: Phase 05 Realtime Routing Documentation Summary

Document Phase 05's three code-level changes (`OPENWHISPR_REALTIME_WSS_URL` build var, `openaiRealtimeStreaming.js` build-config routing, STREAMING default flip + B1 auto-disable) across the four user/maintainer-facing docs: `docs/BUILD_CONFIG.md`, `docs/BACKEND_SPEC.md`, `docs/SELF_HOSTING.md`, `README.md`.

## Outcome

Third-party backend implementers and corporate self-hosters now have a complete, cross-linked picture of Phase 05's realtime-routing changes:

- **`docs/BUILD_CONFIG.md`** — new Backend-table row for `OPENWHISPR_REALTIME_WSS_URL` (with derivation rules, path-preserving / scheme-transforming behavior); amended `OPENWHISPR_STREAMING` row noting the Phase 05 default-flip and the B1 auto-disable safety net; new Worked Example 4 covering the Speaches+LiteLLM relay default, an explicit override to a separate WSS-only ingress, and the `OPENWHISPR_STREAMING=false` opt-out.
- **`docs/BACKEND_SPEC.md`** — new top-level `## Realtime WebSocket Contract` section before `## Custom Protocol Redirect`, covering endpoint derivation, OpenAI Realtime API wire protocol (with per-`type` server-message → client-behavior table), auth (Bearer + `OpenAI-Beta: realtime=v1`), client-to-server events, timeouts (15 s connect, 3 s commit, recommended 3600 s server idle), cold-start buffering (3 s pre-`OPEN` PCM buffer), source pointer, graceful unavailability (HTTP 503), and out-of-scope items (per-session diarization, server-side speaker labels). Third-Party API Inventory row updated to reflect the build-config-driven URL.
- **`docs/SELF_HOSTING.md`** — new `### Realtime WebSocket (Phase 05)` subsection inside Required Endpoints with backend-implementation requirement (Speaches + LiteLLM `mode: realtime`, nginx ingress 3600 s timeouts) and graceful-degradation guidance (HTTP 503 + `OPENWHISPR_STREAMING=false` escape hatch); Selective opt-in table `OPENWHISPR_STREAMING` row updated to reflect new default; TL;DR blockquote amended with 2026-05-09 Phase 05 streaming-flip note.
- **`README.md`** — new comparison-table row noting the realtime-routing change vs upstream's direct WebSocket; build-your-own paragraph explaining the `OPENWHISPR_BACKEND_URL` → realtime URL derivation, the `OPENWHISPR_REALTIME_WSS_URL` override, and the `OPENWHISPR_STREAMING=false` opt-out, with a link to BACKEND_SPEC § Realtime WebSocket Contract.

The cross-linking triangle (BUILD_CONFIG ↔ BACKEND_SPEC ↔ SELF_HOSTING) is consistent: every reference to the realtime contract lands at the same anchor (`#realtime-websocket-contract`).

## Verification

All verify gates green post-edit (no behavior changed, but ran them as the plan's verification step):

```
npm run verify:oauth-gating       # 4 scenarios, 63 greps, 0 violations
npm run verify:feature-gating     # 5 scenarios, 140 greps, 0 violations
npm run verify:realtime-routing   # 5 derivation scenarios + source-no-leak + bundle-no-leak + SC-8, 0 violations
npm run verify:pack-regen         # PASS — pack pipeline regenerates build-config
npm run typecheck                 # PASS — no type errors
```

Plan-level grep verifications (Tasks 1–4) all hit:

```
grep -F "OPENWHISPR_REALTIME_WSS_URL"  docs/BUILD_CONFIG.md  → match
grep -F "Phase 05 amendment"           docs/BUILD_CONFIG.md  → match
grep -F "Realtime WebSocket Contract"  docs/BUILD_CONFIG.md  → match (cross-link)
grep -F "Realtime WebSocket Contract"  docs/BACKEND_SPEC.md  → match (heading)
grep -F "OPENWHISPR_REALTIME_WSS_URL"  docs/BACKEND_SPEC.md  → match
grep -F "Speaches"                     docs/BACKEND_SPEC.md  → match
grep -F "input_audio_buffer.append"    docs/BACKEND_SPEC.md  → match
grep -F "Realtime WebSocket (Phase 05)" docs/SELF_HOSTING.md → match
grep -F "WSS /v1/realtime"             docs/SELF_HOSTING.md  → match
grep -F "OPENWHISPR_REALTIME_WSS_URL"  docs/SELF_HOSTING.md  → match
grep -F "default since Phase 05"       docs/SELF_HOSTING.md  → match
grep -F "Phase 05"                     README.md             → match
grep -F "v1/realtime"                  README.md             → match
```

## Commits

| Task | Commit | File | Subject |
|------|--------|------|---------|
| 1 | `3b71ba5` | `docs/BUILD_CONFIG.md` | add OPENWHISPR_REALTIME_WSS_URL row + STREAMING amendment + Example 4 |
| 2 | `c854365` | `docs/BACKEND_SPEC.md` | add Realtime WebSocket Contract section to BACKEND_SPEC |
| 3 | `bfa349d` | `docs/SELF_HOSTING.md` | document Phase 05 realtime requirements in SELF_HOSTING |
| 4 | `2abc46b` | `README.md` | note Phase 05 realtime routing in README |

## Deviations from Plan

**1. [Rule 4 — granularity, requested by user] Committed each doc separately instead of one combined docs commit.**
- **Found during:** Plan kickoff. Plan body said "committed as a single docs commit (this plan has no code commits)" but the user prompt explicitly said "Commit each separately."
- **Resolution:** Followed user instruction (4 commits, one per file). Plan body's text was the executor's default suggestion, not a hard constraint; the user's prompt overrides.
- **Files modified:** All four docs (one commit each).

**2. [Rule 2 — added context, missing from plan literal] Documented the B1 auto-disable safety net narrative in BUILD_CONFIG.md and SELF_HOSTING.md.**
- **Found during:** Task 1 / Task 3 drafting. The plan literal for the OPENWHISPR_STREAMING row in BUILD_CONFIG.md mentioned the default flip but did NOT mention the B1 auto-disable rule (introduced in Phase 05-03). Without this, operators would not know what happens to a default `npm run build` with no env vars.
- **Resolution:** Added two sentences explaining the auto-disable trigger condition (`OPENWHISPR_STREAMING` not explicitly set AND `OPENWHISPR_REALTIME_WSS_URL` empty) and that `OPENWHISPR_STREAMING=true` with empty URL is respected (caller intent + runtime guard). Same B1 reference added to SELF_HOSTING.md TL;DR amendment.
- **Files modified:** `docs/BUILD_CONFIG.md`, `docs/SELF_HOSTING.md`.

No other deviations. No authentication gates. No architectural decisions required.

## Self-Check: PASSED

Verified all four files modified exist and contain the expected sections:

- `docs/BUILD_CONFIG.md` — `OPENWHISPR_REALTIME_WSS_URL` row present, `Phase 05 amendment` text present, Example 4 added.
- `docs/BACKEND_SPEC.md` — `## Realtime WebSocket Contract` heading present, Speaches reference present, `input_audio_buffer.append` documented, inventory row updated.
- `docs/SELF_HOSTING.md` — `### Realtime WebSocket (Phase 05)` subsection present, Selective opt-in row updated to "default since Phase 05", TL;DR amendment present.
- `README.md` — Phase 05 row in comparison table, build-your-own paragraph cross-linking BACKEND_SPEC.

All four commits present in `git log`:

```
2abc46b docs(05-04): note Phase 05 realtime routing in README
bfa349d docs(05-04): document Phase 05 realtime requirements in SELF_HOSTING
c854365 docs(05-04): add Realtime WebSocket Contract section to BACKEND_SPEC
3b71ba5 docs(05-04): add OPENWHISPR_REALTIME_WSS_URL row + STREAMING amendment + Example 4
```
