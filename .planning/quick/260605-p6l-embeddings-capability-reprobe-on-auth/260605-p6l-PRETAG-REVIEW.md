---
task: 260605-p6l-embeddings-capability-reprobe-on-auth
reviewed: 2026-06-05T18:38:00Z
depth: thorough (release gate)
diff_base: v1.7.20..HEAD
files_reviewed: 4
files_reviewed_list:
  - src/helpers/serverCapabilities.js
  - src/helpers/embeddingsBootstrap.js
  - src/helpers/ipcHandlers.js
  - main.js
findings:
  blocker: 0
  high: 0
  medium: 0
  low: 1
  total: 1
verdict: TAG-SAFE
status: clean
---

# v1.7.21 Pre-Tag Review — Embeddings Capability Re-Probe on Auth (260605-p6l)

**Verdict: TAG-SAFE**
**Findings: 0 BLOCKER / 0 HIGH / 0 MEDIUM / 1 LOW**
**Tests: 41/41 (changed files), 231/231 (full suite) GREEN**

## Summary

Reviewed the v1.7.20..HEAD diff that fixes the corp-lockdown "embeddings disabled
all session" bug: the capability probe ran at startup before the OIDC token landed
(no-token → fail-closed forever). The fix seeds a stable delegating facade at
module-load and, on the post-login `auth-set-token`, re-probes capabilities and
swaps the facade's `_delegate` stub→cloud IN PLACE so the reference
`vectorIndex.js:2` captured at module-load transparently starts hitting cloud.

I scrutinized all 7 focus areas with the highest weight on the mutate-in-place
crux (the "passes tests, fails live" risk class). The implementation is correct
on every axis. The one LOW finding is a defensive-robustness note, not a defect.

---

## Focus-Area Verdicts

### 1. Mutate-in-place correctness (CRUX) — CORRECT

- `vectorIndex.js:2` does `const localEmbeddings = require("./localEmbeddings")`
  ONCE and calls `localEmbeddings.embedText(...)` per-call (lines 36/57/78/117/
  149/185) on THAT captured object. Verified by reading vectorIndex.js directly.
- `install()` (embeddingsBootstrap.js:172-173) seeds ONE facade
  (`_facade = _makeFacade(_makeStub())`) into `require.cache[localEmbeddingsPath]`
  via `_seedCache`. This is the object vectorIndex captures.
- `reinstall()` (lines 240-242) does `_facade._delegate = deps.cloudEmbeddings`.
  It mutates `_delegate` ON THE SAME `_facade` object. It does NOT call
  `_seedCache` again and does NOT reassign `require.cache[...]` to a new object —
  confirmed by reading the full reinstall body. The captured ref therefore flips.
- The facade (`_makeFacade`) is NOT frozen (the swap must succeed); only the inner
  stub (`_makeStub`) is `Object.freeze`d. Correct: the swap target is mutable, the
  swapped-out delegate is immutable. Verified at lines 108 (stub frozen) vs 118-142
  (facade returned bare, not frozen).
- `LocalEmbeddings.noteEmbedText` lives ON the facade itself (lines 136-140), so
  `vectorIndex.js:3`'s `const { LocalEmbeddings } = localEmbeddings` destructure
  keeps working across the swap. Test "facade keeps a stable LocalEmbeddings…"
  asserts this.
- The crux test ("upgrades stub->cloud on the SAME object…") captures `ref` BEFORE
  reinstall (mirroring vectorIndex), asserts it rejects pre-swap and resolves to
  the cloud vector post-swap. This is the exact live-failure guard and it is GREEN.

### 2. Fail-closed integrity — CORRECT

`serverCapabilities.getCapabilities` returns `embeddings:false` on EVERY non-true
path; `embeddings` can only be `true` at line 85 (`features.embeddings === true`):
- no token → line 51 `{...FAIL_CLOSED, reason:"no-token"}`
- no backend URL → line 60 `{...FAIL_CLOSED, reason:"no-token"}`
- `!res || !res.ok` (incl. 401, 500) → line 77 `{...FAIL_CLOSED, reason: 401?…}`
- server-false → line 91 `embeddings:false, reason:"server-false"`
- catch (network / bad JSON) → line 98 `{...FAIL_CLOSED, reason:"error"}`

No added `reason` branch can yield `embeddings:true` or throw — every branch
spreads `FAIL_CLOSED` or computes `=== true`. The function never throws (the only
awaits are inside the try). Token is never logged: only `{ status }` and
`{ error: err.message }` are passed to `debug`. The `embeddingsBootstrap.install`/
`reinstall` catch blocks also fail closed (`embeddingsEnabled=false; reason="error"`).
All 9 reason-discriminator tests in serverCapabilities.test.js are GREEN.

### 3. No retry storm — CORRECT

`reinstall()` arms ONLY on `lastReason === "no-token"` (line 221 early-returns
otherwise). `unauthorized`/`server-false`/`error` are authoritative no-ops — a
server that genuinely says false is never re-probed on a token refresh. Verified
by test "no-op when prior reason was authoritative 'server-false'" (getCapabilities
called exactly once across install+reinstall). Idempotency: `if (!installed ||
seeded) return` (line 218) stops re-probing once on cloud. Concurrency: `if
(reinstalling) return` (line 223) coalesces overlapping `auth-set-token` bursts;
test "concurrency-safe: two overlapping reinstall()…" proves the re-probe and dim
migration each run at most once.

