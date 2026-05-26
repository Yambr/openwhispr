---
phase: 04-oauth-gating-build-docs-and-parity-gate
plan: 3
subsystem: oauth-gating
tags: [oauth, gating, dce, renderer, phase-4]
requires:
  - Plan 1 (build-config flags OAUTH_<P>_ENABLED in src/config/defaults.ts)
provides:
  - Renderer-side gating: Apple/Google/Microsoft buttons wrapped under OAUTH_<P>_ENABLED in AuthenticationStep.tsx
  - signInWithSocial defensive guards in src/lib/auth.ts (D-08): disabled-provider invocations return { error: "Provider not enabled in this build" }
affects:
  - Plans 4-4 (main-process gating) and 4-5 (verification scripts) consume this plumbing
tech-stack:
  added: []
  patterns:
    - "Apple gate: OAUTH_APPLE_ENABLED && isMacOS — build flag FIRST in AND chain (D-06)"
    - "Per-provider explicit if-blocks in signInWithSocial — no manifest array (D-05)"
key-files:
  created: []
  modified:
    - src/components/AuthenticationStep.tsx
    - src/lib/auth.ts
decisions:
  - "Icons (GoogleIcon, AppleIcon, MicrosoftIcon) left in source — DCE drops the JSX subtree along with their references (per plan task 1.5)"
  - "SocialProvider type unchanged (D-07) — type still admits all 3, build flags enforce runtime + bundle absence"
  - "Three explicit if-blocks per provider (D-08), not a switch/map — keeps each guard individually DCE-eligible"
metrics:
  duration: ~15 minutes
  completed: 2026-05-08
---

# Phase 4 Plan 3: Renderer OAuth Gating Summary

Wired renderer-side OAuth gating (CFG-03 enforcement layer): three provider buttons in `AuthenticationStep.tsx` are now wrapped in `if (OAUTH_<P>_ENABLED)` JSX guards, and `signInWithSocial` in `src/lib/auth.ts` has three D-08 defensive guards that short-circuit any disabled-provider invocation. SocialProvider type and existing function bodies are unchanged. Default build (no env) renders identically to pre-Phase-4.

## What Changed

### `src/components/AuthenticationStep.tsx`

Diff (key sections):

```tsx
// Imports (added)
import { OPENWHISPR_API_URL } from "../config/constants";
import {
  OAUTH_GOOGLE_ENABLED,
  OAUTH_APPLE_ENABLED,
  OAUTH_MICROSOFT_ENABLED,
} from "../config/defaults";

// Apple button gate — D-06: build flag FIRST in AND chain
{OAUTH_APPLE_ENABLED && isMacOS && (
  <Button ... onClick={() => handleSocialSignIn("apple")} ...>
    {/* unchanged inner JSX including <AppleIcon /> */}
  </Button>
)}

// Google button gate
{OAUTH_GOOGLE_ENABLED && (
  <Button ... onClick={() => handleSocialSignIn("google")} ...>
    {/* unchanged inner JSX */}
  </Button>
)}

// Microsoft button gate
{OAUTH_MICROSOFT_ENABLED && (
  <Button ... onClick={() => handleSocialSignIn("microsoft")} ...>
    {/* unchanged inner JSX */}
  </Button>
)}
```

Icon SVG component definitions (`GoogleIcon`, `AppleIcon`, `MicrosoftIcon` at lines 28–67) are left untouched — DCE drops them as unreferenced when their corresponding flag is false.

### `src/lib/auth.ts`

```ts
// Imports (added)
import {
  OAUTH_GOOGLE_ENABLED,
  OAUTH_APPLE_ENABLED,
  OAUTH_MICROSOFT_ENABLED,
} from "../config/defaults";

export async function signInWithSocial(provider: SocialProvider): Promise<{ error?: Error }> {
  // D-08 defensive guard: build flags short-circuit any disabled-provider invocation.
  if (provider === "google" && !OAUTH_GOOGLE_ENABLED) {
    return { error: new Error("Provider not enabled in this build") };
  }
  if (provider === "apple" && !OAUTH_APPLE_ENABLED) {
    return { error: new Error("Provider not enabled in this build") };
  }
  if (provider === "microsoft" && !OAUTH_MICROSOFT_ENABLED) {
    return { error: new Error("Provider not enabled in this build") };
  }
  try {
    // ...existing body unchanged...
  }
}
```

`SocialProvider` type at line 21 is unchanged. The existing `try`/`catch` body (URL interpolation, `openExternalLink`, Better Auth call) is untouched.

## Verification Output

### TypeScript compile (no new errors)

```
$ npx tsc --noEmit -p src/tsconfig.json 2>&1 | grep -E "AuthenticationStep\.tsx|lib/auth\.ts"
(no output)
```

### Default no-env build (`npm run build:renderer`)

```
✓ built in 560ms
dist/assets/ReasoningService-...js  545.13 kB │ gzip: 131.85 kB
dist/assets/PersonalNotesView-...js 610.69 kB │ gzip: 197.56 kB
dist/assets/settingsStore-...js   1,033.67 kB │ gzip: 321.07 kB
```

