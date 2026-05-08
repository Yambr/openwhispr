---
phase: 03-build-time-env-refactor
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - src/config/defaults.ts
  - src/config/build-config.generated.ts
  - scripts/generate-build-config.js
  - src/types/build-env.d.ts
  - src/vite.config.mjs
  - .gitignore
  - package.json
autonomous: true
requirements: [CFG-02, CFG-04]

must_haves:
  truths:
    - "src/config/defaults.ts exists and exports every URL/scheme literal listed in CONFIG_INVENTORY"
    - "Renderer reads build-time values via import.meta.env.VITE_OPENWHISPR_* (Vite define)"
    - "Main reads build-time values via the generated module src/config/build-config.generated.ts"
    - "Default build with no env vars resolves every named export to the pre-refactor literal"
    - "TypeScript compiles src/config/defaults.ts without errors"
  artifacts:
    - path: "src/config/defaults.ts"
      provides: "Single-source-of-truth named exports for every CONFIG_INVENTORY default URL/scheme"
      contains: "export const OPENWHISPR_AUTH_URL"
    - path: "src/config/build-config.generated.ts"
      provides: "Frozen build-time literals for main process (gitignored, produced by prebuild)"
      contains: "AUTO-GENERATED"
    - path: "scripts/generate-build-config.js"
      provides: "Prebuild script that reads process.env.OPENWHISPR_* and emits the generated module"
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
      to: "src/config/build-config.generated.ts"
      via: "writeFileSync emitting literal exports"
      pattern: "AUTO-GENERATED"
    - from: "src/config/defaults.ts"
      to: "src/config/build-config.generated.ts"
      via: "import * as Generated"
      pattern: "build-config.generated"
---

<objective>
Establish the foundation for the Phase 3 refactor: a single source of truth (`src/config/defaults.ts`) holding every default URL/scheme literal, a generated frozen module for main-process build-time values (`src/config/build-config.generated.ts` produced by `scripts/generate-build-config.js`), TypeScript ambient types, and an extended Vite `define` block for renderer-side substitution.

Per D-01, D-03, D-04 (CONTEXT.md): defaults must work with no env vars set; renderer uses `import.meta.env.VITE_OPENWHISPR_*`; main reads only the generated module (not `process.env` at runtime).

Purpose: every subsequent plan (waves 2–5) imports from `src/config/defaults.ts`. Without this foundation nothing else can land.
Output: `src/config/defaults.ts`, `scripts/generate-build-config.js`, `src/config/build-config.generated.ts` (gitignored), `src/types/build-env.d.ts`, extended `src/vite.config.mjs`, `.gitignore` entry, `package.json` `prebuild` hook.
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

