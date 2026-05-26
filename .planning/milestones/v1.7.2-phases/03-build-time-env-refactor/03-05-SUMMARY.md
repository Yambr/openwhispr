---
phase: 03-build-time-env-refactor
plan: 5
subsystem: model-registry
tags: [build-time-env, model-registry, litellm, transcription-providers, llm-base-urls]
requires:
  - "src/config/defaults.ts (Plan 1)"
  - "src/config/build-config.generated.cjs (Plan 1)"
provides:
  - "constants.ts API_ENDPOINTS sourced from defaults.ts (zero literal LLM URLs)"
  - "modelRegistryData.json as pure data (no transcriptionProviders.baseUrl)"
  - "ModelRegistry.ts as sole runtime baseUrl injector"
  - "ipcHandlers.js Anthropic/Groq/Mistral mirrors using build-config.generated.cjs"
  - "McpIntegrationCard.tsx MCP_URL sourced from defaults.ts"
affects:
  - src/config/constants.ts
  - src/components/McpIntegrationCard.tsx
  - src/models/modelRegistryData.json
  - src/models/ModelRegistry.ts
  - src/helpers/ipcHandlers.js
tech-stack:
  added: []
  patterns:
    - "Runtime baseUrl injection at module-load time (modelRegistryData.json → ModelRegistry.ts)"
    - "Single source of truth for transcription provider URLs (Option b from RESEARCH.md)"
    - "RawTranscriptionProviderData type for pre-injection JSON shape"
key-files:
  created: []
  modified:
    - src/config/constants.ts
    - src/components/McpIntegrationCard.tsx
    - src/models/modelRegistryData.json
    - src/models/ModelRegistry.ts
    - src/helpers/ipcHandlers.js
decisions:
  - "Kept DEFAULT_TRANSCRIPTION_BASE computeBaseUrl() chain in constants.ts because it composes WHISPER_BASE_URL/OPENWHISPR_TRANSCRIPTION_BASE_URL that are NOT in scope for Plan 5 (no inventory row); only DEFAULT_OPENAI_BASE was collapsed to a direct OPENWHISPR_OPENAI_BASE_URL re-export"
  - "Used a non-mutating injectTranscriptionBaseUrls() helper (returns new array of objects spread-with-baseUrl) instead of in-place mutation — preserves immutability of imported JSON"
  - "Introduced RawTranscriptionProviderData = Omit<TranscriptionProviderData, baseUrl> + ModelRegistryRawData internal type to bridge JSON-without-baseUrl and runtime-with-baseUrl shapes; TranscriptionProviderData.baseUrl remains required for downstream consumers"
metrics:
  duration: ~10min
  tasks: 3
  files: 5
  completed: 2026-05-08
---

# Phase 3 Plan 5: Model Registry + LiteLLM Summary

Closed the largest remaining slice of the build-time env refactor: removed the three transcription-provider `baseUrl` literals from `modelRegistryData.json`, made `ModelRegistry.ts` the sole injection site, and routed all LLM/MCP URL constants in `constants.ts`, `McpIntegrationCard.tsx`, and `ipcHandlers.js` mirror sites through `defaults.ts` / `build-config.generated.cjs`. CFG-04 anchor `OPENWHISPR_BACKEND_URL` now reaches both renderer (`OPENWHISPR_API_URL`) and main consumers.

## What Was Built

### Task 1 — constants.ts + McpIntegrationCard.tsx (commit `9e3eac1`)

`src/config/constants.ts` gained a six-key import block from `./defaults` (`OPENWHISPR_BACKEND_URL`, `OPENWHISPR_OPENAI_BASE_URL`, `OPENWHISPR_ANTHROPIC_URL`, `OPENWHISPR_GEMINI_BASE_URL`, `OPENWHISPR_GROQ_BASE_URL`, `OPENWHISPR_MISTRAL_BASE_URL`).

