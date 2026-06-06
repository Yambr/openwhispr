---
phase: quick-260606-p6k
verified: 2026-06-06T18:22:00Z
status: human_needed
score: 6/6 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Packed app, real meeting with 2+ speakers. Confirm 'Speaker embedding extraction skipped' is GONE from the debug log and speaker labels attach across the meeting."
    expected: "Local speaker-embedding extraction completes; cross-meeting speaker labeling produces embeddings; no 'Port at index 0 is not a valid port' crash."
    why_human: "The Electron MessagePortMain transfer constraint is MODELED in vitest (a fake port), not exercised — real Electron utility-process/onnxruntime does not run under vitest. Per the repo's live-verification-over-green-tests rule, drive the real packed app before/after the v1.7.22 release."
---

# Phase quick-260606-p6k: Diarization MessagePort transferList Fix — Verification Report

**Phase Goal:** Fix the local diarization MessagePort crash "Port at index 0 is not a valid port" — Electron `MessagePortMain.postMessage` rejects ArrayBuffer in transferList. Drop the ArrayBuffer from both transferLists (onnxWorker.js dispatch reply + speakerEmbeddings.js request) so the buffer is structured-cloned instead of transferred. Diarization stays local. Minimal owner-sanctioned upstream edit.
**Verified:** 2026-06-06T18:22:00Z
**Status:** human_needed (all automated must-haves VERIFIED; one live verification recommended)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| - | ----- | ------ | -------- |
| 1 | Local diarization no longer crashes with "Port at index 0 is not a valid port" | ✓ VERIFIED | Both offending transferLists removed. `onnxWorker.js:361` dispatch success branch returns `transferList: []` (no `transferList.push(result.embeddingBuffer)`); `speakerEmbeddings.js:62-65` `request("speaker.extract", { samplesBuffer })` with no 3rd-arg transferList. The `port.postMessage(reply, transferList)` site (line 390) unchanged. Crash modeled by Test A (fake MessagePortMain rejects ArrayBuffer transfer; empty/absent transfer does not throw). **Caveat: unit-modeled, not exercised in real Electron — see human verification.** |
| 2 | speaker.extract reply ArrayBuffer is structured-cloned (not transferred) and `new Float32Array(embeddingBuffer)` still works | ✓ VERIFIED | `speakerExtract` (onnxWorker.js:220-221) returns `data.buffer` from a FRESH `new Float32Array(output.data)` — `data` is a local, never reused after return. transferList:[] → structured-clone copy. `speakerEmbeddings.js:68` `return new Float32Array(embeddingBuffer)` consumes the clone. Test B round-trips embeddingBuffer → Float32Array `[1,2,3]`. Copy-vs-transfer is purely perf, not correctness. |
| 3 | text.embed path remains functional after the shared dispatch() reply fix | ✓ VERIFIED | `textEmbed` (onnxWorker.js:337-338) returns `embedding.buffer` from a fresh `meanPoolAndNormalize(...)` Float32Array — local, not reused. `localEmbeddings.js:72-73` `request("text.embed", { text })` (already no transferList) then `new Float32Array(embeddingBuffer)`. Shared dispatch reply now structured-clones for text.embed too; buffer is fresh, so clone is safe. Full suite (237 tests) covers embeddings paths, all green. |
| 4 | git diff upstream/main is EXACTLY the transferList lines in onnxWorker.js + speakerEmbeddings.js and nothing else | ✓ VERIFIED | `git diff upstream/main HEAD -- src/workers/onnxWorker.js src/helpers/speakerEmbeddings.js` is two hunks: removal of `[samplesBuffer]` 3rd arg, and collapse of `const transferList=[]; if(...) push(...)` to inline `transferList: []`. No other added/removed lines. |
| 5 | onnxWorkerClient.js, localEmbeddings.js, vectorIndex.js stay byte-identical to upstream/main | ✓ VERIFIED | `git diff upstream/main HEAD -- src/helpers/onnxWorkerClient.js src/helpers/localEmbeddings.js src/helpers/vectorIndex.js` is EMPTY. |
| 6 | vitest + tsc pass | ✓ VERIFIED | Full `npx vitest run`: **237 passed (23 files), 0 failed** (after `node scripts/generate-build-config.js`). `cd src && tsc --noEmit`: exit 0, clean. Targeted test: 6/6 passed. |

