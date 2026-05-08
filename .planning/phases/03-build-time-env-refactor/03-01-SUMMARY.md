---
phase: 03-build-time-env-refactor
plan: 1
subsystem: config
tags: [build-time-env, vite-define, defaults, generator, foundation]
requires: []
provides:
  - "src/config/defaults.ts (renderer-only single source of truth, 16 named exports)"
  - "src/config/build-config.generated.cjs (frozen CJS module for main process require())"
  - "src/config/build-config.generated.ts (TS module imported by defaults.ts)"
  - "scripts/generate-build-config.js (prebuild/predev generator)"
  - "src/types/build-env.d.ts (ImportMetaEnv ambient augmentation)"
  - "Vite define block injecting 10 VITE_OPENWHISPR_* keys"
affects:
  - src/vite.config.mjs
  - .gitignore
  - package.json
tech-stack:
  added: []
  patterns:
    - "Build-time env injection via Vite define + JSON.stringify"
    - "Dual generator output (TS for renderer, CJS for main) — no tsc emit step needed"
    - "hasOwnProperty-based override-detection (eliminates default-value-as-explicit-set false negatives)"
    - "Frozen module.exports (Object.freeze) on main-process generated module"
key-files:
  created:
    - scripts/generate-build-config.js
    - src/config/defaults.ts
    - src/types/build-env.d.ts
    - src/config/build-config.generated.ts (gitignored)
    - src/config/build-config.generated.cjs (gitignored)
  modified:
    - src/vite.config.mjs
    - .gitignore
    - package.json
decisions:
  - "Split CFG-04 into OPENWHISPR_BACKEND_URL (default '') and OPENWHISPR_BACKEND_URL_PATTERN (default 'https://api.openwhispr.com/*') to preserve both empty-API semantics and webRequest pattern parity"
  - "Emit BOTH .ts and .cjs from a single generator instead of relying on tsc emit (no tsc step exists in the build)"
  - "OPENWHISPR_OAUTH_PROTOCOL_SCHEME_OVERRIDDEN derived via hasOwnProperty (not string compare to default) — explicit env-set with default value still counts as overridden"
  - "src/config/defaults.ts is RENDERER-ONLY; main process require()s build-config.generated.cjs directly to avoid mixing import.meta.env semantics into CJS"
metrics:
  duration: ~10min
  tasks: 3
  files: 7
  completed: 2026-05-08
---

# Phase 3 Plan 1: Defaults Source of Truth Summary

Bootstrapped the build-time env refactor foundation: a renderer-side single-source-of-truth module (`src/config/defaults.ts`), a Node generator (`scripts/generate-build-config.js`) that emits TWO frozen modules (`build-config.generated.{ts,cjs}`) at prebuild/predev/prestart time, ambient `ImportMetaEnv` types, and an extended Vite `define` block injecting all 10 renderer-exposed `VITE_OPENWHISPR_*` keys.

## What Was Built

### Task 1 — Generator + dual outputs + .gitignore + package.json hooks (commit `fe20321`)

`scripts/generate-build-config.js` is a CommonJS Node script that:

1. Defines a `DEFAULTS` map containing all 16 logical string env-var keys with their parity defaults.
2. Resolves each via `Object.prototype.hasOwnProperty.call(process.env, key) ? process.env[key] : DEFAULTS[key]` — preserving empty-string overrides as intentional (critical for `OPENWHISPR_BACKEND_URL`).
3. Computes `OPENWHISPR_OAUTH_PROTOCOL_SCHEME_OVERRIDDEN` via the same `hasOwnProperty` check, eliminating the fragile string-compare-to-default approach (Plan 3 Task 2 will consume this boolean to decide whether the env override beats the channel-map fallback).
4. Emits `src/config/build-config.generated.ts` with one `export const KEY = "value";` per key plus the boolean.
5. Emits `src/config/build-config.generated.cjs` with `module.exports = Object.freeze({ ... });` — frozen to prevent accidental mutation by main-process consumers.
6. Logs `[build-config] wrote src/config/build-config.generated.{ts,cjs} (16 string keys + 1 boolean)` on success.

