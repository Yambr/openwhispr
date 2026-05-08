---
phase: 04-oauth-gating-build-docs-and-parity-gate
plan: 1
subsystem: build-config
tags: [build-config, oauth, gating, phase-4, infrastructure]
requires:
  - Phase 3 build-config generator + defaults.ts + vite.config.mjs (already in place)
provides:
  - OAUTH_GOOGLE_ENABLED / OAUTH_APPLE_ENABLED / OAUTH_MICROSOFT_ENABLED as boolean build-config flags at every layer (generator -> generated.ts/.cjs -> defaults.ts -> Vite define)
  - VITE_OPENWHISPR_OAUTH_<P>_ENABLED substituted as boolean literal in renderer bundle (DCE-friendly)
  - resolveBool() / pickBool() helpers ready for reuse if more boolean flags are added
affects:
  - Plans 4-2/4-3/4-4 will consume these flags at call sites
  - No consumer code path changed yet (parity preserved)
tech-stack:
  added: []
  patterns:
    - "boolean parse rule: literal 'false' -> false, else true (matches CONTEXT.md D-01)"
key-files:
  created: []
  modified:
    - scripts/generate-build-config.js
    - src/config/defaults.ts
    - src/vite.config.mjs
decisions:
  - "Emitted-constant naming uses _ENABLED suffix (OAUTH_GOOGLE_ENABLED) for boolean-semantic clarity at consumption; user-facing env var stays unsuffixed (OPENWHISPR_OAUTH_GOOGLE) per CONTEXT.md."
  - "Booleans live in a separate BOOL_DEFAULTS map / resolveBool() function rather than overloading the existing string DEFAULTS — keeps types clean in emitted .ts."
  - "Renderer-side pickBool() expects already-boolean inputs (from Vite define) — no string parsing in renderer code path."
metrics:
  duration: ~10 minutes
  completed: 2026-05-08
---

# Phase 4 Plan 1: OAuth Gating Build-Config Plumbing Summary

Added three OAuth provider gating boolean flags (`OAUTH_GOOGLE_ENABLED`, `OAUTH_APPLE_ENABLED`, `OAUTH_MICROSOFT_ENABLED`) to the existing Phase 3 build-config infrastructure at every layer. Pure plumbing — no consumer behavior changes; default build remains parity-identical to pre-Phase-3 Yambr fork.

## What Changed

### `scripts/generate-build-config.js`
- New `BOOL_DEFAULTS` map (3 entries, all default `true`).
- New `resolveBool(boolKey)` reads `OPENWHISPR_OAUTH_<P>` and applies the parse rule: literal `"false"` -> `false`, else `true`.
- `buildResolved()` extended to populate booleans alongside the 16 existing string keys.
- `emitTs()` and `emitCjs()` extended to emit the 3 new boolean exports/entries.
- Trailing log updated: `(16 string keys + 4 booleans)`.

### `src/config/defaults.ts`
- New `pickBool(viteName, generatedValue)` helper (boolean variant of existing `pick` / `pickAllowEmpty`).
- 3 new exports: `OAUTH_GOOGLE_ENABLED`, `OAUTH_APPLE_ENABLED`, `OAUTH_MICROSOFT_ENABLED`, each reading `import.meta.env.VITE_OPENWHISPR_OAUTH_<P>_ENABLED` with fallback to the generated module's boolean.

### `src/vite.config.mjs`
- 3 new entries in `buildTimeDefaults`: `VITE_OPENWHISPR_OAUTH_GOOGLE_ENABLED`, `_APPLE_ENABLED`, `_MICROSOFT_ENABLED`.
- Parse expression: `env.OPENWHISPR_OAUTH_<P> !== "false"` (matches generator's rule).
- Existing `define` block already mapped over `buildTimeDefaults` with `JSON.stringify`, so booleans get emitted as literal `true` / `false` (unquoted) — no `define` block change needed.

## Verification Output

**No-env build (default — parity case):**
```
$ node scripts/generate-build-config.js
[build-config] wrote src/config/build-config.generated.{ts,cjs} (16 string keys + 4 booleans)

$ grep "OAUTH_.*_ENABLED" src/config/build-config.generated.ts
export const OAUTH_GOOGLE_ENABLED = true;
export const OAUTH_APPLE_ENABLED = true;
export const OAUTH_MICROSOFT_ENABLED = true;
```

**With `OPENWHISPR_OAUTH_GOOGLE=false`:**
```
$ OPENWHISPR_OAUTH_GOOGLE=false node scripts/generate-build-config.js
$ grep "OAUTH_.*_ENABLED" src/config/build-config.generated.ts
export const OAUTH_GOOGLE_ENABLED = false;
export const OAUTH_APPLE_ENABLED = true;
export const OAUTH_MICROSOFT_ENABLED = true;
```

Only Google flag flipped; Apple and Microsoft remain `true` (per-provider granularity).

**Vite config substitution (no-env, mode=production):**
```
google: true
apple: true
microsoft: true
```

**Vite config substitution with `OPENWHISPR_OAUTH_GOOGLE=false`:**
```
google with false: false
apple: true
```

**TypeScript compile:**
```
$ npx tsc --noEmit -p src/tsconfig.json 2>&1 | grep "defaults.ts"
no defaults.ts errors
```

## Parity Confirmation (CFG-06)

The 16 existing string keys are emitted unchanged on a no-env build (verified by re-running the generator pre/post change — only the new 3 boolean lines appear). The `OPENWHISPR_OAUTH_PROTOCOL_SCHEME_OVERRIDDEN` derived boolean is unchanged. `OAUTH_<P>_ENABLED = true` for all three providers when no env vars are set, preserving parity with the pre-Phase-3 binary.

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- scripts/generate-build-config.js: FOUND, modified
- src/config/defaults.ts: FOUND, modified
- src/vite.config.mjs: FOUND, modified
- Commit 4d4d83e: FOUND (Task 1 generator)
- Commit 8e09c3f: FOUND (Task 2 defaults.ts)
- Commit e8a628a: FOUND (Task 3 vite.config.mjs)
- Default build emits all 3 booleans as `true`; explicit `OPENWHISPR_OAUTH_GOOGLE=false` flips only Google.
- TS compile clean for defaults.ts.