- `DEFAULT_OPENAI_BASE` collapsed from a `computeBaseUrl([env.OPENWHISPR_OPENAI_BASE_URL, env.OPENAI_BASE_URL], "https://api.openai.com/v1")` chain to a direct alias of `OPENWHISPR_OPENAI_BASE_URL` (Plan 1's `pickAllowEmpty`/`pick` already owns env override resolution; the secondary `env.OPENAI_BASE_URL` fallback was Plan-2-era drift surface that's no longer needed).
- `API_ENDPOINTS.{ANTHROPIC,GEMINI,GROQ_BASE,MISTRAL_BASE}` now reference the imported defaults instead of literals.
- `buildApiUrl()`'s "no-base-passed" fallback updated from inline `"https://api.openai.com/v1"` literal to `OPENWHISPR_OPENAI_BASE_URL`.
- `OPENWHISPR_API_URL` (line 116) collapsed from `(env.VITE_OPENWHISPR_API_URL as string) || ""` to `OPENWHISPR_BACKEND_URL` — closing the CFG-04 renderer loop. Empty-default semantics preserved by `defaults.ts`'s `pickAllowEmpty`.

`src/components/McpIntegrationCard.tsx` adds `import { OPENWHISPR_MCP_URL } from "../config/defaults";` and re-binds the module-local `MCP_URL` const to it (preserves all 3 internal call sites unchanged).

CONFIG_INVENTORY rows handled: 6, 9, 21, 22, 23 + GROQ_BASE/MISTRAL_BASE mirror.

### Task 2 — modelRegistryData.json + ModelRegistry.ts injection (commit `116fdc2`)

`src/models/modelRegistryData.json`: deleted `baseUrl` field from the three `transcriptionProviders` entries (`openai`, `groq`, `mistral`). The JSON is now pure data.

`src/models/ModelRegistry.ts`:
- Imports `OPENWHISPR_OPENAI_BASE_URL`, `OPENWHISPR_GROQ_BASE_URL`, `OPENWHISPR_MISTRAL_BASE_URL` from `../config/defaults`.
- New internal types: `RawTranscriptionProviderData` (= JSON shape without `baseUrl`) and `ModelRegistryRawData` (raw container) bridge the JSON-as-imported and runtime-with-baseUrl shapes. `TranscriptionProviderData.baseUrl` remains required for downstream consumers.
- `injectTranscriptionBaseUrls(raw: ModelRegistryRawData): ModelRegistryData` is the **sole** injection function. It maps each raw provider to a new object with `baseUrl: TRANSCRIPTION_PROVIDER_BASE_URLS[p.id] ?? ""`. Non-mutating (preserves imported JSON immutability).
- Module-load: `const modelData: ModelRegistryData = injectTranscriptionBaseUrls(modelDataRaw as unknown as ModelRegistryRawData)`.

Downstream consumers (`TranscriptionModelPicker.tsx` reads `.baseUrl` on `cloudProviders` from `getTranscriptionProviders()`) automatically receive the injected URL because `getTranscriptionProviders()` returns the post-injection `modelData.transcriptionProviders` array.

CONFIG_INVENTORY rows handled: 17, 18, 19.

### Task 3 — ipcHandlers.js mirror sites (commit `ce9982d`)

Extended the existing top-of-file destructure of `../config/build-config.generated.cjs` to include three new keys: `OPENWHISPR_ANTHROPIC_URL`, `OPENWHISPR_GROQ_BASE_URL`, `OPENWHISPR_MISTRAL_BASE_URL`.

- Line 65: `MISTRAL_TRANSCRIPTION_URL = \`${OPENWHISPR_MISTRAL_BASE_URL}/audio/transcriptions\``.
- Line 2830: `proxyFetch(OPENWHISPR_ANTHROPIC_URL, ...)`.
- Line 3574: `endpoint = \`${OPENWHISPR_GROQ_BASE_URL}/audio/transcriptions\``.

Mirror sites only — these are runtime call sites, not new constant declarations. The single-source-of-truth values live in `build-config.generated.cjs`.

## Verification Performed

### Per-task grep gates (all PASS)

