---
phase: 03-build-time-env-refactor
plan: 5
type: execute
wave: 4
depends_on: [1, 2]
files_modified:
  - src/config/constants.ts
  - src/models/modelRegistryData.json
  - src/models/ModelRegistry.ts
  - src/components/McpIntegrationCard.tsx
  - src/helpers/ipcHandlers.js
  - src/config/aiProvidersConfig.ts
  - src/utils/languages.ts
  - src/helpers/modelManagerBridge.js
autonomous: true
requirements: [CFG-02, CFG-04]

must_haves:
  truths:
    - "src/config/constants.ts has zero literal API URLs (OPENAI_BASE/ANTHROPIC/GEMINI/GROQ/MISTRAL all read from defaults.ts)"
    - "src/models/modelRegistryData.json no longer contains literal baseUrl strings for the three transcription providers"
    - "ModelRegistry.ts injects baseUrls from defaults.ts when constructing the in-memory registry"
    - "Only ModelRegistry.ts reads .baseUrl on transcriptionProviders entries — other consumers (aiProvidersConfig.ts, languages.ts, modelManagerBridge.js) route through ModelRegistry"
    - "src/components/McpIntegrationCard.tsx reads OPENWHISPR_MCP_URL from defaults.ts"
    - "src/helpers/ipcHandlers.js Mistral/Groq/Anthropic URL constants read from build-config.generated.cjs (no inline literals)"
    - "Setting OPENWHISPR_OPENAI_BASE_URL=https://my-proxy.example.com/v1 changes both renderer and main consumers"
  artifacts:
    - path: "src/config/constants.ts"
      provides: "Re-exports/derives API endpoint constants from defaults.ts; no inline URL literals"
      contains: "from \"./defaults\""
    - path: "src/models/modelRegistryData.json"
      provides: "Pure data — baseUrl fields removed from the three transcription providers"
    - path: "src/models/ModelRegistry.ts"
      provides: "Sole consumer of injected baseUrls; injects from defaults.ts at construction time"
      contains: "OPENWHISPR_OPENAI_BASE_URL"
    - path: "src/components/McpIntegrationCard.tsx"
      provides: "MCP URL displayed in UI from defaults.ts"
      contains: "OPENWHISPR_MCP_URL"
    - path: "src/helpers/ipcHandlers.js"
      provides: "Anthropic/Groq/Mistral URL constants from build-config.generated.cjs"
  key_links:
    - from: "src/models/ModelRegistry.ts"
      to: "src/config/defaults.ts"
      via: "named import"
      pattern: "OPENWHISPR_(OPENAI|GROQ|MISTRAL)_BASE_URL"
    - from: "src/components/McpIntegrationCard.tsx"
      to: "src/config/defaults.ts"
      via: "named import"
      pattern: "OPENWHISPR_MCP_URL"
    - from: "src/config/constants.ts"
      to: "src/config/defaults.ts"
      via: "re-export / direct import"
      pattern: "from .*defaults"
    - from: "src/helpers/ipcHandlers.js"
      to: "src/config/build-config.generated.cjs"
      via: "require() — destructure ANTHROPIC/GROQ/MISTRAL keys"
      pattern: "build-config.generated"
---

<objective>
Wave 4 — finish the refactor by handling the model-registry + LiteLLM bucket. Largest remaining slice (rows 6, 9, 17–23) but mechanically simplest now that the pattern is proven.

Per RESEARCH.md §Single source of truth, Option b: move the three baseUrl values out of `modelRegistryData.json` and inject them in `ModelRegistry.ts` at construction time. The JSON becomes pure data.

**Revision note (iteration 1):**
- Per Warning 5, this plan now includes an explicit consumer-audit sub-step ensuring ONLY `ModelRegistry.ts` reads `.baseUrl` on `transcriptionProviders` entries. The CommonJS helper `modelManagerBridge.js` and any other consumers route through `ModelRegistry` (or receive injection identical to step 2 of Task 2).
- Per Blocker 2, CommonJS files (`ipcHandlers.js`, `modelManagerBridge.js`) `require("../config/build-config.generated.cjs")`.

