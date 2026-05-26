# Plan 01-02: HOST-03 Sweep — Wire 3 Hardcoded URLs to defaults.ts (Wave 1)

**Goal:** Remove the 3 hardcoded URL literals surfaced by integration-check (INT-03/04/05) and route them through the build-time SoT. Add the one missing constant (`OPENWHISPR_SHARE_VIEWER_URL`).

**Wave:** 1
**Requirements:** HOST-03
**Depends on:** 01-01 (RED gate authored — proves grep targets are testable)
**Files modified:**
- `src/lib/auth.ts` — wire 2 imports + replace 2 literals
- `src/components/notes/ShareNoteDialog.tsx` — wire 1 import + replace 1 literal
- `scripts/generate-build-config.js` — add `OPENWHISPR_SHARE_VIEWER_URL` to STRING_DEFAULTS
- `src/config/defaults.ts` — re-export new constant
- `src/config/build-config.generated.{ts,cjs}` — regenerated (auto)
- `docs/CONFIG_INVENTORY.md` — 3 new rows

## Tasks

1. **Add `OPENWHISPR_SHARE_VIEWER_URL` to generator** (`scripts/generate-build-config.js`):
   - In `STRING_DEFAULTS` map: `OPENWHISPR_SHARE_VIEWER_URL: "https://notes.openwhispr.com"`
   - In `emitGeneratedTs` and `emitGeneratedCjs`: emit the line
   - In `resolveString()` env var name list: include `OPENWHISPR_SHARE_VIEWER_URL`
   - Also Vite name: `VITE_OPENWHISPR_SHARE_VIEWER_URL`
   Match pattern of existing `OPENWHISPR_MCP_URL` exactly.

2. **Re-export from defaults.ts:**
   ```ts
   export const OPENWHISPR_SHARE_VIEWER_URL = pick(
     "VITE_OPENWHISPR_SHARE_VIEWER_URL",
     Generated.OPENWHISPR_SHARE_VIEWER_URL
   );
   ```
   Place alphabetically near the other `OPENWHISPR_*_URL` exports. Direct named re-export per `[rolldown_tree_shake]`.

3. **Regenerate build-config:**
   ```bash
   node scripts/generate-build-config.js
   ```
   Verify `OPENWHISPR_SHARE_VIEWER_URL: "https://notes.openwhispr.com"` appears in both `.ts` and `.cjs` outputs.

4. **Wire `src/lib/auth.ts:177`:**
   - Add to imports at top: `import { OPENWHISPR_OAUTH_DESKTOP_CALLBACK_URL, OPENWHISPR_OAUTH_RESET_PASSWORD_URL } from "../config/defaults";`
   - Delete line 177: `const DESKTOP_OAUTH_CALLBACK_URL = "https://openwhispr.com/auth/desktop-callback";`
   - Replace all references to `DESKTOP_OAUTH_CALLBACK_URL` (the local const) with `OPENWHISPR_OAUTH_DESKTOP_CALLBACK_URL` (the imported constant). Or, less invasive: rename the import alias `const DESKTOP_OAUTH_CALLBACK_URL = OPENWHISPR_OAUTH_DESKTOP_CALLBACK_URL;` to keep downstream references unchanged. **Choose the less-invasive aliased path** — preserves `[upstream_parity]` API surface for line-blame purposes (the const name was upstream-origin).

5. **Wire `src/lib/auth.ts:232`:**
   - Replace `redirectTo: "https://openwhispr.com/reset-password"` with `redirectTo: OPENWHISPR_OAUTH_RESET_PASSWORD_URL`. Import is already added in step 4.

6. **Wire `src/components/notes/ShareNoteDialog.tsx:26`:**
   - Add import at top: `import { OPENWHISPR_SHARE_VIEWER_URL } from "../../config/defaults";`
   - Replace line 26: `const SHARE_VIEWER_BASE_URL = OPENWHISPR_SHARE_VIEWER_URL;` (keep the local-const alias for minimal call-site change).

7. **Update `docs/CONFIG_INVENTORY.md`** — append 3 rows to the existing 5-column hardcode inventory table:
   ```markdown
   | src/lib/auth.ts | 177 | https://openwhispr.com/auth/desktop-callback | OPENWHISPR_OAUTH_DESKTOP_CALLBACK_URL | (already in generator; wired Phase 1 HOST-03) |
   | src/lib/auth.ts | 232 | https://openwhispr.com/reset-password | OPENWHISPR_OAUTH_RESET_PASSWORD_URL | (already in generator; wired Phase 1 HOST-03) |
   | src/components/notes/ShareNoteDialog.tsx | 26 | https://notes.openwhispr.com | OPENWHISPR_SHARE_VIEWER_URL | (added in Phase 1 HOST-03) |
   ```

8. **Verify upstream-parity:**
   ```bash
   git diff upstream/main -- src/lib/auth.ts | grep -E "^[-+]export"
   ```
   Must be empty (no new/removed exports — only internal const replacement).

## Acceptance

```bash
# Source grep — all 3 banned literals only in defaults.ts/generated:
grep -rn "https://openwhispr.com/auth/desktop-callback" src/ | grep -v "src/config/" ; echo "EXIT=$?"  # expect non-zero (no matches → grep exits 1)
grep -rn "https://openwhispr.com/reset-password" src/ | grep -v "src/config/" ; echo "EXIT=$?"        # expect non-zero
grep -rn "https://notes.openwhispr.com" src/ | grep -v "src/config/" ; echo "EXIT=$?"                  # expect non-zero

# Build-config regenerates cleanly:
node scripts/generate-build-config.js && grep "OPENWHISPR_SHARE_VIEWER_URL" src/config/build-config.generated.cjs   # expect match

# Unit tests for build-config still pass:
npm run test:build-config   # expect 15/15 pass (or +1 if you add SHARE_VIEWER test)

# Upstream parity (auth.ts API surface byte-identical):
git diff upstream/main -- src/lib/auth.ts | grep -E "^[-+]export"   # expect empty

# CONFIG_INVENTORY.md has 3 new rows:
grep -c "OPENWHISPR_OAUTH_DESKTOP_CALLBACK_URL\|OPENWHISPR_OAUTH_RESET_PASSWORD_URL\|OPENWHISPR_SHARE_VIEWER_URL" docs/CONFIG_INVENTORY.md   # expect >= 3
```

Commit message: `feat(01-02): HOST-03 — wire 3 hardcoded URLs to defaults.ts (auth.ts:177/232 + ShareNoteDialog.tsx:26) + add OPENWHISPR_SHARE_VIEWER_URL`

## Notes

- This plan turns the HOST-03 portion of `verify-backend-url-sot.js` GREEN (3 of the source-grep assertions).
- Bundle-grep portion stays RED until `OPENWHISPR_API_URL` is also removed in Plans 01-03/01-04.
- No behavior change for users — URLs are byte-identical to what was hardcoded, just sourced from defaults.ts now.
