# Plan 01-07: Full Green Verification + Live CDP Drive (Wave 6)

**Goal:** All Phase 1 acceptance gates exit green. Drive the packed app via CDP per `[[cdp_renderer_debug]]` to confirm runtime URL override works end-to-end on a real binary, not just in vitest.

**Wave:** 6
**Requirements:** verifies all of Phase 1 (HOST-01, HOST-02, HOST-03)
**Depends on:** 01-01..01-06 all landed
**Files modified:**
- `.planning/phases/01-backend-url-sot-consolidation-dynamic-better-auth/01-VERIFICATION.md` (NEW — verifier-style report)
- `.planning/phases/01-backend-url-sot-consolidation-dynamic-better-auth/01-SUMMARY.md` (NEW)

## Tasks

1. **Run every automated gate, capture output:**

   ```bash
   # Source-grep gate (verify-backend-url-sot.js authored in 01-01):
   npm run verify:backend-url-sot 2>&1 | tee /tmp/01-verify-sot.log

   # Existing gates that MUST still be green (regression check):
   npm run verify:provider-lockdown 2>&1 | tee /tmp/01-verify-lockdown.log
   npm run verify:oauth-gating 2>&1 | tee /tmp/01-verify-oauth.log
   npm run test:build-config 2>&1 | tee /tmp/01-test-build-config.log

   # Vitest full suite:
   npx vitest run 2>&1 | tee /tmp/01-vitest.log

   # TypeScript compile:
   (cd src && npx tsc --noEmit) 2>&1 | tee /tmp/01-tsc.log

   # E2E suite (requires slim-core server running per Phase 9 README):
   cd ../openwhispr-server && docker compose up -d
   sleep 10
   cd ../openwhispr
   npm run test:e2e 2>&1 | tee /tmp/01-e2e.log
   ```

   Expected exit codes:
   - `verify:backend-url-sot`: 0
   - `verify:provider-lockdown`: 0
   - `verify:oauth-gating`: 0
   - `test:build-config`: 0 (15/15 still pass; may be 16/16 if you added a SHARE_VIEWER test in 01-02)
   - vitest: 0 (all green; +8 new tests from 01-01)
   - tsc: 0
   - test:e2e: 0 (44 prior + 3 new from 01-01 host-runtime-override = 47/47)

2. **Pack the corporate-minimal build** and drive it via CDP per `[[cdp_renderer_debug]]`:

   ```bash
   OPENWHISPR_PROVIDER_LOCKDOWN=true npm run pack 2>&1 | tail -10
   # Launch the packed app with CDP:
   ./dist/mac-arm64/OpenWhispr.app/Contents/MacOS/OpenWhispr --remote-debugging-port=9223 &
   APP_PID=$!
   sleep 5
   ```

3. **Live verify HOST-02 via CDP** — using a small Node snippet to:
   1. Discover the renderer target via `curl http://localhost:9223/json/list`.
   2. Connect via WebSocket and `Runtime.evaluate` the following expression:
      ```js
      (async () => {
        const before = { url: window.authClientBaseUrlForTest?.() ?? "unknown" };
        await window.electronAPI.notifyServerUrlChanged("http://localhost:4001/auth-mock");
        // Settings store change is synchronous; force a microtask flush.
        await new Promise((r) => setTimeout(r, 50));
        const after = { url: window.authClientBaseUrlForTest?.() ?? "unknown" };
        return { before, after };
      })();
      ```
   3. Assert the returned `after.url === "http://localhost:4001/auth-mock"`.
   4. Also start a small `http.createServer` on `localhost:4001`, trigger `window.electronAPI.notifyServerUrlChanged("http://localhost:4001")`, then drive `authClient.signIn.email({ email: "test@e2e.local", password: "wrongpass" })` via Runtime.evaluate, and assert the local server received the request at `/api/auth/sign-in/email` (Better Auth path).

   This proves the proxy + IPC + main-side cache are all wired correctly **in the actual packed binary**, not just in vitest where the proxy is a renderer-only thing.

4. **Live verify default-build smoke** — kill packed app, repack WITHOUT `OPENWHISPR_PROVIDER_LOCKDOWN`, launch, observe (manually or via screenshot) that the welcome flow targets `openwhispr.yambr.com`. Either:
   - Visual: launch, click Sign In, observe network log via CDP shows `https://auth.openwhispr.com/...` (the build-time default).
   - Programmatic: CDP `Network.enable` + `Network.requestWillBeSent` listener, assert URL hostname.

