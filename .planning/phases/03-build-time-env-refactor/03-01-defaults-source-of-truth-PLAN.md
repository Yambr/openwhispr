---
phase: 03-build-time-env-refactor
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - src/config/defaults.ts
  - src/config/build-config.generated.ts
  - src/config/build-config.generated.cjs
  - scripts/generate-build-config.js
  - src/types/build-env.d.ts
  - src/vite.config.mjs
  - .gitignore
  - package.json
autonomous: true
requirements: [CFG-02, CFG-04]

must_haves:
  truths:
    - "src/config/defaults.ts exists and exports every URL/scheme literal listed in CONFIG_INVENTORY (renderer-only module)"
    - "Renderer reads build-time values via import.meta.env.VITE_OPENWHISPR_* (Vite define) flowing through src/config/defaults.ts"
    - "Main process reads build-time values via the generated CommonJS module src/config/build-config.generated.cjs (no tsc step required)"
    - "Generator emits BOTH src/config/build-config.generated.ts (renderer-side TS) AND src/config/build-config.generated.cjs (main-side CJS) at prebuild/predev time"
    - "Default build with no env vars resolves every named export to the pre-refactor literal — including OPENWHISPR_BACKEND_URL_PATTERN = 'https://api.openwhispr.com/*'"
    - "Generator emits OPENWHISPR_OAUTH_PROTOCOL_SCHEME_OVERRIDDEN: boolean reflecting whether process.env.OPENWHISPR_OAUTH_PROTOCOL_SCHEME was set at build time"
    - "TypeScript compiles src/config/defaults.ts without errors"
  artifacts:
    - path: "src/config/defaults.ts"
      provides: "RENDERER-ONLY single-source-of-truth named exports for every CONFIG_INVENTORY default URL/scheme. Main process MUST NOT import this file — main imports build-config.generated.cjs directly."
      contains: "export const OPENWHISPR_AUTH_URL"
    - path: "src/config/build-config.generated.ts"
      provides: "Frozen build-time literals for renderer (gitignored, produced by prebuild)"
      contains: "AUTO-GENERATED"
    - path: "src/config/build-config.generated.cjs"
      provides: "Frozen build-time literals for main process — plain CommonJS module with module.exports = Object.freeze({...}) (gitignored, produced by prebuild)"
      contains: "AUTO-GENERATED"
    - path: "scripts/generate-build-config.js"
      provides: "Prebuild script that reads process.env.OPENWHISPR_* and emits BOTH the .ts and .cjs generated modules"
    - path: "src/types/build-env.d.ts"
      provides: "ImportMetaEnv augmentation for new VITE_OPENWHISPR_* keys"
      contains: "interface ImportMetaEnv"
    - path: "src/vite.config.mjs"
      provides: "Extended Vite define block injecting VITE_OPENWHISPR_* values"
      contains: "VITE_OPENWHISPR_BACKEND_URL"
  key_links:
    - from: "src/vite.config.mjs"
      to: "src/config/defaults.ts"
      via: "import.meta.env.VITE_OPENWHISPR_* literal substitution"
      pattern: "VITE_OPENWHISPR_"
    - from: "scripts/generate-build-config.js"
      to: "src/config/build-config.generated.{ts,cjs}"
      via: "writeFileSync emitting literal exports + frozen object"
      pattern: "AUTO-GENERATED"
    - from: "main.js + src/helpers/*.js (CommonJS)"
      to: "src/config/build-config.generated.cjs"
      via: "require()"
      pattern: "build-config.generated.cjs"
    - from: "src/config/defaults.ts"
      to: "src/config/build-config.generated.ts"
      via: "import * as Generated"
      pattern: "build-config.generated"
---

<objective>
Establish the foundation for the Phase 3 refactor: a renderer-side single source of truth (`src/config/defaults.ts`), a generator (`scripts/generate-build-config.js`) that emits TWO frozen modules — `src/config/build-config.generated.ts` (renderer/TS consumers) and `src/config/build-config.generated.cjs` (main-process CJS consumers) — TypeScript ambient types, and an extended Vite `define` block for renderer-side substitution.