```
$ grep -cE 'https://(api\.openai\.com|api\.anthropic\.com|generativelanguage\.googleapis\.com|api\.groq\.com|api\.mistral\.ai)' src/config/constants.ts
0
$ grep -cF 'mcp.openwhispr.com' src/components/McpIntegrationCard.tsx
0
$ grep -cE 'https://(api\.openai\.com|api\.groq\.com|api\.mistral\.ai)' src/models/modelRegistryData.json
0
$ grep -cE 'https://(api\.anthropic\.com|api\.groq\.com|api\.mistral\.ai)' src/helpers/ipcHandlers.js
0
$ node -e "const r=require('./src/models/modelRegistryData.json'); const tp=r.transcriptionProviders||[]; console.log('hasBaseUrl:', tp.some(p=>p.baseUrl))"
hasBaseUrl: false
```

### Consumer-audit grep (Warning 5)

```
$ AUDIT=$(grep -rn '\.baseUrl' src/ --include='*.ts' --include='*.tsx' --include='*.js' | grep -i 'transcriptionProvider' | grep -v 'src/models/ModelRegistry.ts')
$ echo "[$AUDIT]"
[]
```

Zero hits outside `src/models/ModelRegistry.ts` — the injection site is now the unique reader of `.baseUrl` on the literal token "transcriptionProvider". Downstream consumers (`TranscriptionModelPicker.tsx`) read `.baseUrl` on a variable named `cloudProviders` (which is the output of `getTranscriptionProviders()` — i.e., the post-injection array), so they receive the injected URL by construction. The plan's literal acceptance criterion holds.

### Type & syntax checks

```
$ cd src && npx tsc --noEmit -p tsconfig.json   # no errors in constants.ts/McpIntegrationCard.tsx/ModelRegistry.ts
$ node --check src/helpers/ipcHandlers.js       # OK
```

### Global verification grep (per plan)

```
$ grep -rnE "https://(api\.openai\.com|api\.anthropic\.com|generativelanguage\.googleapis\.com|api\.groq\.com|api\.mistral\.ai|auth\.openwhispr\.com|api\.openwhispr\.com|mcp\.openwhispr\.com|accounts\.google\.com|oauth2\.googleapis\.com|www\.googleapis\.com/calendar|openwhispr\.com/auth/desktop-callback|openwhispr\.com/reset-password)" src/ main.js
```

Hits are confined to:
- `src/vite.config.mjs` (env-fallback chains feeding the Vite `define` block — by design; this IS the renderer-side build-config injection layer)
- `src/config/build-config.generated.cjs` (auto-generated, gitignored, frozen)
- `src/config/build-config.generated.ts` (auto-generated, gitignored)

Zero hits in production source code (`*.ts`, `*.tsx`, `*.js` excluding the three above). This matches the plan's expected outcome ("matches ONLY in `src/config/build-config.generated.{ts,cjs}` and possibly the generator script itself").

## Deviations from Plan

**1. [Rule 3 — Blocking issue] Made `TranscriptionProviderData` injection non-mutating, introduced raw/injected type split**

