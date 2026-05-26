---
phase: 03-build-time-env-refactor
plan: 2
type: execute
wave: 2
depends_on: [1]
files_modified:
  - src/lib/auth.ts
  - main.js
  - src/helpers/ipcHandlers.js
autonomous: true
requirements: [CFG-02, CFG-04]

must_haves:
  truths:
    - "auth.openwhispr.com literal appears 0 times in src/lib/auth.ts, main.js, src/helpers/ipcHandlers.js"
    - "api.openwhispr.com literal appears 0 times in main.js (the webRequest pattern reads OPENWHISPR_BACKEND_URL_PATTERN from build-config.generated.cjs — no inline parity carve-out)"
    - "openwhispr.com/auth/desktop-callback literal appears 0 times in src/lib/auth.ts"
    - "Sign-in flows (renderer + main + IPC) resolve to https://auth.openwhispr.com when no env vars set"
    - "Setting OPENWHISPR_AUTH_URL=https://test.example.com at build time changes all three auth call sites to test.example.com"
    - "OPENWHISPR_BACKEND_URL CFG-04 anchor is read from src/config/build-config.generated.cjs at the IPC getApiUrl site"
    - "OPENWHISPR_BACKEND_URL_PATTERN is read from src/config/build-config.generated.cjs at the main.js webRequest pattern site (default '${parity URL}/*')"
  artifacts:
    - path: "src/lib/auth.ts"
      provides: "Renderer auth client using OPENWHISPR_AUTH_URL + OPENWHISPR_OAUTH_DESKTOP_CALLBACK_URL + OPENWHISPR_OAUTH_RESET_PASSWORD_URL from defaults.ts"
      contains: "from \"@/config/defaults\""
    - path: "main.js"
      provides: "Main-process resolveAuthUrl + onBeforeSendHeaders patterns reading from build-config.generated.cjs (no inline literals)"
      contains: "OPENWHISPR_BACKEND_URL_PATTERN"
    - path: "src/helpers/ipcHandlers.js"
      provides: "IPC-side getAuthUrl/getApiUrl reading from build-config.generated.cjs (no inline literals)"
  key_links:
    - from: "src/lib/auth.ts"
      to: "src/config/defaults.ts"
      via: "named import (renderer/TS)"
      pattern: "from .*config/defaults"
    - from: "main.js"
      to: "src/config/build-config.generated.cjs"
      via: "require() (CommonJS)"
      pattern: "build-config.generated"
    - from: "src/helpers/ipcHandlers.js"
      to: "src/config/build-config.generated.cjs"
      via: "require() (CommonJS)"
      pattern: "build-config.generated"
---

<objective>
Wave 2 — auth cluster consolidation. Replace the three duplicated `https://auth.openwhispr.com` hardcodes (rows 1-3 in CONFIG_INVENTORY), the BACKEND_URL pattern at `main.js:716` (rows 4 + 5), the desktop-callback URL at `src/lib/auth.ts:171` (row 7), and the reset-password URL at `src/lib/auth.ts:201` (row 14) with imports from the Phase 3 build-config artifacts.

**Revision note (iteration 1):** Per Blocker 1, row 5 now reads `OPENWHISPR_BACKEND_URL_PATTERN` (separate env var, default `"https://api.openwhispr.com/*"`) — eliminates the inline parity literal. Per Blocker 2, main process and CJS helpers `require("./src/config/build-config.generated.cjs")` (frozen CJS module emitted by Plan 1 generator). No tsc step needed.

Per D-05 (CONTEXT.md): the existing `process.env.AUTH_URL || process.env.VITE_AUTH_URL || ... || literal` chains in `main.js:482-486` and `src/helpers/ipcHandlers.js:3326-3336` collapse into a single require from build-config.generated.cjs.

Output: src/lib/auth.ts, main.js, and src/helpers/ipcHandlers.js with zero auth/api/desktop-callback/reset-password URL literals.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/03-build-time-env-refactor/03-CONTEXT.md
@.planning/phases/03-build-time-env-refactor/03-RESEARCH.md
@docs/CONFIG_INVENTORY.md
@.planning/phases/03-build-time-env-refactor/03-01-defaults-source-of-truth-PLAN.md