CONFIG_INVENTORY rows handled: 6 (constants.ts:116 BACKEND_URL — CFG-04 anchor renderer side), 9 (McpIntegrationCard MCP URL), 17/18/19 (registry baseUrls), 21 (constants.ts OPENAI_BASE), 22 (constants.ts ANTHROPIC), 23 (constants.ts GEMINI), constants.ts:77/78 GROQ_BASE/MISTRAL_BASE, ipcHandlers.js:61/2826/3589 mirror sites.
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
  Renderer (TS): import { OPENWHISPR_OPENAI_BASE_URL, ... } from "@/config/defaults";
  Main / CJS:    const { OPENWHISPR_ANTHROPIC_URL, OPENWHISPR_GROQ_BASE_URL, OPENWHISPR_MISTRAL_BASE_URL } = require("../config/build-config.generated.cjs");

CONFIG_INVENTORY rows handled:
  Row 6:  src/config/constants.ts:116           "" (empty default)               → OPENWHISPR_BACKEND_URL  (CFG-04 anchor renderer)
  Row 9:  src/components/McpIntegrationCard.tsx:13  "https://mcp.openwhispr.com/mcp" → OPENWHISPR_MCP_URL
  Row 17: src/models/modelRegistryData.json:139 "https://api.openai.com/v1"     → OPENWHISPR_OPENAI_BASE_URL  (move out of JSON)
  Row 18: src/models/modelRegistryData.json:166 "https://api.groq.com/openai/v1" → OPENWHISPR_GROQ_BASE_URL  (move out of JSON)
  Row 19: src/models/modelRegistryData.json:185 "https://api.mistral.ai/v1"     → OPENWHISPR_MISTRAL_BASE_URL  (move out of JSON)
  Row 21: src/config/constants.ts:60            "https://api.openai.com/v1"     → OPENWHISPR_OPENAI_BASE_URL
  Row 22: src/config/constants.ts:75            "https://api.anthropic.com/v1/messages" → OPENWHISPR_ANTHROPIC_URL
  Row 23: src/config/constants.ts:76            "https://generativelanguage.googleapis.com/v1beta" → OPENWHISPR_GEMINI_BASE_URL

Mirror sites:
  src/config/constants.ts:77   GROQ_BASE       → OPENWHISPR_GROQ_BASE_URL
  src/config/constants.ts:78   MISTRAL_BASE    → OPENWHISPR_MISTRAL_BASE_URL
  src/helpers/ipcHandlers.js:61    MISTRAL_TRANSCRIPTION_URL  → OPENWHISPR_MISTRAL_BASE_URL
  src/helpers/ipcHandlers.js:2826  Anthropic proxy URL        → OPENWHISPR_ANTHROPIC_URL
  src/helpers/ipcHandlers.js:3589  Groq URL                   → OPENWHISPR_GROQ_BASE_URL

