# Configuration Inventory

This document catalogues every hardcoded value in the OpenWhispr source tree that is targeted for build-time replacement in Phase 3. Its purpose is to make Phase 3's refactor mechanical: a developer working only from this file should be able to locate every hardcode, replace it with the proposed environment variable, and produce a self-hostable build without re-auditing the source tree (ROADMAP Success Criterion #3).

**Scope (per D-09, REQ CFG-01):** Five buckets only — (1) backend URLs (OpenWhispr cloud endpoints), (2) OAuth client IDs and per-provider client config, (3) enterprise AI provider endpoint defaults, (4) default model registry overrides (base URLs in `src/models/modelRegistryData.json`), (5) LiteLLM-shaped URLs (OpenAI-compatible base URL constructions). Out of scope: HuggingFace model download URLs, GitHub release URLs for sidecar binaries, build-tool URLs, documentation links in error messages or UI, and `https://openwhispr.com/terms` / `/privacy` / `/contact-sales` navigation links.

**How to use:** Every row is a Phase 3 refactor target. The `proposed env-var` column uses the `OPENWHISPR_*` prefix per D-12 — this is the **logical** name. Renderer-side consumption sites require a `VITE_` prefix at the point of consumption (Vite only exposes `VITE_*` vars to the renderer); the `notes` column flags each renderer-side entry explicitly.

**Cross-links:** Backend, enterprise, and LiteLLM rows include links to endpoint cards in [BACKEND_SPEC.md](BACKEND_SPEC.md). OAuth rows link to [OAUTH_SPEC.md](OAUTH_SPEC.md).

## Summary

| Category | Count |
|----------|-------|
| backend | 9 |
| oauth | 6 |
| enterprise | 0 |
| model-registry | 3 |
| litellm | 5 |
| **Total** | **23** |

_Enterprise note: enterprise provider endpoints (Bedrock, Azure, Vertex) are entirely runtime-resolved via user-supplied env vars (`BEDROCK_REGION`, `AZURE_OPENAI_ENDPOINT`, `VERTEX_PROJECT`, etc.) stored in `safeStorage`. No hardcoded enterprise endpoint defaults exist in the source today._

## Inventory