5. **Write `01-VERIFICATION.md`** in verifier format (mimic the v1.7.2 phase VERIFICATION.md style):

   ```markdown
   ---
   phase: 01-backend-url-sot-consolidation-dynamic-better-auth
   verified: 2026-05-26T...
   status: passed | gaps_found
   score: N/M must-haves verified
   ---

   # Phase 1: Backend URL SoT Consolidation + Dynamic Better Auth — Verification Report

   ## Observable Truths

   | # | Truth (from SPEC AC list) | Status | Evidence |
   |---|---------------------------|--------|----------|
   | AC-1 | `grep OPENWHISPR_API_URL` zero matches | ✓ | npm run verify:backend-url-sot |
   | … | … | … | … |

   ## Behavioral Spot-Checks

   | Behavior | Command | Result | Status |
   |----------|---------|--------|--------|
   | Proxy honors runtime URL override (live, packed app) | CDP eval driven from Plan 01-07 Task 3 | URL swapped, local mock received Better Auth POST | ✓ PASS |
   | Default-build smoke | CDP Network log shows auth.openwhispr.com | ✓ PASS |
   | e2e regression (Phase 9 + new) | npm run test:e2e | 47/47 | ✓ PASS |

   ## Upstream Parity

   git diff upstream/main -- src/lib/auth.ts | grep -E "^[-+]export"
   Result: empty (zero API surface drift)

   ## Anti-Patterns Found

   (none expected; if any TODO/FIXME/XXX surfaced in touched files, list here)

   ## Server-Side Findings (SURFACED-ONLY per server_repo_boundary)

   - ../openwhispr-server/docker-compose*.yml references to OPENWHISPR_API_URL
     (if any) — flagged for server team. NO client-side action.

   _Verified: 2026-05-26_
   ```

6. **Write `01-SUMMARY.md`** (frontmatter + body):

   ```markdown
   ---
   phase: 01
   phase_name: backend-url-sot-consolidation-dynamic-better-auth
   completed: 2026-05-26
   requirements-completed: [HOST-01, HOST-02, HOST-03]
   plans: 7
   tests-added: 11 (3 e2e + 8 vitest)
   ---

   # Phase 1 Summary

   ## One-liner

   Backend URL is now a single source of truth (OPENWHISPR_BACKEND_URL) consumed by renderer + main; Better Auth client honors runtime persisted Server URL via JavaScript Proxy that re-instantiates inner createAuthClient on demand, with upstream API surface byte-identical (auth.ts:12 origin commit 56f4efb8 preserved).

   ## Delivered

   - HOST-01: OPENWHISPR_API_URL retired; 5 renderer files + ipcHandlers.js + main.js + preload.js + e2e fixture + release.yml all converged on OPENWHISPR_BACKEND_URL
   - HOST-02: authClient as mutable Proxy + Zustand serverUrl subscription + main-process URL cache via settings:server-url-changed IPC
   - HOST-03: 3 hardcoded URLs (auth.ts:177, auth.ts:232, ShareNoteDialog.tsx:26) wired to defaults.ts constants; OPENWHISPR_SHARE_VIEWER_URL added to generator

   ## Decisions / Lessons

   1. Proxy over lazy factory — preserves upstream API surface byte-identical
   2. Zustand + localStorage over safeStorage — URL is config, not secret
   3. release.yml split-PR rename — keeps CI working through the transition

   ## Maintainer Action

   See MAINTAINER-ACTION.md — GH repo var rename pending.

   ## Server-Side Findings (Surfaced Only)

   (list any docker-compose / openwhispr-server env-var references to old name)

   ## Next

   /gsd-discuss-phase 2 — Policy ADR (build-time-only relaxation for backend host)
   ```

7. **Commit verification + summary:**
   ```bash
   git add .planning/phases/01-backend-url-sot-consolidation-dynamic-better-auth/01-VERIFICATION.md .planning/phases/01-backend-url-sot-consolidation-dynamic-better-auth/01-SUMMARY.md
   git commit -m "verify(01): Phase 1 complete — HOST-01/02/03 satisfied, 47/47 e2e green, live CDP drive confirms runtime URL override"
   ```

## Acceptance

```bash
# All gates exit 0:
npm run verify:backend-url-sot     # 0
npm run verify:provider-lockdown    # 0 (regression check)
npm run verify:oauth-gating         # 0 (regression check)
npm run test:build-config           # 0
npx vitest run                      # 0
(cd src && npx tsc --noEmit)        # 0
npm run test:e2e                    # 0, 47/47 (44 prior + 3 host-runtime-override)

# Live CDP verify (manual visual confirm needed):
# 1. Packed lockdown build → notifyServerUrlChanged("http://localhost:4001") → next signIn hits localhost:4001
# 2. Packed default build → signIn hits auth.openwhispr.com (build-time default)
# Both observations recorded in 01-VERIFICATION.md "Behavioral Spot-Checks" table.

# Upstream parity:
git diff upstream/main -- src/lib/auth.ts | grep -E "^[-+]export"   # empty
```

Commit message: `verify(01): Phase 1 complete — HOST-01/02/03 satisfied, e2e green, live CDP drive confirms runtime URL override`

## Notes

- This is the **acceptance gate plan** per `[live_verification_over_green_tests]`. Green vitest alone is insufficient; the live CDP drive against the real packed binary is the trump card.
- If CDP live drive fails (e.g., proxy doesn't actually swap inner instance in the bundled binary due to Rolldown DCE), DO NOT mark phase complete. File the gap in 01-VERIFICATION.md with `status: gaps_found` and dispatch a fix plan inline before progressing to Phase 2.
- Per `[[v178_prod_live_results]]` and `[[review_before_tag]]`, the project's pattern is: live verify → review the diff with gsd-code-reviewer → only then tag a release. Phase 1 does NOT tag (tagging is per-release, not per-phase) but the review step is good discipline before /gsd-discuss-phase 2 starts.
- E2E count assumption (44 → 47) — confirm actual baseline before declaring expected number. Recent quick-task work (260526-ix4) may have changed it.