`.gitignore` gained a `# Build-time generated config (Phase 3)` block listing both generated files.

`package.json` hooks the generator into `prestart`, `predev`, `predev:main`, `prebuild`, `prebuild:mac`, `prebuild:win`, `prebuild:linux` (7 lifecycle scripts) — every code path that compiles or runs the app re-emits fresh build-config modules.

### Task 2 — Renderer-only defaults.ts + ambient types (commit `6982015`)

`src/config/defaults.ts` re-exports all 16 string keys with two override helpers:

- `pick(viteName, generatedValue)` — uses Vite-substituted `import.meta.env.VITE_*` if non-empty, otherwise falls back to the generated value.
- `pickAllowEmpty(viteName, generatedValue)` — preserves explicit empty-string overrides (used for `OPENWHISPR_BACKEND_URL` and `OPENWHISPR_MISTRAL_BASE_URL`).

Six keys (Google OAuth endpoints, Anthropic URL, OAuth protocol scheme) bypass `pick`/`pickAllowEmpty` entirely and re-export the generated value directly — they have no `VITE_*` injection because they're either main-process-only or not user-overridable per the plan's interfaces block.

The header docblock declares the file RENDERER-ONLY and points main-process consumers at `build-config.generated.cjs` instead. The fragile `typeof import.meta !== "undefined"` branch was dropped (Warning 4 fix) — `defaults.ts` is never imported by main, so `import.meta.env` is always defined at runtime in renderer / always replaced by Vite at build time.

`src/types/build-env.d.ts` augments `ImportMetaEnv` with all 10 renderer-exposed `VITE_OPENWHISPR_*` keys plus the existing `VITE_AUTH_URL` and `VITE_OPENWHISPR_API_URL` (kept for backward compatibility with pre-Phase-3 call sites).

### Task 3 — Vite define block extension (commit `627f603`)

`src/vite.config.mjs` now builds a `buildTimeDefaults` object after `loadEnv()` mapping each renderer-exposed `VITE_OPENWHISPR_*` key to its resolved value (with multi-layer fallback chains: e.g., `OPENWHISPR_AUTH_URL || VITE_AUTH_URL || "https://auth.openwhispr.com"`). The `define:` config inlines each key as `import.meta.env.KEY = JSON.stringify(value)`, and the `runtime-env.json` writer plugin spreads the same keys into the emitted JSON for non-bundled inspection.

Existing `VITE_AUTH_URL` / `VITE_OPENWHISPR_API_URL` keys remain in the `runtime-env.json` payload for backward compatibility — call-site migration is the responsibility of waves 2-5.

## Verification Performed

- `node scripts/generate-build-config.js` runs cleanly; emits both files; cjs module is frozen; default `OPENWHISPR_BACKEND_URL` is `""`, `OPENWHISPR_BACKEND_URL_PATTERN` is `"https://api.openwhispr.com/*"`, `OPENWHISPR_OAUTH_PROTOCOL_SCHEME_OVERRIDDEN` is `false`.
- With `OPENWHISPR_OAUTH_PROTOCOL_SCHEME=openwhispr` set explicitly, `OPENWHISPR_OAUTH_PROTOCOL_SCHEME_OVERRIDDEN === true` (proves no false-negative when the explicit value matches the default).
- `npx tsc --noEmit -p src/tsconfig.json` produces no errors referencing `defaults.ts`, `build-config.generated.ts`, or `build-env.d.ts`.
- `vite.loadConfigFromFile()` resolves `import.meta.env.VITE_OPENWHISPR_AUTH_URL` to the env-overridden value when set, and to `"https://auth.openwhispr.com"` when unset; all 10 renderer-side keys appear in the `define` block.
- `git status` shows both `build-config.generated.{ts,cjs}` ignored.

## Deviations from Plan

**1. [Rule 2 — Critical functionality] Wired generator into all platform-specific prebuild scripts**