| file:line | current value | proposed env-var | category | notes |
|-----------|---------------|------------------|----------|-------|
| src/lib/auth.ts:5 | `https://auth.openwhispr.com` | `OPENWHISPR_AUTH_URL` | backend | Fallback in `VITE_AUTH_URL \|\| "https://auth.openwhispr.com"`. Renderer; needs `VITE_` prefix at consumption (`import.meta.env.VITE_AUTH_URL`). Already partially wired via `VITE_AUTH_URL` in `vite.config.mjs:39` — Phase 3 only needs to set the fallback default to an env var. Used as base URL for all Better Auth client calls. See [BACKEND_SPEC §OpenWhispr Cloud Endpoints](BACKEND_SPEC.md#openwhispr-cloud-endpoints) and [OAUTH_SPEC §OpenWhispr Cloud Sign-In](OAUTH_SPEC.md#openwhispr-cloud-sign-in). |
| main.js:485 | `https://auth.openwhispr.com` | `OPENWHISPR_AUTH_URL` | backend | Same logical value as `src/lib/auth.ts:5`, duplicated in main-process `resolveAuthUrl()`. Main process only. Already partially guarded by `process.env.AUTH_URL \|\| process.env.VITE_AUTH_URL \|\| runtimeEnv.VITE_AUTH_URL` — the hardcoded literal is the final fallback. Consolidate to single export alongside `src/helpers/ipcHandlers.js:3336`. See [BACKEND_SPEC §OpenWhispr Cloud Endpoints](BACKEND_SPEC.md#openwhispr-cloud-endpoints). |
| src/helpers/ipcHandlers.js:3336 | `https://auth.openwhispr.com` | `OPENWHISPR_AUTH_URL` | backend | Third occurrence of the same auth URL fallback, inside the IPC handler module's local `getAuthUrl()`. Main process only. Used in N call sites — consolidate to a shared helper function that reads from env, removing all three hardcoded literals. See [BACKEND_SPEC §OpenWhispr Cloud Endpoints](BACKEND_SPEC.md#openwhispr-cloud-endpoints). |
| main.js:715 | `https://auth.openwhispr.com/*` | `OPENWHISPR_AUTH_URL` | backend | URL pattern used in `session.defaultSession.webRequest.onBeforeSendHeaders` to allow same-origin header spoofing for auth requests. Must be updated whenever `OPENWHISPR_AUTH_URL` changes. Main process only. See [BACKEND_SPEC §OpenWhispr Cloud Endpoints](BACKEND_SPEC.md#openwhispr-cloud-endpoints). |
| main.js:716 | `https://api.openwhispr.com/*` | `OPENWHISPR_BACKEND_URL` | backend | URL pattern used in same `onBeforeSendHeaders` request filter alongside `auth.openwhispr.com`. Must mirror the `OPENWHISPR_BACKEND_URL` value. Main process only. The `OPENWHISPR_API_URL` / `VITE_OPENWHISPR_API_URL` runtime lookup at `src/helpers/ipcHandlers.js:3327-3330` already resolves the API URL at runtime — this pattern is a separate hardcode that needs to become dynamic. See [BACKEND_SPEC §OpenWhispr Cloud Endpoints](BACKEND_SPEC.md#openwhispr-cloud-endpoints). |
| src/config/constants.ts:116 | `""` (empty — cloud URL is opt-in) | `OPENWHISPR_BACKEND_URL` | backend | `OPENWHISPR_API_URL = (env.VITE_OPENWHISPR_API_URL as string) \|\| ""`. Renderer; needs `VITE_` prefix at consumption (`VITE_OPENWHISPR_API_URL` — already wired in `vite.config.mjs:38`). The CFG-04 anchor variable. Used in 3 renderer call sites (`AuthenticationStep.tsx:159`, `EmailVerificationStep.tsx:31`, `auth.ts:114`). See [BACKEND_SPEC §OpenWhispr Cloud Endpoints](BACKEND_SPEC.md#openwhispr-cloud-endpoints). |
| src/lib/auth.ts:171 | `https://openwhispr.com/auth/desktop-callback` | `OPENWHISPR_OAUTH_DESKTOP_CALLBACK_URL` | backend | `DESKTOP_OAUTH_CALLBACK_URL` constant used as the public callback page for social sign-in (`src/lib/auth.ts:184`). Renderer; needs `VITE_` prefix at consumption. Both `src/lib/auth.ts:171` and `src/helpers/googleCalendarOAuth.js:11` hold the same URL as independent constants — consolidate. See [OAUTH_SPEC §OpenWhispr Cloud Sign-In](OAUTH_SPEC.md#openwhispr-cloud-sign-in). |
| src/helpers/googleCalendarOAuth.js:11 | `https://openwhispr.com/auth/desktop-callback` | `OPENWHISPR_OAUTH_DESKTOP_CALLBACK_URL` | backend | `DEFAULT_DESKTOP_CALLBACK_URL` in the Google Calendar OAuth helper. Main process only. Already partially guarded by `process.env.VITE_OPENWHISPR_OAUTH_CALLBACK_URL \|\| DEFAULT_DESKTOP_CALLBACK_URL` at line 33. Consolidate the hardcoded fallback with `src/lib/auth.ts:171` into a single shared constant. See [OAUTH_SPEC §Google Calendar](OAUTH_SPEC.md#google-calendar). |
| src/components/McpIntegrationCard.tsx:13 | `https://mcp.openwhispr.com/mcp` | `OPENWHISPR_MCP_URL` | backend | MCP (Model Context Protocol) server endpoint displayed and copied to clipboard in the Integrations UI. Renderer; needs `VITE_` prefix at consumption. A self-hoster pointing to their own backend would replace this with their own MCP server URL. See [BACKEND_SPEC](BACKEND_SPEC.md) (no current endpoint card — add if MCP spec is documented). |
| src/helpers/googleCalendarOAuth.js:6 | `https://accounts.google.com/o/oauth2/v2/auth` | `OPENWHISPR_OAUTH_GOOGLE_AUTH_URL` | oauth | Google OAuth 2.0 authorization endpoint. Main process only. Standard Google URL — a self-hoster running their own identity proxy would override this. Per D-13, each OAuth provider gets its own row for CFG-03 gating. See [OAUTH_SPEC §Google Calendar](OAUTH_SPEC.md#google-calendar). |
| src/helpers/googleCalendarOAuth.js:7 | `https://oauth2.googleapis.com/token` | `OPENWHISPR_OAUTH_GOOGLE_TOKEN_URL` | oauth | Google OAuth 2.0 token exchange endpoint. Main process only. See [OAUTH_SPEC §Google Calendar](OAUTH_SPEC.md#google-calendar). |
| src/helpers/googleCalendarOAuth.js:223 | `https://oauth2.googleapis.com/revoke` | `OPENWHISPR_OAUTH_GOOGLE_REVOKE_URL` | oauth | Google OAuth 2.0 token revocation endpoint. Main process only. Inline literal, not extracted to a constant — Phase 3 should extract and wire via env. See [OAUTH_SPEC §Google Calendar](OAUTH_SPEC.md#google-calendar). |
| src/helpers/googleCalendarManager.js:6 | `https://www.googleapis.com/calendar/v3` | `OPENWHISPR_OAUTH_GOOGLE_CALENDAR_API_URL` | oauth | Google Calendar REST API base URL used for all calendar list and events requests. Main process only. See [OAUTH_SPEC §Google Calendar](OAUTH_SPEC.md#google-calendar). |
| src/lib/auth.ts:201 | `https://openwhispr.com/reset-password` | `OPENWHISPR_OAUTH_RESET_PASSWORD_URL` | oauth | Password reset redirect URL passed to Better Auth's `requestPasswordReset()`. Renderer; needs `VITE_` prefix at consumption. A self-hoster would replace with their own reset-password page URL. See [OAUTH_SPEC §OpenWhispr Cloud Sign-In](OAUTH_SPEC.md#openwhispr-cloud-sign-in). |
| electron-builder.json:7 | `openwhispr` | `OPENWHISPR_OAUTH_PROTOCOL_SCHEME` | oauth | Custom URL protocol scheme registered via `app.setAsDefaultProtocolClient()`. Defined in `electron-builder.json:7` as `"schemes": ["openwhispr"]` and mirrored at runtime in `main.js:50-52` (`DEFAULT_OAUTH_PROTOCOL_BY_CHANNEL`). Main process / build-time. Already partially env-driven at runtime via `VITE_OPENWHISPR_PROTOCOL` / `OPENWHISPR_PROTOCOL` (`main.js:136-143`) — but the static `electron-builder.json` entry is not. Phase 3 needs to template `electron-builder.json` or use its `extraMetadata` env injection to make the scheme configurable at build time. See [OAUTH_SPEC §Custom Protocol Reference](OAUTH_SPEC.md#custom-protocol-reference). |
| _No entries_ | — | — | enterprise | No hardcoded enterprise endpoint defaults found. AWS Bedrock region, Azure OpenAI endpoint and API version, GCP Vertex project/location are all runtime-resolved from user-supplied env vars via `safeStorage`. See `src/services/ai/inferenceProviders/enterprise.ts` for the settings access pattern. |
| src/models/modelRegistryData.json:139 | `https://api.openai.com/v1` | `OPENWHISPR_OPENAI_BASE_URL` | model-registry | `transcriptionProviders[0].baseUrl` — OpenAI transcription provider base URL in the registry JSON. Used by the model registry to construct transcription endpoint URLs. This is also the same logical value as `src/config/constants.ts:60` (`DEFAULT_OPENAI_BASE` fallback); both should resolve to the same env var. See [BACKEND_SPEC §OpenAI-compatible endpoints](BACKEND_SPEC.md). |
| src/models/modelRegistryData.json:166 | `https://api.groq.com/openai/v1` | `OPENWHISPR_GROQ_BASE_URL` | model-registry | `transcriptionProviders[1].baseUrl` — Groq transcription provider base URL in the registry JSON. Also mirrored at `src/config/constants.ts:77` (`GROQ_BASE`) and `src/helpers/ipcHandlers.js:3589`. See [BACKEND_SPEC §OpenAI-compatible endpoints](BACKEND_SPEC.md). |
| src/models/modelRegistryData.json:185 | `https://api.mistral.ai/v1` | `OPENWHISPR_MISTRAL_BASE_URL` | model-registry | `transcriptionProviders[2].baseUrl` — Mistral transcription provider base URL in the registry JSON. Also mirrored at `src/config/constants.ts:78` (`MISTRAL_BASE`) and as `MISTRAL_TRANSCRIPTION_URL` at `src/helpers/ipcHandlers.js:61`. See [BACKEND_SPEC §OpenAI-compatible endpoints](BACKEND_SPEC.md). |
| src/config/constants.ts:60 | `https://api.openai.com/v1` | `OPENWHISPR_OPENAI_BASE_URL` | litellm | `DEFAULT_OPENAI_BASE` fallback — the default OpenAI-compatible base URL for all chat/completions/responses calls. Already partially env-driven via `env.OPENWHISPR_OPENAI_BASE_URL \|\| env.OPENAI_BASE_URL` (lines 59-61) — the hardcoded literal is the final fallback. Both main process and renderer. Renderer path via `API_ENDPOINTS.OPENAI_BASE` needs `VITE_` prefix. Central to 3 derived constants (`OPENAI`, `OPENAI_MODELS`, `TRANSCRIPTION_BASE`) — changing this constant updates all three. See [BACKEND_SPEC §OpenAI-compatible endpoints](BACKEND_SPEC.md). |
| src/config/constants.ts:75 | `https://api.anthropic.com/v1/messages` | `OPENWHISPR_ANTHROPIC_URL` | litellm | `API_ENDPOINTS.ANTHROPIC` — Anthropic messages endpoint. Used by `src/helpers/ipcHandlers.js:2826` for the main-process Anthropic proxy. Also passed to `@ai-sdk/anthropic` via IPC. Main process only (Anthropic calls route through main to avoid CORS). See [BACKEND_SPEC §OpenAI-compatible endpoints](BACKEND_SPEC.md). |
| src/config/constants.ts:76 | `https://generativelanguage.googleapis.com/v1beta` | `OPENWHISPR_GEMINI_BASE_URL` | litellm | `API_ENDPOINTS.GEMINI` — Google Gemini API base URL. Used directly in `src/services/ai/inferenceProviders/gemini.ts`. Renderer; needs `VITE_` prefix at consumption. See [BACKEND_SPEC §OpenAI-compatible endpoints](BACKEND_SPEC.md). |
| src/config/constants.ts:77 | `https://api.groq.com/openai/v1` | `OPENWHISPR_GROQ_BASE_URL` | litellm | `API_ENDPOINTS.GROQ_BASE` — Groq OpenAI-compatible base URL. Used by `groq.ts` provider and transcription handlers. Also mirrored in `src/models/modelRegistryData.json:166` and `src/helpers/ipcHandlers.js:3589`. Renderer + main (IPC transcription path). Needs `VITE_` prefix for renderer consumption. Consolidate with the model-registry entry so both read from the same env var. See [BACKEND_SPEC §OpenAI-compatible endpoints](BACKEND_SPEC.md). |
| src/config/constants.ts:78 | `https://api.mistral.ai/v1` | `OPENWHISPR_MISTRAL_BASE_URL` | litellm | `API_ENDPOINTS.MISTRAL_BASE` — Mistral API base URL. Used by Mistral transcription handler and model registry. Also mirrored in `src/models/modelRegistryData.json:185` and as `MISTRAL_TRANSCRIPTION_URL` at `src/helpers/ipcHandlers.js:61`. Main process only (all Mistral calls proxy through IPC). Consolidate three occurrences to a single env-var-backed constant. See [BACKEND_SPEC §OpenAI-compatible endpoints](BACKEND_SPEC.md). |

## Phase 10 — Provider Lockdown (`OPENWHISPR_PROVIDER_LOCKDOWN`)

When the build-time flag `OPENWHISPR_PROVIDER_LOCKDOWN` is set (emitted as the
`PROVIDER_LOCKDOWN_ENABLED` constant), the corporate-minimal build strips the
BYOK and enterprise key-management surface. Two configuration notes:

- **BYOK key fields in `src/stores/settingsStore.ts` are kept (typed) but never
  written.** The per-provider key fields (`openaiApiKey`, `anthropicApiKey`,
  `geminiApiKey`, `groqApiKey`, `mistralApiKey`, `customTranscriptionApiKey`,
  `customReasoningApiKey`, and the `bedrock*` / `azure*` / `vertex*` credential
  fields), their setters, and `invalidateApiKeyCaches` remain declared. Removing
  them would churn the store typings and every reader for no DCE benefit — the
  UI and IPC that *write* them are already DCE'd under lockdown, so the fields
  simply stay at their defaults. This is a deliberate discretion decision
  (CONTEXT "Claude's Discretion") favouring typing honesty over field deletion.
- **`CustomModelInput` (`src/components/ui/CustomModelInput.tsx`) carries no own
  build-time gate.** Its only consumer is `EnterpriseProviderConfig.tsx`, which
  lives inside the `EnterpriseSection` subtree that Phase 10 Plan 04 already
  DCEs by gating the `EnterpriseSection` mount. `CustomModelInput` therefore
  dead-code-eliminates transitively in the corporate bundle — no standalone
  `!PROVIDER_LOCKDOWN_ENABLED` wrapper is needed or added.

The provider-lockdown DCE contract is mechanically verified by
`npm run verify:provider-lockdown` (Phase 10 Plan 06): a 2-scenario bundle-grep
gate that asserts every OAuth / alternative-cloud / BYOK / enterprise literal is
PRESENT in the default build (parity) and ABSENT under
`OPENWHISPR_PROVIDER_LOCKDOWN=true`. See
[`docs/BUILD_CONFIG.md` § Provider Lockdown Flag](./BUILD_CONFIG.md#provider-lockdown-flag-phase-10).

## Verification Notes

To verify this inventory is complete before starting Phase 3, re-run the discovery greps documented in the plan (`02-02-PLAN.md`, Task 1, Step 1 grep block) and confirm that every match is either (a) present as a row in the table above with a real `file:line` reference, or (b) explicitly out of scope per the documented exclusions (HuggingFace download URLs, GitHub release URLs for sidecar binaries, `docs.openwhispr.com` and similar documentation navigation links, `openwhispr.com/terms`, `openwhispr.com/privacy`, `openwhispr.com/contact-sales`). Any new match not covered by either rule should be added as a new row before proceeding. Note that `GOOGLE_CALENDAR_CLIENT_ID` and `GOOGLE_CALENDAR_CLIENT_SECRET` are runtime user-supplied secrets (no hardcoded values in source) and are therefore not inventory targets.
