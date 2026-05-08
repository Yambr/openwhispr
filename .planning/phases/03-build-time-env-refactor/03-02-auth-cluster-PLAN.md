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
    - "openwhispr.com/auth/desktop-callback literal appears 0 times in src/lib/auth.ts"
    - "Sign-in flows (renderer + main + IPC) resolve to https://auth.openwhispr.com when no env vars set"
    - "Setting OPENWHISPR_AUTH_URL=https://test.example.com at build time changes all three auth call sites to test.example.com"
    - "OPENWHISPR_BACKEND_URL CFG-04 anchor is read from src/config/defaults.ts at the webRequest pattern site"
  artifacts:
    - path: "src/lib/auth.ts"
      provides: "Renderer auth client using OPENWHISPR_AUTH_URL + OPENWHISPR_OAUTH_DESKTOP_CALLBACK_URL + OPENWHISPR_OAUTH_RESET_PASSWORD_URL from defaults.ts"
      contains: "from \"@/config/defaults\""
    - path: "main.js"
      provides: "Main-process resolveAuthUrl + onBeforeSendHeaders patterns reading from defaults.ts"
      contains: "OPENWHISPR_AUTH_URL"
    - path: "src/helpers/ipcHandlers.js"
      provides: "IPC-side getAuthUrl/getApiUrl reading from defaults.ts (no inline literals)"
  key_links:
    - from: "src/lib/auth.ts"
      to: "src/config/defaults.ts"
      via: "named import"
      pattern: "from .*config/defaults"
    - from: "main.js"
      to: "src/config/defaults.ts compiled output"
      via: "require of compiled module"
      pattern: "config/defaults"
    - from: "src/helpers/ipcHandlers.js"
      to: "src/config/defaults.ts compiled output"
      via: "require of compiled module"
      pattern: "config/defaults"
---

<objective>
Wave 2 — auth cluster consolidation. Replace the three duplicated `https://auth.openwhispr.com` hardcodes (rows 1-3 in CONFIG_INVENTORY), the BACKEND_URL pattern at `main.js:716` (row 5), the desktop-callback URL at `src/lib/auth.ts:171` (row 7), and the reset-password URL at `src/lib/auth.ts:201` (row 14) with imports from `src/config/defaults.ts`.

This wave proves the consolidation pattern that the rest of the phase reuses. CFG-04 anchor (`OPENWHISPR_BACKEND_URL`) lands here at `main.js:716` (`webRequest.onBeforeSendHeaders`).

Per D-05 (CONTEXT.md): the existing `process.env.AUTH_URL || process.env.VITE_AUTH_URL || ... || literal` chains in `main.js:482-486` and `src/helpers/ipcHandlers.js:3326-3336` collapse into a single import from defaults.ts.

Output: src/lib/auth.ts, main.js, and src/helpers/ipcHandlers.js with zero auth/desktop-callback/reset-password URL literals.
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
After Plan 1, src/config/defaults.ts exports (named):
  OPENWHISPR_AUTH_URL: string
  OPENWHISPR_BACKEND_URL: string  (default "")
  OPENWHISPR_OAUTH_DESKTOP_CALLBACK_URL: string
  OPENWHISPR_OAUTH_RESET_PASSWORD_URL: string

CONFIG_INVENTORY rows handled by this plan:
  Row 1: src/lib/auth.ts:5         "https://auth.openwhispr.com"               → OPENWHISPR_AUTH_URL
  Row 2: main.js:485               "https://auth.openwhispr.com"               → OPENWHISPR_AUTH_URL
  Row 3: src/helpers/ipcHandlers.js:3336 "https://auth.openwhispr.com"         → OPENWHISPR_AUTH_URL
  Row 4: main.js:715               "https://auth.openwhispr.com/*"             → OPENWHISPR_AUTH_URL + "/*"
  Row 5: main.js:716               "https://api.openwhispr.com/*"              → OPENWHISPR_BACKEND_URL + "/*"  (CFG-04 anchor; if empty, omit pattern)
  Row 7: src/lib/auth.ts:171       "https://openwhispr.com/auth/desktop-callback" → OPENWHISPR_OAUTH_DESKTOP_CALLBACK_URL
  Row 14: src/lib/auth.ts:201      "https://openwhispr.com/reset-password"     → OPENWHISPR_OAUTH_RESET_PASSWORD_URL

