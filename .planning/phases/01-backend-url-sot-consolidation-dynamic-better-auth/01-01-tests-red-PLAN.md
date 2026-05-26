# Plan 01-01: TDD-Red — Failing Tests First (Wave 0)

**Goal:** Author the acceptance gate(s) for Phase 1 in their failing state, before any production code changes. Subsequent plans turn them green by landing the code they assert.

**Wave:** 0 (TDD red)
**Requirements:** none directly (sets up acceptance for HOST-01, HOST-02, HOST-03)
**Depends on:** nothing
**Files modified:**
- `tests/e2e/features/host-runtime-override.feature` (NEW)
- `tests/e2e/steps/host-runtime-override.steps.ts` (NEW)
- `test/helpers/authClientProxy.test.js` (NEW — vitest unit)
- `scripts/verify-backend-url-sot.js` (NEW — bundle-grep + source-grep gate)
- `package.json` (add `"verify:backend-url-sot"` npm script)

## Tasks

1. **Author Playwright Cucumber feature** `tests/e2e/features/host-runtime-override.feature` covering HOST-02 acceptance per CONTEXT D-04:

   ```gherkin
   Feature: Backend URL runtime override (Phase 1 HOST-02)

     Background:
       Given the Electron app is launched against the slim-core backend

     Scenario: Default — authClient targets build-time host
       Given no Server URL is persisted in settings
       When I read authClient.baseURL via renderer evaluate
       Then it equals the build-time AUTH_URL default

     Scenario: Runtime override — authClient swaps to persisted host
       When the renderer persists serverUrl = "http://localhost:4001/auth"
       And I trigger authClient.signIn.email with fixture credentials
       Then the next outbound auth request hits http://localhost:4001
       And no outbound auth request hits the build-time AUTH_URL default

     Scenario: Clear override — authClient reverts to default
       Given the persisted Server URL has been set then cleared
       Then authClient.baseURL equals the build-time AUTH_URL default again
   ```

2. **Author Cucumber step definitions** in `tests/e2e/steps/host-runtime-override.steps.ts`. Use existing `electron-launch.ts` fixture. Steps use `electronApp.evaluate()` to drive `window.electronAPI.notifyServerUrlChanged(url)` (introduced in Plan 01-04) and read `authClient.baseURL` from the proxy (introduced in Plan 01-05). Use a local lightweight HTTP listener (`http.createServer`) on `localhost:4001` to record incoming requests — no openwhispr-server changes.

3. **Author vitest unit tests** in `test/helpers/authClientProxy.test.js` for the proxy mechanics from CONTEXT D-01:
   - cache key correctness (same URL → same inner instance)
   - dirty-flag re-creation (URL change → new inner instance on next access)
   - method binding (proxy returns bound method, not raw function)
   - default fallback (no persistedUrl → AUTH_URL build-time)
   - clear-override semantics (persistedUrl → null → AUTH_URL again)
   Aim for 8 tests.

4. **Author bundle-grep + source-grep gate** in `scripts/verify-backend-url-sot.js`. Runs after `npm run pack`:
   - Source grep: `grep -rn "OPENWHISPR_API_URL\b" src/ scripts/` → zero matches
   - Source grep: `grep -rn "VITE_OPENWHISPR_API_URL\b" src/ scripts/ .github/` → zero matches
   - Source grep: each of 3 hardcoded URLs from HOST-03 → matches only in `src/config/defaults.ts` and `src/config/build-config.generated.{ts,cjs}`
   - Bundle grep: `dist/main/preload.js` and renderer bundle do NOT contain `OPENWHISPR_API_URL` literal anywhere
   Script exits 0 on all clean, 1 with detailed report on any violation.

5. **Wire npm script:**
   ```json
   "verify:backend-url-sot": "node scripts/verify-backend-url-sot.js"
   ```

6. **Run all three test paths and CONFIRM RED:**
   - `npx vitest run test/helpers/authClientProxy.test.js` → fails (proxy doesn't exist yet)
   - `npm run verify:backend-url-sot` → exits 1 (current source still has `OPENWHISPR_API_URL`)
   - `npm run test:e2e -- --grep "host-runtime-override"` → fails (IPC channel doesn't exist yet)

## Acceptance

```bash
# All three MUST fail for plan 01-01 to be DONE:
npx vitest run test/helpers/authClientProxy.test.js; echo "EXIT=$?"   # expect non-zero
npm run verify:backend-url-sot; echo "EXIT=$?"                          # expect 1
# (e2e requires backend; run only if slim-core server is up)
npm run test:e2e:list 2>&1 | grep "host-runtime-override" | wc -l       # expect 3 (3 scenarios listed)
```

Commit message: `test(01-01): RED — add failing host-runtime-override e2e + authClient proxy units + verify-backend-url-sot gate`

## Notes

- Per `[live_verification_over_green_tests]`: this plan establishes the gates that the rest of the phase must turn green. No production code in this commit.
- The e2e feature uses `localhost:4001` as the runtime override target — distinct from the default slim-core `localhost:4000` used by Phase 9 fixtures. No collision with existing 44 scenarios.
- `scripts/verify-backend-url-sot.js` follows the pattern of `verify-provider-lockdown.js` / `verify-oauth-gating.js` for consistency.