Logical env-var names from CONFIG_INVENTORY (all 13 distinct):
  OPENWHISPR_AUTH_URL                       default: "https://auth.openwhispr.com"
  OPENWHISPR_BACKEND_URL                    default: ""  (empty = opt-in; DO NOT change)
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
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Create generator script + generated module + .gitignore entry</name>
  <files>scripts/generate-build-config.js, src/config/build-config.generated.ts, .gitignore, package.json</files>
  <read_first>
    - .planning/phases/03-build-time-env-refactor/03-RESEARCH.md (§Decision: Main-process build-time injection mechanism — Option B)
    - docs/CONFIG_INVENTORY.md (full table — all 23 rows)
    - .gitignore (existing entries)
    - package.json (scripts section, find existing `prebuild` hooks)
  </read_first>
  <action>
    Create `scripts/generate-build-config.js` (CommonJS Node script). It MUST:
    1. Define a `DEFAULTS` object containing all 15 logical env-var keys with their string defaults from the `<interfaces>` block above. The 15 keys are: OPENWHISPR_AUTH_URL, OPENWHISPR_BACKEND_URL (default `""`), OPENWHISPR_OAUTH_DESKTOP_CALLBACK_URL, OPENWHISPR_MCP_URL, OPENWHISPR_OAUTH_GOOGLE_AUTH_URL, OPENWHISPR_OAUTH_GOOGLE_TOKEN_URL, OPENWHISPR_OAUTH_GOOGLE_REVOKE_URL, OPENWHISPR_OAUTH_GOOGLE_CALENDAR_API_URL, OPENWHISPR_OAUTH_RESET_PASSWORD_URL, OPENWHISPR_OAUTH_PROTOCOL_SCHEME, OPENWHISPR_OPENAI_BASE_URL, OPENWHISPR_ANTHROPIC_URL, OPENWHISPR_GEMINI_BASE_URL, OPENWHISPR_GROQ_BASE_URL, OPENWHISPR_MISTRAL_BASE_URL.
    2. For each key, resolve `process.env[key] ?? DEFAULTS[key]`. Empty string is a valid resolved value (DO NOT coerce empty to default for OPENWHISPR_BACKEND_URL — empty is the intended default per CONFIG_INVENTORY row 6).
    3. Write `src/config/build-config.generated.ts` containing a header comment `// AUTO-GENERATED — do not edit. Produced by scripts/generate-build-config.js at build time.`, then one `export const KEY = ${JSON.stringify(value)};` line per key.
    4. Log `[build-config] wrote src/config/build-config.generated.ts (15 keys)` to stdout on success.

    Add `src/config/build-config.generated.ts` to `.gitignore` on its own line under a `# Build-time generated config (Phase 3)` comment block.

    In `package.json`, add a `prebuild` script that runs `node scripts/generate-build-config.js`. If a `prebuild` script already exists, append the new command using `&&` so existing prebuild steps still run first. Also add a `predev` script that runs the same generator (so dev mode also has the generated file). If `predev` already exists, append with `&&`.

    Run `node scripts/generate-build-config.js` once now to produce the initial generated file (so subsequent tasks/imports work).
  </action>
  <verify>
    <automated>node scripts/generate-build-config.js &amp;&amp; test -f src/config/build-config.generated.ts &amp;&amp; grep -c "^export const OPENWHISPR_" src/config/build-config.generated.ts | grep -q "^15$" &amp;&amp; grep -q "build-config.generated.ts" .gitignore &amp;&amp; node -e "const p=require('./package.json'); if(!p.scripts.prebuild || !p.scripts.prebuild.includes('generate-build-config')) process.exit(1)"</automated>
  </verify>
  <acceptance_criteria>
    - `scripts/generate-build-config.js` exists and is executable via `node`.
    - Running it produces `src/config/build-config.generated.ts` with exactly 15 `export const OPENWHISPR_*` lines.
    - `OPENWHISPR_BACKEND_URL` line equals `export const OPENWHISPR_BACKEND_URL = "";` when no env var is set.
    - `OPENWHISPR_AUTH_URL` line equals `export const OPENWHISPR_AUTH_URL = "https://auth.openwhispr.com";` when no env var is set.
    - `.gitignore` contains the substring `build-config.generated.ts`.
    - `package.json` `scripts.prebuild` field contains the substring `generate-build-config`.
    - `package.json` `scripts.predev` field contains the substring `generate-build-config`.
  </acceptance_criteria>
  <done>Generator script committed, generated file produced and gitignored, package.json hooks wired.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Create src/config/defaults.ts (single source of truth) + TypeScript ambient types</name>
  <files>src/config/defaults.ts, src/types/build-env.d.ts</files>
  <read_first>
    - src/config/build-config.generated.ts (produced by Task 1)
    - src/config/constants.ts (lines 46-125 — existing fallback pattern)
    - .planning/phases/03-build-time-env-refactor/03-RESEARCH.md (§Decision: Single-source-of-truth config module shape, §TypeScript typing approach)
    - src/tsconfig.json (confirm strict: false, ambient .d.ts auto-includes)
  </read_first>
  <action>
    Create `src/config/defaults.ts` exporting all 15 named constants from `<interfaces>`. Implementation:

    ```ts
    // SINGLE SOURCE OF TRUTH for build-configurable URL/scheme defaults.
    // Renderer call sites read import.meta.env.VITE_OPENWHISPR_* (substituted by Vite define at build time).
    // Main-process call sites read the build-config.generated module (frozen at prebuild time).
    // No production code path reads process.env.OPENWHISPR_* at runtime — see scripts/verify-defaults-parity.js.

    import * as Generated from "./build-config.generated";

    type ViteEnv = Record<string, string | undefined>;
    const viteEnv: ViteEnv | undefined =
      typeof import.meta !== "undefined" && (import.meta as any).env
        ? ((import.meta as any).env as ViteEnv)
        : undefined;

    function pick(viteName: string, generatedValue: string): string {
      const v = viteEnv?.[viteName];
      return typeof v === "string" && v.length > 0 ? v : generatedValue;
    }

    // For values where empty string IS the intended default (BACKEND_URL), still allow explicit override but preserve empty.
    function pickAllowEmpty(viteName: string, generatedValue: string): string {
      const v = viteEnv?.[viteName];
      return typeof v === "string" ? v : generatedValue;
    }

    export const OPENWHISPR_AUTH_URL = pick("VITE_OPENWHISPR_AUTH_URL", Generated.OPENWHISPR_AUTH_URL);
    export const OPENWHISPR_BACKEND_URL = pickAllowEmpty("VITE_OPENWHISPR_BACKEND_URL", Generated.OPENWHISPR_BACKEND_URL);
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

    Create `src/types/build-env.d.ts` augmenting `ImportMetaEnv` with optional readonly `VITE_OPENWHISPR_*` keys for all 7 renderer-exposed entries (BACKEND_URL, AUTH_URL, OAUTH_DESKTOP_CALLBACK_URL, MCP_URL, OAUTH_RESET_PASSWORD_URL, OPENAI_BASE_URL, GEMINI_BASE_URL, GROQ_BASE_URL, MISTRAL_BASE_URL). Also keep existing `VITE_AUTH_URL` and `VITE_OPENWHISPR_API_URL` keys for backward compatibility during the transition.
  </action>
  <verify>
    <automated>npx tsc --noEmit -p src/tsconfig.json 2>&amp;1 | grep -E "(defaults\.ts|build-env\.d\.ts)" | grep -v "^$" &amp;&amp; exit 1; test $? -eq 1 &amp;&amp; grep -c "^export const OPENWHISPR_" src/config/defaults.ts | grep -q "^15$"</automated>
  </verify>
  <acceptance_criteria>
    - `src/config/defaults.ts` exists with exactly 15 `export const OPENWHISPR_*` lines.
    - File imports from `./build-config.generated`.
    - `OPENWHISPR_BACKEND_URL` uses `pickAllowEmpty` (preserves empty-string semantics).
    - `OPENWHISPR_AUTH_URL` uses `pick`.
    - `src/types/build-env.d.ts` exists and declares `interface ImportMetaEnv` with at least the 9 renderer-exposed `VITE_OPENWHISPR_*` keys.
    - `npx tsc --noEmit -p src/tsconfig.json` produces no errors referencing `src/config/defaults.ts` or `src/types/build-env.d.ts`.
  </acceptance_criteria>
  <done>defaults.ts compiles, all 15 named exports present, ambient types in place.</done>
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
    In `src/vite.config.mjs`, after the existing `loadEnv(mode, envDir, "")` call, build a `buildTimeDefaults` object mapping each renderer-exposed VITE_OPENWHISPR_* key to its resolved value, reading from the loaded `env` (which contains every var in `process.env`):

    ```js
    const buildTimeDefaults = {
      VITE_OPENWHISPR_BACKEND_URL: env.OPENWHISPR_BACKEND_URL ?? env.VITE_OPENWHISPR_API_URL ?? "",
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

    Extend the existing `define:` config option so it merges any pre-existing entries with the new `buildTimeDefaults` mapped through `JSON.stringify`:

    ```js
    define: {
      ...existingDefineEntries, // preserve current VITE_AUTH_URL / VITE_OPENWHISPR_API_URL entries
      ...Object.fromEntries(
        Object.entries(buildTimeDefaults).map(([k, v]) => [`import.meta.env.${k}`, JSON.stringify(v)])
      ),
    }
    ```

    Also extend the `runtime-env.json` writer plugin (lines 34-46) so the JSON payload includes every key from `buildTimeDefaults` (so dev-mode main-process fallback chains can read them). Do NOT remove the existing `VITE_AUTH_URL` / `VITE_OPENWHISPR_API_URL` keys — they remain for backward compatibility until call sites migrate in waves 2-5.

    DO NOT add a `VITE_OPENWHISPR_API_URL` entry to `buildTimeDefaults` — it is already in the existing define block; keep it untouched.
  </action>
  <verify>
    <automated>node -e "process.env.OPENWHISPR_AUTH_URL='https://test.example.com'; require('vite').loadConfigFromFile({command:'build',mode:'production'}, 'src/vite.config.mjs').then(r =&gt; { const d = r.config.define; if(!d['import.meta.env.VITE_OPENWHISPR_AUTH_URL'] || !d['import.meta.env.VITE_OPENWHISPR_AUTH_URL'].includes('test.example.com')) { console.error('FAIL', d); process.exit(1); } console.log('OK'); })"</automated>
  </verify>
  <acceptance_criteria>
    - `src/vite.config.mjs` `define` block includes literal keys `import.meta.env.VITE_OPENWHISPR_BACKEND_URL`, `import.meta.env.VITE_OPENWHISPR_AUTH_URL`, `import.meta.env.VITE_OPENWHISPR_OAUTH_DESKTOP_CALLBACK_URL`, `import.meta.env.VITE_OPENWHISPR_MCP_URL`, `import.meta.env.VITE_OPENWHISPR_OAUTH_RESET_PASSWORD_URL`, `import.meta.env.VITE_OPENWHISPR_OPENAI_BASE_URL`, `import.meta.env.VITE_OPENWHISPR_GEMINI_BASE_URL`, `import.meta.env.VITE_OPENWHISPR_GROQ_BASE_URL`, `import.meta.env.VITE_OPENWHISPR_MISTRAL_BASE_URL`.
    - With `OPENWHISPR_AUTH_URL=https://test.example.com` set, the resolved Vite config's `define["import.meta.env.VITE_OPENWHISPR_AUTH_URL"]` substring contains `test.example.com`.
    - With no env vars set, the same key resolves to JSON-quoted `"https://auth.openwhispr.com"`.
    - `runtime-env.json` plugin writes a JSON file containing all 9 new keys.
    - `npm run build` (or `vite build`) completes without errors caused by the modified define block. (If full build is too slow, `npx vite build --mode production --logLevel error` against a no-op entry is acceptable.)
  </acceptance_criteria>
  <done>Vite injects all 9 renderer-side VITE_OPENWHISPR_* values; runtime-env.json mirrors them.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Build environment → Renderer bundle | `define` substitutions are inlined into the JS bundle as literals — anything placed there is shipped to every user. |
| Build environment → Main process | `scripts/generate-build-config.js` reads `process.env` and emits a `.ts` file that is bundled into the asar at build time. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-03-01 | Information Disclosure | `src/vite.config.mjs` define block | mitigate | Only inject `VITE_*` keys whose values are non-secret URLs (per CONFIG_INVENTORY scope: backend/oauth/model-registry/litellm URLs). Reject any future addition of secret material to this block via code review and the parity grep gate (Plan 5). |
| T-03-02 | Tampering | `scripts/generate-build-config.js` | mitigate | Generated file is `.gitignore`d so no committed secrets/values; hash isn't required because every value is derived from CONFIG_INVENTORY which is the source of truth. |
| T-03-03 | Spoofing | `OPENWHISPR_BACKEND_URL` empty default | accept | Empty default is the documented Yambr behavior — downstream call sites (`auth.ts:114`) treat empty as "API not configured" and short-circuit. Preserved by `pickAllowEmpty`. |
| T-03-04 | Elevation of Privilege | Build-time-only contract | mitigate | Plan 5 grep gate forbids `process.env.OPENWHISPR_*` reads outside `scripts/generate-build-config.js`, `electron-builder.config.js`, and `src/vite.config.mjs`. This wave creates the only allowed read sites. |
</threat_model>

<verification>
After all 3 tasks complete:
- `node scripts/generate-build-config.js` emits 15 named exports.
- `src/config/defaults.ts` re-exports all 15 with correct fallback semantics (empty preserved for BACKEND_URL).
- `npx tsc --noEmit -p src/tsconfig.json` passes (no new errors from `src/config/defaults.ts` or `src/types/build-env.d.ts`).
- Vite config injects all 9 renderer-side VITE_OPENWHISPR_* keys, verified by `vite.loadConfigFromFile` smoke check.
- `git status` shows `src/config/build-config.generated.ts` as ignored.
</verification>

<success_criteria>
- All artifacts in `must_haves.artifacts` exist and contain required substrings.
- All key links in `must_haves.key_links` are present.
- TypeScript compiles cleanly.
- Default build (no env vars) resolves every named export to the pre-refactor literal value.
- Foundation is ready for waves 2–5 to import from `src/config/defaults.ts`.
</success_criteria>

<output>
After completion, create `.planning/phases/03-build-time-env-refactor/03-01-SUMMARY.md`.
</output>
