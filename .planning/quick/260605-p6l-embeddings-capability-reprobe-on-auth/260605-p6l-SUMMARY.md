---
phase: quick-260605-p6l
plan: 01
subsystem: embeddings / capability-probe
tags: [embeddings, lockdown, capabilities, auth, vectorIndex, qdrant]
requires:
  - "src/helpers/serverCapabilities.js getCapabilities()"
  - "src/helpers/embeddingsBootstrap.js install()/runDimMigration()"
  - "src/helpers/cloudEmbeddings.js CloudEmbeddings facade"
  - "upstream vectorIndex.js module-load capture seam"
provides:
  - "getCapabilities() reason discriminator (no-token|unauthorized|server-false|error|ok)"
  - "embeddingsBootstrap stable delegating facade with mutate-in-place _delegate swap"
  - "embeddingsBootstrap.reinstall() — post-login capability re-probe"
  - "embeddingsBootstrap.setQdrantPort() — port stash for post-login dim migration"
affects:
  - "auth-set-token IPC fires reinstall() fire-and-forget"
  - "main.js startup stashes qdrant port"
tech-stack:
  added: []
  patterns:
    - "Mutate-in-place delegate swap on a stable seeded require.cache object so an upstream module-load capture flips transparently"
    - "reason-discriminated fail-closed (transient no-token vs authoritative) to bound re-probes"
key-files:
  created: []
  modified:
    - src/helpers/serverCapabilities.js
    - test/helpers/serverCapabilities.test.js
    - src/helpers/embeddingsBootstrap.js
    - test/helpers/embeddingsBootstrap.test.js
    - src/helpers/ipcHandlers.js
    - main.js
decisions:
  - "A throwing getCapabilities() in install()/reinstall() is treated as authoritative reason 'error' (no retry) since getCapabilities is documented never to throw — a throw is unexpected, not transient."
  - "Empty-backend-URL classified reason 'no-token' (transient) so the post-login re-probe still fires under runtime onboarding when URL+token land together."
metrics:
  duration: ~20m
  completed: 2026-06-05
---

# Phase quick-260605-p6l Plan 01: Embeddings Capability Re-probe on Auth Summary

Fixed the capability-probe-before-auth bug: a lockdown build that fail-closed its `/api/capabilities` probe at startup (token not yet present) now re-probes when the OIDC token lands via `auth-set-token` and, if embeddings is now true, flips the already-seeded `localEmbeddings` facade stub→cloud **in place** — so `vectorIndex`'s startup-captured reference transparently starts hitting the cloud for the rest of the session. No restart, no re-require, zero edit to any upstream file.

## What shipped

1. **`serverCapabilities.getCapabilities()` reason discriminator** — every return path now carries a `reason`: `no-token` (no token OR empty backend URL — transient, arms the post-login retry), `unauthorized` (401), `server-false` (non-401 non-ok, OR ok-with-embeddings-false), `error` (network/bad-json), `ok` (clean true probe). Booleans unchanged, still fail-closed on every non-true path, still never throws.

2. **`embeddingsBootstrap` stable delegating facade + `reinstall()`** — `install()` now seeds ONE stable, non-frozen facade whose internal `_delegate` starts as the frozen throw-fast stub. `reinstall()` re-probes **only when `lastReason === "no-token"`**, swaps `_delegate` to `CloudEmbeddings` on the SAME facade object (the object `vectorIndex.js:2` captured at module-load), runs the qdrant dim migration once via the stashed port, is idempotent + concurrency-guarded (in-flight `reinstalling` flag), and never throws. No-op on authoritative reasons, before `install()`, once already cloud, and on the default (non-lockdown) build. The facade keeps a stable `LocalEmbeddings.noteEmbedText` so `vectorIndex.js:3`'s destructure survives the swap.

3. **Wiring (additive only)** — `auth-set-token` fires `require("./embeddingsBootstrap").reinstall().catch(debug)` as a single fork-only statement after the upstream `tokenStore.set(token)`, inside the success branch, fire-and-forget (not awaited). `main.js` stashes the live qdrant port via `setQdrantPort()` inside the ready block so the post-login migration can re-derive it.

