# Plan 01-03: HOST-01 Renderer — Remove OPENWHISPR_API_URL from renderer (Wave 2)

**Goal:** Delete the dual-env-var convention from the renderer. `OPENWHISPR_API_URL` and all its references are removed; all 5 renderer call sites import `OPENWHISPR_BACKEND_URL` from `defaults.ts` instead.

**Wave:** 2
**Requirements:** HOST-01 (renderer side)
**Depends on:** 01-01, 01-02 (clean working tree)
**Files modified:**
- `src/config/constants.ts` — delete `OPENWHISPR_API_URL` export
- `src/lib/auth.ts` — replace import
- `src/components/onboarding/AuthenticationStep.tsx` — replace import
- `src/components/onboarding/EmailVerificationStep.tsx` — replace import
- (potentially other renderer files — verify via grep)
- `tests/e2e/fixtures/electron-launch.ts` — update env-var setting (line 47-51)
- `tests/e2e/steps/sync-cjm.steps.ts` — update comment (line 11)
- `src/locales/{ja,it,ru,zh-TW,zh-CN}/translation.json` — update VITE_AUTH_URL message if it references old env var (optional, low priority)

## Tasks

1. **Final renderer grep** (re-confirm scope):
   ```bash
   grep -rln "OPENWHISPR_API_URL\b" src/
   ```
   Expected: 5 files based on integration-check scout — `constants.ts`, `auth.ts`, `AuthenticationStep.tsx`, `EmailVerificationStep.tsx`, plus any not yet surfaced. Capture the actual list before editing.

2. **Delete `OPENWHISPR_API_URL` from constants.ts:**
   - Line 116: `export const OPENWHISPR_API_URL = (env.VITE_OPENWHISPR_API_URL as string) || "";`
   - Delete the line entirely.
   - Also delete the section comment `// OpenWhispr Cloud API` if it's no longer accurate (constants.ts retains other endpoints).

3. **Rewrite renderer imports** — for each file from step 1:
   - Replace `import { OPENWHISPR_API_URL } from "../config/constants"` with `import { OPENWHISPR_BACKEND_URL } from "../config/defaults"` (adjust relative path per file location).
   - Replace identifier references `OPENWHISPR_API_URL` → `OPENWHISPR_BACKEND_URL`.
   - In `auth.ts`, this is for the `import { OPENWHISPR_API_URL } from "../config/constants"` line — already line 2 per the file head.
   - Confirm via `grep -rn "OPENWHISPR_BACKEND_URL" src/` that the new imports are present and resolve.

4. **Update e2e fixture** (`tests/e2e/fixtures/electron-launch.ts:47-51`):
   - Replace the dual setter:
     ```ts
     OPENWHISPR_API_URL: backendUrl,
     VITE_OPENWHISPR_API_URL: backendUrl,
     ```
     With:
     ```ts
     OPENWHISPR_BACKEND_URL: backendUrl,
     VITE_OPENWHISPR_BACKEND_URL: backendUrl,
     ```
   - Update the in-file comment (lines 47-48) explaining the env-var precedence.

5. **Update sync-cjm comment** (`tests/e2e/steps/sync-cjm.steps.ts:11`):
   - Replace `${OPENWHISPR_API_URL}` with `${OPENWHISPR_BACKEND_URL}` in the comment block.

6. **Update i18n strings (5 locales)** — `featuresDisabledDescription` keys in `ja`, `it`, `ru`, `zh-TW`, `zh-CN` reference `VITE_AUTH_URL` (correct — separate var) NOT `OPENWHISPR_API_URL`. **No change needed** — confirmed via grep. Skip this step.

7. **Final renderer grep — confirm zero matches:**
   ```bash
   grep -rn "OPENWHISPR_API_URL\b" src/
   grep -rn "VITE_OPENWHISPR_API_URL\b" src/ tests/
   ```
   Both expected: zero output.

8. **Smoke-build renderer:**
   ```bash
   cd src && npx tsc --noEmit
   ```
   Expected: exit 0, no errors.

## Acceptance

```bash
grep -rn "OPENWHISPR_API_URL\b" src/ scripts/ tests/; echo "EXIT=$?"             # expect non-zero (no matches)
grep -rn "VITE_OPENWHISPR_API_URL\b" src/ scripts/ tests/; echo "EXIT=$?"        # expect non-zero
cd src && npx tsc --noEmit; echo "EXIT=$?"                                       # expect 0
# Vitest still passes:
npx vitest run --reporter=verbose 2>&1 | tail -20                                # all renderer tests green
# verify-backend-url-sot partially green (source-grep section):
node scripts/verify-backend-url-sot.js 2>&1 | grep -i "source-grep"              # source-grep should pass; bundle-grep still red
# auth.ts upstream parity (no new exports):
git diff upstream/main -- src/lib/auth.ts | grep -E "^[-+]export"; echo "EXIT=$?"   # expect empty
```

Commit message: `feat(01-03): HOST-01 renderer — remove OPENWHISPR_API_URL; 5 imports now read OPENWHISPR_BACKEND_URL from defaults.ts`

## Notes

- **The repo is in a "main-process-broken" state at this point** — `ipcHandlers.js` still reads `process.env.OPENWHISPR_API_URL`, which is no longer set anywhere. Don't run the packed app between Plan 01-03 and Plan 01-04. Plan 01-04 fixes the main side.
- Tests run via vitest do not exercise the main-process path, so they still pass.
- `src/vite.config.mjs` deliberately NOT updated yet — it still has `VITE_OPENWHISPR_AUTH_URL` define, which is a separate variable (AUTH, not API). Leave it alone.
