---
phase: 260606-p6k-diarization-messageport-transferlist-fix
reviewed: 2026-06-06T18:25:00Z
depth: deep
files_reviewed: 3
files_reviewed_list:
  - src/workers/onnxWorker.js
  - src/helpers/speakerEmbeddings.js
  - src/workers/onnxWorker.transferList.test.js
findings:
  critical: 0
  warning: 0
  info: 1
  total: 1
status: clean
---

# v1.7.22 Pre-Tag Code Review — Diarization MessagePortMain transferList fix

**Reviewed:** 2026-06-06T18:25:00Z
**Depth:** deep (release gate)
**Files Reviewed:** 3
**Status:** clean
**Verdict:** TAG-SAFE

## Summary

Reviewed the full `v1.7.21..HEAD` diff. The change is a surgical fix for the local
diarization crash `Port at index 0 is not a valid port` (onnxWorker.js reply hop).
Electron's `MessagePortMain.postMessage(message, transfer)` accepts ONLY MessagePort
objects in its `transfer` argument — unlike the web `MessageChannel`, it rejects
ArrayBuffers. The worker was transferring the embedding ArrayBuffer in the reply
transferList; the fix structured-clones it instead by passing `transferList: []`.
The symmetric request-side `[samplesBuffer]` transfer (which hits the same
constraint and would have thrown earlier) was also dropped.

The diff is exactly the transferList lines plus a new behavioral regression test.
No incidental edits, no scope creep, no debug artifacts, no corp namespace tokens.
All claimed correctness properties verified against source. The new test passes
(6/6) and is a genuine regression guard, not a grep tautology.

**Verdict: TAG-SAFE. 0 BLOCKER, 0 WARNING, 1 INFO.**

## Focus-area verification

### 1. CORRECTNESS — confirmed

- **Worker reply hop (onnxWorker.js:389-390):** `port.postMessage(reply, transferList)`
  call site is UNCHANGED; only the value of `transferList` changed from
  `[result.embeddingBuffer]` to `[]`. With an empty transfer array, MessagePortMain
  structured-clones the full `reply` object (including `result.embeddingBuffer`) —
  no transfer attempt, so no `Port at index 0` throw. The ArrayBuffer arrives at the
  parent as a clone.
- **Fresh buffers (no neuter/reuse-after-post):**
  - `speakerExtract` (onnxWorker.js:220-221): `const data = new Float32Array(output.data); return { embeddingBuffer: data.buffer }` — a fresh copy of the session output. Not aliased to the ORT session; nothing reuses it after return. Safe.
  - `textEmbed` (onnxWorker.js:337-338): `embedding` is a freshly-allocated `Float32Array(dim)` from `meanPoolAndNormalize`. Fresh buffer. Safe.
  - Because nothing is transferred anymore, no buffer is neutered — even reuse would be safe, but the buffers are fresh regardless.
- **Receiver decode works on both paths:**
  - Speaker: `speakerEmbeddings.js:67-68` — `if (!embeddingBuffer) return null; return new Float32Array(embeddingBuffer)` over the cloned buffer. Works.
  - Text: `localEmbeddings.js:72-73` — `new Float32Array(embeddingBuffer)` over the cloned buffer. Works.

### 2. SCOPE / DIFF — confirmed

- `git diff v1.7.21..HEAD --numstat` on the two source files: `speakerEmbeddings.js`
  = +1/-2, `onnxWorker.js` = +1/-3. Exactly the transferList lines.
- Non-planning source diff touches ONLY: `src/workers/onnxWorker.js`,
  `src/helpers/speakerEmbeddings.js`, `src/workers/onnxWorker.transferList.test.js`.
- **Untouched (verified empty diff):** `src/helpers/onnxWorkerClient.js`,
  `src/helpers/localEmbeddings.js`, `src/helpers/vectorIndex.js`,
  `src/helpers/cloudEmbeddings.js`, `src/helpers/embeddingsBootstrap.js`,
  `src/helpers/serverCapabilities.js`. The cloud bge-m3 path is untouched.