- **Found during:** Task 1
- **Issue:** Plan called for `prebuild` and `predev` hooks only, but `package.json` has 7 build-related lifecycle scripts (`prestart`, `predev`, `predev:main`, `prebuild`, `prebuild:mac`, `prebuild:win`, `prebuild:linux`). Hooking only two would leave platform-specific builds (e.g., `npm run build:mac` triggering `prebuild:mac` instead of generic `prebuild`) without freshly generated config — breaking parity guarantees.
- **Fix:** Appended `&& node scripts/generate-build-config.js` to all 7 lifecycle scripts that compile or run the app.
- **Files modified:** `package.json`
- **Commit:** `fe20321`

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| Split CFG-04 into BACKEND_URL + BACKEND_URL_PATTERN | Single key cannot satisfy both `main.js:716` webRequest pattern (`https://api.openwhispr.com/*`) and `constants.ts:116` empty default (CFG-04). Splitting preserves both behaviors with zero inline literal carve-out. |
| Dual generator output (.ts + .cjs) | The build has no tsc emit step; main process is CommonJS. A single generator emitting both modules avoids introducing a tsc compile pass and keeps both consumer worlds zero-config. |
| `hasOwnProperty`-based override detection | A truthy check would treat empty-string explicit overrides as "not set"; a string-compare-to-default would treat explicit env-set with default value as "not overridden". `hasOwnProperty` is semantically precise. |
| `Object.freeze()` on cjs export | Main-process consumers may pass the config object around; freezing prevents accidental mutation that would silently desync per-call-site values. |
| RENDERER-ONLY contract for defaults.ts | Mixing `import.meta.env` semantics into a CJS-importable module forces fragile `typeof` branches that break under bundlers. Splitting consumer surfaces (defaults.ts for renderer, build-config.generated.cjs for main) eliminates the branch. |

## Files Modified

- `scripts/generate-build-config.js` (new, 117 lines)
- `src/config/defaults.ts` (new, 67 lines)
- `src/types/build-env.d.ts` (new, 29 lines)
- `src/config/build-config.generated.ts` (generated, gitignored)
- `src/config/build-config.generated.cjs` (generated, gitignored)
- `src/vite.config.mjs` (extended `define` block + `runtime-env.json` payload)
- `.gitignore` (added Phase 3 build-time generated config block)
- `package.json` (7 lifecycle scripts wired to generator)

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | `fe20321` | Build-time config generator emitting TS+CJS modules |
| 2 | `6982015` | Renderer-only defaults.ts + build-env ambient types |
| 3 | `627f603` | Vite define block with VITE_OPENWHISPR_* keys |

## Foundation Ready For

- **Wave 2** (Plan 2 auth-cluster, Plan 3 electron-builder-config): main process `require("./src/config/build-config.generated.cjs")`; renderer imports from `src/config/defaults.ts`.
- **Wave 3** (Plan 4 google-oauth-cluster): same pattern, plus consumes `OPENWHISPR_OAUTH_PROTOCOL_SCHEME_OVERRIDDEN` boolean to decide channel-map vs env precedence.
- **Wave 4** (Plan 5 model-registry): renderer-side LLM provider URL defaults read from `defaults.ts`.
- **Wave 5** (Plan 6 verify-parity): grep gate forbidding `process.env.OPENWHISPR_*` reads outside `scripts/generate-build-config.js`, `electron-builder.config.js`, and `src/vite.config.mjs`.

## Self-Check: PASSED

- `scripts/generate-build-config.js` — FOUND
- `src/config/defaults.ts` — FOUND
- `src/types/build-env.d.ts` — FOUND
- `src/config/build-config.generated.ts` — FOUND (gitignored)
- `src/config/build-config.generated.cjs` — FOUND (gitignored)
- `src/vite.config.mjs` — modified, contains `VITE_OPENWHISPR_BACKEND_URL` etc.
- Commit `fe20321` — FOUND
- Commit `6982015` — FOUND
- Commit `627f603` — FOUND