Per D-01, D-03, D-04 (CONTEXT.md): defaults must work with no env vars set; renderer uses `import.meta.env.VITE_OPENWHISPR_*`; main reads only the generated `.cjs` module (not `process.env` at runtime).

**Revision note (iteration 1):** Splits CFG-04 into TWO env vars (`OPENWHISPR_BACKEND_URL` opt-in default `""`, `OPENWHISPR_BACKEND_URL_PATTERN` parity default `"https://api.openwhispr.com/*"`) to fix Blocker 1. Emits `.cjs` for main process to fix Blocker 2 (no tsc emit step exists). Adds `OPENWHISPR_OAUTH_PROTOCOL_SCHEME_OVERRIDDEN` boolean to fix Blocker 3 (no string-compare detection). Drops fragile `import.meta` typeof branch from `defaults.ts` (Warning 4) — main process never imports defaults.ts directly.

Purpose: every subsequent plan (waves 2–5) imports from `src/config/defaults.ts` (renderer) or `require("./src/config/build-config.generated.cjs")` (main).
Output: `src/config/defaults.ts`, `scripts/generate-build-config.js`, `src/config/build-config.generated.ts`, `src/config/build-config.generated.cjs` (both gitignored), `src/types/build-env.d.ts`, extended `src/vite.config.mjs`, `.gitignore` entries, `package.json` `prebuild`/`predev` hooks.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/03-build-time-env-refactor/03-CONTEXT.md
@.planning/phases/03-build-time-env-refactor/03-RESEARCH.md
@docs/CONFIG_INVENTORY.md
@src/vite.config.mjs
@src/config/constants.ts

<interfaces>
Existing pattern (src/config/constants.ts:46-69): `computeBaseUrl` reads env then literal.
Existing Vite define (src/vite.config.mjs:38-39): `VITE_AUTH_URL`, `VITE_OPENWHISPR_API_URL` already wired.
Existing renderer consumption (src/lib/auth.ts:5): `import.meta.env.VITE_AUTH_URL || "https://auth.openwhispr.com"`.

Logical env-var names with defaults (16 string keys + 1 derived boolean = 17 emitted entries):
  OPENWHISPR_AUTH_URL                       default: "https://auth.openwhispr.com"
  OPENWHISPR_BACKEND_URL                    default: ""  (opt-in semantic; row 6 / CFG-04 anchor)
  OPENWHISPR_BACKEND_URL_PATTERN            default: "https://api.openwhispr.com/*"  (webRequest pattern; row 5 — distinct from BACKEND_URL)
  OPENWHISPR_OAUTH_DESKTOP_CALLBACK_URL     default: "https://openwhispr.com/auth/desktop-callback"
  OPENWHISPR_MCP_URL                        default: "https://mcp.openwhispr.com/mcp"
  OPENWHISPR_OAUTH_GOOGLE_AUTH_URL          default: "https://accounts.google.com/o/oauth2/v2/auth"
  OPENWHISPR_OAUTH_GOOGLE_TOKEN_URL         default: "https://oauth2.googleapis.com/token"
  OPENWHISPR_OAUTH_GOOGLE_REVOKE_URL        default: "https://oauth2.googleapis.com/revoke"
  OPENWHISPR_OAUTH_GOOGLE_CALENDAR_API_URL  default: "https://www.googleapis.com/calendar/v3"
  OPENWHISPR_OAUTH_RESET_PASSWORD_URL       default: "https://openwhispr.com/reset-password"
  OPENWHISPR_OAUTH_PROTOCOL_SCHEME          default: "openwhispr"
  OPENWHISPR_OPENAI_BASE_URL                default: "https://api.openai.com/v1"
  OPENWHISPR_ANTHROPIC_URL                  default: "https://api.anthropic.com/v1/messages"
  OPENWHISPR_GEMINI_BASE_URL                default: "https://generativelanguage.googleapis.com/v1beta"
  OPENWHISPR_GROQ_BASE_URL                  default: "https://api.groq.com/openai/v1"
  OPENWHISPR_MISTRAL_BASE_URL               default: "https://api.mistral.ai/v1"
  OPENWHISPR_OAUTH_PROTOCOL_SCHEME_OVERRIDDEN  derived boolean: true iff process.env.OPENWHISPR_OAUTH_PROTOCOL_SCHEME was set at generator-run time