Additional consumers (Warning 5 — must be audited and routed through ModelRegistry):
  src/config/aiProvidersConfig.ts   (derives AI_MODES from registry)
  src/utils/languages.ts            (derives REASONING_PROVIDERS from registry)
  src/helpers/modelManagerBridge.js (handles local model downloads)
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Refactor src/config/constants.ts + src/components/McpIntegrationCard.tsx (rows 6, 9, 21, 22, 23 + mirrors)</name>
  <files>src/config/constants.ts, src/components/McpIntegrationCard.tsx</files>
  <read_first>
    - src/config/constants.ts (full file — confirm lines 46-125, especially 60, 75, 76, 77, 78, 116)
    - src/components/McpIntegrationCard.tsx (line 13)
    - src/config/defaults.ts (exports list)
    - docs/CONFIG_INVENTORY.md (rows 6, 9, 21, 22, 23)
  </read_first>
  <action>
    1. In `src/config/constants.ts`, at top after existing imports add:
       ```ts
       import {
         OPENWHISPR_BACKEND_URL,
         OPENWHISPR_OPENAI_BASE_URL,
         OPENWHISPR_ANTHROPIC_URL,
         OPENWHISPR_GEMINI_BASE_URL,
         OPENWHISPR_GROQ_BASE_URL,
         OPENWHISPR_MISTRAL_BASE_URL,
       } from "./defaults";
       ```
    2. Replace `DEFAULT_OPENAI_BASE` (line 60) and surrounding `computeBaseUrl` env-fallback chain with: `export const DEFAULT_OPENAI_BASE = OPENWHISPR_OPENAI_BASE_URL;`. Delete `computeBaseUrl` if it has no other callers (grep first).
    3. Replace `API_ENDPOINTS.ANTHROPIC` (line 75) literal with `OPENWHISPR_ANTHROPIC_URL`.
    4. Replace `API_ENDPOINTS.GEMINI` (line 76) literal with `OPENWHISPR_GEMINI_BASE_URL`.
    5. Replace `API_ENDPOINTS.GROQ_BASE` (line 77) literal with `OPENWHISPR_GROQ_BASE_URL`.
    6. Replace `API_ENDPOINTS.MISTRAL_BASE` (line 78) literal with `OPENWHISPR_MISTRAL_BASE_URL`.
    7. Replace `OPENWHISPR_API_URL` (line 116, currently `(env.VITE_OPENWHISPR_API_URL as string) || ""`) with: `export const OPENWHISPR_API_URL = OPENWHISPR_BACKEND_URL;`. Empty-default semantic preserved by `pickAllowEmpty` in defaults.ts.
    8. After all changes: `grep -cE "https://(api\\.openai\\.com|api\\.anthropic\\.com|generativelanguage\\.googleapis\\.com|api\\.groq\\.com|api\\.mistral\\.ai)" src/config/constants.ts` must return 0.
    9. In `src/components/McpIntegrationCard.tsx`:
       - Add `import { OPENWHISPR_MCP_URL } from "@/config/defaults";` (or relative path matching project convention).
       - Line 13: replace literal `"https://mcp.openwhispr.com/mcp"` with `OPENWHISPR_MCP_URL`.
       - `grep -cF "mcp.openwhispr.com" src/components/McpIntegrationCard.tsx` must return 0.
  </action>
  <verify>
    <automated>test "$(grep -cE 'https://(api\.openai\.com|api\.anthropic\.com|generativelanguage\.googleapis\.com|api\.groq\.com|api\.mistral\.ai)' src/config/constants.ts)" = "0" && test "$(grep -cF 'mcp.openwhispr.com' src/components/McpIntegrationCard.tsx)" = "0" && grep -q "from .*defaults" src/config/constants.ts && grep -q "OPENWHISPR_MCP_URL" src/components/McpIntegrationCard.tsx && npx tsc --noEmit -p src/tsconfig.json 2>&1 | grep -E "(constants\.ts|McpIntegrationCard\.tsx)" | grep -v "^$" && exit 1; exit 0</automated>
  </verify>
  <acceptance_criteria>
    - `grep -cE "https://(api\.openai\.com|api\.anthropic\.com|generativelanguage\.googleapis\.com|api\.groq\.com|api\.mistral\.ai)" src/config/constants.ts` outputs `0`.
    - `grep -cF "mcp.openwhispr.com" src/components/McpIntegrationCard.tsx` outputs `0`.
    - `src/config/constants.ts` imports from `./defaults`.
    - `src/components/McpIntegrationCard.tsx` imports `OPENWHISPR_MCP_URL`.
    - TypeScript compile passes for both files.
  </acceptance_criteria>
  <done>constants.ts and McpIntegrationCard.tsx fully migrated to defaults.ts imports.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Move baseUrls out of modelRegistryData.json + inject in ModelRegistry.ts + AUDIT consumers (rows 17, 18, 19 + Warning 5 fix)</name>
  <files>src/models/modelRegistryData.json, src/models/ModelRegistry.ts, src/config/aiProvidersConfig.ts, src/utils/languages.ts, src/helpers/modelManagerBridge.js</files>
  <read_first>
    - src/models/modelRegistryData.json (lines 130-200 — transcriptionProviders array)
    - src/models/ModelRegistry.ts (full file — find where transcriptionProviders is read/used)
    - src/config/aiProvidersConfig.ts (find how it reads transcriptionProviders)
    - src/utils/languages.ts (find how it reads transcriptionProviders)
    - src/helpers/modelManagerBridge.js (find how it reads transcriptionProviders)
    - src/config/defaults.ts (exports list)
    - docs/CONFIG_INVENTORY.md (rows 17, 18, 19)
    - .planning/phases/03-build-time-env-refactor/03-RESEARCH.md (§Single source of truth, "Recommend Option b")
  </read_first>
  <action>
    **Step A — JSON cleanup:**
    1. In `src/models/modelRegistryData.json`:
       - Find the three `transcriptionProviders` entries (currently with `baseUrl: "..."`).
       - DELETE the `baseUrl` field from all three entries (OpenAI, Groq, Mistral). The JSON becomes pure data.
       - Optionally add a top-level `"_baseUrlInjectedAtRuntime": true` marker (documentation aid only).

    **Step B — ModelRegistry.ts becomes sole baseUrl injector:**
    2. In `src/models/ModelRegistry.ts`:
       - Add: `import { OPENWHISPR_OPENAI_BASE_URL, OPENWHISPR_GROQ_BASE_URL, OPENWHISPR_MISTRAL_BASE_URL } from "@/config/defaults";`.
       - In the constructor / load method that reads `modelRegistryData.json`, after loading inject `baseUrl` on each transcription provider by `id`:
         ```ts
         const providerBaseUrls: Record<string, string> = {
           openai: OPENWHISPR_OPENAI_BASE_URL,
           groq: OPENWHISPR_GROQ_BASE_URL,
           mistral: OPENWHISPR_MISTRAL_BASE_URL,
         };
         for (const provider of registry.transcriptionProviders) {
           const url = providerBaseUrls[provider.id];
           if (url) provider.baseUrl = url;
         }
         ```
       - Confirm provider IDs (`openai`, `groq`, `mistral`) by reading the JSON first.

    **Step C — Consumer audit (Warning 5 fix):**
    3. Run an explicit grep audit:
       ```bash
       grep -rn "transcriptionProviders" src/ --include="*.ts" --include="*.tsx" --include="*.js"
       ```
       For EVERY hit outside `src/models/ModelRegistry.ts` AND outside `src/models/modelRegistryData.json`:
       - If the consumer accesses `.baseUrl` on a transcription provider entry → refactor it to obtain the provider through `ModelRegistry` (which has the injected `baseUrl`), NOT by directly importing the JSON.
       - If the consumer only reads non-`baseUrl` fields (id, name, supportedLanguages, etc.) → no action needed (still acceptable to import the JSON).

    4. Specific files to inspect (per Warning 5):
       - `src/config/aiProvidersConfig.ts` — derives AI_MODES from registry. If it reads `.baseUrl`, route through ModelRegistry.
       - `src/utils/languages.ts` — derives REASONING_PROVIDERS from registry. If it reads `.baseUrl`, route through ModelRegistry.
       - `src/helpers/modelManagerBridge.js` — handles local model downloads. CommonJS file. If it accesses `.baseUrl` on transcriptionProviders, refactor: either (a) require ModelRegistry's compiled output if possible, OR (b) have it `require("../config/build-config.generated.cjs")` and use the same injection table as ModelRegistry.ts. Prefer option (a) for SoT; pick (b) only if circular-import or runtime constraints block (a).

    5. **Acceptance grep:** After audit:
       ```bash
       grep -rn "\.baseUrl" src/ --include="*.ts" --include="*.tsx" --include="*.js" | grep -i "transcriptionProvider"
       ```
       Output MUST contain hits ONLY in `src/models/ModelRegistry.ts` (the injection site). All other files either don't access `.baseUrl` on transcription providers, or obtain the provider object via ModelRegistry. Document the audit output in the SUMMARY.

    **Step D — sanity checks:**
    6. `grep -cE "https://(api\\.openai\\.com|api\\.groq\\.com|api\\.mistral\\.ai)" src/models/modelRegistryData.json` must return 0.
    7. `npx tsc --noEmit -p src/tsconfig.json` must pass for ModelRegistry.ts and any modified consumer files.
    8. JSON sanity: `node -e "const r=require('./src/models/modelRegistryData.json'); const tp=r.transcriptionProviders||[]; if(tp.some(p=>p.baseUrl)) process.exit(1)"` must exit 0.
  </action>
  <verify>
    <automated>test "$(grep -cE 'https://(api\.openai\.com|api\.groq\.com|api\.mistral\.ai)' src/models/modelRegistryData.json)" = "0" && node -e "const r=require('./src/models/modelRegistryData.json'); const tp=r.transcriptionProviders||[]; if(tp.some(p=>p.baseUrl)) process.exit(1)" && grep -q "OPENWHISPR_OPENAI_BASE_URL" src/models/ModelRegistry.ts && AUDIT="$(grep -rn '\.baseUrl' src/ --include='*.ts' --include='*.tsx' --include='*.js' | grep -i 'transcriptionProvider' | grep -v 'src/models/ModelRegistry.ts' || true)"; test -z "$AUDIT" && npx tsc --noEmit -p src/tsconfig.json 2>&1 | grep -E "ModelRegistry\.ts" | grep -v "^$" && exit 1; exit 0</automated>
  </verify>
  <acceptance_criteria>
    - `grep -cE "https://(api\.openai\.com|api\.groq\.com|api\.mistral\.ai)" src/models/modelRegistryData.json` outputs `0`.
    - JSON parses; no `transcriptionProviders[*].baseUrl` field present.
    - `ModelRegistry.ts` references `OPENWHISPR_OPENAI_BASE_URL`, `OPENWHISPR_GROQ_BASE_URL`, `OPENWHISPR_MISTRAL_BASE_URL`.
    - **Audit grep:** `grep -rn '\.baseUrl' src/ ... | grep -i 'transcriptionProvider' | grep -v 'src/models/ModelRegistry.ts'` returns ZERO matches.
    - TypeScript compile passes.
  </acceptance_criteria>
  <done>JSON is pure data; ModelRegistry.ts is the sole injector; all transcriptionProviders.baseUrl consumers route through ModelRegistry.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: Refactor src/helpers/ipcHandlers.js mirror sites (Anthropic/Groq/Mistral inline literals)</name>
  <files>src/helpers/ipcHandlers.js</files>
  <read_first>
    - src/helpers/ipcHandlers.js (lines 60-65 for MISTRAL_TRANSCRIPTION_URL; 2820-2830 for Anthropic; 3585-3595 for Groq)
    - src/config/build-config.generated.cjs (exports list)
    - docs/CONFIG_INVENTORY.md (rows 22, 23 notes about ipcHandlers mirrors; row 19 note about Mistral)
  </read_first>
  <action>
    1. Extend the existing `require("../config/build-config.generated.cjs")` destructure (added in Plan 2 Task 3) to also include:
       ```js
       const {
         OPENWHISPR_AUTH_URL,
         OPENWHISPR_BACKEND_URL,
         OPENWHISPR_ANTHROPIC_URL,
         OPENWHISPR_GROQ_BASE_URL,
         OPENWHISPR_MISTRAL_BASE_URL,
       } = require("../config/build-config.generated.cjs");
       ```
    2. Line ~61 (`MISTRAL_TRANSCRIPTION_URL`): replace literal `"https://api.mistral.ai/v1"` (or full path) with `OPENWHISPR_MISTRAL_BASE_URL`. Preserve any path suffix: `` `${OPENWHISPR_MISTRAL_BASE_URL}/audio/transcriptions` ``.
    3. Line ~2826 (Anthropic proxy URL): replace literal `"https://api.anthropic.com/v1/messages"` with `OPENWHISPR_ANTHROPIC_URL`.
    4. Line ~3589 (Groq URL): replace literal `"https://api.groq.com/openai/v1"` (or full path) with `OPENWHISPR_GROQ_BASE_URL` (preserving suffix as in step 2).
    5. After changes: `grep -cE "https://(api\\.anthropic\\.com|api\\.groq\\.com|api\\.mistral\\.ai)" src/helpers/ipcHandlers.js` must return 0.
    6. `node --check src/helpers/ipcHandlers.js` must pass.
  </action>
  <verify>
    <automated>test "$(grep -cE 'https://(api\.anthropic\.com|api\.groq\.com|api\.mistral\.ai)' src/helpers/ipcHandlers.js)" = "0" && grep -q "OPENWHISPR_ANTHROPIC_URL" src/helpers/ipcHandlers.js && grep -q "OPENWHISPR_GROQ_BASE_URL" src/helpers/ipcHandlers.js && grep -q "OPENWHISPR_MISTRAL_BASE_URL" src/helpers/ipcHandlers.js && node --check src/helpers/ipcHandlers.js</automated>
  </verify>
  <acceptance_criteria>
    - `grep -cE "https://(api\.anthropic\.com|api\.groq\.com|api\.mistral\.ai)" src/helpers/ipcHandlers.js` outputs `0`.
    - File destructure includes the three new keys from `../config/build-config.generated.cjs`.
    - `node --check` exits 0.
  </acceptance_criteria>
  <done>ipcHandlers.js Anthropic/Groq/Mistral mirror sites all use build-config.generated.cjs requires.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| App → Third-party LLM/transcription APIs | OPENAI/ANTHROPIC/GEMINI/GROQ/MISTRAL base URLs control where user prompts and audio go. |
