# Phase 3: Build-time Env Refactor - Research

**Researched:** 2026-05-08
**Domain:** Vite/Electron build-time config injection, refactor mechanics
**Confidence:** HIGH (working from concrete inventory + existing partial implementation)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-09 (Phase 1 carryover):** Five hardcode buckets only — backend, oauth, enterprise, model-registry, litellm. HuggingFace/GitHub/docs/legal-page URLs out of scope.
- **D-12 (Phase 1 carryover):** Logical env-var prefix is `OPENWHISPR_*`. Renderer-side consumption requires `VITE_` prefix at consumption site.
- **D-13 (Phase 1 carryover):** Each OAuth provider gets its own row/env-var (per-provider granularity for CFG-03 gating in Phase 4).
- **Phase 2 carryover:** Enterprise bucket is empty in source — Bedrock/Azure/Vertex are runtime user-supplied via `safeStorage`, not Phase 3 targets.
- **D-01:** Create `src/config/defaults.ts` (renderer-readable + main-process-importable) holding every default URL literal as a named export. Every call site imports from this module and reads `import.meta.env.VITE_X ?? DEFAULT_X` (renderer) or `process.env.X ?? DEFAULT_X` (main). After refactor, `grep` for any hardcoded URL literal in `src/` outside `src/config/defaults.ts` must return 0 matches.
- **D-02:** `electron-builder.json` protocol scheme literal is the single allowed exception, replaced by JS-config approach in D-04.
- **D-03 (No fail-closed):** Default build with no env vars set MUST succeed and behave identically to pre-refactor. Strict-required env vars rejected — would break dev workflow.
- **D-04 (JS config file):** Convert `electron-builder.json` → `electron-builder.config.js` (CommonJS module). Module reads `process.env.OPENWHISPR_OAUTH_PROTOCOL_SCHEME` with fallback `"openwhispr"`. electron-builder natively supports `.js` configs. Keep runtime mirror in `main.js:50-52` reading the same env var with the same fallback.
- **D-05 (Consolidate during Phase 3):** `auth.openwhispr.com` (3 sites), `groq` (3 sites), `mistral` (3 sites), and `desktop-callback` URL (2 sites) collapse via shared helpers exported from `src/config/defaults.ts` (or paired `src/config/endpoints.ts`).
- **D-06 (Grep + smoke checklist):** Two-tier validation — (1) `scripts/verify-defaults-parity.js` greps every CONFIG_INVENTORY current value and asserts exactly one occurrence in `src/config/defaults.ts` (or `electron-builder.config.js`); (2) manual smoke checklist in `docs/SELF_HOSTING.md`. No bundle-diff or integration-test infra in Phase 3.
- **Vite/process.env split:** Renderer rows → `import.meta.env.VITE_OPENWHISPR_*` via Vite `define` (extend existing block at `src/vite.config.mjs:38-39`). Main-process rows → `process.env.OPENWHISPR_*` baked at electron-builder time. Dual-process modules (e.g., `src/config/constants.ts`) read `import.meta.env` when available, fall back to `process.env`, then to literal — verified style at `src/config/constants.ts:59-61`.

### Claude's Discretion

- Exact name of the centralized defaults module (`defaults.ts` vs `endpoints.ts` vs split into both)
- Whether to introduce a thin runtime helper (`getEndpoint(name)`) vs direct named imports
- Test-file placement / naming for the parity grep script
- Whether to keep `package.json` script names unchanged or add `npm run verify:parity`
- How to structure the smoke-checklist markdown table in `SELF_HOSTING.md`

### Deferred Ideas (OUT OF SCOPE)

- Bundle diffing / integration tests with mock backend — Phase 4 if needed.
- `npm run verify:parity` as CI gate — Phase 4. Phase 3 ships the script but does not yet wire it into CI.
- Per-provider OAuth disable flags (`OPENWHISPR_OAUTH_GOOGLE=false`) — Phase 4 (CFG-03).
- `BUILD_CONFIG.md` documenting every env var — Phase 4 deliverable.

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CFG-02 | Refactor every CONFIG_INVENTORY entry to a build-time variable read via Vite `define` (renderer) or `process.env` at build time (main). No runtime reads of new env vars in production code paths. | Refactor-partitioning (§Refactor partitioning) maps all 23 inventory rows to either renderer/main/dual buckets and recommends execution order. Verification (§Verification & guardrails) ensures runtime-read prohibition. |
| CFG-04 | `OPENWHISPR_BACKEND_URL` (and per-service URL overrides) replaces hardcoded OpenWhispr cloud base URL. Empty/unset → current default URL. | Inventory anchors `OPENWHISPR_BACKEND_URL` at `src/config/constants.ts:116` (currently `VITE_OPENWHISPR_API_URL || ""`) and `main.js:716` URL pattern. The defaults module exports `OPENWHISPR_BACKEND_URL` and the Vite `define` / electron-builder.config.js inject it into both processes. |