Rationale for BACKEND_URL_PATTERN split: CONFIG_INVENTORY row 5 (`main.js:716` webRequest pattern, currently `https://api.openwhispr.com/*`) and row 6 (`constants.ts:116`, currently `""`) demand contradictory defaults from a single key. Splitting into two distinct keys preserves both behaviors with zero inline literal carve-out in main.js, and keeps SC#1 ("zero occurrences of the former hardcoded value outside defaults/generator") true.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Create generator script + BOTH generated modules + .gitignore entries</name>
  <files>scripts/generate-build-config.js, src/config/build-config.generated.ts, src/config/build-config.generated.cjs, .gitignore, package.json</files>
  <read_first>
    - .planning/phases/03-build-time-env-refactor/03-RESEARCH.md (§Decision: Main-process build-time injection mechanism)
    - docs/CONFIG_INVENTORY.md (full table — all 23 rows)
    - .gitignore (existing entries)
    - package.json (scripts section, find existing `prebuild` hooks)
  </read_first>
  <action>
    Create `scripts/generate-build-config.js` (CommonJS Node script). It MUST:
    1. Define a `DEFAULTS` object containing all 16 logical string env-var keys with their defaults from the `<interfaces>` block above. The 16 keys are: OPENWHISPR_AUTH_URL, OPENWHISPR_BACKEND_URL (default `""`), OPENWHISPR_BACKEND_URL_PATTERN (default `"https://api.openwhispr.com/*"`), OPENWHISPR_OAUTH_DESKTOP_CALLBACK_URL, OPENWHISPR_MCP_URL, OPENWHISPR_OAUTH_GOOGLE_AUTH_URL, OPENWHISPR_OAUTH_GOOGLE_TOKEN_URL, OPENWHISPR_OAUTH_GOOGLE_REVOKE_URL, OPENWHISPR_OAUTH_GOOGLE_CALENDAR_API_URL, OPENWHISPR_OAUTH_RESET_PASSWORD_URL, OPENWHISPR_OAUTH_PROTOCOL_SCHEME, OPENWHISPR_OPENAI_BASE_URL, OPENWHISPR_ANTHROPIC_URL, OPENWHISPR_GEMINI_BASE_URL, OPENWHISPR_GROQ_BASE_URL, OPENWHISPR_MISTRAL_BASE_URL.
    2. For each string key, resolve `process.env[key] ?? DEFAULTS[key]`. Empty string is a valid resolved value (DO NOT coerce empty to default for OPENWHISPR_BACKEND_URL — empty is the intended default per CONFIG_INVENTORY row 6).
    3. Compute `OPENWHISPR_OAUTH_PROTOCOL_SCHEME_OVERRIDDEN = Object.prototype.hasOwnProperty.call(process.env, "OPENWHISPR_OAUTH_PROTOCOL_SCHEME")`. (Use `hasOwnProperty` rather than truthy check so an explicit empty string still counts as "set".) This boolean is consumed by Plan 3 Task 2 to decide whether the env override beats the channel map — replaces the fragile string-compare-to-default approach.
    4. Emit `src/config/build-config.generated.ts` with header `// AUTO-GENERATED — do not edit. Produced by scripts/generate-build-config.js at build time.` followed by one `export const KEY = ${JSON.stringify(value)};` line per string key, plus `export const OPENWHISPR_OAUTH_PROTOCOL_SCHEME_OVERRIDDEN = ${JSON.stringify(boolean)};`.
    5. Emit `src/config/build-config.generated.cjs` (plain CommonJS) with the same header comment, then a single `module.exports = Object.freeze({ KEY: value, ..., OPENWHISPR_OAUTH_PROTOCOL_SCHEME_OVERRIDDEN: bool });` literal. Use `JSON.stringify` for value serialization. The frozen object prevents accidental mutation by main-process consumers.
    6. Log `[build-config] wrote src/config/build-config.generated.{ts,cjs} (16 string keys + 1 boolean)` to stdout on success.

    Add to `.gitignore` under a new `# Build-time generated config (Phase 3)` comment block — TWO lines:
    ```
    src/config/build-config.generated.ts
    src/config/build-config.generated.cjs
    ```

    In `package.json`, add a `prebuild` script that runs `node scripts/generate-build-config.js`. If `prebuild` exists, append the new command using `&&` so existing prebuild steps still run first. Also add a `predev` script that runs the same generator. If `predev` exists, append with `&&`.

    Run `node scripts/generate-build-config.js` once now to produce the initial generated files (so subsequent tasks/imports work).
  </action>
  <verify>
    <automated>node scripts/generate-build-config.js &amp;&amp; test -f src/config/build-config.generated.ts &amp;&amp; test -f src/config/build-config.generated.cjs &amp;&amp; grep -c "^export const OPENWHISPR_" src/config/build-config.generated.ts | grep -qE "^(16|17)$" &amp;&amp; node -e "const m=require('./src/config/build-config.generated.cjs'); if(m.OPENWHISPR_BACKEND_URL!==''||m.OPENWHISPR_BACKEND_URL_PATTERN!=='https://api.openwhispr.com/*'||typeof m.OPENWHISPR_OAUTH_PROTOCOL_SCHEME_OVERRIDDEN!=='boolean'||!Object.isFrozen(m)) process.exit(1)" &amp;&amp; grep -q "build-config.generated.ts" .gitignore &amp;&amp; grep -q "build-config.generated.cjs" .gitignore &amp;&amp; node -e "const p=require('./package.json'); if(!p.scripts.prebuild || !p.scripts.prebuild.includes('generate-build-config')) process.exit(1)"</automated>
  </verify>
  <acceptance_criteria>
    - `scripts/generate-build-config.js` exists and runs via `node`.
    - Running it produces BOTH `src/config/build-config.generated.ts` (16 `export const` URL/scheme lines + 1 boolean export) AND `src/config/build-config.generated.cjs` (frozen `module.exports` object).
    - `.cjs` module: `require()` returns frozen object containing all 16 string keys plus `OPENWHISPR_OAUTH_PROTOCOL_SCHEME_OVERRIDDEN` boolean.
    - With no env vars: `OPENWHISPR_BACKEND_URL === ""`, `OPENWHISPR_BACKEND_URL_PATTERN === "https://api.openwhispr.com/*"`, `OPENWHISPR_AUTH_URL === "https://auth.openwhispr.com"`, `OPENWHISPR_OAUTH_PROTOCOL_SCHEME_OVERRIDDEN === false`.
    - With `OPENWHISPR_OAUTH_PROTOCOL_SCHEME=openwhispr` set explicitly, `OPENWHISPR_OAUTH_PROTOCOL_SCHEME_OVERRIDDEN === true` (proves no false-negative on default-value-as-explicit-set).
    - `.gitignore` contains BOTH `build-config.generated.ts` and `build-config.generated.cjs`.
    - `package.json` `scripts.prebuild` and `scripts.predev` both contain `generate-build-config`.
  </acceptance_criteria>
  <done>Generator emits both TS and CJS modules; both gitignored; package.json hooks wired; override boolean correctly tracks env-set state.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Create src/config/defaults.ts (RENDERER-ONLY single source of truth) + TypeScript ambient types</name>
  <files>src/config/defaults.ts, src/types/build-env.d.ts</files>
  <read_first>
    - src/config/build-config.generated.ts (produced by Task 1)
    - src/config/constants.ts (lines 46-125 — existing fallback pattern)
    - .planning/phases/03-build-time-env-refactor/03-RESEARCH.md (§Decision: Single-source-of-truth config module shape, §TypeScript typing approach)
    - src/tsconfig.json (confirm strict: false, ambient .d.ts auto-includes)
  </read_first>
  <action>
    Create `src/config/defaults.ts` exporting all 16 named string constants from `<interfaces>`. **This module is RENDERER-ONLY.** Main process consumers MUST `require("./src/config/build-config.generated.cjs")` directly — they MUST NOT import `defaults.ts`. Add a header docblock stating this explicitly.

    Drop the fragile `typeof import.meta !== "undefined"` branch (Warning 4 fix) — since main never imports this module, `import.meta.env` is always defined here at runtime in renderer / always replaced by Vite at build time. Implementation:

    ```ts
    // RENDERER-ONLY single source of truth for build-configurable URL/scheme defaults.
    // DO NOT import this file from main process or CommonJS helpers — main reads
    // src/config/build-config.generated.cjs directly via require().
    //
    // Renderer call sites read import.meta.env.VITE_OPENWHISPR_* (substituted by Vite define at build time).
    // Main-process call sites read the build-config.generated.cjs module (frozen at prebuild time).
    // No production code path reads process.env.OPENWHISPR_* at runtime — see scripts/verify-defaults-parity.js.

    import * as Generated from "./build-config.generated";

    const env = (import.meta as any).env as Record<string, string | undefined>;

    function pick(viteName: string, generatedValue: string): string {
      const v = env?.[viteName];
      return typeof v === "string" && v.length > 0 ? v : generatedValue;
    }

    // For values where empty string IS a valid intended default (BACKEND_URL), preserve empty.
    function pickAllowEmpty(viteName: string, generatedValue: string): string {
      const v = env?.[viteName];
      return typeof v === "string" ? v : generatedValue;
    }

    export const OPENWHISPR_AUTH_URL = pick("VITE_OPENWHISPR_AUTH_URL", Generated.OPENWHISPR_AUTH_URL);
    export const OPENWHISPR_BACKEND_URL = pickAllowEmpty("VITE_OPENWHISPR_BACKEND_URL", Generated.OPENWHISPR_BACKEND_URL);
    export const OPENWHISPR_BACKEND_URL_PATTERN = pick("VITE_OPENWHISPR_BACKEND_URL_PATTERN", Generated.OPENWHISPR_BACKEND_URL_PATTERN);
    export const OPENWHISPR_OAUTH_DESKTOP_CALLBACK_URL = pick("VITE_OPENWHISPR_OAUTH_DESKTOP_CALLBACK_URL", Generated.OPENWHISPR_OAUTH_DESKTOP_CALLBACK_URL);
    export const OPENWHISPR_MCP_URL = pick("VITE_OPENWHISPR_MCP_URL", Generated.OPENWHISPR_MCP_URL);
    export const OPENWHISPR_OAUTH_GOOGLE_AUTH_URL = Generated.OPENWHISPR_OAUTH_GOOGLE_AUTH_URL;
    export const OPENWHISPR_OAUTH_GOOGLE_TOKEN_URL = Generated.OPENWHISPR_OAUTH_GOOGLE_TOKEN_URL;
    export const OPENWHISPR_OAUTH_GOOGLE_REVOKE_URL = Generated.OPENWHISPR_OAUTH_GOOGLE_REVOKE_URL;
    export const OPENWHISPR_OAUTH_GOOGLE_CALENDAR_API_URL = Generated.OPENWHISPR_OAUTH_GOOGLE_CALENDAR_API_URL;
    export const OPENWHISPR_OAUTH_RESET_PASSWORD_URL = pick("VITE_OPENWHISPR_OAUTH_RESET_PASSWORD_URL", Generated.OPENWHISPR_OAUTH_RESET_PASSWORD_URL);
    export const OPENWHISPR_OAUTH_PROTOCOL_SCHEME = Generated.OPENWHISPR_OAUTH_PROTOCOL_SCHEME;
    export const OPENWHISPR_OPENAI_BASE_URL = pick("VITE_OPENWHISPR_OPENAI_BASE_URL", Generated.OPENWHISPR_OPENAI_BASE_URL);
    export const OPENWHISPR_ANTHROPIC_URL = Generated.OPENWHISPR_ANTHROPIC_URL;
    export const OPENWHISPR_GEMINI_BASE_URL = pick("VITE_OPENWHISPR_GEMINI_BASE_URL", Generated.OPENWHISPR_GEMINI_BASE_URL);
    export const OPENWHISPR_GROQ_BASE_URL = pick("VITE_OPENWHISPR_GROQ_BASE_URL", Generated.OPENWHISPR_GROQ_BASE_URL);
    export const OPENWHISPR_MISTRAL_BASE_URL = pickAllowEmpty("VITE_OPENWHISPR_MISTRAL_BASE_URL", Generated.OPENWHISPR_MISTRAL_BASE_URL);
    ```

    Create `src/types/build-env.d.ts` augmenting `ImportMetaEnv` with optional readonly `VITE_OPENWHISPR_*` keys for all 10 renderer-exposed entries (BACKEND_URL, BACKEND_URL_PATTERN, AUTH_URL, OAUTH_DESKTOP_CALLBACK_URL, MCP_URL, OAUTH_RESET_PASSWORD_URL, OPENAI_BASE_URL, GEMINI_BASE_URL, GROQ_BASE_URL, MISTRAL_BASE_URL). Also keep existing `VITE_AUTH_URL` and `VITE_OPENWHISPR_API_URL` for backward compatibility.
  </action>
  <verify>
    <automated>npx tsc --noEmit -p src/tsconfig.json 2>&amp;1 | grep -E "(defaults\.ts|build-env\.d\.ts)" | grep -v "^$" &amp;&amp; exit 1; test $? -eq 1 &amp;&amp; grep -c "^export const OPENWHISPR_" src/config/defaults.ts | grep -q "^16$" &amp;&amp; grep -q "RENDERER-ONLY" src/config/defaults.ts &amp;&amp; ! grep -q "typeof import.meta" src/config/defaults.ts</automated>
  </verify>
  <acceptance_criteria>
    - `src/config/defaults.ts` exists with exactly 16 `export const OPENWHISPR_*` lines.
    - File imports from `./build-config.generated`.
    - File contains the `RENDERER-ONLY` header docblock.
    - File does NOT contain `typeof import.meta` (Warning 4 fix).
    - `OPENWHISPR_BACKEND_URL` uses `pickAllowEmpty` (preserves empty-string semantics).
    - `OPENWHISPR_BACKEND_URL_PATTERN` uses `pick` (defaults to parity literal).
    - `OPENWHISPR_AUTH_URL` uses `pick`.
    - `src/types/build-env.d.ts` exists and declares `interface ImportMetaEnv` with at least the 10 renderer-exposed `VITE_OPENWHISPR_*` keys.
    - `npx tsc --noEmit -p src/tsconfig.json` produces no errors referencing `src/config/defaults.ts` or `src/types/build-env.d.ts`.
  </acceptance_criteria>
  <done>defaults.ts compiles, renderer-only, all 16 named exports present, ambient types in place, no fragile import.meta typeof branch.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: Extend Vite define block in src/vite.config.mjs</name>
  <files>src/vite.config.mjs</files>
  <read_first>
    - src/vite.config.mjs (full file — note existing define block at lines 38-39, runtime-env.json plugin at 34-46)
    - .planning/phases/03-build-time-env-refactor/03-RESEARCH.md (§Decision: Renderer build-time injection mechanism)
    - docs/CONFIG_INVENTORY.md (rows flagged "Renderer; needs VITE_ prefix")
  </read_first>
  <action>
    In `src/vite.config.mjs`, after the existing `loadEnv(mode, envDir, "")` call, build a `buildTimeDefaults` object mapping each renderer-exposed VITE_OPENWHISPR_* key to its resolved value:

    ```js
    const buildTimeDefaults = {
      VITE_OPENWHISPR_BACKEND_URL: env.OPENWHISPR_BACKEND_URL ?? env.VITE_OPENWHISPR_API_URL ?? "",
      VITE_OPENWHISPR_BACKEND_URL_PATTERN: env.OPENWHISPR_BACKEND_URL_PATTERN || "https://api.openwhispr.com/*",
      VITE_OPENWHISPR_AUTH_URL: env.OPENWHISPR_AUTH_URL || env.VITE_AUTH_URL || "https://auth.openwhispr.com",
      VITE_OPENWHISPR_OAUTH_DESKTOP_CALLBACK_URL: env.OPENWHISPR_OAUTH_DESKTOP_CALLBACK_URL || env.VITE_OPENWHISPR_OAUTH_CALLBACK_URL || "https://openwhispr.com/auth/desktop-callback",
      VITE_OPENWHISPR_MCP_URL: env.OPENWHISPR_MCP_URL || "https://mcp.openwhispr.com/mcp",
      VITE_OPENWHISPR_OAUTH_RESET_PASSWORD_URL: env.OPENWHISPR_OAUTH_RESET_PASSWORD_URL || "https://openwhispr.com/reset-password",
      VITE_OPENWHISPR_OPENAI_BASE_URL: env.OPENWHISPR_OPENAI_BASE_URL || env.OPENAI_BASE_URL || "https://api.openai.com/v1",
      VITE_OPENWHISPR_GEMINI_BASE_URL: env.OPENWHISPR_GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta",
      VITE_OPENWHISPR_GROQ_BASE_URL: env.OPENWHISPR_GROQ_BASE_URL || "https://api.groq.com/openai/v1",
      VITE_OPENWHISPR_MISTRAL_BASE_URL: env.OPENWHISPR_MISTRAL_BASE_URL || "https://api.mistral.ai/v1",
    };
    ```

    Extend the existing `define:` config so it merges pre-existing entries with the new `buildTimeDefaults` mapped through `JSON.stringify`:

    ```js
    define: {
      ...existingDefineEntries,
      ...Object.fromEntries(
        Object.entries(buildTimeDefaults).map(([k, v]) => [`import.meta.env.${k}`, JSON.stringify(v)])
      ),
    }
    ```

    Also extend the `runtime-env.json` writer plugin so the JSON payload includes every key from `buildTimeDefaults`. Do NOT remove existing `VITE_AUTH_URL` / `VITE_OPENWHISPR_API_URL` keys — they remain for backward compatibility until call sites migrate in waves 2-5.

    DO NOT add a `VITE_OPENWHISPR_API_URL` entry to `buildTimeDefaults` — already in existing define block.
  </action>
  <verify>
    <automated>node -e "process.env.OPENWHISPR_AUTH_URL='https://test.example.com'; require('vite').loadConfigFromFile({command:'build',mode:'production'}, 'src/vite.config.mjs').then(r =&gt; { const d = r.config.define; if(!d['import.meta.env.VITE_OPENWHISPR_AUTH_URL'] || !d['import.meta.env.VITE_OPENWHISPR_AUTH_URL'].includes('test.example.com')) { console.error('FAIL', d); process.exit(1); } if(!d['import.meta.env.VITE_OPENWHISPR_BACKEND_URL_PATTERN']) { console.error('missing BACKEND_URL_PATTERN'); process.exit(1); } console.log('OK'); })"</automated>
  </verify>
  <acceptance_criteria>
    - `src/vite.config.mjs` `define` block includes literal keys: `import.meta.env.VITE_OPENWHISPR_BACKEND_URL`, `import.meta.env.VITE_OPENWHISPR_BACKEND_URL_PATTERN`, `import.meta.env.VITE_OPENWHISPR_AUTH_URL`, `import.meta.env.VITE_OPENWHISPR_OAUTH_DESKTOP_CALLBACK_URL`, `import.meta.env.VITE_OPENWHISPR_MCP_URL`, `import.meta.env.VITE_OPENWHISPR_OAUTH_RESET_PASSWORD_URL`, `import.meta.env.VITE_OPENWHISPR_OPENAI_BASE_URL`, `import.meta.env.VITE_OPENWHISPR_GEMINI_BASE_URL`, `import.meta.env.VITE_OPENWHISPR_GROQ_BASE_URL`, `import.meta.env.VITE_OPENWHISPR_MISTRAL_BASE_URL`.
    - With `OPENWHISPR_AUTH_URL=https://test.example.com` set, the resolved Vite `define["import.meta.env.VITE_OPENWHISPR_AUTH_URL"]` substring contains `test.example.com`.
    - With no env vars set, the same key resolves to JSON-quoted `"https://auth.openwhispr.com"`.
    - `runtime-env.json` plugin writes a JSON file containing all 10 new keys.
    - `npm run build` completes without errors caused by the modified define block.
  </acceptance_criteria>
  <done>Vite injects all 10 renderer-side VITE_OPENWHISPR_* values; runtime-env.json mirrors them.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Build environment → Renderer bundle | `define` substitutions are inlined into the JS bundle as literals — anything placed there is shipped to every user. |
