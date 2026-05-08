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
autonomous: true
requirements: [CFG-02, CFG-04]

must_haves:
  truths:
    - "src/config/constants.ts has zero literal API URLs (OPENAI_BASE/ANTHROPIC/GEMINI/GROQ/MISTRAL all read from defaults.ts)"
    - "src/models/modelRegistryData.json no longer contains literal baseUrl strings for the three transcription providers (OpenAI, Groq, Mistral)"
    - "ModelRegistry.ts injects baseUrls from defaults.ts when constructing the in-memory registry"
    - "src/components/McpIntegrationCard.tsx reads OPENWHISPR_MCP_URL from defaults.ts"
    - "src/helpers/ipcHandlers.js Mistral/Groq/Anthropic URL constants read from defaults.ts (no inline literals)"
    - "Setting OPENWHISPR_OPENAI_BASE_URL=https://my-proxy.example.com/v1 changes both renderer (constants.ts) and main (modelRegistry, ipcHandlers) consumers"
  artifacts:
    - path: "src/config/constants.ts"
      provides: "Re-exports/derives API endpoint constants from defaults.ts; no inline URL literals"
      contains: "from \"./defaults\""
    - path: "src/models/modelRegistryData.json"
      provides: "Pure data — baseUrl fields removed from the three transcription providers"
    - path: "src/models/ModelRegistry.ts"
      provides: "Injects baseUrls from defaults.ts into the in-memory registry at construction time"
      contains: "OPENWHISPR_OPENAI_BASE_URL"
    - path: "src/components/McpIntegrationCard.tsx"
      provides: "MCP URL displayed in UI from defaults.ts"
      contains: "OPENWHISPR_MCP_URL"
    - path: "src/helpers/ipcHandlers.js"
      provides: "Anthropic/Groq/Mistral URL constants from defaults.ts"
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
---

<objective>
Wave 4 (depends on Plan 1 foundation + Plan 2 to avoid the constants.ts/auth.ts edit collision) — finish the refactor by handling the model-registry + LiteLLM bucket. This is the largest remaining slice (rows 6, 9, 17–23 in CONFIG_INVENTORY) but mechanically the simplest now that the pattern is proven.

Per RESEARCH.md §Single source of truth, Option b: move the three baseUrl values out of `modelRegistryData.json` entirely and inject them in `ModelRegistry.ts` at construction time. The JSON becomes pure data.

Per D-05: consolidate the three Groq sites and three Mistral sites and the constants.ts:116 BACKEND_URL site into single defaults.ts imports.

CONFIG_INVENTORY rows handled: 6 (constants.ts:116 BACKEND_URL — CFG-04 anchor renderer side), 9 (McpIntegrationCard MCP URL), 17/18/19 (registry baseUrls), 21 (constants.ts OPENAI_BASE), 22 (constants.ts ANTHROPIC), 23 (constants.ts GEMINI), and the constants.ts:77/78 GROQ_BASE/MISTRAL_BASE entries plus the ipcHandlers.js:61/2826/3589 mirror sites.
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
After Plan 1, src/config/defaults.ts exports:
  OPENWHISPR_BACKEND_URL: string  (default "")
  OPENWHISPR_MCP_URL: string
  OPENWHISPR_OPENAI_BASE_URL: string
  OPENWHISPR_ANTHROPIC_URL: string
  OPENWHISPR_GEMINI_BASE_URL: string
  OPENWHISPR_GROQ_BASE_URL: string
  OPENWHISPR_MISTRAL_BASE_URL: string