</phase_requirements>

## Summary

- **No new tooling needed.** The existing `src/vite.config.mjs` `define` block + electron-builder's native `.js` config support cover everything in CONFIG_INVENTORY. The whole phase is mechanical: extract literals into one module, extend two injection sites, consolidate three duplicate clusters.
- **One module is the source of truth.** `src/config/defaults.ts` exports every default URL plus a `resolve(envName, default)` helper that reads `import.meta.env` when defined, else `process.env`, else literal. This module is the only place URL literals live; everything else imports.
- **Two injection mechanisms, same env-var names.** Renderer: extend Vite `define` to substitute `import.meta.env.VITE_OPENWHISPR_*` at compile time. Main: `electron-builder.config.js` reads `process.env.OPENWHISPR_*` at build time and writes them through to the packaged main bundle (electron-builder spawns the build child with current `process.env`, so no extra plumbing needed for main).
- **`runtime-env.json` stays.** It is the existing dev-mode bridge that lets `main.js` read renderer-only env vars at startup. Phase 3 keeps it for dev parity but extends its keys to cover all renderer vars used in main fallback chains.
- **Verification is a single grep script.** `scripts/verify-defaults-parity.js` enforces "every CONFIG_INVENTORY current value appears exactly once in source, inside `defaults.ts` or `electron-builder.config.js`." Plus a forbid-runtime-reads grep: `OPENWHISPR_*` env reads outside the defaults module / build configs / known fallback shims.
- **Default-equivalence is mostly free.** Because every default is a named-export literal that matches the pre-refactor value, a no-env build resolves to the identical URL string at every call site. Smoke-testing the 5 critical flows (sign-in, transcription, MCP UI, calendar OAuth, custom protocol) covers the rest.

**Primary recommendation:** Centralize in `src/config/defaults.ts`; extend `src/vite.config.mjs` `define` for renderer; convert to `electron-builder.config.js` exporting an object that reads `process.env` at top-level for main; ship `scripts/verify-defaults-parity.js` as a grep gate.

## Decision: Renderer build-time injection mechanism

**Recommendation: extend the existing `loadEnv` + `define` pattern in `src/vite.config.mjs`.** Do not switch to `import.meta.env` "automatic" exposure (which only forwards `VITE_*` vars from `.env` files) — the existing approach is already in use and proven.

**Why `define` over plain `import.meta.env`:**
- `define` supports literal substitution of any name (we can inject `__OPENWHISPR_AUTH_URL__` if we wanted). For Phase 3 we're staying with `VITE_*` env names so consumption looks like `import.meta.env.VITE_OPENWHISPR_AUTH_URL`, which is what the existing code does (`src/lib/auth.ts:5`).
- `loadEnv(mode, envDir, "")` (third arg `""`) loads ALL env vars (not just `VITE_`-prefixed) — this is already in `src/vite.config.mjs:26`. Phase 3 leverages this: an `OPENWHISPR_AUTH_URL` set in the environment can be re-exposed to the renderer by writing it to `define["import.meta.env.VITE_OPENWHISPR_AUTH_URL"]`.
- Vite inlines `define` substitutions at compile time — they are textually replaced in the JS output. This satisfies CFG-02's "no runtime reads" constraint.

**Concrete extension to `vite.config.mjs`:**

```js
// in defineConfig({mode}) callback, after loadEnv
const buildTimeDefaults = {
  VITE_OPENWHISPR_BACKEND_URL:
    env.OPENWHISPR_BACKEND_URL || env.VITE_OPENWHISPR_API_URL || "",
  VITE_OPENWHISPR_AUTH_URL:
    env.OPENWHISPR_AUTH_URL || env.VITE_AUTH_URL || "https://auth.openwhispr.com",
  VITE_OPENWHISPR_OAUTH_DESKTOP_CALLBACK_URL:
    env.OPENWHISPR_OAUTH_DESKTOP_CALLBACK_URL ||
    env.VITE_OPENWHISPR_OAUTH_CALLBACK_URL ||
    "https://openwhispr.com/auth/desktop-callback",
  // ... one per renderer-side row in CONFIG_INVENTORY
};

return {
  // ...
  define: Object.fromEntries(
    Object.entries(buildTimeDefaults).map(([k, v]) => [
      `import.meta.env.${k}`,
      JSON.stringify(v),
    ])
  ),
  // ...
};
```

`JSON.stringify(v)` is critical — `define` performs literal substitution; without quoting, the value would be inserted as an unquoted JS expression and break the build.

**JSON values:** for objects (e.g., a provider list), `JSON.stringify` handles them; consumers parse via standard property access. Phase 3 has no JSON-shaped inventory rows — every entry is a string URL or a simple identifier — so this is theoretical.