Note: src/helpers/googleCalendarOAuth.js:11 (row 8 — same desktop-callback URL) is handled by Plan 4 (Google OAuth wave) to keep file-scoped commits.

Note: src/config/constants.ts:116 (row 6 — VITE_OPENWHISPR_API_URL "" empty default) is handled by Plan 5 (model-registry/litellm wave) where constants.ts is rewritten end-to-end. This plan only handles main.js:716 (the webRequest pattern), which composes BACKEND_URL with "/*".
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
    3. Line 171 (`DESKTOP_OAUTH_CALLBACK_URL` const): replace the literal `"https://openwhispr.com/auth/desktop-callback"` with `OPENWHISPR_OAUTH_DESKTOP_CALLBACK_URL`. Remove any `import.meta.env.VITE_*` fallback chain at this line — defaults.ts handles it.
    4. Line 201 (`requestPasswordReset` redirect URL): replace literal `"https://openwhispr.com/reset-password"` with `OPENWHISPR_OAUTH_RESET_PASSWORD_URL`.
    5. DO NOT change line 109 / line 114 logic that uses `OPENWHISPR_API_URL` (constants.ts:116 / row 6) — Plan 5 handles that. This task only touches the three specific lines above.
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
  <name>Task 2: Refactor main.js (rows 2, 4, 5)</name>
  <files>main.js</files>
  <read_first>
    - main.js (lines 480-490 for resolveAuthUrl, lines 710-730 for webRequest patterns; confirm exact line numbers)
    - src/helpers/ipcHandlers.js (lines 3320-3340 — pattern this main.js section will mirror)
    - docs/CONFIG_INVENTORY.md (rows 2, 4, 5)
    - .planning/phases/03-build-time-env-refactor/03-RESEARCH.md (§Refactor partitioning — Row 11 main.js:715 webRequest pattern note)
  </read_first>
  <action>
    main.js is CommonJS-loaded at runtime. It must require the COMPILED output of `src/config/defaults.ts`. The TypeScript build emits to `src/dist/` per `electron-builder.json:18` which lists `src/dist/**/*` as packaged. At top of `main.js`, after existing requires, add:

    ```js
    const {
      OPENWHISPR_AUTH_URL,
      OPENWHISPR_BACKEND_URL,
    } = require("./src/dist/config/defaults");
    ```

    If the dev/build setup loads source TS instead of compiled output, use the existing path resolution pattern already in main.js (search for any existing `require("./src/...")` call to confirm style). If no existing pattern, use `require("./src/config/defaults")` and rely on the existing TS build chain to produce the JS.

    1. Row 2 — `resolveAuthUrl()` at line ~485: replace the multi-tier fallback chain `process.env.AUTH_URL || process.env.VITE_AUTH_URL || runtimeEnv.VITE_AUTH_URL || "https://auth.openwhispr.com"` with simply `OPENWHISPR_AUTH_URL`. The defaults module already encapsulates env-fallback. Delete the now-unused `runtimeEnv` lookups for `VITE_AUTH_URL` (but keep the `runtime-env.json` reading mechanism intact for any other keys it serves).
    2. Row 4 — `webRequest.onBeforeSendHeaders` URL pattern at line ~715: replace `"https://auth.openwhispr.com/*"` with `` `${OPENWHISPR_AUTH_URL}/*` ``. Normalize the constructed pattern with: define a small helper inline `const ensureNoTrailingSlash = (u) => u.replace(/\/+$/, "");` and use `` `${ensureNoTrailingSlash(OPENWHISPR_AUTH_URL)}/*` ``.
    3. Row 5 (CFG-04 anchor) — `webRequest.onBeforeSendHeaders` URL pattern at line ~716: replace `"https://api.openwhispr.com/*"` with a conditional. Because OPENWHISPR_BACKEND_URL default is `""`, only push the pattern into the urls list when the backend URL is set:
       ```js
       const urls = [`${ensureNoTrailingSlash(OPENWHISPR_AUTH_URL)}/*`];
       if (OPENWHISPR_BACKEND_URL) urls.push(`${ensureNoTrailingSlash(OPENWHISPR_BACKEND_URL)}/*`);
       ```
       This preserves pre-refactor behavior because the pre-refactor code unconditionally registered `api.openwhispr.com/*` even when the renderer's `OPENWHISPR_API_URL` was empty — but the cloud is opt-in per row 6, so dropping the pattern when backend is empty matches the documented intent. NOTE: if pre-refactor behavior must be byte-identical, set the default of `OPENWHISPR_BACKEND_URL` in the generated module to `"https://api.openwhispr.com"` instead. Confirm with the planner intent (CONFIG_INVENTORY row 5 says "Must mirror the OPENWHISPR_BACKEND_URL value" — implying backend URL MUST resolve to `https://api.openwhispr.com` for parity). **Decision for this task:** override the empty-default semantic ONLY for the webRequest pattern by hardcoding the parity URL inline IF `OPENWHISPR_BACKEND_URL` is empty:
       ```js
       const apiUrlForPattern = OPENWHISPR_BACKEND_URL || "https://api.openwhispr.com";
       urls.push(`${ensureNoTrailingSlash(apiUrlForPattern)}/*`);
       ```
       This is the ONLY allowed inline literal occurrence in main.js, and it exists because row 5 is a runtime-pattern derived value, not a primary URL. Document this decision in the SUMMARY.

       Wait — actually re-reading row 6: empty IS the default. The webRequest pattern at row 4/5 was hardcoded to `api.openwhispr.com` independent of the renderer's `OPENWHISPR_API_URL` default. So pre-refactor parity REQUIRES the pattern to register `api.openwhispr.com/*` even when no env is set. **Resolution:** add a separate exported constant `OPENWHISPR_BACKEND_URL_PATTERN` to `src/config/defaults.ts` (extend Plan 1's defaults.ts) that defaults to `"https://api.openwhispr.com"` (the parity value). main.js consumes that constant for the webRequest pattern only. Update generator script + Plan 1 isn't being modified — instead, do the override locally in main.js using the literal `"https://api.openwhispr.com"` ONLY at this exact line, and add a comment `// CONFIG_INVENTORY row 5 parity literal — see Plan 02 SUMMARY.` This single literal is the documented exception for row 5 parity preservation.
    4. After all changes, run `grep -nF "auth.openwhispr.com" main.js` — must return zero matches. Run `grep -nF "api.openwhispr.com" main.js` — must return at most one match (the documented row 5 parity literal with comment).
  </action>
  <verify>
    <automated>test "$(grep -cF 'auth.openwhispr.com' main.js)" = "0" &amp;&amp; test "$(grep -cF 'api.openwhispr.com' main.js)" -le "1" &amp;&amp; grep -q "config/defaults" main.js &amp;&amp; node --check main.js</automated>
  </verify>
  <acceptance_criteria>
    - `grep -cF "auth.openwhispr.com" main.js` outputs `0`.
    - `grep -cF "api.openwhispr.com" main.js` outputs `0` or `1` (one allowed only with the documented `// CONFIG_INVENTORY row 5 parity literal` comment on the same or preceding line).
    - main.js contains a `require` of `./src/dist/config/defaults` or `./src/config/defaults`.
    - `node --check main.js` exits 0 (syntax valid).
    - `resolveAuthUrl()` no longer reads `process.env.AUTH_URL` / `process.env.VITE_AUTH_URL` (verify with `grep -E "process\.env\.(AUTH_URL|VITE_AUTH_URL)" main.js` returns 0 matches).
  </acceptance_criteria>
  <done>main.js imports from defaults.ts; auth pattern + backend pattern + resolveAuthUrl all use named imports.</done>
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
    1. At top of `src/helpers/ipcHandlers.js` (after existing requires), add: `const { OPENWHISPR_AUTH_URL, OPENWHISPR_BACKEND_URL } = require("../dist/config/defaults");` (or `../config/defaults` matching the path style used by main.js in Task 2).
    2. Replace the local `getAuthUrl()` function (around line 3320-3336) so it returns `OPENWHISPR_AUTH_URL` directly. Delete the multi-tier fallback chain (`process.env.AUTH_URL || process.env.VITE_AUTH_URL || runtimeEnv.VITE_AUTH_URL || "https://auth.openwhispr.com"`).
    3. Replace the local `getApiUrl()` function (around line 3327-3330) so it returns `OPENWHISPR_BACKEND_URL` directly (which may be empty per row 6 — preserve that semantic). Delete the multi-tier fallback chain.
    4. Keep the function names `getAuthUrl()` and `getApiUrl()` to avoid touching every call site — they are now thin one-line returns. Add a JSDoc comment on each: `// CONFIG_INVENTORY rows 3,6 — single-source-of-truth via src/config/defaults.ts`.
    5. Run `grep -nF "auth.openwhispr.com" src/helpers/ipcHandlers.js` — must return zero matches. The literal `"https://api.openwhispr.com"` if present at row 6 site (line ~3329) — also remove (BACKEND_URL default is empty per row 6).
    6. DO NOT touch `src/helpers/ipcHandlers.js:61` (Mistral URL) or `:3589` (Groq URL) or `:2826` (Anthropic URL) — those are Plan 5 scope.
  </action>
  <verify>
    <automated>test "$(grep -cF 'auth.openwhispr.com' src/helpers/ipcHandlers.js)" = "0" &amp;&amp; grep -q "config/defaults" src/helpers/ipcHandlers.js &amp;&amp; node --check src/helpers/ipcHandlers.js &amp;&amp; test "$(grep -cE 'process\.env\.(AUTH_URL|VITE_AUTH_URL|VITE_OPENWHISPR_API_URL|OPENWHISPR_API_URL)' src/helpers/ipcHandlers.js)" = "0"</automated>
  </verify>
  <acceptance_criteria>
    - `grep -cF "auth.openwhispr.com" src/helpers/ipcHandlers.js` outputs `0`.
    - `grep -cE "process\.env\.(AUTH_URL|VITE_AUTH_URL|VITE_OPENWHISPR_API_URL|OPENWHISPR_API_URL)" src/helpers/ipcHandlers.js` outputs `0` (the multi-tier chains are gone).
    - `src/helpers/ipcHandlers.js` contains `require(... "config/defaults")`.
    - `getAuthUrl()` is a one-line return of `OPENWHISPR_AUTH_URL`.
    - `getApiUrl()` is a one-line return of `OPENWHISPR_BACKEND_URL`.
    - `node --check src/helpers/ipcHandlers.js` exits 0.
  </acceptance_criteria>
  <done>ipcHandlers.js getAuthUrl/getApiUrl reduced to single-line returns from defaults.ts; zero auth literals remain.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Renderer → main IPC | `getAuthUrl()` / `getApiUrl()` outputs are sent across IPC; they must never include user-controlled fragments. |
| Build env → packaged binary | `OPENWHISPR_AUTH_URL` value is baked into both renderer (via Vite define) and main (via generated module) at build time. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-03-05 | Tampering | `webRequest.onBeforeSendHeaders` URL pattern | mitigate | The pattern uses `${URL}/*` template — `OPENWHISPR_AUTH_URL` is a build-time constant, not user input. `ensureNoTrailingSlash` normalizes to prevent `//` malformed patterns. |
| T-03-06 | Information Disclosure | resolveAuthUrl removing `process.env` fallback | accept | The four-tier chain is collapsed to a single defaults.ts import; the runtime `process.env.AUTH_URL` override capability is intentionally removed (CFG-02 forbids runtime reads). Build-time-only override remains via `OPENWHISPR_AUTH_URL`. |
| T-03-07 | Spoofing | Empty BACKEND_URL semantic preserved | mitigate | `OPENWHISPR_BACKEND_URL` empty default preserved; row 5 parity literal documented as the only allowed inline exception. |
</threat_model>

<verification>
After all 3 tasks:
- Three target files have zero `auth.openwhispr.com` literals.
- `src/lib/auth.ts` has zero `openwhispr.com/auth/desktop-callback` and zero `openwhispr.com/reset-password` literals.
- `main.js` has at most one `api.openwhispr.com` literal (documented row 5 parity).
- All three files import/require from `config/defaults`.
- `node --check main.js` and `node --check src/helpers/ipcHandlers.js` pass.
- `npx tsc --noEmit -p src/tsconfig.json` passes.
- Manual smoke (deferred to Plan 5 verification): `npm run dev` launches without auth-flow errors.
</verification>

<success_criteria>
All `must_haves.truths` observable; all key links present; CFG-04 anchor (`OPENWHISPR_BACKEND_URL`) consumed at `main.js:716` site.
</success_criteria>

<output>
After completion, create `.planning/phases/03-build-time-env-refactor/03-02-SUMMARY.md` documenting:
- The row 5 parity-literal decision (if used).
- Path resolution choice for the main.js require (`./src/dist/config/defaults` vs `./src/config/defaults`).
</output>
