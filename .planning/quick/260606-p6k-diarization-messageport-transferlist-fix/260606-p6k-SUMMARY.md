---
phase: quick-260606-p6k
plan: 01
subsystem: local-diarization
tags: [electron, messageport, transferlist, onnx, speaker-embeddings, diarization, upstream-platform-bug]
requires:
  - upstream/main onnxWorker.js + speakerEmbeddings.js (Gabriel Stein, #693)
provides:
  - "Local speaker-embedding extraction that does not crash on MessagePortMain transfer"
affects:
  - src/workers/onnxWorker.js
  - src/helpers/speakerEmbeddings.js
tech-stack:
  added: []
  patterns:
    - "Electron MessagePortMain.postMessage transfer accepts ONLY MessagePort (not ArrayBuffer) — structured-clone the buffer instead of transferring it"
key-files:
  created:
    - src/workers/onnxWorker.transferList.test.js
  modified:
    - src/workers/onnxWorker.js
    - src/helpers/speakerEmbeddings.js
decisions:
  - "Drop the ArrayBuffer from BOTH Electron transferLists (structured-clone instead of transfer) — the tightest, most upstream-convergent fix"
  - "Leave onnxWorkerClient.js untouched: transferList || [] already turns undefined into [] (one fewer upstream file diverged)"
  - "Test C asserts on onnxWorker.js SOURCE (CJS worker, no exports, can't run under vitest); Test A models the port constraint at the seam"
metrics:
  duration: ~12m
  completed: 2026-06-06
requirements: [DIAR-FIX-01]
---

# Phase quick-260606-p6k Plan 01: Diarization MessagePortMain transferList Fix Summary

Fixed the local diarization crash "Port at index 0 is not a valid port" by dropping the ArrayBuffers from both Electron `MessagePortMain` transferLists (worker reply + samples request) so they are structured-cloned instead of transferred. Two-line upstream-convergent fix plus a regression test that models the real `MessagePortMain` transfer constraint. Restores local cross-meeting speaker labeling. Ships as v1.7.22.

## What Changed

- **`src/workers/onnxWorker.js`** — `dispatch()` success branch now returns `transferList: []` (was building a list and pushing `result.embeddingBuffer`). The `port.postMessage(reply, transferList)` call site at line ~390 is unchanged; the worker simply never transfers the ArrayBuffer, so the parent gets a structured-clone copy. This reply path is shared by `speaker.extract` and `text.embed` (incidental, fine — both are small buffers).
- **`src/helpers/speakerEmbeddings.js`** — dropped the `[samplesBuffer]` 3rd arg from `onnxWorkerClient.request("speaker.extract", { samplesBuffer })`, symmetric with `localEmbeddings.js:72`'s `text.embed` call. `onnxWorkerClient.js:201` resolves `transferList || []`, so `undefined` becomes `[]`. `new Float32Array(embeddingBuffer)` still works on the cloned buffer.
- **`src/workers/onnxWorker.transferList.test.js`** (new) — 6 tests (A/B/C) per the plan.

## Root Cause

Electron `MessagePortMain.postMessage(message, transfer)` accepts ONLY `MessagePort` objects in `transfer` — unlike the web `MessageChannel`, it rejects `ArrayBuffer`s with "Port at index 0 is not a valid port". The onnx utility worker pushed the embedding `ArrayBuffer` into the reply transferList and `speakerEmbeddings.js` pushed the samples `ArrayBuffer` into the request transferList. Both hops threw. The speaker-embedding step crashed and was swallowed at `ipcHandlers.js:8004` ("Speaker embedding extraction skipped"), so cross-meeting speaker labeling silently produced nothing.

## Tasks

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 (RED) | Failing regression test modeling MessagePortMain transfer constraint | `6bb4aa90` | src/workers/onnxWorker.transferList.test.js |
| 2 (GREEN) | Drop ArrayBuffers from both Electron transferLists | `1557fb4f` | src/workers/onnxWorker.js, src/helpers/speakerEmbeddings.js |
| 3 (GATE) | Full suite + tsc + tight-diff verification | (no commit — verification only) | — |

## TDD Cycle

- **RED** (`6bb4aa90`): Test A (3 tests, port-constraint model) passed; Test B (speaker.extract called without 3rd arg) and Test C ("no `transferList.push(result.embeddingBuffer)`") FAILED against unmodified code. RED state confirmed exactly as planned.
- **GREEN** (`1557fb4f`): all 6 tests pass.

## Verification Results

- **Targeted vitest** (`src/workers/onnxWorker.transferList.test.js`): 6 passed.
- **Full vitest**: 237 passed (23 files), 0 failed.
  - NOTE: the first full run reported 45 failures in unrelated subsystems (authClientProxy, host-coldstart, etc.). Root cause: this is a fresh worktree that had never been built, so `src/config/build-config.generated.{ts,cjs}` did not exist. Running `node scripts/generate-build-config.js` (the standard `predev`/`prebuild` step) regenerated it, after which all 237 tests pass. This is an environmental build-state gap, not a regression from this change — those files are gitignored and were not committed.
- **tsc** (`cd src && tsc --noEmit`): clean (no errors) after build-config generation.

### Tight diff — `git diff upstream/main HEAD` for the two sanctioned files

```diff
diff --git a/src/helpers/speakerEmbeddings.js b/src/helpers/speakerEmbeddings.js
index 16ba39c3..cc9b030d 100644
--- a/src/helpers/speakerEmbeddings.js
+++ b/src/helpers/speakerEmbeddings.js
@@ -61,8 +61,7 @@ class SpeakerEmbeddings {

     const { embeddingBuffer } = await onnxWorkerClient.request(
       "speaker.extract",
-      { samplesBuffer },
-      [samplesBuffer]
+      { samplesBuffer }
     );

     if (!embeddingBuffer) return null;
diff --git a/src/workers/onnxWorker.js b/src/workers/onnxWorker.js
index 3c56feaf..85968dff 100644
--- a/src/workers/onnxWorker.js
+++ b/src/workers/onnxWorker.js
@@ -358,9 +358,7 @@ async function dispatch({ id, method, payload }) {
   }
   try {
     const result = await handler(payload || {});
-    const transferList = [];
-    if (result?.embeddingBuffer) transferList.push(result.embeddingBuffer);
-    return { reply: { id, result }, transferList };
+    return { reply: { id, result }, transferList: [] };
   } catch (err) {
     log("error", "handler threw", { method, error: err?.message, stack: err?.stack });
     return { reply: { id, error: { message: err?.message || String(err) } }, transferList: [] };
```

The diff is EXACTLY the transferList lines and nothing else.

### Diff-clean gate — untouched upstream files

`git diff upstream/main HEAD -- src/helpers/onnxWorkerClient.js src/helpers/localEmbeddings.js src/helpers/vectorIndex.js` is **EMPTY** — these stay byte-identical to upstream/main.

### Cloud-embeddings gate

My commits (`610b9cf..HEAD`) changed exactly three files:
`src/helpers/speakerEmbeddings.js`, `src/workers/onnxWorker.js`, `src/workers/onnxWorker.transferList.test.js`.
None of `cloudEmbeddings.js`, `embeddingsBootstrap.js`, `serverCapabilities.js` was touched. (Those files appear in `git diff --name-only upstream/main HEAD` only because they are pre-existing Yambr-fork files — the upstream-vs-fork diff spans the whole fork, not this plan's changeset.)

## Deviations from Plan

None — plan executed exactly as written. Tasks 1-2 committed; Task 3 is a verification gate with no code, so no commit. One environmental note: the missing generated build-config had to be regenerated (standard predev step) for the full suite + tsc to pass; no source change resulted.

## Upstream PR / Issue Note (REQUIRED — to file)

This is a genuine **upstream platform bug**, not Yambr-fork drift. Electron `MessagePortMain.postMessage(message, transfer)` transfer semantics differ from the web `MessageChannel`: `MessagePortMain` accepts ONLY `MessagePort` objects in the transfer list and throws "Port at index 0 is not a valid port" on an `ArrayBuffer`. The offending code is upstream OpenWhispr (`src/workers/onnxWorker.js` + `src/helpers/speakerEmbeddings.js`, authored by Gabriel Stein in upstream PR `#693` "fix(onnx): cap embedding segments and isolate inference in utility process") and is **still unfixed on `upstream/main` as of 2026-06-06** (both files were byte-identical to `upstream/main` before this change).

The edit to these two upstream files was **owner-sanctioned for this specific platform bug** (locked decision in the plan): touch ONLY the transferList lines so the diff matches what a future upstream fix would plausibly land.

**TODO — file upstream so the fork's divergence converges back:**
- Repo: `OpenWhispr/openwhispr` (https://github.com/OpenWhispr/openwhispr)
- Title (suggested): `fix(onnx): don't put ArrayBuffer in MessagePortMain transferList (crashes speaker-embedding extraction)`
- Body: Electron `MessagePortMain` transfer accepts only `MessagePort`, not `ArrayBuffer` (unlike web `MessageChannel`), so the onnx utility worker reply (`onnxWorker.js` dispatch pushing `result.embeddingBuffer`) and the `speaker.extract` request (`speakerEmbeddings.js` passing `[samplesBuffer]`) both throw "Port at index 0 is not a valid port". The crash is swallowed at `ipcHandlers.js` ("Speaker embedding extraction skipped"), so local cross-meeting speaker labeling silently produces nothing. Fix: structured-clone the buffers instead of transferring — `dispatch()` returns `transferList: []`; `speakerEmbeddings.js` drops the `[samplesBuffer]` 3rd arg.
- Patch: the exact two-hunk diff shown above.

(Filing against the third-party upstream repo is left for the owner to action with the appropriate account; the issue/PR link should be pasted here once filed.)

## Self-Check: PASSED

- `src/workers/onnxWorker.transferList.test.js` — FOUND
- `src/workers/onnxWorker.js` — FOUND (modified)
- `src/helpers/speakerEmbeddings.js` — FOUND (modified)
- Commit `6bb4aa90` — FOUND
- Commit `1557fb4f` — FOUND
