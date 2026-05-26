---
phase: 260526-ix4
plan: 01
subsystem: realtime-streaming
status: incomplete
resume-signal: Task 3 (checkpoint:human-verify) — live verification against staging server
tags:
  - realtime
  - language
  - wss
  - dictation
  - i18n
provides:
  - "OpenAIRealtimeStreaming.connect({language}) appends &language=<code> to the WSS URL"
  - "Dictation IPC forwards options.language → streaming.connect"
  - "audioManager.warmup + audioManager.start emit ISO-639-1 base codes (en-US → en) via getBaseLanguageCode"
  - "meetingRecordingStore.getMeetingTranscriptionOptions returns include `language` on both OpenAI-realtime paths (fallback + happy)"
requires:
  - "Server v1.0.9 (xgohagty) deployed with ?language= query-param injection + whitelist ['en','ru']"
affects:
  - dictation realtime (provider lockdown + BYOK)
  - meeting realtime (mic + system streams)
tech-stack:
  added: []
  patterns:
    - "Single-point query-string serialization in main-process connect()"
    - "Renderer-side normalization via getBaseLanguageCode (no main-process splitting)"
    - "Truthy guard for language (covers undefined/null/''/0); no explicit !== undefined check"
key-files:
  created: []
  modified:
    - src/helpers/openaiRealtimeStreaming.js
    - src/helpers/ipcHandlers.js
    - src/helpers/audioManager.js
    - src/stores/meetingRecordingStore.ts
    - test/helpers/openaiRealtimeStreaming.test.js
decisions:
  - "No client-side ISO whitelist (server is authoritative; allows zero-client-release roll-out when server expands the list)"
  - "Renderer-side normalization (Option A from RESEARCH.md) — one place owns 'what STT code we send', main-process stays signature-clean"
  - "Truthy guard for language (not !== undefined) — uniformly skips empty string and null"
  - "BYOK direct-OpenAI session.update.transcription.language stays OUT of scope per RESEARCH.md Open Questions §2 (separate follow-up for upstream PR)"
metrics:
  duration_seconds: 209
  duration_human: "3m 29s"
  completed_date: "2026-05-26"
  commits: 3
  files_modified: 5
  lines_added_implementation: 12
  lines_added_tests: 150
---

# Phase 260526-ix4 Plan 01: Client realtime WSS — pass settings.preferredLanguage as `?language=` Summary

Forwards the user's `settings.preferredLanguage` (normalized to ISO-639-1 base via `getBaseLanguageCode`) end-to-end from renderer settings through main-process realtime IPC to the WSS URL as `?language=<code>`. Closes the language-drift bug where short Russian utterances were OpenAI-auto-detected as English on the corporate-lockdown realtime path.

## What changed

### Tasks 1 + 2 — code (3 commits)

| Commit     | Type     | Files                                              | Purpose                                                                            |
| ---------- | -------- | -------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `6909d5fc` | test     | test/helpers/openaiRealtimeStreaming.test.js (+150) | RED: 7 new language-suffix assertions on URL build (3 fail / 7 pass)               |
| `146868cc` | feat     | src/helpers/openaiRealtimeStreaming.js (+7/-3)     | GREEN: destructure `language`, append `&language=<enc>` after `?intent=transcription`; include `language` in connect-debug log |
| `081493a2` | feat     | src/helpers/ipcHandlers.js (+1), audioManager.js (+2/-2), meetingRecordingStore.ts (+2/-2) | Wire dictation IPC; normalize en-US → en in audioManager warmup + start; close fallback return in meetingStore |

**Net diff:** +12 implementation lines, +150 test lines (3 commits, 5 files modified).