CONFIG_INVENTORY rows handled:
  Row 6:  src/config/constants.ts:116           "" (empty default)               → OPENWHISPR_BACKEND_URL  (CFG-04 anchor renderer)
  Row 9:  src/components/McpIntegrationCard.tsx:13  "https://mcp.openwhispr.com/mcp" → OPENWHISPR_MCP_URL
  Row 17: src/models/modelRegistryData.json:139 "https://api.openai.com/v1"     → OPENWHISPR_OPENAI_BASE_URL  (move out of JSON)
  Row 18: src/models/modelRegistryData.json:166 "https://api.groq.com/openai/v1" → OPENWHISPR_GROQ_BASE_URL  (move out of JSON)
  Row 19: src/models/modelRegistryData.json:185 "https://api.mistral.ai/v1"     → OPENWHISPR_MISTRAL_BASE_URL  (move out of JSON)
  Row 21: src/config/constants.ts:60            "https://api.openai.com/v1"     → OPENWHISPR_OPENAI_BASE_URL
  Row 22: src/config/constants.ts:75            "https://api.anthropic.com/v1/messages" → OPENWHISPR_ANTHROPIC_URL
  Row 23: src/config/constants.ts:76            "https://generativelanguage.googleapis.com/v1beta" → OPENWHISPR_GEMINI_BASE_URL