**Score:** 6/6 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `src/workers/onnxWorker.js` | dispatch reply no ArrayBuffer in transferList | ✓ VERIFIED | Line 361: `return { reply: { id, result }, transferList: [] }`. No `transferList.push`. Wired: postMessage at 390 consumes it. |
| `src/helpers/speakerEmbeddings.js` | speaker.extract without `[samplesBuffer]` 3rd arg | ✓ VERIFIED | Lines 62-65: `request("speaker.extract", { samplesBuffer })`, no transferList. |
| `src/workers/onnxWorker.transferList.test.js` | regression test, behavioral, RED against pre-fix | ✓ VERIFIED | 121 lines, 6 tests (A/B/C). NOT a tautology — see below. |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| speakerEmbeddings.js | onnxWorkerClient.request | speaker.extract call w/o transferList | ✓ WIRED | `request("speaker.extract", { samplesBuffer })`, callArgs[2] undefined → `onnxWorkerClient.js:201 transferList \|\| []` → `[]`. |
| onnxWorker.js | port.postMessage | reply w/o ArrayBuffer in transferList | ✓ WIRED | dispatch returns `transferList: []`; `port.postMessage(reply, transferList)` at line 390. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| speakerExtract reply | embeddingBuffer | `new Float32Array(output.data).buffer` from `speakerSession.run` | ✓ Yes (fresh per-call buffer) | ✓ FLOWING |
| textEmbed reply | embeddingBuffer | `meanPoolAndNormalize(output.data...).buffer` from `textSession.run` | ✓ Yes (fresh per-call buffer) | ✓ FLOWING |

**Correctness check (critical):** Both `speakerExtract` and `textEmbed` return a FRESH Float32Array's `.buffer`, created locally and never reused after return. Nothing in the worker relies on the buffer being transferred/neutered. Therefore structured-clone (transferList:[]) delivers a usable, correct buffer to the parent on BOTH paths; `new Float32Array(embeddingBuffer)` succeeds at speakerEmbeddings.js:68 and localEmbeddings.js:73. Copy-vs-transfer is purely a perf trade (buffers are a few KB), not a correctness change. ✓ PASS.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Test is RED against pre-fix code (not a grep tautology) | Inspected `upstream/main` versions | pre-fix has `[samplesBuffer]` (se.js:65) and `transferList.push(result.embeddingBuffer)` (ow.js:362) → Test B `callArgs[2] === undefined` FAILS, Test C `not.toContain("transferList.push...")` FAILS pre-fix | ✓ PASS |
| Targeted test green post-fix | `npx vitest run ...transferList.test.js` | 6 passed | ✓ PASS |
| Full suite | `npx vitest run` | 237 passed, 0 failed | ✓ PASS |
| Typecheck | `cd src && tsc --noEmit` | exit 0, clean | ✓ PASS |
| Live diarization (real Electron) | n/a | MessagePortMain modeled in vitest, real utility-process not run | ? SKIP → human verification |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| DIAR-FIX-01 | PLAN | Fix local diarization MessagePort transferList crash | ✓ SATISFIED | Both transferLists drop the ArrayBuffer; tight diff; full suite green. Live confirmation pending (human). |

### Anti-Patterns Found

None. No TBD/FIXME/XXX/TODO debt markers in the modified source files (the SUMMARY's upstream-PR "TODO" is a documentation action item, not a code marker). No corp namespace token introduced — the `grep corp` hits in src/ are the word "corporate" in pre-existing comments and `src/dist/` build artifacts, unrelated to this task's 3-file changeset.

### Cross-Check Confirmations

- **This task's commits** (`6bb4aa90` test, `1557fb4f` fix) touched exactly 3 files: onnxWorker.transferList.test.js, onnxWorker.js, speakerEmbeddings.js. ✓
- **Cloud bge-m3 files** (cloudEmbeddings.js / embeddingsBootstrap.js / serverCapabilities.js) are NOT in this task's commits — they appear under `git log upstream/main..HEAD` only because of pre-existing Yambr-fork commits (prefixes p6l/tsa/wt4), not p6k. ✓
- **onnxWorkerClient.js / localEmbeddings.js / vectorIndex.js** byte-identical to upstream/main. ✓

### Human Verification Required

**1. Live diarization in packed app**

- **Test:** Build/run the packed app, hold a real meeting with 2+ speakers, enable debug logging.
- **Expected:** "Speaker embedding extraction skipped" is GONE from the debug log; no "Port at index 0 is not a valid port"; speaker labels attach across the meeting (cross-meeting speaker labeling produces embeddings).
- **Why human:** The Electron `MessagePortMain` transfer constraint is MODELED with a fake port in vitest; the real Electron utility-process + onnxruntime path does not run under vitest. Per the repo's live-verification-over-green-tests rule (five v1.7.x blockers passed green but failed live), drive the real app before/after the **v1.7.22** release.

### Gaps Summary

No automated gaps. All 6 must-haves VERIFIED, diff is exactly the two sanctioned transferList hunks, three upstream files stay byte-identical, no cloud-embeddings file touched, full suite + tsc green, and the regression test is genuinely behavioral (proven RED against pre-fix upstream code, not a grep tautology). The correctness check confirms structured-clone delivers a usable buffer on both speaker and text paths because each handler returns a fresh, non-reused Float32Array buffer.

Status is **human_needed** solely because the MessagePortMain crash is unit-modeled, not exercised in real Electron — a single live verification on the packed app is recommended before shipping v1.7.22, consistent with the repo's live-verification rule.

---

_Verified: 2026-06-06T18:22:00Z_
_Verifier: Claude (gsd-verifier)_