### What lands at each layer

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Renderer (Zustand settingsStore.preferredLanguage = "ru" | "en-US" | …) │
│   │                                                                     │
│   ├─→ audioManager.warmupStreamingConnection  (line 2065)               │
│   │     language: getBaseLanguageCode(warmupLang)  ← "en-US" → "en"     │
│   │                                                                     │
│   ├─→ audioManager.startStreamingRecording  (line 2290)                 │
│   │     language: getBaseLanguageCode(preferredLang)                    │
│   │                                                                     │
│   └─→ meetingRecordingStore.getMeetingTranscriptionOptions  (line 113)  │
│         const language = getBaseLanguageCode(state.preferredLanguage)   │
│         returns { ..., language }  (both fallback + happy paths)        │
│                                                                         │
│ ───── IPC boundary ─────────────────────────────────────────────────── │
│                                                                         │
│ Main process (ipcHandlers.js)                                           │
│   • connectInner (dictation, line 5135)  ← NEW: language: options.language│
│     await streaming.connect({ ..., language: options.language })        │
│   • connectRealtimeStreaming (meeting, line 4302)  ← already in place   │
│                                                                         │
│ OpenAIRealtimeStreaming.connect (openaiRealtimeStreaming.js)            │
│   const { ..., language } = options;                                    │
│   const langSuffix = language ? `&language=${encodeURIComponent(...)}` :│
│                                  "";                                    │
│   const url = `${WSS}${sep}intent=transcription${langSuffix}`           │
│                                                                         │
│ ───── WSS ─────────────────────────────────────────────────────────── │
│                                                                         │
│ Server (xgohagty v1.0.9) — reads ?language=, validates against          │
│   whitelist ['en','ru'], injects transcription.language into            │
│   session.update frame on OpenAI realtime relay.                        │
└─────────────────────────────────────────────────────────────────────────┘
```

## Verification (automated — Task 1 + Task 2)

All gates PASS on commit `081493a2`:

| Gate                                                                                                  | Result                                                                                |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `npx vitest run test/helpers/openaiRealtimeStreaming.test.js`                                         | 10 / 10 (3 prior + 7 new)                                                             |
| `npx tsc --noEmit -p src/tsconfig.json`                                                               | clean (no output)                                                                     |
| `grep -nE "language" src/helpers/openaiRealtimeStreaming.js \| grep -v '^[[:space:]]*//' \| wc -l`    | 4 (destructure + langSuffix + url interpolation + debug log)                          |
| `grep -c "language: options.language" src/helpers/ipcHandlers.js`                                     | 3 (≥3 required; postServerToken @4240 + meeting @4302 + new dictation @5135)          |
| `sed -n '5125,5145p' src/helpers/ipcHandlers.js \| grep -q "language: options.language"`              | match (line-range anchor for dictation connectInner block)                            |
| `grep -c "getBaseLanguageCode(warmupLang)" src/helpers/audioManager.js`                               | 1                                                                                     |
| `grep -c "getBaseLanguageCode(preferredLang)" src/helpers/audioManager.js`                            | 1                                                                                     |
| `grep -cE "mode, language" src/stores/meetingRecordingStore.ts`                                       | 2 (both fallback + happy-path returns)                                                |

## TDD Gate Compliance

✓ RED commit (`6909d5fc`) — `test(...)`: 3 failures expected and observed (language=ru/en suffix + intent preservation). The other 4 tests (no-language paths) passed at RED because the URL never contained `language=` yet.
✓ GREEN commit (`146868cc`) — `feat(...)`: all 10 tests pass.
✓ Sequence intact: RED → GREEN → Task-2 secondary feat. No REFACTOR commit (impl was minimal — 4 effective new statements, no cleanup warranted).

## Deviations from Plan

### Cosmetic — meetingRecordingStore.ts fallback return format

**Found during:** Task 2 verification (`grep -cE "mode, language"` returned 1 instead of 2).
**Issue:** First-pass edit formatted the OpenAI-fallback `return` as a multi-line object literal:
```ts
return {
  provider: "openai-realtime" as const,
  model: "gpt-4o-mini-transcribe",
  mode,
  language,
};
```
The plan's verify gate uses `grep -cE "mode, language"` which only matches inline form. Multi-line was equivalent in behavior but failed the literal-string grep.
**Fix:** Reformatted to one-line `{ provider: ..., model: ..., mode, language }` matching the plan's `<action>` snippet at line 261.
**Files modified:** `src/stores/meetingRecordingStore.ts` (cosmetic — same shape, single line vs. multi-line).
**Commit:** `081493a2` (folded into Task 2).
**Rule:** Rule 3 (auto-fix blocking issue — gate wouldn't pass otherwise; not a behavior change).

No other deviations. No Rule 4 (architectural) escalations needed.

## Upstream parity

Net new Yambr-fork drift: **zero**. All four source-file edits are additive or pure refactors:

| File                                       | Change                                                  | Upstream-PR-ready? |
| ------------------------------------------ | ------------------------------------------------------- | ------------------ |
| `src/helpers/openaiRealtimeStreaming.js`   | +`language` destructure, +URL suffix, +debug-log field  | **Yes**            |
| `src/helpers/ipcHandlers.js` (line ~5135)  | +`language: options.language` in `streaming.connect`    | **Yes** (additive; doesn't touch lockdown ternary) |
| `src/helpers/audioManager.js` (2 sites)    | inline `&& !== "auto"` → `getBaseLanguageCode(...)`     | **Yes** (refactor + en-US fix benefits upstream too) |
| `src/stores/meetingRecordingStore.ts`      | +`language` in 2 returns                                | **Yes**            |

`git diff upstream/main -- src/helpers/openaiRealtimeStreaming.js src/helpers/audioManager.js src/stores/meetingRecordingStore.ts` is minimal (~10 net-changed lines, all additive).

## Server v1.0.9 deployment

**Not verified by this plan.** The plan's prerequisite per Task 3 states: "Confirm xgohagty's server v1.0.9 is deployed (whitelist `['en','ru']`, `?language=` query-param injection live). If not, BLOCK this checkpoint until server ships." Verification gate is delegated to the human at Task 3.

## Open follow-ups (out of scope, flagged in RESEARCH.md)

1. **Lowercase normalization in `getBaseLanguageCode`** — if a user store ever contains `"RU"` instead of `"ru"`, the server whitelist could 4xx. Defensive `.toLowerCase()` recommended as a follow-up quick task.
2. **BYOK direct-OpenAI `session.update.transcription.language` injection** — the `preconfigured=false` path (lines 153-172 of openaiRealtimeStreaming.js) sends its own session.update without language. The Yambr corporate-lockdown build uses `preconfigured=true` exclusively (server-side ephemeral token configures the session, so the `?language=` query param is the only sink), so this gap doesn't affect the fork. The companion upstream PR should extend `transcription: { model: this.model }` to `transcription: { model: this.model, ...(this.language ? { language: this.language } : {}) }` for upstream's direct-OpenAI BYOK case.

## Task 3 — checkpoint:human-verify (NOT executed by executor)

Per execution rules and global memory `live_verification_over_green_tests`, Task 3 (live verification of Russian / en-US / auto dictation + meeting-realtime mic + system streams against the live xgohagty server v1.0.9) is the human-verify checkpoint that must run end-to-end before this plan is marked **complete**. Procedure documented in `260526-ix4-PLAN.md` Task 3 `<how-to-verify>` (6 sub-tests: T1 Russian dictation, T2 en-US whitelist, T3 auto/no-language regression, T4 meeting two-stream, T5 Vitest re-run, T6 `npm run verify:provider-lockdown`).

Status: **incomplete — awaiting live-verify.**

## Self-Check: PASSED

- FOUND: src/helpers/openaiRealtimeStreaming.js (line 37 destructure + line 68-69 langSuffix/url + line 70-73 debug log all present)
- FOUND: src/helpers/ipcHandlers.js (line 5135 `language: options.language`)
- FOUND: src/helpers/audioManager.js (line 2065 + line 2290 use `getBaseLanguageCode`)
- FOUND: src/stores/meetingRecordingStore.ts (both returns include `, language`)
- FOUND: test/helpers/openaiRealtimeStreaming.test.js (new describe block with 7 language tests)
- FOUND: 6909d5fc — `git log --oneline | grep 6909d5fc` matched: RED commit
- FOUND: 146868cc — matched: GREEN commit
- FOUND: 081493a2 — matched: Task 2 commit