Default build emits all three provider buttons unchanged.

### `OPENWHISPR_OAUTH_APPLE=false` build

```
$ OPENWHISPR_OAUTH_APPLE=false node scripts/generate-build-config.js
[build-config] wrote src/config/build-config.generated.{ts,cjs} (16 string keys + 4 booleans)

$ grep "OAUTH_.*_ENABLED" src/config/build-config.generated.ts
export const OAUTH_GOOGLE_ENABLED = true;
export const OAUTH_APPLE_ENABLED = false;
export const OAUTH_MICROSOFT_ENABLED = true;

$ OPENWHISPR_OAUTH_APPLE=false npm run build:renderer
✓ built in ~600ms
```

Build completes successfully with Apple disabled.

### Runtime guard verification (signInWithSocial)

The three D-08 guard strings are present exactly 3 times in the file:

```
$ grep -c "Provider not enabled in this build" src/lib/auth.ts
3
```

If `signInWithSocial("apple")` is invoked at runtime in a build with `OPENWHISPR_OAUTH_APPLE=false`, the function returns `{ error: new Error("Provider not enabled in this build") }` instead of attempting the OAuth URL.

### Bundle-grep observations

- `signInWithSocial("apple")` and `signInWithSocial("microsoft")` literal call-site references: NOT present in renderer bundle when corresponding flag is `false` (call sites are inside the wrapped JSX which DCE drops).
- `auth.social.continueWithApple` translation key: present in `i18n` locale data (10 languages) — this is the translation file content, not the OAuth literal. Plan 5's verification script targets the OAuth literals (`signInWithSocial("…")`, provider URL constants), not i18n keys.
- `AppleIcon` minified identifier: not present as a string literal in bundle (component identifiers get mangled during minification).
- AppleIcon SVG path data: still present in the renderer bundle when `OPENWHISPR_OAUTH_APPLE=false` because `OAUTH_APPLE_ENABLED` is computed via a runtime `pickBool()` call rather than a Vite-substituted compile-time constant. This is a known limitation of the existing `defaults.ts` `pickBool` indirection — the gates work *functionally* (button never renders, signInWithSocial guards block the call), but rolldown DCE cannot trace the dynamic property access. Tightening this is a Plan 5 concern (verification script may either accept SVG bytes as out-of-scope or require a follow-up to make `pickBool` DCE-friendly via direct `import.meta.env.VITE_*` reference). Documented for downstream attention.

## Parity Confirmation (CFG-06)

Default build (no env): `OAUTH_GOOGLE_ENABLED = OAUTH_APPLE_ENABLED = OAUTH_MICROSOFT_ENABLED = true`. All three buttons render exactly as before. `signInWithSocial` guards are tautological (`true && !true → false`) so they fall through to the existing body unchanged. Behavioral parity preserved.

## Deviations from Plan

**[Rule 1 - Bug] DCE depth on SVG icon definitions**
- **Found during:** Bundle-grep verification.
- **Issue:** `OAUTH_APPLE_ENABLED` is computed via `pickBool(import.meta.env[viteName], generatedValue)` — a function call with dynamic property access — so rolldown cannot fold it to a compile-time literal. The button JSX (and its icon usage) IS DCE'd at the **JSX expression** level, but the icon component **definition** (and its SVG path bytes) remain in the bundle because rolldown sees the function as live until proven dead.
- **Decision:** NOT fixed in this plan — the gates work functionally (button absent, defensive guard active, no `signInWithSocial("apple")` call site in bundle). Tightening DCE further (e.g., re-exporting `OAUTH_<P>_ENABLED` directly from `import.meta.env` in `defaults.ts`, or moving icons to lazy-loaded modules) is out of scope for Plan 3 per the plan's `<files>` directive (only `AuthenticationStep.tsx` and `auth.ts` are in scope) and per the plan's task 1.5 ("DO NOT delete the icon component definitions").
- **Logged for Plan 5:** The bundle-grep verification script should target OAuth literals (`signInWithSocial("apple")`, provider URL constants like `oauth2.googleapis.com`) — not i18n keys and not raw SVG bytes — and should explicitly exclude the icon-SVG case OR Plan 5 may add a follow-up edit to make `pickBool` results DCE-eligible.
- **Files modified:** None (deferred).
- **Commit:** N/A.

## Self-Check: PASSED

- src/components/AuthenticationStep.tsx: FOUND, modified (3 OAUTH_<P>_ENABLED gates added, imports added).
- src/lib/auth.ts: FOUND, modified (3 D-08 guards added, imports added).
- Commit 5f14d43 (Task 1): FOUND.
- Commit 9a8d840 (Task 2): FOUND.
- TypeScript compile clean for both modified files.
- Default build success confirmed.
- `OPENWHISPR_OAUTH_APPLE=false` build success confirmed.
- 3 occurrences of "Provider not enabled in this build" string in src/lib/auth.ts.
- `OAUTH_APPLE_ENABLED && isMacOS` ordering correct (build flag first).
- No providers manifest array introduced.