## The crux (proven by test)

`vectorIndex.js:2` does `const localEmbeddings = require("./localEmbeddings")` — capturing the object once — and calls `localEmbeddings.embedText(...)` on that captured object per-call. Re-seeding `require.cache` with a NEW object would NOT reach it. The fix mutates `_facade._delegate` in place. The Task-2 test captures the facade ref BEFORE `reinstall()` (mirroring `vectorIndex`), asserts `embedText` rejects `EMBEDDINGS_UNAVAILABLE`, runs `reinstall()` with a now-true re-probe, then asserts the SAME captured ref resolves the cloud vector — proving the flip reaches `vectorIndex` transparently.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Generated build-config missing in fresh worktree**
- **Found during:** Task 2 (RED run)
- **Issue:** `src/config/build-config.generated.cjs` was absent in the fresh worktree, so pre-existing `embeddingsBootstrap.migrateCollectionDim` tests (which call `_resolveDeps()` without `_setTestDeps`) hit `MODULE_NOT_FOUND`. Not caused by my changes — these tests pass in a normal dev tree where `predev`/`pretest` generate the config.
- **Fix:** Ran `node scripts/generate-build-config.js` (the canonical generator). The file is gitignored (a generated artifact), so nothing was committed.
- **Files modified:** none committed (generated artifact only)
- **Commit:** n/a

### Plan-gate note (not a deviation)

Task 3's verify command included a whole-file `git diff upstream/main -- src/helpers/ipcHandlers.js | ... grep '^-'` check intended to assert "no upstream handler line removed." That check yields a **false positive** here because `ipcHandlers.js` already carries substantial pre-existing fork drift elsewhere in its ~3400 lines (e.g. 260604-tsa work), so the whole-file diff naturally shows removed-vs-upstream lines unrelated to the `auth-set-token` handler. The gate's actual intent — the `auth-set-token` handler's upstream lines stay byte-identical and my change is purely additive — was verified directly instead:
- `git diff HEAD~ -- ipcHandlers.js` on the handler shows ZERO `-` lines; only my added `reinstall()` statement + comment.
- The upstream `tokenStore.set(token)`, the `else` branch, `debugLogger.debug("auth-set-token ignored: empty or non-string token", {`, and `type: typeof token,` lines are all present verbatim (matched byte-for-byte against `git show upstream/main:src/helpers/ipcHandlers.js`).

## Gate results

- `npx vitest run` — **231/231 passing** (16 serverCapabilities incl. 8 new reason assertions; 25 embeddingsBootstrap incl. 11 new facade/reinstall tests, incl. the mutate-in-place crux proof).
- `npm run typecheck` (`cd src && tsc --noEmit`) — **clean** (no errors).
- `git diff --quiet upstream/main -- vectorIndex.js localEmbeddings.js onnxWorker.js onnxWorkerClient.js` — **exit 0** (4 upstream embed files diff-clean).
- `auth-set-token` handler upstream lines — **byte-identical**; only one additive fork statement.
- corp namespace/model literal scan on all p6l-touched/added lines — **none found** (generic only).
- No user-facing strings added (main-process logic; debug logs only) → no locale changes needed.

## Commits

- `ac4db5c6` feat(260605-p6l): add reason discriminator to getCapabilities
- `04b13626` feat(260605-p6l): stable delegating facade + reinstall() post-login re-probe
- `d11dce9f` feat(260605-p6l): wire reinstall() into auth-set-token + stash qdrant port

## Known Stubs

None. The throw-fast stub is the intended fail-closed delegate (FTS5 fallback), not an unfinished placeholder; it is swapped to the real `CloudEmbeddings` on a successful re-probe.

## Threat Flags

None. No new network endpoint, auth path, or schema surface beyond the existing 260604-tsa `/api/capabilities` boundary; the re-probe reuses it with the same Bearer + `useSessionCookies:false` semantics.

## Self-Check: PASSED

All 6 modified files present; all 3 task commits (ac4db5c6, 04b13626, d11dce9f) found in git history.
