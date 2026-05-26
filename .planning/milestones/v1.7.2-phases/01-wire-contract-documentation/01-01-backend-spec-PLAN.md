---
phase: 1
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - docs/BACKEND_SPEC.md
autonomous: true
requirements: [DOC-01]
must_haves:
  truths:
    - "docs/BACKEND_SPEC.md exists in repo"
    - "Every OpenWhispr cloud HTTP endpoint the client calls is documented in detail (method, URL, auth header, request schema, response schema, source file:line)"
    - "Global error envelope (status codes + JSON shape) is documented once at top, with per-endpoint deviations inline"
    - "Third-party AI APIs (OpenAI/Anthropic/Gemini/Mistral/Groq/AssemblyAI/Deepgram) and enterprise providers (Bedrock/Azure/Vertex) appear in inventory-only section (one line each, no schemas)"
    - "Every documented OpenWhispr-cloud endpoint links to file:line of the fetch() call AND of the IPC handler/wrapper"
  artifacts:
    - path: "docs/BACKEND_SPEC.md"
      provides: "Wire-level contract for OpenWhispr cloud + inventory of third-party calls"
      contains: "## Global Error Envelope"
  key_links:
    - from: "docs/BACKEND_SPEC.md"
      to: "src/lib/auth.ts, src/components/AuthenticationStep.tsx, src/components/EmailVerificationStep.tsx, src/helpers/ipcHandlers.js, src/helpers/tokenStore.js"
      via: "file:line source pointers in every endpoint table row"
      pattern: "src/.*:[0-9]+"
---

<objective>
Produce `docs/BACKEND_SPEC.md` — the wire-level contract documenting every external HTTP call the OpenWhispr client makes, with detailed coverage of OpenWhispr cloud endpoints (the v2 swap target) and inventory-only treatment of third-party / enterprise APIs.