- `main.js` / `preload.js` untouched. No upstream-parity surface beyond the two
  owner-sanctioned minimal worker edits.

### 3. REGRESSION RISK — none found

- Request-side drop (`speakerEmbeddings.js:62-65`): `onnxWorkerClient.request` is
  now called with `transferList = undefined`. In `onnxWorkerClient.js:201` the call
  is `this.port.postMessage({ id, method, payload }, transferList || [])`, so it
  becomes `[]` and `samplesBuffer` is structured-cloned to the worker. The worker
  reads it via `new Float32Array(samplesBuffer)` (onnxWorker.js:202) — works on a
  cloned ArrayBuffer identically to a transferred one. No behavior change beyond
  not crashing.
- This makes `speaker.extract` symmetric with `text.embed` (localEmbeddings.js:72),
  which never passed a transferList — consistency improved, not degraded.
- `text.embed` shares the same `dispatch()` reply path; with `transferList: []` it
  structured-clones `embeddingBuffer` exactly as before the transfer was attempted.
  Verified the only callers of `onnxWorkerClient.request` are
  speaker.load/extract and text.load/embed — none now pass a transferList.

### 4. TEST QUALITY — behavioral, would fail against pre-fix code

- **Test A** reproduces the real MessagePortMain constraint at the port seam: the
  OLD pattern `postMessage(reply, [arrayBuffer])` throws `/Port at index 0 is not a
  valid port/`; the NEW path `postMessage(reply, [])` / `postMessage(reply)` does
  not. Behavioral, not a grep.
- **Test B** drives the REAL `speakerEmbeddings.extractEmbeddingFromSamples` and
  asserts the 3rd request arg (`callArgs[2]`) is `undefined` and the buffer
  round-trips to a `Float32Array`. Against pre-fix code, `speakerEmbeddings.js`
  passed `[samplesBuffer]` as the 3rd arg, so `callArgs[2]` would be that array and
  `toBeUndefined()` would FAIL. Genuine regression guard. The only stub is
  `_ensureLoaded` (the worker-spawn seam) — within the no-mocks rule.
- **Test C** is a structural source assertion. `not.toContain(
  "transferList.push(result.embeddingBuffer)")` FAILS against pre-fix source (that
  exact line existed). The companion `toContain("transferList: []")` is weaker (the
  catch branch already had it pre-fix), but the `not.toContain` assertion is the
  real guard. Acceptable: onnxWorker.js is a CJS utility-process worker guarded by
  `process.parentPort` and cannot be imported under vitest, so a source assertion is
  the correct tool here.
- Confirmed live: `npx vitest run src/workers/onnxWorker.transferList.test.js` →
  6 passed.

### 5. HYGIENE — clean

- No `TODO`/`FIXME`/`XXX`/`HACK`/`console.log`/`debugger` in any of the 3 files.
- No corp namespace tokens (`PROVIDER_LOCKDOWN`, secrets, api keys) introduced.
- No dead code: the deleted `const transferList = []; if (...) push(...)` block is
  fully replaced by the inline `transferList: []`.

## Info

### IN-01: Test C second assertion is weak (non-blocking)

**File:** `src/workers/onnxWorker.transferList.test.js:117-119`
**Issue:** `toContain("transferList: []")` would pass against pre-fix code too, since
the catch branch already returned `transferList: []`. Only the `not.toContain(
"transferList.push(result.embeddingBuffer)")` assertion (line 114) actually guards
the regression.
**Fix (optional, not required for tag):** tighten to assert the success-branch
specifically, e.g. `expect(source).toContain("return { reply: { id, result }, transferList: [] }")`.
The existing `not.toContain` already provides the real guard, so this is cosmetic.

---

_Reviewed: 2026-06-06T18:25:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep (release gate)_