| Renderer ↔ Main IPC | Anthropic IPC bridge passes through main; URL must be authoritative from build-config.generated.cjs. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-03-14 | Spoofing | Maintainer-overrideable LLM endpoints | accept | Documented use case (LiteLLM proxy / self-hosted gateway). Defaults preserved. |
| T-03-15 | Tampering | JSON registry no longer holding URLs | mitigate | Removing baseUrl from JSON eliminates JSON-template attack surface. |
| T-03-16 | Information Disclosure | constants.ts re-exports | accept | Re-exports preserve import-graph stability; no new disclosure. |
| T-03-22 | Tampering | transcriptionProviders.baseUrl drift | mitigate | Consumer audit (Task 2 Step C) ensures only ModelRegistry reads `.baseUrl`; other consumers route through it. Eliminates risk of one consumer reading an un-injected baseUrl. |
</threat_model>

<verification>
- `src/config/constants.ts`: zero literal API URLs.
- `src/models/modelRegistryData.json`: zero API URL literals; no `baseUrl` field on transcription providers.
- `src/components/McpIntegrationCard.tsx`: zero `mcp.openwhispr.com` literals.
- `src/helpers/ipcHandlers.js`: zero Anthropic/Groq/Mistral URL literals.
- **Consumer audit:** Only `src/models/ModelRegistry.ts` accesses `.baseUrl` on `transcriptionProviders` entries.
- TypeScript compiles cleanly.
- `node --check` passes on all `.js` targets.