Purpose: A third party reading this doc must be able to implement a drop-in replacement for the OpenWhispr cloud backend without reading source.
Output: One markdown file at `docs/BACKEND_SPEC.md`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/REQUIREMENTS.md
@.planning/phases/01-wire-contract-documentation/01-CONTEXT.md
@.planning/codebase/INTEGRATIONS.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Reverse-engineer OpenWhispr cloud + inventory third-party calls and write BACKEND_SPEC.md</name>
  <files>docs/BACKEND_SPEC.md</files>
  <read_first>
    Read these source files in full (they are the source of truth for the spec):
    - src/config/constants.ts (find OPENWHISPR_API_URL ~line 116; capture VITE_OPENWHISPR_API_URL fallback chain)
    - src/lib/auth.ts (every fetch() call including /api/auth/delete-account, withSessionRefresh wrapper, header construction)
    - src/components/AuthenticationStep.tsx (find /api/check-user call ~lines 154-159; full request/response shape)
    - src/components/EmailVerificationStep.tsx (find /api/auth/verification-status polling ~lines 29-31)
    - src/helpers/ipcHandlers.js (search for OPENWHISPR_API_URL and VITE_OPENWHISPR_API_URL — main-process auth/cloud handlers ~line 3327 onward; capture all auth-* and cloud-* IPC channels that hit cloud)
    - src/helpers/tokenStore.js (token persistence layer; document what tokens are stored and the lifecycle, since auth endpoints depend on it)
    - src/services/ai/inferenceProviders/openwhispr.ts (cloud provider's calls if any)

    For inventory section, grep these files for fetch( / axios / SDK base URLs:
    - src/services/ai/inferenceProviders/openai.ts
    - src/services/ai/inferenceProviders/anthropic.ts
    - src/services/ai/inferenceProviders/gemini.ts
    - src/services/ai/inferenceProviders/groq.ts
    - src/services/ai/inferenceProviders/enterprise.ts (Bedrock + Azure + Vertex)
    - src/services/ai/inferenceProviders/lan.ts
    - src/services/ai/inferenceProviders/local.ts
    - src/services/ai/openaiBase.ts
    - src/helpers/openaiRealtimeStreaming.js
    - src/helpers/assemblyAiStreaming.js
    - src/helpers/deepgramStreaming.js
    - src/helpers/ipcHandlers.js (Mistral transcription handler — multipart POST to https://api.mistral.ai/v1/audio/transcriptions; Anthropic IPC bridge)

    Skip Google Calendar HTTP calls — those are inventoried in OAUTH_SPEC plan (cross-link only).
  </read_first>
  <action>
    Create `docs/BACKEND_SPEC.md` with the EXACT structure below. Use markdown tables + fenced JSON code blocks (per D-05). NO OpenAPI / JSON Schema syntax. Every endpoint row in the OpenWhispr cloud section MUST include both the fetch() call site and the IPC handler / wrapper file:line (per D-07).

    Required sections in order:

    1. `# Backend Wire Spec`
       Brief intro: scope (OpenWhispr cloud detailed, third-party inventory-only), how to read the doc, link forward to OAUTH_SPEC.md and SELF_HOSTING.md.

    2. `## Conventions`
       - Base URL: `${OPENWHISPR_API_URL}` resolved from `VITE_OPENWHISPR_API_URL` build-time env (cite `src/config/constants.ts:116`)
       - Transport: HTTPS only
       - Content-Type: `application/json` unless noted
       - Auth header format (document exactly what the client sends — Bearer token, cookie, or other — derived from src/lib/auth.ts)
       - Source-pointer convention: `path:line` (relative to repo root) refers to the fetch() call site; IPC pointer refers to the matching ipcMain.handle channel.

    3. `## Global Error Envelope` (per D-08)
       Document the JSON error shape the client expects (derived from src/lib/auth.ts error-handling branches). Include a JSON example. List the HTTP status codes the client treats specially (e.g., 401 → token refresh, 403, 404, 5xx). Per-endpoint deviations are noted inline with each endpoint, not here.

    4. `## OpenWhispr Cloud Endpoints` (DETAILED — per D-01)
       For EACH endpoint discovered in source (minimum: `/api/check-user`, `/api/auth/verification-status`, `/api/auth/delete-account`, plus any others found in ipcHandlers.js / lib/auth.ts), produce a subsection with this template:

       ```
       ### `{METHOD} /api/...`

       **Purpose:** {one sentence describing what the client uses this for}

       | method | URL pattern | auth header | fetch() call site | IPC handler / wrapper |
       |---|---|---|---|---|
       | POST | `${OPENWHISPR_API_URL}/api/check-user` | `Authorization: Bearer <token>` (or "none" if pre-auth) | `src/components/AuthenticationStep.tsx:154` | `src/helpers/ipcHandlers.js:NNNN` (or "renderer-direct" if no IPC) |

       **Request body**
       ```json
       { ...example reflecting actual keys sent by client... }
       ```

       **Response body (success)**
       ```json
       { ...example reflecting keys the client reads... }
       ```

       **Error deviations:** {only if this endpoint diverges from the global envelope; otherwise write "Uses global error envelope."}

       **Notes:** {client-side behavior — e.g., "polled every 3s in EmailVerificationStep"; "401 triggers withSessionRefresh retry once". Per D-10, do not speculate about server-side semantics.}
       ```

       Required cards (minimum — discover others while reading source and add them):
       - `POST /api/check-user` (from AuthenticationStep.tsx)
       - `GET /api/auth/verification-status` (from EmailVerificationStep.tsx; document polling cadence as observed)
       - `DELETE /api/auth/delete-account` (from src/lib/auth.ts)
       - Any other `/api/...` paths found by grepping `${OPENWHISPR_API_URL}` and `OPENWHISPR_API_URL` and `VITE_OPENWHISPR_API_URL` across the repo

    5. `## Custom Protocol Redirect`
       One short subsection: the `openwhispr://` redirect URL the cloud must send the user back to after sign-in. Document the channel-specific variants (`openwhispr-dev`, `openwhispr-staging`) referenced in main.js. Cross-link to OAUTH_SPEC.md for the full OAuth flow.

    6. `## Third-Party API Inventory` (INVENTORY-ONLY — per D-02)
       Single big table, one row per call site. Columns:

       `| Provider | Endpoint / SDK base URL | Method/transport | Source file:line | Vendor docs link |`

       Required rows (minimum — add any others discovered):
       - OpenAI Responses API — `https://api.openai.com/v1/responses` — POST — src/services/ai/openaiBase.ts:NN — https://platform.openai.com/docs/api-reference/responses
       - OpenAI Chat Completions (fallback) — `https://api.openai.com/v1/chat/completions` — POST — src/services/ai/inferenceProviders/openai.ts:NN — https://platform.openai.com/docs/api-reference/chat
       - OpenAI Realtime — WebSocket — src/helpers/openaiRealtimeStreaming.js:NN — https://platform.openai.com/docs/guides/realtime
       - Anthropic Messages — `https://api.anthropic.com/v1/messages` — POST — src/services/ai/inferenceProviders/anthropic.ts:NN (+ IPC bridge in src/helpers/ipcHandlers.js:NN) — https://docs.anthropic.com/en/api/messages
       - Google Gemini — `https://generativelanguage.googleapis.com/v1beta` — POST — src/services/ai/inferenceProviders/gemini.ts:NN — https://ai.google.dev/api
       - Groq — `https://api.groq.com/openai/v1` — POST — src/services/ai/inferenceProviders/groq.ts:NN — https://console.groq.com/docs/api-reference
       - Mistral transcription — `https://api.mistral.ai/v1/audio/transcriptions` — multipart POST — src/helpers/ipcHandlers.js:NN — https://docs.mistral.ai/api/
       - AssemblyAI Realtime — WebSocket — src/helpers/assemblyAiStreaming.js:NN — https://www.assemblyai.com/docs/speech-to-text/streaming
       - Deepgram Realtime — WebSocket — src/helpers/deepgramStreaming.js:NN — https://developers.deepgram.com/reference/streaming
       - AWS Bedrock — SDK (@ai-sdk/amazon-bedrock) — region-derived URL — src/services/ai/inferenceProviders/enterprise.ts:NN — https://docs.aws.amazon.com/bedrock/
       - Azure OpenAI — `${AZURE_OPENAI_ENDPOINT}` — POST — src/services/ai/inferenceProviders/enterprise.ts:NN — https://learn.microsoft.com/azure/ai-services/openai/
       - GCP Vertex AI — SDK (@ai-sdk/google-vertex) — src/services/ai/inferenceProviders/enterprise.ts:NN — https://cloud.google.com/vertex-ai/docs
       - LAN provider (OpenAI-compatible custom URL) — `${cleanupRemoteUrl}` from settings — src/services/ai/inferenceProviders/lan.ts:NN — N/A (user-supplied)
       - Local provider (llama.cpp localhost) — `http://127.0.0.1:${port}/v1/...` — src/services/ai/inferenceProviders/local.ts:NN — https://github.com/ggerganov/llama.cpp

       **MANDATORY:** Replace every `:NN` with a real line number while reading the source. If a constant is built dynamically (e.g., region-templated), state that explicitly in the row instead of inventing a line.

    7. `## Out of Scope`
       Brief list noting what this doc deliberately does not cover (per D-11): hidden cloud endpoints not called by the current client, server-side rate limits / retry semantics (per D-10), live runtime trace validation (per D-09), reference backend implementation (per D-15).

    Per D-09 / D-06: do NOT capture live HTTP traces, do NOT speculate. Source is the contract. Where the client never reads a response field, omit it from the example. Where a request body key is conditional, mark it `// optional` in the JSON example.

    Use ONLY markdown — no OpenAPI/Swagger/JSON Schema tooling.
  </action>
  <verify>
    <automated>test -f docs/BACKEND_SPEC.md && grep -q '^## Global Error Envelope' docs/BACKEND_SPEC.md && grep -q '^## OpenWhispr Cloud Endpoints' docs/BACKEND_SPEC.md && grep -q '^## Third-Party API Inventory' docs/BACKEND_SPEC.md && grep -q '^## Conventions' docs/BACKEND_SPEC.md && grep -q '/api/check-user' docs/BACKEND_SPEC.md && grep -q '/api/auth/verification-status' docs/BACKEND_SPEC.md && grep -q '/api/auth/delete-account' docs/BACKEND_SPEC.md && grep -qE 'src/lib/auth\.ts:[0-9]+' docs/BACKEND_SPEC.md && grep -qE 'src/components/AuthenticationStep\.tsx:[0-9]+' docs/BACKEND_SPEC.md && grep -qE 'src/helpers/ipcHandlers\.js:[0-9]+' docs/BACKEND_SPEC.md && grep -q 'api.anthropic.com' docs/BACKEND_SPEC.md && grep -q 'api.openai.com' docs/BACKEND_SPEC.md && grep -q 'api.mistral.ai' docs/BACKEND_SPEC.md && ! grep -qE '^openapi:|"openapi"' docs/BACKEND_SPEC.md && [ "$(grep -cE '^\| ' docs/BACKEND_SPEC.md)" -ge 15 ]</automated>
  </verify>
  <acceptance_criteria>
    - File exists: `test -f docs/BACKEND_SPEC.md`
    - Contains heading `## Global Error Envelope` (D-08)
    - Contains heading `## OpenWhispr Cloud Endpoints`
    - Contains heading `## Third-Party API Inventory`
    - Contains heading `## Conventions`
    - Mentions `/api/check-user`, `/api/auth/verification-status`, `/api/auth/delete-account`
    - Contains source pointers with line numbers: `src/lib/auth.ts:NNN`, `src/components/AuthenticationStep.tsx:NNN`, `src/helpers/ipcHandlers.js:NNN` (D-07)
    - Inventory mentions `api.openai.com`, `api.anthropic.com`, `api.mistral.ai`
    - NO OpenAPI tooling: `grep -E '^openapi:|"openapi"' docs/BACKEND_SPEC.md` returns nothing (D-05)
    - At least 15 markdown table rows total (`grep -cE '^\| '` ≥ 15)
  </acceptance_criteria>
  <done>
    `docs/BACKEND_SPEC.md` exists with all required sections; every OpenWhispr cloud endpoint card has a row with method/URL/auth/fetch-site/IPC-site populated; JSON example blocks for request and response are present for each cloud endpoint; third-party inventory table contains a row per known provider with file:line pointers and vendor doc links.
  </done>
</task>

</tasks>

<verification>
- `docs/BACKEND_SPEC.md` exists and contains the required section headings (Conventions, Global Error Envelope, OpenWhispr Cloud Endpoints, Custom Protocol Redirect, Third-Party API Inventory, Out of Scope).
- Every OpenWhispr cloud endpoint table row has both a `src/...:NN` fetch-site pointer and an IPC handler pointer (or explicit "renderer-direct").
- All third-party providers from `.planning/codebase/INTEGRATIONS.md` appear in the inventory table.
- No OpenAPI / JSON Schema artifacts (per D-05).
</verification>

<success_criteria>
DOC-01 satisfied: a third party reading `docs/BACKEND_SPEC.md` can implement a drop-in OpenWhispr cloud backend without consulting the source tree, while seeing the inventory boundary that keeps third-party APIs out of scope.
</success_criteria>

<output>
After completion, create `.planning/phases/01-wire-contract-documentation/01-01-SUMMARY.md` per the summary template.
</output>