Mirror sites (Phase 3 must touch but NOT separate inventory rows — mentioned in inventory notes):
  src/config/constants.ts:77   GROQ_BASE       → OPENWHISPR_GROQ_BASE_URL
  src/config/constants.ts:78   MISTRAL_BASE    → OPENWHISPR_MISTRAL_BASE_URL
  src/helpers/ipcHandlers.js:61    MISTRAL_TRANSCRIPTION_URL  → OPENWHISPR_MISTRAL_BASE_URL
  src/helpers/ipcHandlers.js:2826  Anthropic proxy URL        → OPENWHISPR_ANTHROPIC_URL
  src/helpers/ipcHandlers.js:3589  Groq URL                   → OPENWHISPR_GROQ_BASE_URL
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Refactor src/config/constants.ts + src/components/McpIntegrationCard.tsx (rows 6, 9, 21, 22, 23 + GROQ/MISTRAL mirrors)</name>
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
    2. Replace `DEFAULT_OPENAI_BASE` (line 60) and the surrounding `computeBaseUrl` env-fallback chain (lines 59-69 if separate) with a one-liner: `export const DEFAULT_OPENAI_BASE = OPENWHISPR_OPENAI_BASE_URL;`. Delete the now-unused `computeBaseUrl` helper if it has no other callers (grep first).
    3. Replace `API_ENDPOINTS.ANTHROPIC` (line 75) literal with `OPENWHISPR_ANTHROPIC_URL`.
    4. Replace `API_ENDPOINTS.GEMINI` (line 76) literal with `OPENWHISPR_GEMINI_BASE_URL`.
    5. Replace `API_ENDPOINTS.GROQ_BASE` (line 77) literal with `OPENWHISPR_GROQ_BASE_URL`.
    6. Replace `API_ENDPOINTS.MISTRAL_BASE` (line 78) literal with `OPENWHISPR_MISTRAL_BASE_URL`.
    7. Replace `OPENWHISPR_API_URL` (line 116, currently `(env.VITE_OPENWHISPR_API_URL as string) || ""`) with: `export const OPENWHISPR_API_URL = OPENWHISPR_BACKEND_URL;`. The empty-default semantic is preserved by `pickAllowEmpty` in defaults.ts.
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
  <name>Task 2: Move baseUrls out of modelRegistryData.json + inject in ModelRegistry.ts (rows 17, 18, 19)</name>
  <files>src/models/modelRegistryData.json, src/models/ModelRegistry.ts</files>
  <read_first>
    - src/models/modelRegistryData.json (lines 130-200 — transcriptionProviders array structure)
    - src/models/ModelRegistry.ts (full file — find where transcriptionProviders is read/used)
    - src/config/defaults.ts (exports list)
    - docs/CONFIG_INVENTORY.md (rows 17, 18, 19)
    - .planning/phases/03-build-time-env-refactor/03-RESEARCH.md (§Single source of truth, "Recommend Option b")
  </read_first>
  <action>
    1. In `src/models/modelRegistryData.json`:
       - Find the three `transcriptionProviders` entries (currently with `baseUrl: "https://api.openai.com/v1"` etc.).
       - DELETE the `baseUrl` field from all three entries (OpenAI, Groq, Mistral). The JSON becomes pure data.
       - Add a top-level `"_baseUrlInjectedAtRuntime": true` marker (optional documentation aid, no functional effect).
    2. In `src/models/ModelRegistry.ts`:
       - Add: `import { OPENWHISPR_OPENAI_BASE_URL, OPENWHISPR_GROQ_BASE_URL, OPENWHISPR_MISTRAL_BASE_URL } from "@/config/defaults";` (or relative path).
       - Find the constructor / load method that reads `modelRegistryData.json`. After loading, inject `baseUrl` on each transcription provider by `id`:
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
         Use the actual provider ID strings as they appear in the JSON (`openai`, `groq`, `mistral` — confirm by reading the JSON first).
    3. After changes: `grep -cE "https://(api\\.openai\\.com|api\\.groq\\.com|api\\.mistral\\.ai)" src/models/modelRegistryData.json` must return 0.
    4. `npx tsc --noEmit -p src/tsconfig.json` must pass for ModelRegistry.ts.
    5. Sanity check: `node -e "const r=require('./src/models/modelRegistryData.json'); const tp=r.transcriptionProviders||[]; if(tp.some(p=>p.baseUrl)) { console.error('JSON still contains baseUrl', tp); process.exit(1); }"` must exit 0.
  </action>
  <verify>
    <automated>test "$(grep -cE 'https://(api\.openai\.com|api\.groq\.com|api\.mistral\.ai)' src/models/modelRegistryData.json)" = "0" && node -e "const r=require('./src/models/modelRegistryData.json'); const tp=r.transcriptionProviders||[]; if(tp.some(p=>p.baseUrl)) process.exit(1)" && grep -q "OPENWHISPR_OPENAI_BASE_URL" src/models/ModelRegistry.ts && npx tsc --noEmit -p src/tsconfig.json 2>&1 | grep -E "ModelRegistry\.ts" | grep -v "^$" && exit 1; exit 0</automated>
  </verify>
  <acceptance_criteria>
    - `grep -cE "https://(api\.openai\.com|api\.groq\.com|api\.mistral\.ai)" src/models/modelRegistryData.json` outputs `0`.
    - JSON parses; no `transcriptionProviders[*].baseUrl` field present.
    - `ModelRegistry.ts` references `OPENWHISPR_OPENAI_BASE_URL`, `OPENWHISPR_GROQ_BASE_URL`, `OPENWHISPR_MISTRAL_BASE_URL`.
    - In-memory registry (after construction) has `baseUrl` populated on each transcription provider — verifiable by adding a quick `console.log(JSON.stringify(registry.getTranscriptionProviders()))` in a test stub if needed (not required for grep gate).
    - TypeScript compile passes.
  </acceptance_criteria>
  <done>JSON is pure data; ModelRegistry.ts injects baseUrls from defaults.ts.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: Refactor src/helpers/ipcHandlers.js mirror sites (Anthropic/Groq/Mistral inline literals)</name>
  <files>src/helpers/ipcHandlers.js</files>
  <read_first>
    - src/helpers/ipcHandlers.js (lines 60-65 for MISTRAL_TRANSCRIPTION_URL; lines 2820-2830 for Anthropic; lines 3585-3595 for Groq — confirm exact line numbers)
    - src/config/defaults.ts (exports list)
    - docs/CONFIG_INVENTORY.md (rows 22, 23 notes about ipcHandlers mirrors; row 19 note about Mistral)
  </read_first>
  <action>
    1. Extend the existing `require("config/defaults")` destructure (added in Plan 2 Task 3) to also include:
       ```js
       const {
         OPENWHISPR_AUTH_URL,
         OPENWHISPR_BACKEND_URL,
         OPENWHISPR_ANTHROPIC_URL,
         OPENWHISPR_GROQ_BASE_URL,
         OPENWHISPR_MISTRAL_BASE_URL,
       } = require("../dist/config/defaults");
       ```
       (Path style must match Plan 2's choice.)
    2. Line ~61 (`MISTRAL_TRANSCRIPTION_URL`): replace literal `"https://api.mistral.ai/v1"` (or whatever full path is there) with `OPENWHISPR_MISTRAL_BASE_URL`. If the existing literal includes a path suffix like `/audio/transcriptions`, preserve the suffix: `` `${OPENWHISPR_MISTRAL_BASE_URL}/audio/transcriptions` ``.
    3. Line ~2826 (Anthropic proxy URL): replace literal `"https://api.anthropic.com/v1/messages"` with `OPENWHISPR_ANTHROPIC_URL`.
    4. Line ~3589 (Groq URL): replace literal `"https://api.groq.com/openai/v1"` (or with path suffix) with `OPENWHISPR_GROQ_BASE_URL` (preserving any path suffix as in step 2).
    5. After changes: `grep -cE "https://(api\\.anthropic\\.com|api\\.groq\\.com|api\\.mistral\\.ai)" src/helpers/ipcHandlers.js` must return 0.
    6. `node --check src/helpers/ipcHandlers.js` must pass.
  </action>
  <verify>
    <automated>test "$(grep -cE 'https://(api\.anthropic\.com|api\.groq\.com|api\.mistral\.ai)' src/helpers/ipcHandlers.js)" = "0" && grep -q "OPENWHISPR_ANTHROPIC_URL" src/helpers/ipcHandlers.js && grep -q "OPENWHISPR_GROQ_BASE_URL" src/helpers/ipcHandlers.js && grep -q "OPENWHISPR_MISTRAL_BASE_URL" src/helpers/ipcHandlers.js && node --check src/helpers/ipcHandlers.js</automated>
  </verify>
  <acceptance_criteria>
    - `grep -cE "https://(api\.anthropic\.com|api\.groq\.com|api\.mistral\.ai)" src/helpers/ipcHandlers.js` outputs `0`.
    - File destructure includes the three new keys.
    - `node --check` exits 0.
  </acceptance_criteria>
  <done>ipcHandlers.js Anthropic/Groq/Mistral mirror sites all use defaults.ts imports.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| App → Third-party LLM/transcription APIs | OPENAI/ANTHROPIC/GEMINI/GROQ/MISTRAL base URLs control where user prompts and audio go. |
| Renderer ↔ Main IPC | Anthropic IPC bridge passes through main; URL must be authoritative from defaults.ts. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-03-14 | Spoofing | Maintainer-overrideable LLM endpoints | accept | Documented use case (LiteLLM proxy / self-hosted gateway). Defaults preserved. |
| T-03-15 | Tampering | JSON registry no longer holding URLs | mitigate | Removing baseUrl from JSON eliminates the JSON-template attack surface. URLs come from typed TS module. |
| T-03-16 | Information Disclosure | constants.ts re-exports | accept | Re-exports preserve import-graph stability for existing call sites; no new disclosure. |
</threat_model>

<verification>
- `src/config/constants.ts`: zero literal API URLs.
- `src/models/modelRegistryData.json`: zero `https://api.openai|groq|mistral` literals; no `baseUrl` field on transcription providers.
- `src/components/McpIntegrationCard.tsx`: zero `mcp.openwhispr.com` literals.
- `src/helpers/ipcHandlers.js`: zero Anthropic/Groq/Mistral URL literals.
- TypeScript compiles cleanly.
- `node --check` passes on all `.js` targets.

After this plan completes, run a global grep across the source tree:
```
grep -rnE "https://(api\.openai\.com|api\.anthropic\.com|generativelanguage\.googleapis\.com|api\.groq\.com|api\.mistral\.ai|auth\.openwhispr\.com|api\.openwhispr\.com|mcp\.openwhispr\.com|accounts\.google\.com|oauth2\.googleapis\.com|www\.googleapis\.com/calendar|openwhispr\.com/auth/desktop-callback|openwhispr\.com/reset-password)" src/ main.js
```
Expected: only matches inside `src/config/defaults.ts` and `src/config/build-config.generated.ts` (and possibly the documented row 5 parity literal in `main.js` from Plan 2).
</verification>

<success_criteria>
All `must_haves.truths` observable; CFG-04 anchor `OPENWHISPR_BACKEND_URL` reaches its renderer-side consumer (constants.ts:116 → defaults.ts); zero non-defaults-module URL literals remain across the touched files.
</success_criteria>

<output>
After completion, create `.planning/phases/03-build-time-env-refactor/03-05-SUMMARY.md` including the global-grep result from the verification block above. This summary serves as the source-level proof for ROADMAP success criterion #1.
</output>