<interfaces>
After Plan 1:
  Renderer (TS): import { OPENWHISPR_AUTH_URL, ... } from "@/config/defaults";
  Main / CJS:    const { OPENWHISPR_AUTH_URL, OPENWHISPR_BACKEND_URL, OPENWHISPR_BACKEND_URL_PATTERN } = require("./src/config/build-config.generated.cjs");

The .cjs module is a frozen object emitted by scripts/generate-build-config.js at prebuild/predev. The .ts module (defaults.ts) is RENDERER-ONLY.

CONFIG_INVENTORY rows handled by this plan:
  Row 1: src/lib/auth.ts:5         "https://auth.openwhispr.com"               → OPENWHISPR_AUTH_URL (defaults.ts)
  Row 2: main.js:485               "https://auth.openwhispr.com"               → OPENWHISPR_AUTH_URL (build-config.generated.cjs)
  Row 3: src/helpers/ipcHandlers.js:3336 "https://auth.openwhispr.com"         → OPENWHISPR_AUTH_URL (build-config.generated.cjs)
  Row 4: main.js:715               "https://auth.openwhispr.com/*"             → `${OPENWHISPR_AUTH_URL}/*` (template, normalized)
  Row 5: main.js:716               "https://api.openwhispr.com/*"              → OPENWHISPR_BACKEND_URL_PATTERN (build-config.generated.cjs)
  Row 7: src/lib/auth.ts:171       "https://openwhispr.com/auth/desktop-callback" → OPENWHISPR_OAUTH_DESKTOP_CALLBACK_URL (defaults.ts)
  Row 14: src/lib/auth.ts:201      "https://openwhispr.com/reset-password"     → OPENWHISPR_OAUTH_RESET_PASSWORD_URL (defaults.ts)

Relative path from main.js to .cjs: `./src/config/build-config.generated.cjs`
Relative path from src/helpers/ipcHandlers.js to .cjs: `../config/build-config.generated.cjs`

