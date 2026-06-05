---
phase: quick-260605-p6l
verified: 2026-06-05T18:30:00Z
status: passed
score: 7/7 must-haves verified
overrides_applied: 0
---

# Phase quick-260605-p6l: Embeddings Capability Re-probe on Auth — Verification Report

**Phase Goal:** Fix the capability-probe-before-auth bug — embeddings were disabled for the whole session because the capability probe ran at startup before the OIDC token landed (fail-closed forever). The fix seeds a stable non-frozen delegating facade and re-probes on auth-set-token, swapping the delegate stub→cloud IN PLACE on the same seeded object vectorIndex captured at module-load.
**Verified:** 2026-06-05T18:30:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Token landing AFTER startup re-probes and turns embeddings ON for the session (no restart) | ✓ VERIFIED | `ipcHandlers.js:3399-3405` fires `reinstall()` after `tokenStore.set`; `embeddingsBootstrap.js:213-267` re-probes when armed, swaps to cloud, runs migration. Test `embeddingsBootstrap.test.js:210-242` (mutate-in-place proof) PASSES. |
| 2 | Re-probe flips the SAME require.cache object vectorIndex captured at module-load (zero re-require, zero vectorIndex.js edit) | ✓ VERIFIED | `install()` creates `_facade` (line 172) and seeds it once via `_seedCache` (line 173); `reinstall()` mutates `_facade._delegate = deps.cloudEmbeddings` (line 242) — it does NOT replace `require.cache[LE_PATH]`. Crux test captures `ref = require(LE_PATH)` BEFORE reinstall, asserts it REJECTS (stub), then RESOLVES to `cloudVec` AFTER — proving the swap reaches the pre-captured ref. **No replace-with-new-object risk: confirmed mutate-in-place.** |
| 3 | getCapabilities reports a `reason` distinguishing transient no-token from authoritative server-false/unauthorized/error | ✓ VERIFIED | `serverCapabilities.js:51` (no-token), `:60` (empty-URL→no-token), `:79` (401→unauthorized, else server-false), `:91` (ok/server-false), `:98` (error). Every non-true path keeps `embeddings:false` (fail-closed via `...FAIL_CLOSED`). 16 tests green incl. 8 reason assertions covering all paths. |
| 4 | reinstall() idempotent + concurrency-safe (migration at most once); authoritative reason → no-op | ✓ VERIFIED | `reinstalling` in-flight guard (line 223-224); `lastReason !== "no-token"` early-return (line 221). Concurrency test (`:260-291`) asserts getCapabilities called once + makeQdrantClient once across two overlapping calls. server-false no-op test (`:244-258`) asserts no re-probe. |
| 5 | Default build (lockdown OFF): install() AND reinstall() strict no-ops | ✓ VERIFIED | `install()` returns before seed/probe when `!deps.lockdownEnabled` (line 162-166); `reinstall()` returns first when `!deps.lockdownEnabled` (line 216). Test `:355-363` asserts no probe, no seed, `require.cache[LE_PATH]` undefined. |
| 6 | 4 upstream embed files diff-clean vs upstream/main | ✓ VERIFIED | `git diff --numstat upstream/main -- vectorIndex.js localEmbeddings.js onnxWorker.js onnxWorkerClient.js` → empty output, exit 0. Zero changes. |
| 7 | auth-set-token existing upstream lines byte-identical; only one additive reinstall() statement | ✓ VERIFIED | Handler diff vs upstream shows ONLY `+` lines (comment + reinstall block); zero `-` lines in handler body. `tokenStore.set(token)` intact; `else` branch `debugLogger.debug("auth-set-token ignored...")` present verbatim in both `upstream/main:ipcHandlers.js` and worktree. |

**Score:** 7/7 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/helpers/serverCapabilities.js` | getCapabilities() with reason discriminator | ✓ VERIFIED | reason on all 5 classifications; fail-closed preserved; never throws |
| `src/helpers/embeddingsBootstrap.js` | Stable non-frozen facade + reinstall() + lastReason + in-flight guard | ✓ VERIFIED | `_makeFacade` non-frozen with swappable `_delegate`; reinstall mutates in place; setQdrantPort threads port; exports reinstall/setQdrantPort |
| `src/helpers/ipcHandlers.js` | auth-set-token fires reinstall() additively | ✓ VERIFIED | Single fire-and-forget `.catch()` insertion after tokenStore.set inside success branch |
| `main.js` | setQdrantPort stashed inside qdrant ready block | ✓ VERIFIED | Line 991, inside `if (qdrantManager.isReady())` block (opens line 971) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| ipcHandlers auth-set-token | embeddingsBootstrap.reinstall() | require().reinstall().catch() | ✓ WIRED | Line 3399-3405, additive, not awaited |
| embeddingsBootstrap facade | vectorIndex captured localEmbeddings ref | `_delegate` swap on same seeded object | ✓ WIRED | Same `_facade` seeded once, mutated in place (lines 172→242); crux test proves reach |
| embeddingsBootstrap.reinstall() | serverCapabilities.getCapabilities() | re-probe gated on lastReason==="no-token" | ✓ WIRED | Line 221 gate, line 229 re-probe |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full test suite | `npx vitest run` | 231/231 passing (22 files) | ✓ PASS |
| Type check | `cd src && tsc --noEmit` | exit 0, clean | ✓ PASS |
| 4 upstream embed files unchanged | `git diff --numstat upstream/main -- <4 files>` | empty, exit 0 | ✓ PASS |
| Handler else-branch byte-identical | grep upstream vs worktree | both contain `auth-set-token ignored` verbatim | ✓ PASS |
| Corp namespace scan | grep yambr/qwen/openrouter/litellm on p6l lines | only 1 pre-existing comment from commit 5d6d8a3a (not p6l) | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Status | Evidence |
|-------------|-------------|--------|----------|
| P6L-01 (reason discriminator) | 260605-p6l-PLAN | ✓ SATISFIED | serverCapabilities reason on all paths + tests |
| P6L-02 (stable facade + reinstall) | 260605-p6l-PLAN | ✓ SATISFIED | mutate-in-place facade + crux test |
| P6L-03 (auth-set-token wiring) | 260605-p6l-PLAN | ✓ SATISFIED | additive reinstall() statement |
| P6L-04 (qdrant port stash) | 260605-p6l-PLAN | ✓ SATISFIED | setQdrantPort in main.js ready block |

### Anti-Patterns Found

None blocking. No TODO/FIXME/XXX in p6l-touched lines. The throw-fast stub is the intended fail-closed FTS5 signal (swapped to real cloud on successful re-probe), not an unfinished placeholder.

### Gaps Summary

No gaps. The whole fix hinges on mutate-in-place reaching vectorIndex's startup-captured reference — this is **confirmed in production code**: `install()` seeds `_facade` into `require.cache[LE_PATH]` ONCE (line 173); `reinstall()` mutates `_facade._delegate` (line 242) on that SAME object. It does NOT call `_seedCache` again, does NOT replace the cache entry with a new object. The crux test (`embeddingsBootstrap.test.js:228-236`) captures the cached ref before reinstall and proves the same ref routes to cloud after — the exact pattern `vectorIndex.js:2` uses. No silent live-failure risk.

All hard constraints hold: 4 upstream embed files diff-clean, auth-set-token additive-only (zero modified/removed upstream lines), 231/231 tests green, tsc clean, no corp namespace literal in p6l code.

---

_Verified: 2026-06-05T18:30:00Z_
_Verifier: Claude (gsd-verifier)_