| Build environment → Main process | `scripts/generate-build-config.js` reads `process.env` and emits a `.cjs` file that is bundled into the asar at build time. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-03-01 | Information Disclosure | `src/vite.config.mjs` define block | mitigate | Only inject `VITE_*` keys whose values are non-secret URLs. Reject any future addition of secret material via parity grep gate (Plan 6). |
| T-03-02 | Tampering | `scripts/generate-build-config.js` outputs | mitigate | Both `.ts` and `.cjs` outputs are `.gitignore`d so no committed values; `module.exports` wrapped with `Object.freeze()` to prevent runtime mutation by main-process consumers. |
| T-03-03 | Spoofing | `OPENWHISPR_BACKEND_URL` empty default | accept | Empty default is the documented Yambr behavior — downstream call sites treat empty as "API not configured" and short-circuit. Preserved by `pickAllowEmpty`. |
| T-03-04 | Elevation of Privilege | Build-time-only contract | mitigate | Plan 6 grep gate forbids `process.env.OPENWHISPR_*` reads outside `scripts/generate-build-config.js`, `electron-builder.config.js`, and `src/vite.config.mjs`. |
| T-03-20 | Tampering | Override-detection fidelity | mitigate | `OPENWHISPR_OAUTH_PROTOCOL_SCHEME_OVERRIDDEN` derived via `hasOwnProperty` — explicit env-set with default value still counts as overridden, eliminating false negatives. |
</threat_model>

<verification>
After all 3 tasks complete:
- `node scripts/generate-build-config.js` emits 16 string keys + 1 boolean across `.ts` and `.cjs` modules.
- `.cjs` module is frozen and requirable from CommonJS.
- `src/config/defaults.ts` re-exports all 16 string keys with correct fallback semantics (empty preserved for BACKEND_URL).
- `defaults.ts` carries the RENDERER-ONLY docblock; no `typeof import.meta` branch.
- `npx tsc --noEmit -p src/tsconfig.json` passes.
- Vite config injects all 10 renderer-side keys.
- `git status` shows BOTH `src/config/build-config.generated.ts` AND `src/config/build-config.generated.cjs` as ignored.
</verification>

<success_criteria>
- All artifacts in `must_haves.artifacts` exist and contain required substrings.
- All key links in `must_haves.key_links` are present.
- TypeScript compiles cleanly.
- Default build (no env vars) resolves every named export to the pre-refactor literal value (including BACKEND_URL_PATTERN).
- Foundation is ready for waves 2–5: renderer imports `src/config/defaults.ts`, main process requires `src/config/build-config.generated.cjs`.
</success_criteria>

<output>
After completion, create `.planning/phases/03-build-time-env-refactor/03-01-SUMMARY.md`.
</output>