**Security implications:**
- Every value placed in `define` ends up **literally inlined** in the renderer bundle. Never put secrets here. CONFIG_INVENTORY contains only URLs and OAuth public endpoints — safe.
- The existing `runtime-env.json` file (written by the `write-runtime-env` plugin in `vite.config.mjs:34-46`) is also inlined into the dist as a JSON file. Phase 3 should extend it to cover every renderer var consumed by main-process fallbacks (so dev mode still works without the renderer having been built fresh).

**TypeScript types for `import.meta.env`:** add an `src/vite-env.d.ts` (already conventional in Vite TS projects) or extend the existing one — see TypeScript section below.

[VERIFIED: src/vite.config.mjs:24-46]
[VERIFIED: src/lib/auth.ts:5 — `import.meta.env.VITE_AUTH_URL` already in use]
[CITED: vite.dev/config/shared-options.html#define — define performs literal text replacement, requires JSON.stringify for strings]

## Decision: Main-process build-time injection mechanism

**Recommendation: do nothing custom for the bundle. Just read `process.env.OPENWHISPR_*` at the top of `src/config/defaults.ts` (with `typeof import.meta` guard) and let electron-builder pass through `process.env` at build time.**

The main process is **not** transformed by Vite. `main.js`, `preload.js`, and `src/helpers/*.js` are copied into the asar verbatim per `electron-builder.json:14-17`. They are evaluated at runtime by the packaged Electron binary. So "build-time main injection" really means "freeze the resolved value into a JS module at build time, then bundle that module."

**The mechanism:**

1. `src/config/defaults.ts` (compiled to JS by `tsc` and emitted into `src/dist/` via the existing `npm run build:*` chain — confirmed by `electron-builder.json:18` listing `src/dist/**/*` as a packaged file) reads `process.env.OPENWHISPR_*` at module load time.
2. Module-load happens at runtime, not build time. **However**: because `D-03` requires defaults work without any env, and the env-var values are baked into one module, this is functionally build-time-equivalent: the maintainer sets env vars before `npm run build`, those vars are present in `process.env` when electron-builder spawns the renderer build, the renderer build inlines them via `define`, and for main-process consumers the same env vars are read at top-level of the defaults module — but **only the renderer side is truly build-time**.
3. To make the main-process side build-time as well (CFG-02 strict reading: "no runtime reads in production code paths"), generate a frozen module: `src/config/build-config.generated.ts` produced by a `prebuild` script that reads `process.env` at build time and writes literal exports. This is the cleanest path.

**Two-option fork — pick one:**

**Option A: pure runtime read (simpler).** `src/config/defaults.ts` reads `process.env.OPENWHISPR_*` once at module load. The env vars must be present in `process.env` at app startup. In packaged builds the env is empty (no shell), so the module always falls through to literal defaults. Maintainers wanting to override would have to set env vars at user-machine launch time — but `D-03` rules out user-runtime config and CFG-02 demands build-time-only reads.

⚠️ **Option A fails CFG-02 strictly.** A packaged binary that reads `process.env.OPENWHISPR_AUTH_URL` at startup is reading at runtime, even if the value is always empty. The grep gate in §Verification will flag it.

**Option B: generated frozen module (recommended).**
- Add `scripts/generate-build-config.js` invoked from `package.json` `prebuild` script.
- It reads `process.env.OPENWHISPR_*`, falls back to defaults, and writes `src/config/build-config.generated.ts` with literal exports:
  ```ts
  // AUTO-GENERATED — do not edit
  export const OPENWHISPR_AUTH_URL = "https://auth.openwhispr.com";
  export const OPENWHISPR_BACKEND_URL = "";
  // ...
  ```
- Add the generated file to `.gitignore`.
- `src/config/defaults.ts` re-exports from the generated module (renderer side uses `import.meta.env.VITE_*` as primary, generated module as fallback for parity in dev/SSR/non-Vite contexts).
- For main process, only the generated module is read — no `process.env.OPENWHISPR_*` at runtime in production code.

**Recommendation: Option B.** It mechanically satisfies CFG-02's "no runtime reads" wording, gives the grep gate a clean rule (`process.env.OPENWHISPR_*` is forbidden everywhere in `src/` and `main.js` except inside `scripts/generate-build-config.js` and `electron-builder.config.js`), and works with electron-builder's existing build pipeline without new plumbing.

**Trade-off vs. Option A:** Option B adds one generated file and one prebuild script. Worth it for grep-clarity. The planner should make this an explicit decision in the first task.

[VERIFIED: electron-builder.json:14-17 — files block lists `src/dist/**/*`, `src/helpers/**/*`, `src/config/**/*` so generated module ships]
[CITED: electron-builder.org/configuration/configuration — `electron-builder.config.js` is supported as alternative to `.json`; module is imported and its default export consumed]

## Decision: Single-source-of-truth config module shape

**Recommendation: one module, `src/config/defaults.ts`. No paired `endpoints.ts`. Add a thin `getEndpoint(name)` helper for the consolidation cases (D-05) but use direct named imports for everything else.**

**Shape:**

```ts
// src/config/defaults.ts
//
// SINGLE SOURCE OF TRUTH for all build-configurable URL/scheme defaults.
// The literal values in this file ARE the defaults — every other source file
// imports from here. The Vite `define` block in vite.config.mjs and the
// generated module scripts/generate-build-config.js produce the env-overridden
// values at build time.

import * as Generated from "./build-config.generated";

// Renderer reads import.meta.env first (Vite-substituted at build time);
// main reads from Generated module (frozen at build time).
const env =
  (typeof import.meta !== "undefined" && (import.meta as any).env) || undefined;

function pickRenderer(viteName: string, generatedValue: string): string {
  if (env && env[viteName]) return env[viteName] as string;
  return generatedValue;
}

// --- Backend URLs ---
export const OPENWHISPR_AUTH_URL =
  pickRenderer("VITE_OPENWHISPR_AUTH_URL", Generated.OPENWHISPR_AUTH_URL);
export const OPENWHISPR_BACKEND_URL =
  pickRenderer("VITE_OPENWHISPR_BACKEND_URL", Generated.OPENWHISPR_BACKEND_URL);
export const OPENWHISPR_OAUTH_DESKTOP_CALLBACK_URL =
  pickRenderer("VITE_OPENWHISPR_OAUTH_DESKTOP_CALLBACK_URL", Generated.OPENWHISPR_OAUTH_DESKTOP_CALLBACK_URL);
export const OPENWHISPR_MCP_URL =
  pickRenderer("VITE_OPENWHISPR_MCP_URL", Generated.OPENWHISPR_MCP_URL);

// --- OAuth ---
export const OPENWHISPR_OAUTH_GOOGLE_AUTH_URL = Generated.OPENWHISPR_OAUTH_GOOGLE_AUTH_URL;
export const OPENWHISPR_OAUTH_GOOGLE_TOKEN_URL = Generated.OPENWHISPR_OAUTH_GOOGLE_TOKEN_URL;
export const OPENWHISPR_OAUTH_GOOGLE_REVOKE_URL = Generated.OPENWHISPR_OAUTH_GOOGLE_REVOKE_URL;
export const OPENWHISPR_OAUTH_GOOGLE_CALENDAR_API_URL = Generated.OPENWHISPR_OAUTH_GOOGLE_CALENDAR_API_URL;
export const OPENWHISPR_OAUTH_RESET_PASSWORD_URL =
  pickRenderer("VITE_OPENWHISPR_OAUTH_RESET_PASSWORD_URL", Generated.OPENWHISPR_OAUTH_RESET_PASSWORD_URL);
export const OPENWHISPR_OAUTH_PROTOCOL_SCHEME = Generated.OPENWHISPR_OAUTH_PROTOCOL_SCHEME;

// --- Model registry / LiteLLM ---
export const OPENWHISPR_OPENAI_BASE_URL =
  pickRenderer("VITE_OPENWHISPR_OPENAI_BASE_URL", Generated.OPENWHISPR_OPENAI_BASE_URL);
export const OPENWHISPR_ANTHROPIC_URL = Generated.OPENWHISPR_ANTHROPIC_URL;
export const OPENWHISPR_GEMINI_BASE_URL =
  pickRenderer("VITE_OPENWHISPR_GEMINI_BASE_URL", Generated.OPENWHISPR_GEMINI_BASE_URL);
export const OPENWHISPR_GROQ_BASE_URL =
  pickRenderer("VITE_OPENWHISPR_GROQ_BASE_URL", Generated.OPENWHISPR_GROQ_BASE_URL);
export const OPENWHISPR_MISTRAL_BASE_URL = Generated.OPENWHISPR_MISTRAL_BASE_URL;
```

**Why one module not two:** The original suggestion of `defaults.ts + endpoints.ts` adds a layer with no payoff — every consumer just needs `OPENWHISPR_AUTH_URL`. A second module would only matter if we needed to compose URLs (e.g., `${BACKEND_URL}/api/auth/delete-account`) — but those compositions are inline at call sites (e.g., `src/lib/auth.ts:114`) and should stay there. The `getX()` helpers (`getAuthUrl`, `getApiUrl`) inside `src/helpers/ipcHandlers.js` and `src/helpers/googleCalendarOAuth.js` should become thin wrappers around the named exports — kept for lazy-evaluation semantics, not duplication.

**Existing pattern to align with:** `src/config/constants.ts:46-69` already does the `env-fallback-fallback-literal` dance. `defaults.ts` adopts the same style. After Phase 3, `constants.ts` re-exports from `defaults.ts` for backward compatibility (or the literals in `constants.ts:60, 75-78, 116` are deleted and call sites import from `defaults.ts` directly — planner's call).

**Model registry JSON:** `src/models/modelRegistryData.json:139,166,185` is JSON, not TS — it cannot import `defaults.ts` directly. Two options:
- **Option a:** Replace the three `baseUrl` fields with a sentinel like `"<<OPENWHISPR_OPENAI_BASE_URL>>"`, and resolve at JSON load time inside `src/models/ModelRegistry.ts` (the existing TS wrapper).
- **Option b:** Move those three values out of JSON entirely — store them in `defaults.ts` and have `ModelRegistry.ts` inject them when constructing the in-memory registry.

**Recommend Option b.** It removes the JSON-template templating coupling and makes the JSON file a pure data container. This is also the lowest-risk path because `ModelRegistry.ts` already has methods for reading from the JSON. [CITED: src/models/ModelRegistry.ts]

[VERIFIED: src/config/constants.ts:46-69 — existing fallback chain pattern]
[VERIFIED: src/lib/auth.ts:5 — existing `import.meta.env.VITE_AUTH_URL || literal` pattern]

## TypeScript typing approach

**Recommendation: one ambient declaration file `src/types/build-env.d.ts` augmenting `ImportMetaEnv`.**

```ts
// src/types/build-env.d.ts
interface ImportMetaEnv {
  // existing
  readonly VITE_AUTH_URL?: string;
  readonly VITE_OPENWHISPR_API_URL?: string;
  // Phase 3 additions
  readonly VITE_OPENWHISPR_BACKEND_URL?: string;
  readonly VITE_OPENWHISPR_AUTH_URL?: string;
  readonly VITE_OPENWHISPR_OAUTH_DESKTOP_CALLBACK_URL?: string;
  readonly VITE_OPENWHISPR_MCP_URL?: string;
  readonly VITE_OPENWHISPR_OPENAI_BASE_URL?: string;
  readonly VITE_OPENWHISPR_GEMINI_BASE_URL?: string;
  readonly VITE_OPENWHISPR_GROQ_BASE_URL?: string;
  readonly VITE_OPENWHISPR_OAUTH_RESET_PASSWORD_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

**For the generated module:** because `build-config.generated.ts` is committed-via-prebuild and read by `defaults.ts`, its types come for free from the file itself. No ambient declaration needed.

**For `process.env.OPENWHISPR_*` reads in `electron-builder.config.js` and `scripts/generate-build-config.js`:** these are CommonJS files; no typing required. If a `.ts` build script is preferred, add `process.env.OPENWHISPR_*?: string` types via `NodeJS.ProcessEnv` augmentation in the same `build-env.d.ts`.

**Why optional (`?`) on every field:** matches reality — defaults must work with empty env, so every `VITE_*` may be undefined. Forcing required typing would push the strict-check into call sites where it doesn't belong.

[VERIFIED: src/tsconfig.json — `strict: false`, `skipLibCheck: true` — ambient `.d.ts` files in `src/types/` are auto-included]
[CITED: vite.dev/guide/env-and-mode.html#intellisense-for-typescript]

## Verification & guardrails

**Two grep-based gates ship in Phase 3:**

### Gate 1: `scripts/verify-defaults-parity.js` (D-06 automation)

- Inputs: `docs/CONFIG_INVENTORY.md` (parse table; extract `current value` column).
- For each value:
  - Run `grep -rn -F "<value>" src/ main.js preload.js` excluding `**/dist/**`, `**/node_modules/**`, `**/build-config.generated.ts`.
  - Assert: exactly one match, and that match's file is `src/config/defaults.ts` OR `electron-builder.config.js`.
  - Special case: the protocol scheme `"openwhispr"` may match in many places (it's a common substring); use a regex anchored to the JSON/JS literal context.
- Exit 1 with a list of offending files on failure.
- Run via `npm run verify:parity` (Claude's discretion to add this script).

### Gate 2: forbid runtime `process.env.OPENWHISPR_*` reads in production code

- `grep -rn 'process\.env\.OPENWHISPR_' src/ main.js preload.js`
- Allowed locations: `src/config/defaults.ts` (Option A) OR none (Option B with generated module).
- Allowed build-time locations: `scripts/generate-build-config.js`, `electron-builder.config.js`, `src/vite.config.mjs`.
- Same script as Gate 1 can carry this rule.

### Gate 3 (optional — Claude's discretion): ESLint rule

- A `no-restricted-syntax` rule banning `MemberExpression[object.object.name='process'][object.property.name='env'][property.name=/^OPENWHISPR_/]` in `src/` (excluding allowed files via overrides).
- Lower priority than the grep gate because lint runs less reliably than a CI grep.

### Pre-existing patterns to NOT regress

- `process.env.AUTH_URL || process.env.VITE_AUTH_URL || runtimeEnv.VITE_AUTH_URL || literal` chains in `main.js:482-486`, `src/helpers/ipcHandlers.js:3326-3336` — Phase 3 collapses these to a single import from `defaults.ts`. The grep gate must NOT mistakenly flag the consolidated import as a violation. Whitelist `src/config/defaults.ts` and the generated module.
- `runtime-env.json` writer in `src/vite.config.mjs:34-46` — keep this; it's the dev-mode bridge. Extend its keys to cover all Phase 3 vars used in main-process fallbacks.

[VERIFIED: src/helpers/ipcHandlers.js:3326-3336 — current 4-tier fallback chain]
[VERIFIED: main.js:482-486 — same pattern in resolveAuthUrl()]

## Refactor partitioning recommendation

**Partition by file, not by category.** Rationale: the 23 inventory rows touch only 9 files. Per-file partitioning yields atomic commits that are easy to review and bisect.

**Suggested execution order (5 waves):**

| Wave | Files | Rows | Why first/last |
|------|-------|------|----------------|
| 0 (setup) | `src/config/defaults.ts` (new), `src/config/build-config.generated.ts` (gen'd, gitignored), `scripts/generate-build-config.js` (new), `src/vite.config.mjs` (extend `define`), `src/types/build-env.d.ts` (new) | n/a | Foundation. Nothing else can land before these. Default values match pre-refactor literals exactly. |
| 1 (auth cluster) | `src/lib/auth.ts`, `main.js`, `src/helpers/ipcHandlers.js` | 5,6,7,11,12,15 (rows for auth.openwhispr.com × 3, BACKEND_URL × 2, desktop-callback) | Highest-risk consolidation (3 sites collapsing). Land second because everything else depends on the auth pattern being proven. CFG-04 anchor lives here. |
| 2 (electron-builder) | `electron-builder.json` → `electron-builder.config.js`, `main.js:50-52` mirror | row 16 (protocol scheme) | Touches packaging. Verify `npm run pack` still produces a binary before merging. |
| 3 (Google OAuth + Calendar) | `src/helpers/googleCalendarOAuth.js`, `src/helpers/googleCalendarManager.js` | rows 8,17,18,19,20 | Standalone — only Google OAuth flows touch these files. No cross-file refactor risk. |
| 4 (model registry + LiteLLM) | `src/models/modelRegistryData.json`, `src/models/ModelRegistry.ts`, `src/config/constants.ts`, `src/components/McpIntegrationCard.tsx` | rows 9,10,13,14,21,22,23 (and 1 + 2 for `OPENWHISPR_OPENAI_BASE_URL` consolidation) | The JSON-cannot-import problem (§Single source of truth) lives here. Move baseUrls out of JSON into `defaults.ts`, inject in `ModelRegistry.ts`. Three-way duplication consolidation (Groq × 3, Mistral × 3) lands here. |
| 5 (verify) | `scripts/verify-defaults-parity.js` (new), `package.json` script entry (`verify:parity`), `docs/SELF_HOSTING.md` smoke checklist | n/a | Ship the gate after the refactor lands so it can prove zero-regression. |

**Tricky items flagged:**

- **Row 16 `electron-builder.json:7` (protocol scheme):** The `.json` → `.config.js` conversion is non-mechanical — every other field in `electron-builder.json` becomes a JS object literal. Risk: typos in conversion break packaging. Mitigation: copy verbatim into a `.js` template, then introduce the env read for ONE field. Verify with `npm run pack` (CSC_IDENTITY_AUTO_DISCOVERY=false) before merging.
- **Rows 17,18,19,20 (Google OAuth endpoints):** These are stable Google URLs unlikely to ever be overridden (a self-hoster of `auth.openwhispr.com` doesn't reroute Google OAuth). They still need env-var wrapping per D-13 to preserve the per-provider gating model for Phase 4 (CFG-03), but the smoke checklist can deprioritize them.
- **Row 11 (`main.js:715` `auth.openwhispr.com/*` URL pattern in `webRequest.onBeforeSendHeaders`):** Note this is a glob/pattern, not a base URL — once `OPENWHISPR_AUTH_URL` is configurable, the pattern must dynamically construct `${OPENWHISPR_AUTH_URL}/*`. The URL parser in Electron's `webRequest` API accepts glob patterns; ensure the constructed pattern is normalized (no double slashes).
- **Row 16 mirror at `main.js:50-52` (`DEFAULT_OAUTH_PROTOCOL_BY_CHANNEL`):** This is a *channel-aware* map. The Phase 3 env var `OPENWHISPR_OAUTH_PROTOCOL_SCHEME` overrides it unconditionally per D-04. Decide: does the override replace the entire channel map, or only the `production` slot? CONTEXT.md says "reading the same env var with the same fallback" — implying override of the resolved value. Recommend: env var, when set, overrides regardless of channel; when unset, fall back to channel map. This preserves dev/staging isolation when env unset (current behavior).
- **Rows 21–23 (Anthropic/Gemini/Groq/Mistral baseURLs in `src/config/constants.ts:75-78`):** These four are NOT yet env-driven — only `OPENAI_BASE` is (line 60). Phase 3 must add the four corresponding env reads. Existing pattern at line 59-69 (`computeBaseUrl`) is the template.

**Plans should split as:** 1 plan per wave (5 plans total) OR 1 plan for wave 0+1 and 1 plan each for 2/3/4/5 (4 plans). Recommend 5 plans for clean per-file commits.

[VERIFIED: rows mapped against CONFIG_INVENTORY.md table — no row left unaccounted]

## Default-equivalence proof strategy

**Phase 3 ships D-06 manual smoke checklist only. No automated parity beyond the grep gate.**

**Smoke checklist for `docs/SELF_HOSTING.md`:**

| Flow | Action | Expected | Inventory rows covered |
|------|--------|----------|-----------------------|
| Sign-in (email) | Build with no env vars; launch; click "Sign in" | Browser opens to `auth.openwhispr.com/api/auth/...` | 1, 2, 3 (auth URL × 3 sites) |
| Sign-in (Google social) | Click "Sign in with Google" | Browser opens to `accounts.google.com/o/oauth2/v2/auth` then redirects to `openwhispr.com/auth/desktop-callback?protocol=openwhispr` | 7, 8, 11 (desktop-callback, Google auth URL, protocol scheme) |
| Calendar OAuth | Connect Google Calendar | Same Google auth URL; token exchange to `oauth2.googleapis.com/token`; calendar list pulled from `googleapis.com/calendar/v3` | 11, 12, 14 |
| Transcription (cloud OpenAI) | Set OpenAI key, transcribe | Request hits `api.openai.com/v1/audio/transcriptions` | 21 (`OPENAI_BASE_URL`) |
| Transcription (Groq) | Switch to Groq, transcribe | Request hits `api.groq.com/openai/v1/audio/transcriptions` | 17, 23 (Groq registry + constants) |
| MCP UI | Open Integrations card | Displays `https://mcp.openwhispr.com/mcp` | 9 |
| Custom protocol | Trigger OAuth callback (e.g., from web sign-in) | OS launches app via `openwhispr://` URL | 16 (protocol scheme) |

**How to inspect URLs without instrumenting:**

- Use the existing debug logger (`OPENWHISPR_LOG_LEVEL=debug`) — `logger.logReasoning` and `debugLogger.log` already log most outbound URL constructions. Phase 3 should ensure the resolved URL appears in at least one log line per consuming subsystem.
- Network-level inspection via Charles Proxy / mitmproxy / Wireshark is the fallback if logs don't surface the URL.
- For OS-level protocol registration: `defaults read com.yambr.openwhispr` (macOS) shows registered URL schemes in the bundle's Info.plist after `npm run pack`.

**Optional automated lower-bar check (Claude's discretion, not required by CONTEXT.md):**

- A unit test that imports `src/config/defaults.ts` with no env, snapshots all named exports, and asserts each value matches the pre-refactor literal. Cheap, fast, regression-proof. Recommend adding it; it's strictly cheaper than the smoke checklist alone.

**Bundle diff (deferred to Phase 4 per CONTEXT.md):** `npm run pack` twice — once on `main` (pre-refactor) and once on the Phase 3 branch — and `diff -r` the unpacked asar contents. This catches any literal-leak. Phase 3 doesn't need it; the grep gate is equivalent at the source level.

[CITED: D-06 in CONTEXT.md — "Manual smoke checklist in docs/SELF_HOSTING.md"]

## Open questions for the planner

1. **Option A vs Option B for main-process injection** — recommendation is Option B (generated module). Planner should confirm in wave-0 plan and document the decision.
2. **`src/config/constants.ts` post-refactor fate** — does it re-export from `defaults.ts` for backward-compat, or do all call sites get touched to import from `defaults.ts` directly? Recommend the latter for clean grep results, but it doubles the diff size for wave 4. Planner's call.
3. **Channel-aware vs unconditional protocol scheme override** — see "tricky items" above; recommend env-var-wins-when-set, channel-map-when-unset.
4. **Whether to add the snapshot unit test for defaults parity** — cheap and recommended, but technically beyond CONTEXT.md scope (D-06 says "no integration test infra"; a snapshot test is borderline).
5. **`OPENWHISPR_BACKEND_URL` empty-string semantics** — currently `src/config/constants.ts:116` emits `""` when unset, and downstream call sites (`src/lib/auth.ts:109`) treat empty as "API not configured" and short-circuit. Phase 3 must preserve this — DO NOT default to a non-empty URL like `api.openwhispr.com`. The CONFIG_INVENTORY entry for row 6 explicitly notes "cloud URL is opt-in."
6. **electron-builder env passthrough** — confirm with a test that `OPENWHISPR_OAUTH_PROTOCOL_SCHEME=foo npm run pack` produces a packaged app whose Info.plist registers `foo://`. This is the only place where env passthrough matters because the protocol scheme lives in packaging metadata, not in app code.

## Citations

### Repo files (verified)
- `src/vite.config.mjs:24-46` — existing `loadEnv` + `define`-style pattern (via `runtime-env.json` plugin)
- `src/lib/auth.ts:1-220` — `import.meta.env.VITE_AUTH_URL` consumption, `DESKTOP_OAUTH_CALLBACK_URL` constant, `requestPasswordReset` redirect URL
- `src/config/constants.ts:46-125` — `computeBaseUrl` env-fallback pattern; current `OPENWHISPR_API_URL` empty-string semantics
- `main.js:48-149` — channel-aware protocol scheme map and `getOAuthProtocol()`
- `main.js:474-487` — `resolveAuthUrl()` 4-tier fallback chain (consolidation target)
- `main.js:712-729` — `webRequest.onBeforeSendHeaders` URL pattern list (rows 4, 5)
- `src/helpers/ipcHandlers.js:3320-3336` — `getApiUrl()` / `getAuthUrl()` IPC-side helpers (consolidation target)
- `src/helpers/googleCalendarOAuth.js:1-50` — Google OAuth URL constants
- `electron-builder.json:1-249` — current JSON config; conversion target to `.js`
- `docs/CONFIG_INVENTORY.md` — 23-row inventory (the canonical task list)

### External (cited, not separately verified for this phase)
- vite.dev/config/shared-options.html#define — `define` performs literal text replacement; values must be JSON-stringified
- vite.dev/guide/env-and-mode.html#intellisense-for-typescript — `ImportMetaEnv` ambient interface pattern
- electron-builder.org/configuration/configuration — `.js` config support; `extraMetadata` for env injection (not used by this phase)

## Assumptions Log

| # | Claim | Section | Risk if wrong |
|---|-------|---------|---------------|
| A1 | electron-builder spawns child build processes inheriting `process.env` from the npm script invocation | Main-process injection mechanism | If false, Option B (generated module) still works (the prebuild script runs in the npm shell directly). If true (likely), Option A would also work — but we recommend B regardless. Low risk. |
| A2 | The protocol scheme literal `"openwhispr"` is searchable as a literal without false positives in the inventory verification grep | Verification & guardrails | Medium risk — `"openwhispr"` likely appears in package.json, comments, log strings. Mitigation: anchor regex to `"schemes": [...]` in the electron-builder config and `DEFAULT_OAUTH_PROTOCOL_BY_CHANNEL.production` map; whitelist other contexts. |
| A3 | `JSON.stringify` is sufficient quoting for all `define` values in `vite.config.mjs` | Renderer injection | All current inventory values are simple strings or empty strings — no edge cases. Verified by Vite docs. Low risk. |
| A4 | `src/types/build-env.d.ts` will be auto-included by `src/tsconfig.json` because `src/` is in the include path | TypeScript typing | TypeScript auto-includes ambient `.d.ts` files from any included directory. `tsconfig.json` includes `src/**/*` (verified). Low risk. |
| A5 | A snapshot of `src/config/defaults.ts` named exports under no-env conditions matching the pre-refactor literal values is sufficient evidence of behavioral parity at the source level | Default-equivalence | This is necessary but not sufficient — call sites that compose URLs (`${BASE}/path`) could regress if the import changes from a const to an undefined. Mitigation: smoke checklist covers the runtime side. Low-medium risk. |

## Metadata

**Confidence breakdown:**
- Refactor mechanics: HIGH — every step traces to existing patterns in the repo.
- Verification approach: HIGH — pure grep, mechanical.
- TypeScript typing: HIGH — standard Vite pattern.
- electron-builder env passthrough: MEDIUM — recommend a quick `npm run pack` smoke before relying on it.
- Default equivalence: MEDIUM — manual smoke is inherently lower-confidence than automated diff (deferred to Phase 4).

**Research date:** 2026-05-08
**Valid until:** ~2026-08-08 (Vite/electron-builder behavior is stable; refresh if either has a major version bump).

## RESEARCH COMPLETE