### 4. auth-set-token additive-only — CORRECT

Diffed against `upstream/main:src/helpers/ipcHandlers.js`. The handler body
(`tokenStore.set(token)` success branch + the empty/non-string else-debug) is
byte-identical to upstream. The ONLY fork addition is the single fire-and-forget
`require("./embeddingsBootstrap").reinstall().catch(...)` statement placed AFTER
`tokenStore.set(token)` inside the success branch. It is NOT awaited and is
`.catch`'d, so it cannot block or reject the IPC handler. Correct.

### 5. Default-build parity — CORRECT

- `install()`: line 162 `if (!deps.lockdownEnabled) return;` AFTER setting
  `installed=true` but BEFORE seeding `_facade` or fetching capabilities. Strict
  no-op: cache untouched, no probe. Test "build gate OFF … strict no-op" GREEN.
- `reinstall()`: line 216 `if (!deps.lockdownEnabled) return;` is the FIRST check,
  before `installed`/`seeded`/`lastReason`/`reinstalling`. So even though
  `install()` set `installed=true` on the default build, reinstall short-circuits
  before any work. Test "reinstall() (build gate OFF) is a strict no-op" GREEN
  (require.cache[LE_PATH] stays undefined, getCapabilities never called).

### 6. Port threading — CORRECT

- `main.js:991` calls `setQdrantPort(qdrantManager.getPort())` INSIDE the resolved
  `start().then()` block, guarded by `qdrantManager.isReady()` — so the port is
  stashed only when qdrant is actually live and ready.
- `reinstall()` migrates only `if (_qdrantPort != null)` (line 246); otherwise it
  swaps the delegate and logs "skipping dim migration … port unknown" (line 250)
  with NO crash. Test "reinstall() swaps the delegate but SKIPS migration when no
  qdrant port was stashed" GREEN.
- Race: `auth-set-token` fires from `src/lib/auth.ts:53` (renderer onChange), which
  runs well after `await embeddingsBootstrap.install()` (main.js:962) and after the
  qdrant `start().then()` block during `startApp()`. If reinstall somehow fired
  before the port was stashed, the `!= null` guard degrades gracefully (delegate
  swaps, migration skipped — next upsert re-embeds). No crash path exists.

### 7. Hygiene — CLEAN

`grep` for `console.log` / `TODO` / `FIXME` / `XXX` / `HACK` / corp model+namespace
tokens (`qwen`/`litellm`/`openrouter`/`namespace`) across the three new/changed
helpers returned nothing. No dead code: every exported symbol is wired (install/
reinstall/setQdrantPort/runDimMigration in main.js; reinstall in ipcHandlers;
migrate/ensure helpers used internally + test-asserted). The client never hardcodes
a model name — `cloudEmbeddings._request` sends `{ input }` with model omitted so
the server picks from operator env.

---

## Findings

### LOW-01: Unreachable `embeddingsEnabled && _facade` branch could silently no-op if invariant ever broke

**File:** `src/helpers/embeddingsBootstrap.js:240`
**Issue:** `reinstall()` upgrades to cloud only under `if (embeddingsEnabled &&
_facade)`. The `&& _facade` is defensive: in practice `_facade` is non-null
whenever `lastReason === "no-token"` (the only state that reaches the re-probe),
because `lastReason` is set to `"no-token"` only AFTER `install()` seeds `_facade`
at line 172. So the guard is currently always satisfied when it matters. However,
if a future refactor ever set `lastReason="no-token"` without seeding `_facade`,
this code would silently fall to the `else` (line 252) — `seeded=false`, no cloud
routing, no error — i.e. a silent no-op rather than a loud failure. Not a defect
today (the invariant holds and is test-covered), purely a robustness note.
**Fix (optional, post-tag):** keep `_facade` set; if defensiveness is desired,
log when `embeddingsEnabled && !_facade` rather than silently falling through:
```js
if (embeddingsEnabled) {
  if (!_facade) {
    deps.debug("embeddings: re-probe true but no seeded facade — invariant broken");
  } else {
    _facade._delegate = deps.cloudEmbeddings;
    // …existing migration…
  }
}
```
This does not block the tag.

---

## Release Gate Decision

**TAG-SAFE.** The mutate-in-place crux — the exact silent-live-failure class that a
prior release's pre-tag review caught — is implemented correctly (same-object
delegate swap, non-frozen facade, reference captured by vectorIndex flips) and is
guarded by a test that captures the ref before the swap. Fail-closed integrity,
no-retry-storm, additive-only IPC, default-build parity, and graceful port
threading all verified by reading + cross-referencing the real call sites
(vectorIndex.js, cloudEmbeddings.js, main.js, upstream ipcHandlers.js). Full suite
231/231 green. Only one LOW robustness note, no defect.

---

_Reviewed: 2026-06-05T18:38:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: thorough (release gate)_