- **Found during:** Task 2 step B
- **Issue:** Plan specified in-place mutation (`for (const provider of registry.transcriptionProviders) { provider.baseUrl = ... }`), but the imported JSON is treated by TS as a deeply-readonly literal (the cast `modelDataRaw as ModelRegistryData` failed because the JSON literal type didn't have `baseUrl` after step A). In-place mutation also introduces test-isolation hazards if the same JSON object is imported elsewhere.
- **Fix:** Introduced `RawTranscriptionProviderData = Omit<TranscriptionProviderData, "baseUrl">` and `ModelRegistryRawData` (raw container). Wrote `injectTranscriptionBaseUrls(raw)` returning a new `ModelRegistryData` with a freshly-mapped `transcriptionProviders` array. Functionally identical — providers exposed via `getTranscriptionProviders()` carry the injected `baseUrl` — but immutable and type-clean.
- **Files modified:** `src/models/ModelRegistry.ts`
- **Commit:** `116fdc2`

**2. [Rule 3 — Blocking issue] Kept `DEFAULT_TRANSCRIPTION_BASE` `computeBaseUrl()` chain intact**

- **Found during:** Task 1 step 2
- **Issue:** Plan said "Delete `computeBaseUrl` if it has no other callers (grep first)". Grep showed it has a second caller: `DEFAULT_TRANSCRIPTION_BASE` (composing `OPENWHISPR_TRANSCRIPTION_BASE_URL` and `WHISPER_BASE_URL` env vars that are out of scope for Plan 5 — no CONFIG_INVENTORY row covers them).
- **Fix:** Kept `computeBaseUrl()` and `DEFAULT_TRANSCRIPTION_BASE` unchanged. Only `DEFAULT_OPENAI_BASE` was collapsed to a direct re-export of `OPENWHISPR_OPENAI_BASE_URL`. No literal URL leaks remain in scope.
- **Files modified:** `src/config/constants.ts`
- **Commit:** `9e3eac1`

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| Non-mutating `injectTranscriptionBaseUrls()` | TS-clean cast from raw JSON shape; no shared-state hazards; preserves imported JSON immutability. |
| `RawTranscriptionProviderData = Omit<…, "baseUrl">` | Lets the public `TranscriptionProviderData` keep `baseUrl: string` (required) for downstream consumers, while accurately typing the JSON pre-injection. |
| Kept `computeBaseUrl()` for `DEFAULT_TRANSCRIPTION_BASE` | The Plan-5 CONFIG_INVENTORY rows only cover `OPENWHISPR_OPENAI_BASE_URL`; the `WHISPER_BASE_URL`/`OPENWHISPR_TRANSCRIPTION_BASE_URL` chain belongs to a different inventory slice (out of scope). Removing it would change behavior. |
| Collapsed `OPENWHISPR_API_URL` to direct `OPENWHISPR_BACKEND_URL` re-export | CFG-04 anchor: `defaults.ts` already owns env-override resolution (via `pickAllowEmpty`). A second `env.VITE_OPENWHISPR_API_URL` read at this site re-introduces drift surface that Plan 6's grep gate is designed to forbid. |

## Files Modified

- `src/config/constants.ts` (6-key import added; DEFAULT_OPENAI_BASE simplified; API_ENDPOINTS.{ANTHROPIC,GEMINI,GROQ_BASE,MISTRAL_BASE} re-routed; buildApiUrl fallback updated; OPENWHISPR_API_URL re-routed)
- `src/components/McpIntegrationCard.tsx` (1 import added; MCP_URL re-bound)
- `src/models/modelRegistryData.json` (3 `baseUrl` fields deleted from transcriptionProviders)
- `src/models/ModelRegistry.ts` (3-key import added; raw/injected type split; injection helper)
- `src/helpers/ipcHandlers.js` (top-of-file destructure extended with 3 keys; 3 mirror-site call sites updated)

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | `9e3eac1` | constants.ts + McpIntegrationCard.tsx → defaults.ts (rows 6, 9, 21–23 + GROQ/MISTRAL mirrors) |
| 2 | `116fdc2` | Move transcriptionProviders.baseUrl out of JSON; inject in ModelRegistry (rows 17–19) |
| 3 | `ce9982d` | ipcHandlers.js Anthropic/Groq/Mistral mirrors → build-config.generated.cjs |

## Foundation Ready For

- **Wave 5 (Plan 6 verify-parity):** All CONFIG_INVENTORY rows for the build-time env refactor are now closed. Plan 6's global grep gate forbidding `process.env.OPENWHISPR_*` reads outside generator/build-config sites should pass (production source has zero matches; only `vite.config.mjs` and `scripts/generate-build-config.js` legitimately read `process.env`).

## Self-Check: PASSED

- `src/config/constants.ts` — modified, contains `from "./defaults"`, zero literal LLM URLs
- `src/components/McpIntegrationCard.tsx` — modified, contains `OPENWHISPR_MCP_URL`, zero `mcp.openwhispr.com` literals
- `src/models/modelRegistryData.json` — modified, transcriptionProviders[*].baseUrl absent
- `src/models/ModelRegistry.ts` — modified, contains `OPENWHISPR_OPENAI_BASE_URL` + `injectTranscriptionBaseUrls`
- `src/helpers/ipcHandlers.js` — modified, contains the three new destructure keys, zero target literals
- Commit `9e3eac1` — FOUND
- Commit `116fdc2` — FOUND
- Commit `ce9982d` — FOUND