After this plan, run global grep:
```
grep -rnE "https://(api\.openai\.com|api\.anthropic\.com|generativelanguage\.googleapis\.com|api\.groq\.com|api\.mistral\.ai|auth\.openwhispr\.com|api\.openwhispr\.com|mcp\.openwhispr\.com|accounts\.google\.com|oauth2\.googleapis\.com|www\.googleapis\.com/calendar|openwhispr\.com/auth/desktop-callback|openwhispr\.com/reset-password)" src/ main.js
```
Expected: matches ONLY in `src/config/build-config.generated.{ts,cjs}` (and possibly the generator script itself if it's under src/, but it lives in `scripts/`).
</verification>

<success_criteria>
All `must_haves.truths` observable; CFG-04 anchor `OPENWHISPR_BACKEND_URL` reaches its renderer-side consumer; zero non-build-config URL literals remain across touched files; transcriptionProviders.baseUrl is read only by ModelRegistry.
</success_criteria>

<output>
After completion, create `.planning/phases/03-build-time-env-refactor/03-05-SUMMARY.md` including:
- Global-grep result from verification block.
- Consumer-audit output (the `\.baseUrl | grep transcriptionProvider` grep) showing only ModelRegistry hits.
This SUMMARY is the source-level proof for ROADMAP success criterion #1.
</output>