Note: src/helpers/googleCalendarOAuth.js:11 (row 8 — same desktop-callback URL) is handled by Plan 4.
Note: src/config/constants.ts:116 (row 6 — VITE_OPENWHISPR_API_URL "" empty default) is handled by Plan 5.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Refactor src/lib/auth.ts (rows 1, 7, 14)</name>
  <files>src/lib/auth.ts</files>
  <read_first>
    - src/lib/auth.ts (full file — confirm line numbers 5, 171, 184, 201, 109, 114)
    - src/config/defaults.ts (confirm exports)
    - docs/CONFIG_INVENTORY.md (rows 1, 7, 14)
  </read_first>
  <action>
    1. At top of `src/lib/auth.ts`, add: `import { OPENWHISPR_AUTH_URL, OPENWHISPR_OAUTH_DESKTOP_CALLBACK_URL, OPENWHISPR_OAUTH_RESET_PASSWORD_URL } from "@/config/defaults";` (use the same import-style as existing imports — `@/` alias if used elsewhere, otherwise relative path).
    2. Line 5 (`AUTH_BASE_URL` const): replace `import.meta.env.VITE_AUTH_URL || "https://auth.openwhispr.com"` with `OPENWHISPR_AUTH_URL`. The named export from defaults.ts already encapsulates the env-fallback chain.
    3. Line 171 (`DESKTOP_OAUTH_CALLBACK_URL` const): replace the literal `"https://openwhispr.com/auth/desktop-callback"` with `OPENWHISPR_OAUTH_DESKTOP_CALLBACK_URL`. Remove any `import.meta.env.VITE_*` fallback chain at this line.
    4. Line 201 (`requestPasswordReset` redirect URL): replace literal `"https://openwhispr.com/reset-password"` with `OPENWHISPR_OAUTH_RESET_PASSWORD_URL`.
    5. DO NOT change line 109 / line 114 logic that uses `OPENWHISPR_API_URL` (constants.ts:116 / row 6) — Plan 5 handles that.
    6. Run `grep -nF "auth.openwhispr.com" src/lib/auth.ts` — must return zero matches. Run `grep -nF "openwhispr.com/auth/desktop-callback" src/lib/auth.ts` — must return zero matches. Run `grep -nF "openwhispr.com/reset-password" src/lib/auth.ts` — must return zero matches.
  </action>
  <verify>
    <automated>test "$(grep -cF 'auth.openwhispr.com' src/lib/auth.ts)" = "0" &amp;&amp; test "$(grep -cF 'openwhispr.com/auth/desktop-callback' src/lib/auth.ts)" = "0" &amp;&amp; test "$(grep -cF 'openwhispr.com/reset-password' src/lib/auth.ts)" = "0" &amp;&amp; grep -q "from .*config/defaults" src/lib/auth.ts &amp;&amp; npx tsc --noEmit -p src/tsconfig.json 2>&amp;1 | grep -E "auth\.ts" | grep -v "^$" &amp;&amp; exit 1; exit 0</automated>
  </verify>
  <acceptance_criteria>
    - `grep -cF "auth.openwhispr.com" src/lib/auth.ts` outputs `0`.
    - `grep -cF "openwhispr.com/auth/desktop-callback" src/lib/auth.ts` outputs `0`.
    - `grep -cF "openwhispr.com/reset-password" src/lib/auth.ts` outputs `0`.
    - `src/lib/auth.ts` contains a line matching `from ["'].*config/defaults["']`.
    - `npx tsc --noEmit -p src/tsconfig.json` produces no errors referencing `src/lib/auth.ts`.
  </acceptance_criteria>
  <done>auth.ts imports three constants from defaults.ts; zero literal URL strings remain.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Refactor main.js (rows 2, 4, 5) — uses OPENWHISPR_BACKEND_URL_PATTERN, no inline literal</name>
  <files>main.js</files>
  <read_first>
    - main.js (lines 480-490 for resolveAuthUrl, lines 710-730 for webRequest patterns; confirm exact line numbers)
    - src/config/build-config.generated.cjs (must exist after Plan 1 ran — produced by `node scripts/generate-build-config.js`)
    - docs/CONFIG_INVENTORY.md (rows 2, 4, 5)
    - .planning/phases/03-build-time-env-refactor/03-RESEARCH.md (§Refactor partitioning — Row 5 webRequest pattern note)
  </read_first>
  <action>
    main.js is CommonJS-loaded at runtime by Electron. It MUST `require()` the generated `.cjs` module (no tsc step exists in this repo — Vite emits renderer assets only). At top of `main.js`, after existing requires, add:

    ```js
    const {
      OPENWHISPR_AUTH_URL,
      OPENWHISPR_BACKEND_URL,
      OPENWHISPR_BACKEND_URL_PATTERN,
    } = require("./src/config/build-config.generated.cjs");
    ```

    Path note: from project root (where `main.js` lives), the relative path to the generated CJS file is `./src/config/build-config.generated.cjs`. The file is gitignored but produced by `npm run prebuild` / `npm run predev` (wired in Plan 1 Task 1). If running `node main.js` directly without prebuild, the file will be missing — document this requirement in the SUMMARY.

    1. Row 2 — `resolveAuthUrl()` at line ~485: replace the multi-tier fallback chain `process.env.AUTH_URL || process.env.VITE_AUTH_URL || runtimeEnv.VITE_AUTH_URL || "https://auth.openwhispr.com"` with simply `OPENWHISPR_AUTH_URL`. Delete the now-unused `runtimeEnv` lookups for `VITE_AUTH_URL` (keep the `runtime-env.json` reading mechanism intact for any other keys it serves).
    2. Row 4 — `webRequest.onBeforeSendHeaders` URL pattern at line ~715: replace `"https://auth.openwhispr.com/*"` with a normalized template. Define an inline helper `const ensureNoTrailingSlash = (u) => u.replace(/\/+$/, "");` and use `` `${ensureNoTrailingSlash(OPENWHISPR_AUTH_URL)}/*` ``.
    3. Row 5 — `webRequest.onBeforeSendHeaders` URL pattern at line ~716: replace `"https://api.openwhispr.com/*"` with `OPENWHISPR_BACKEND_URL_PATTERN` directly (no template construction — the value already includes the `/*` suffix per Plan 1 default `"https://api.openwhispr.com/*"`). Construct the urls list as:
       ```js
       const urls = [
         `${ensureNoTrailingSlash(OPENWHISPR_AUTH_URL)}/*`,
         OPENWHISPR_BACKEND_URL_PATTERN,
       ];
       ```
       This preserves byte-identical pre-refactor behavior (pattern always present with parity default) AND eliminates the inline `api.openwhispr.com` literal.
    4. After all changes, run `grep -nF "auth.openwhispr.com" main.js` — must return zero matches. Run `grep -nF "api.openwhispr.com" main.js` — must return zero matches (NO documented carve-out — the literal lives only in the generator's DEFAULTS table now).
  </action>
  <verify>
    <automated>test "$(grep -cF 'auth.openwhispr.com' main.js)" = "0" &amp;&amp; test "$(grep -cF 'api.openwhispr.com' main.js)" = "0" &amp;&amp; grep -q "build-config.generated.cjs" main.js &amp;&amp; grep -q "OPENWHISPR_BACKEND_URL_PATTERN" main.js &amp;&amp; node --check main.js</automated>
  </verify>
  <acceptance_criteria>
    - `grep -cF "auth.openwhispr.com" main.js` outputs `0`.
    - `grep -cF "api.openwhispr.com" main.js` outputs `0` (no carve-out, no documented exception).
    - main.js contains a `require("./src/config/build-config.generated.cjs")` (or equivalent path).
    - main.js destructures `OPENWHISPR_BACKEND_URL_PATTERN` from that require.
    - `node --check main.js` exits 0 (syntax valid).
    - `resolveAuthUrl()` no longer reads `process.env.AUTH_URL` / `process.env.VITE_AUTH_URL` (verify with `grep -E "process\.env\.(AUTH_URL|VITE_AUTH_URL)" main.js` returns 0 matches).
  </acceptance_criteria>
  <done>main.js requires from build-config.generated.cjs; zero auth/api literals remain; webRequest pattern reads OPENWHISPR_BACKEND_URL_PATTERN.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: Refactor src/helpers/ipcHandlers.js (row 3 + co-located getApiUrl)</name>
  <files>src/helpers/ipcHandlers.js</files>
  <read_first>
    - src/helpers/ipcHandlers.js (lines 3320-3340 for getAuthUrl/getApiUrl; confirm exact line numbers)
    - main.js (post-Task-2 — pattern to mirror)
    - docs/CONFIG_INVENTORY.md (row 3 + row 6 note about VITE_OPENWHISPR_API_URL at lines 3327-3330)
  </read_first>
  <action>
    1. At top of `src/helpers/ipcHandlers.js` (after existing requires), add: `const { OPENWHISPR_AUTH_URL, OPENWHISPR_BACKEND_URL } = require("../config/build-config.generated.cjs");`. Path is relative from `src/helpers/` up one level to `src/config/`.
    2. Replace the local `getAuthUrl()` function (around line 3320-3336) so it returns `OPENWHISPR_AUTH_URL` directly. Delete the multi-tier fallback chain (`process.env.AUTH_URL || process.env.VITE_AUTH_URL || runtimeEnv.VITE_AUTH_URL || "https://auth.openwhispr.com"`).
    3. Replace the local `getApiUrl()` function (around line 3327-3330) so it returns `OPENWHISPR_BACKEND_URL` directly (which may be empty per row 6 — preserve that semantic). Delete the multi-tier fallback chain.
    4. Keep the function names `getAuthUrl()` and `getApiUrl()` — now thin one-line returns. Add JSDoc comment on each: `// CONFIG_INVENTORY rows 3,6 — single-source-of-truth via src/config/build-config.generated.cjs`.
    5. Run `grep -nF "auth.openwhispr.com" src/helpers/ipcHandlers.js` — must return zero matches. The literal `"https://api.openwhispr.com"` if present at row 6 site (line ~3329) — also remove (BACKEND_URL default is empty per row 6).
    6. DO NOT touch `src/helpers/ipcHandlers.js:61` (Mistral URL), `:3589` (Groq URL), or `:2826` (Anthropic URL) — Plan 5 scope.
  </action>
  <verify>
    <automated>test "$(grep -cF 'auth.openwhispr.com' src/helpers/ipcHandlers.js)" = "0" &amp;&amp; grep -q "build-config.generated.cjs" src/helpers/ipcHandlers.js &amp;&amp; node --check src/helpers/ipcHandlers.js &amp;&amp; test "$(grep -cE 'process\.env\.(AUTH_URL|VITE_AUTH_URL|VITE_OPENWHISPR_API_URL|OPENWHISPR_API_URL)' src/helpers/ipcHandlers.js)" = "0"</automated>
  </verify>
  <acceptance_criteria>
    - `grep -cF "auth.openwhispr.com" src/helpers/ipcHandlers.js` outputs `0`.
    - `grep -cE "process\.env\.(AUTH_URL|VITE_AUTH_URL|VITE_OPENWHISPR_API_URL|OPENWHISPR_API_URL)" src/helpers/ipcHandlers.js` outputs `0`.
    - `src/helpers/ipcHandlers.js` contains `require("../config/build-config.generated.cjs")` (or equivalent).
    - `getAuthUrl()` is a one-line return of `OPENWHISPR_AUTH_URL`.
    - `getApiUrl()` is a one-line return of `OPENWHISPR_BACKEND_URL`.
    - `node --check src/helpers/ipcHandlers.js` exits 0.
  </acceptance_criteria>
  <done>ipcHandlers.js getAuthUrl/getApiUrl reduced to single-line returns from build-config.generated.cjs; zero auth literals remain.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Renderer → main IPC | `getAuthUrl()` / `getApiUrl()` outputs are sent across IPC; they must never include user-controlled fragments. |
| Build env → packaged binary | `OPENWHISPR_AUTH_URL` and `OPENWHISPR_BACKEND_URL_PATTERN` are baked into both renderer (via Vite define) and main (via generated `.cjs`) at build time. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-03-05 | Tampering | `webRequest.onBeforeSendHeaders` URL pattern | mitigate | The pattern uses build-time constants from frozen `.cjs` module; `ensureNoTrailingSlash` normalizes auth URL to prevent `//` malformed patterns. `OPENWHISPR_BACKEND_URL_PATTERN` is consumed verbatim (already includes `/*` suffix). |
| T-03-06 | Information Disclosure | resolveAuthUrl removing `process.env` fallback | accept | Four-tier chain collapsed to a single require; runtime `process.env.AUTH_URL` override capability is intentionally removed (CFG-02 forbids runtime reads). Build-time-only override via `OPENWHISPR_AUTH_URL`. |
| T-03-07 | Spoofing | Empty BACKEND_URL semantic preserved | mitigate | `OPENWHISPR_BACKEND_URL` empty default preserved (renderer opt-in semantic). `OPENWHISPR_BACKEND_URL_PATTERN` carries the parity URL for the webRequest filter — separation of concerns eliminates the inline-literal carve-out. |
</threat_model>

<verification>
After all 3 tasks:
- Three target files have zero `auth.openwhispr.com` literals.
- `src/lib/auth.ts` has zero `openwhispr.com/auth/desktop-callback` and zero `openwhispr.com/reset-password` literals.
- `main.js` has zero `api.openwhispr.com` literals (no documented exception).
- `src/lib/auth.ts` imports from `@/config/defaults`; `main.js` and `src/helpers/ipcHandlers.js` require from `build-config.generated.cjs`.
- `node --check main.js` and `node --check src/helpers/ipcHandlers.js` pass.
- `npx tsc --noEmit -p src/tsconfig.json` passes.
</verification>

<success_criteria>
All `must_haves.truths` observable; CFG-04 anchor (`OPENWHISPR_BACKEND_URL`) consumed at IPC `getApiUrl` site; new `OPENWHISPR_BACKEND_URL_PATTERN` consumed at main.js webRequest site without any inline parity literal.
</success_criteria>

<output>
After completion, create `.planning/phases/03-build-time-env-refactor/03-02-SUMMARY.md` documenting:
- Confirmation that `api.openwhispr.com` literal count in main.js is 0.
- Path resolution choice for the main.js / ipcHandlers.js requires.
</output>
