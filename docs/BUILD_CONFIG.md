# Build-Time Configuration

## Overview

Build-time configuration is the set of environment variables read at `npm run build` (or `npm run pack`) time and **baked into the produced binary**. Once a binary ships, the values are frozen until the next rebuild — they are not adjustable from the running app.

The Yambr OpenWhispr fork uses build-time configuration (rather than an in-app reconfiguration UI or post-install settings file) by deliberate design: it produces smaller attack surface, an auditable per-deployment binary, and removes any code path that could re-point the client at a hostile backend after install. In-app UI for backend reconfiguration is explicitly out of scope (see `REQUIREMENTS.md` → Out of Scope).

There are two read sites for build-time variables, mirroring the Electron main / renderer split (Phase 3 D-01):

- **Renderer** — Vite substitutes `import.meta.env.VITE_OPENWHISPR_*` as JavaScript literals during the bundle step. Because the values are literals at compile time, dead branches (`if (false) { … }`) are eliminated by the bundler's DCE, which is how Phase 4 OAuth gating physically removes disabled providers from the renderer chunk. Renderer consumers go through `src/config/defaults.ts` (and the generated `src/config/build-config.generated.ts` fallback module) rather than reading `import.meta.env` ad hoc.
- **Main process** — At `prebuild`, `scripts/generate-build-config.js` writes a CommonJS module to `src/config/build-config.generated.cjs` containing every value frozen for that build. Main-process modules `require()` it; there is no runtime fallback path through `process.env` for these defaults.
- **electron-builder** — `electron-builder.config.js` reads `process.env.OPENWHISPR_OAUTH_PROTOCOL_SCHEME` directly so the registered URL scheme in the packaged app's metadata matches the runtime mirror in `main.js`.

The user-facing variable name is always `OPENWHISPR_*`. The `VITE_OPENWHISPR_*` form is an internal re-export performed by `src/vite.config.mjs` for variables the renderer needs; you do not set the `VITE_*` form on the command line.

For the wire-protocol semantics of each backend endpoint, see [`docs/BACKEND_SPEC.md`](BACKEND_SPEC.md). For OAuth provider integration details (authorization, token, revoke, scopes per provider), see [`docs/OAUTH_SPEC.md`](OAUTH_SPEC.md). For the file-by-file inventory of every Phase 3 hardcode-replacement that backs the table below, see [`docs/CONFIG_INVENTORY.md`](CONFIG_INVENTORY.md).

## Variable Reference

Each subsection below has its own table. All tables share the same six columns:

`Name | Purpose | Default | Allowed values | Read at | Source-of-truth file`

For every row, the **Source-of-truth file** column points at the module where the default lives; all renderer-side defaults are emitted by the generator `scripts/generate-build-config.js`, and you should treat that script's `DEFAULTS` map as the canonical seed.

### Backend

(generator: `scripts/generate-build-config.js`)

| Name | Purpose | Default | Allowed values | Read at | Source-of-truth file |
|------|---------|---------|----------------|---------|----------------------|
| `OPENWHISPR_AUTH_URL` | Better Auth base URL for OpenWhispr cloud sign-in (used by `src/lib/auth.ts` client and main-process `resolveAuthUrl()`). | `https://auth.openwhispr.com` | Any URL | build (renderer + main) | `src/config/defaults.ts` + `src/config/build-config.generated.cjs` |
| `OPENWHISPR_BACKEND_URL` | OpenWhispr cloud API base URL (sign-in, quotas, transcription proxy, MCP). Empty string disables OpenWhispr cloud features and the binary behaves as BYOK-only. | `""` (empty) | Any URL or empty string | build (renderer + main) | `src/config/defaults.ts` + `src/config/build-config.generated.cjs` |
| `OPENWHISPR_BACKEND_URL_PATTERN` | URL pattern installed in `session.defaultSession.webRequest.onBeforeSendHeaders` to permit same-origin header forwarding for backend requests. Must match `OPENWHISPR_BACKEND_URL` host. | `https://api.openwhispr.com/*` | Any URL pattern accepted by Electron `webRequest` filters | build (main) | `src/config/build-config.generated.cjs` |
| `OPENWHISPR_MCP_URL` | MCP (Model Context Protocol) server endpoint exposed in the Integrations UI; copied to clipboard when the user pairs an external client. | `https://mcp.openwhispr.com/mcp` | Any URL | build (renderer) | `src/config/defaults.ts` |
| `OPENWHISPR_REALTIME_WSS_URL` | WebSocket URL for realtime ASR (OpenAI Realtime API protocol, served by the corporate backend's Speaches+LiteLLM relay or any compatible implementation). When unset and `OPENWHISPR_BACKEND_URL` is set, derived as `wss://${host(OPENWHISPR_BACKEND_URL)}/v1/realtime` — path component on the backend URL is preserved verbatim (e.g. `https://api.example.com/v1` → `wss://api.example.com/v1/v1/realtime`), and the scheme is transformed `https`→`wss` / `http`→`ws`. When both are unset (offline / no-backend builds), realtime ASR is unavailable and `openaiRealtimeStreaming.connect()` rejects with a clear error before opening a WebSocket — set `OPENWHISPR_STREAMING=false` for offline builds (or rely on the B1 auto-disable rule documented in the [Realtime WebSocket Contract](./BACKEND_SPEC.md#realtime-websocket-contract) cross-link below). Setting this explicitly overrides the derivation (e.g. when realtime is on a separate WSS-only ingress). | `""` (empty; or derived from `OPENWHISPR_BACKEND_URL`) | Any `wss://` / `ws://` URL or empty string | build (main) | `src/config/build-config.generated.cjs` |

### OAuth — Endpoints

(generator: `scripts/generate-build-config.js`)

| Name | Purpose | Default | Allowed values | Read at | Source-of-truth file |
|------|---------|---------|----------------|---------|----------------------|
| `OPENWHISPR_OAUTH_DESKTOP_CALLBACK_URL` | Public callback page that receives the post-sign-in redirect and bridges back into the desktop app via the custom protocol. Used by both Better Auth (`src/lib/auth.ts`) and Google Calendar OAuth (`src/helpers/googleCalendarOAuth.js`). | `https://openwhispr.com/auth/desktop-callback` | Any URL | build (renderer + main) | `src/config/defaults.ts` + `src/config/build-config.generated.cjs` |
| `OPENWHISPR_OAUTH_RESET_PASSWORD_URL` | Page passed to Better Auth `requestPasswordReset()` as the post-reset redirect target. | `https://openwhispr.com/reset-password` | Any URL | build (renderer) | `src/config/defaults.ts` |
| `OPENWHISPR_OAUTH_PROTOCOL_SCHEME` | Custom URL scheme registered with the OS for the desktop callback redirect (e.g. `openwhispr://auth?token=…`). Both `electron-builder.config.js` (writes the scheme into the packaged app's metadata at build time) and `main.js` (registers it at runtime via `app.setAsDefaultProtocolClient`) read this. | `openwhispr` | Any URL-scheme-safe string (alphanumeric, `-`, `.`) | build (electron-builder) + runtime mirror in main | `electron-builder.config.js` (build) + `src/config/build-config.generated.cjs` (runtime mirror) |
| `OPENWHISPR_OAUTH_GOOGLE_AUTH_URL` | Google OAuth 2.0 authorization endpoint hit when the user starts a Google Calendar connect flow. | `https://accounts.google.com/o/oauth2/v2/auth` | Any URL | build (main) | `src/config/build-config.generated.cjs` |
| `OPENWHISPR_OAUTH_GOOGLE_TOKEN_URL` | Google OAuth 2.0 token-exchange endpoint hit after the desktop callback delivers the auth code. | `https://oauth2.googleapis.com/token` | Any URL | build (main) | `src/config/build-config.generated.cjs` |
| `OPENWHISPR_OAUTH_GOOGLE_REVOKE_URL` | Google OAuth 2.0 token revocation endpoint hit when the user disconnects Google Calendar. | `https://oauth2.googleapis.com/revoke` | Any URL | build (main) | `src/config/build-config.generated.cjs` |
| `OPENWHISPR_OAUTH_GOOGLE_CALENDAR_API_URL` | Google Calendar v3 REST API base URL used for calendar-list and events queries. | `https://www.googleapis.com/calendar/v3` | Any URL | build (main) | `src/config/build-config.generated.cjs` |

### OAuth — Provider gating (Phase 4)

These three boolean flags physically remove a provider from the produced binary when set to the literal string `"false"`. Renderer-side gating relies on Vite's DCE: the provider button, its icon import, and the `signInWithSocial(<provider>)` switch arm are all wrapped in `if (OAUTH_<P>_ENABLED)` and dropped when the flag is false. Main-process gating skips IPC handler registration for the provider's family (currently only Google Calendar has a main-process surface).

The flags do NOT appear in `docs/CONFIG_INVENTORY.md` because they are net-new Phase 4 additions, not Phase 3 hardcode replacements.

| Name | Purpose | Default | Allowed values | Read at | Source-of-truth file |
|------|---------|---------|----------------|---------|----------------------|
| `OPENWHISPR_OAUTH_GOOGLE` | When `false`, removes Google sign-in button + `signInWithSocial("google")` arm + `GoogleIcon` from the renderer bundle, and skips registration of the Google Calendar IPC family (`gcal-*` handlers) in main. | `true` | `"false"` disables; anything else (including unset) enables | build (renderer DCE + main if-block) | `src/config/defaults.ts` + `src/config/build-config.generated.cjs` |
| `OPENWHISPR_OAUTH_APPLE` | When `false`, removes Apple sign-in button + `signInWithSocial("apple")` arm + `AppleIcon` from the renderer bundle, and removes the `auth.social.continueWithApple` i18n key reference. The default `isMacOS` runtime gate still applies when the flag is unset. | `true` | `"false"` disables; anything else (including unset) enables | build (renderer DCE) | `src/config/defaults.ts` + `src/config/build-config.generated.cjs` |
| `OPENWHISPR_OAUTH_MICROSOFT` | When `false`, removes Microsoft sign-in button + `signInWithSocial("microsoft")` arm + `MicrosoftIcon` from the renderer bundle, and removes the `auth.social.continueWithMicrosoft` i18n key reference. | `true` | `"false"` disables; anything else (including unset) enables | build (renderer DCE) | `src/config/defaults.ts` + `src/config/build-config.generated.cjs` |

### Feature Gating Flags (Phase 04.1)

These three boolean flags physically remove a feature family — its UI mounting points, IPC handler registrations, and preload bridge methods — from the produced binary. Unlike OAuth gating (default = `true`), these flags **default to `false`** per the 2026-05-08 corporate-minimal pivot: opt-in is required to ship Stripe billing, the referral program, or live (WebSocket) ASR. The user-facing env var name is unsuffixed (`OPENWHISPR_BILLING`, not `OPENWHISPR_BILLING_ENABLED`); the emitted constant in `src/config/build-config.generated.{ts,cjs}` is suffixed (`BILLING_ENABLED`) for boolean-semantic clarity at consumption sites.

The flags do NOT appear in `docs/CONFIG_INVENTORY.md` because they are net-new Phase 04.1 additions, not Phase 3 hardcode replacements.

| Name | Purpose | Default | Allowed values | Read at | Source-of-truth file |
|------|---------|---------|----------------|---------|----------------------|
| `OPENWHISPR_BILLING` | When unset/`false`, removes the Stripe checkout / billing-portal / switch-plan / preview-switch IPC method literals (`cloudCheckout`, `cloudBillingPortal`, `cloudSwitchPlan`, `cloudPreviewSwitch`), their kebab-case channels, and the `/api/stripe/` URL fragment from the renderer bundle and the preload surface; skips registration of the four Stripe `ipcMain.handle` blocks in main. UI buttons are no-op stubs that return `{ success: false, error: "Billing is disabled in this build" }` (the bundle-grep contract is the v1 deliverable; UI hide-vs-no-op is a deferred refinement). | `false` | Anything other than `"false"` is treated as `true`; absent = default | build (renderer DCE via Vite alias + main if-block + generated preload submodule) | `scripts/generate-build-config.js` BOOL_DEFAULTS + `src/config/build-config.generated.cjs` |
| `OPENWHISPR_REFERRALS` | When unset/`false`, removes referral IPC method literals (`getReferralStats`, `sendReferralInvite`, `getReferralInvites`), their kebab-case channels, and the `/api/referrals/` URL fragment; the entire `ReferralModal-*.js` chunk is no longer emitted; the sidebar nav entry disappears (passed `undefined` for `onOpenReferrals`); skips registration of the three referral `ipcMain.handle` blocks. | `false` | Anything other than `"false"` is treated as `true`; absent = default | build (renderer DCE via sub-component split + main if-block + generated preload submodule) | `scripts/generate-build-config.js` BOOL_DEFAULTS + `src/config/build-config.generated.cjs` |
| `OPENWHISPR_STREAMING` | Gates AssemblyAI + Deepgram + OpenAI-Realtime preload methods, the `assemblyai-streaming-*` / `deepgram-streaming-*` IPC channels, the `/api/streaming-token` / `/api/deepgram-streaming-token` URL fragments, and the 141 kB `useChatStreaming-*.js` chunk. **Phase 05 amendment (2026-05-09):** default flipped `false` → `true` — realtime ASR now routes through the corporate backend's `WSS /v1/realtime` (Speaches+LiteLLM, OpenAI-Realtime-compatible — see [BACKEND_SPEC § Realtime WebSocket Contract](./BACKEND_SPEC.md#realtime-websocket-contract)) instead of direct third-party WebSockets, so the original default-off rationale no longer applies. **B1 auto-disable safety net:** when the caller has not explicitly set `OPENWHISPR_STREAMING` AND `OPENWHISPR_REALTIME_WSS_URL` resolves empty (no backend, no override), the generator forces `STREAMING_ENABLED=false` to prevent a default `npm run build` from shipping a binary that crashes on first record. An explicit `OPENWHISPR_STREAMING=true` with no URL is respected as caller intent (the empty-URL guard in `openaiRealtimeStreaming.js` catches it at runtime). Set `OPENWHISPR_STREAMING=false` to opt out (escape hatch for backends that haven't deployed the realtime relay yet — preserves the Phase 04.1 absence-set behavior). | `true` (Phase 05 amendment; was `false` in Phase 04.1) | Anything other than `"false"` is treated as `true`; absent = default (subject to B1 auto-disable above) | build (renderer DCE via two-stub Vite alias + main if-block + generated preload submodule + `OPENWHISPR_REALTIME_WSS_URL` for routing) | `scripts/generate-build-config.js` BOOL_DEFAULTS + `src/config/build-config.generated.cjs` |

> **Resolver semantics.** `scripts/generate-build-config.js#resolveBool` parses unset → `default`, the literal string `"false"` → `false`, anything else (`"true"`, `"1"`, `"yes"`, etc.) → `true`. The semantics are identical for OAuth flags (default `true`) and feature flags (default `false`); the asymmetric "explicit `true` required for opt-in" some readers expect is NOT how the resolver currently works. If you set `OPENWHISPR_BILLING=anything-not-false` it enables billing.

### Provider Lockdown Flag (Phase 10)

A single boolean flag that produces the **corporate-minimal** build variant. When
enabled it strips every alternative AI provider, every BYOK (bring-your-own-key)
surface, the enterprise-provider UI, and all OAuth sign-in buttons — leaving
**exactly two processing paths**: **Cloud** (the OpenWhispr corporate backend
only) and **Local** (offline whisper.cpp / Parakeet). Same gating pattern as the
Phase 04.1 feature flags (build-time DCE, default `false`, no runtime drift when
unset).

| Name | Purpose | Default | Allowed values | Read at | Source-of-truth file |
|------|---------|---------|----------------|---------|----------------------|
| `OPENWHISPR_PROVIDER_LOCKDOWN` | When `true`, emits `PROVIDER_LOCKDOWN_ENABLED = true` and removes, via renderer DCE + main if-blocks + the generated `preload-byok.generated.cjs` submodule: (1) the Apple / Google / Microsoft OAuth sign-in buttons — the welcome screen becomes email/password only; (2) the alternative cloud provider choice (OpenAI / Groq / Mistral / Custom) in the transcription and reasoning pickers — Cloud mode talks only to the corporate backend; (3) the enterprise provider UI (AWS Bedrock / Azure / Google Vertex) and its credential fields; (4) every BYOK surface — "Paste your API key" inputs, per-provider key storage, `CustomModelInput`, and the `v1/keys` API-key management UI. The inference-mode selector is reduced from 5 modes (`openwhispr` / `providers` / `local` / `self-hosted` / `enterprise`) to 2 (`OpenWhispr` Cloud + `Local`). **Implies the three `OPENWHISPR_OAUTH_*` flags off:** the generator force-resolves `OAUTH_GOOGLE_ENABLED` / `OAUTH_APPLE_ENABLED` / `OAUTH_MICROSOFT_ENABLED` to `false` when lockdown is on — an explicit `OPENWHISPR_OAUTH_GOOGLE=true` **cannot** override lockdown. | `false` | Anything other than `"false"` is treated as `true`; absent = default | build (renderer DCE + main if-block + generated preload submodule) | `scripts/generate-build-config.js` BOOL_DEFAULTS + `src/config/build-config.generated.cjs` |

**Worked example — corporate-minimal build pointed at a private backend:**

```bash
OPENWHISPR_PROVIDER_LOCKDOWN=true \
  OPENWHISPR_BACKEND_URL=https://corp.example.com \
  npm run pack
```

This regenerates `build-config.generated.{ts,cjs}` with `PROVIDER_LOCKDOWN_ENABLED = true`
(and all three `OAUTH_*_ENABLED` forced `false`), builds the renderer with the
provider / BYOK / enterprise / OAuth branches dead-code-eliminated, and packages
an unsigned `--dir` build. Verify the result with
`npm run verify:provider-lockdown` (see [Verification gates](#verification-gates)).

### Runtime Backend Host Flag (Phase 1.8.0)

Introduced in v1.8.0 Phase 3 alongside ADR-001
(`docs/adr/ADR-001-runtime-host-configurability.md`). Gates whether the
onboarding screen renders a "Server URL" field that lets the end-user enter
their organization's backend host at runtime, without rebuilding the binary.

| Name | Purpose | Default | Allowed values | Read at | Source-of-truth file |
|------|---------|---------|----------------|---------|----------------------|
| `OPENWHISPR_ALLOW_CUSTOM_HOST` | When `true`, emits `ALLOW_CUSTOM_HOST_ENABLED = true` and renders the Server URL field on the onboarding screen (Phase 4 UI-01..04). End-user enters their org's backend URL; client validates HTTPS-only + reachability (`GET /api/auth/get-session` returns 401), persists to `useSettingsStore.serverUrl` (localStorage), and Better Auth + all `/api/*` calls hit the persisted host. When `false` (default), the field is physically tree-shaken from the bundle and the binary uses the build-time `OPENWHISPR_BACKEND_URL` exactly as v1.7.x did — ordinary Yambr users see zero behavioral change. See ADR-001 for the full threat model and mitigations M1–M6. | `false` | Anything other than `"false"` is treated as `true`; absent = default | build (renderer DCE) | `scripts/generate-build-config.js` BOOL_DEFAULTS + `src/config/build-config.generated.cjs` |

**Worked example — corporate-minimal build with end-user host selection:**

```bash
OPENWHISPR_ALLOW_CUSTOM_HOST=true \
  OPENWHISPR_PROVIDER_LOCKDOWN=true \
  npm run pack
```

The packed binary boots to an onboarding screen with three fields: Server URL
(empty), email, password. The user types `https://openwhispr.acme.com`,
client validates reachability, persists the URL, and signs in. Without the
flag, the field is gone and the binary uses whatever `OPENWHISPR_BACKEND_URL`
was set at build time.

Verify the tree-shake with `npm run verify:allow-custom-host` (added in
Phase 3 BG-02).

### LLM Providers

(generator: `scripts/generate-build-config.js`)

| Name | Purpose | Default | Allowed values | Read at | Source-of-truth file |
|------|---------|---------|----------------|---------|----------------------|
| `OPENWHISPR_OPENAI_BASE_URL` | OpenAI-compatible base URL for chat / completions / responses / transcription. Drives `API_ENDPOINTS.OPENAI_BASE`, `OPENAI_MODELS`, and `TRANSCRIPTION_BASE` — overriding it shifts all three to your LiteLLM-shaped endpoint. | `https://api.openai.com/v1` | Any OpenAI-compatible base URL (with or without trailing `/v1`) | build (renderer + main) | `src/config/defaults.ts` + `src/config/build-config.generated.cjs` |
| `OPENWHISPR_ANTHROPIC_URL` | Anthropic Messages API endpoint hit by the main-process Anthropic proxy (calls route through main to avoid CORS in the renderer). | `https://api.anthropic.com/v1/messages` | Any URL | build (main) | `src/config/build-config.generated.cjs` |
| `OPENWHISPR_GEMINI_BASE_URL` | Google Gemini (Generative Language) API base URL used by `src/services/ai/inferenceProviders/gemini.ts`. | `https://generativelanguage.googleapis.com/v1beta` | Any URL | build (renderer) | `src/config/defaults.ts` |
| `OPENWHISPR_GROQ_BASE_URL` | Groq OpenAI-compatible base URL used by both the chat provider and the transcription handler. | `https://api.groq.com/openai/v1` | Any OpenAI-compatible base URL | build (renderer + main) | `src/config/defaults.ts` + `src/config/build-config.generated.cjs` |
| `OPENWHISPR_MISTRAL_BASE_URL` | Mistral OpenAI-compatible base URL used by transcription and chat handlers. | `https://api.mistral.ai/v1` | Any OpenAI-compatible base URL | build (renderer + main) | `src/config/defaults.ts` + `src/config/build-config.generated.cjs` |

> BYOK API keys (OpenAI, Anthropic, Gemini, Groq, Mistral, plus the five enterprise cloud credentials) are **not** build-time variables — they are user-supplied at runtime and encrypted at rest via Electron `safeStorage`. Build-time variables only define endpoints and feature flags, never secrets.

## Feature Gating Mechanism

Six boolean build-time flags physically remove code from the shipped binary: 3 OAuth provider gates (Phase 4 — default `true`) and 3 feature-family gates (Phase 04.1 — default `false`). The mechanism is constraint-driven: the binary ships with a smaller surface and a smaller audit footprint, and a corporate self-hoster can prove (via bundle-grep) that disabled features are physically absent — not just visually hidden behind a runtime check. Three layers cooperate to make that work.

### Layer 1: Build-config generation (literals, not env reads)

`scripts/generate-build-config.js` reads every `OPENWHISPR_*` env var at `prebuild` / `prepack` / explicit `pack` invocation time and writes two files:

- `src/config/build-config.generated.ts` — consumed by the renderer (Vite imports it). Each flag is emitted as a literal `export const X_ENABLED = true;` or `export const X_ENABLED = false;`.
- `src/config/build-config.generated.cjs` — consumed by the main process and preload (`require`d at runtime).

The literal-export form is load-bearing: Rolldown (Vite's bundler) only constant-folds and dead-code-eliminates branches when the gate value is a literal at the consumer's parse time. The export must therefore propagate to the consumer surface as a named literal, NOT as a namespace member access.

In addition, the generator emits one `preload-<feature>.generated.cjs` factory module per gated preload surface (`preload-gcal.generated.cjs`, `preload-billing.generated.cjs`, `preload-referrals.generated.cjs`, `preload-streaming.generated.cjs`). When the flag is `true`, the factory exposes the IPC method bindings; when `false`, it exports an empty factory `module.exports = function () { return {}; };` containing zero references to any gated IPC method literal. These files are gitignored and listed in `electron-builder.json#files` so the runtime `require()` resolves in packaged builds.

### Layer 2: Renderer dead-code elimination (DCE)

`src/config/defaults.ts` re-exports each flag with the **direct named re-export** form:

```ts
export {
  OAUTH_GOOGLE_ENABLED,
  OAUTH_APPLE_ENABLED,
  OAUTH_MICROSOFT_ENABLED,
  BILLING_ENABLED,
  REFERRALS_ENABLED,
  STREAMING_ENABLED,
} from "./build-config.generated";
```

Consumers wrap mounting points so the gate evaluates to a literal `false` at the consumer's parse time — Rolldown then drops the dead JSX, then the unused import, then the entire downstream module graph. Two consumer-side shapes are in use:

1. **Sub-component-split** (used by OAuth, REFERRALS) — extract the gated UI into its own `*.tsx` file, mount as `{X_ENABLED && <FooSection ... />}` from the parent. **Static (not lazy) imports inside the sub-component file are required** — `React.lazy()` / dynamic `import("…")` causes Vite to emit an orphan chunk for the dynamic-import target regardless of whether the containing module is reachable.
2. **Vite resolve.alias swap** (used by BILLING, STREAMING) — when the gated literals live inside an always-imported leaf hook or data module that cannot be component-split (because it would violate rules-of-hooks or require surgically gating 6+ unrelated consumer call sites), `src/vite.config.mjs#resolve.alias` swaps the import target to a no-op stub (`*.stub.ts` / `*.stub.js`) when the flag is `false`. The alias is re-evaluated per `defineConfig` invocation with a require-cache bust so sequential scenario builds in the same Node process pick up env-driven flips. Two-stub variants are supported when a feature's literals span multiple leaf modules (e.g. STREAMING aliases both `streamingProviders.js` and `useChatStreaming.ts`).

> **Two hard invariants** future contributors must respect:
>
> 1. **NEVER use namespace-member access (`Generated.X_ENABLED`).** The form `import * as Generated from "./build-config.generated"; export const X = Generated.X_ENABLED;` does **not** propagate the literal across the module boundary — Rolldown degrades the gate to a runtime `b && jsx(...)` check, both branches survive, and bundle-grep finds the gated literals despite the gate "looking right" in source. Always use `export { X } from "./build-config.generated";`.
> 2. **NEVER place `React.lazy()` / dynamic `import()` inside a gated sub-component.** Vite/Rolldown unconditionally emit a standalone chunk for every `import("…")` expression encountered during parsing. Even when the containing sub-component file is dropped from the static import graph, the orphan chunk gets emitted into `src/dist/assets/`. Use static imports inside gated sub-components.

### Layer 3: Main process and preload

The main process gates IPC handler registration with simple top-level conditionals in `src/helpers/ipcHandlers.js`:

```js
if (BuildConfig.BILLING_ENABLED) {
  ipcMain.handle("cloud-checkout", ...);
  ipcMain.handle("cloud-billing-portal", ...);
  // …four Stripe handlers + their helper closures
}
```

Because `BuildConfig` is `require`d from the generated `.cjs` and the property is a literal `false`, the entire block is unreachable at runtime — the renderer can never invoke an unregistered handler. (V8 / the bundler do not strip unreachable Node code, but the contract here is *no handler registration*, not *no source-bytes-on-disk*.)

The preload surface uses code-generated factory modules rather than runtime conditionals because `preload.js` is shipped verbatim by electron-builder (it is never bundled). A runtime `...(BuildConfig.X ? { foo, bar } : {})` spread would leave the literal method names `foo` / `bar` in the source preload file — bundle-grep would still find them. Instead `preload.js` does:

```js
const buildBillingApi = require("./preload-billing.generated.cjs");
contextBridge.exposeInMainWorld("electronAPI", {
  // …
  ...buildBillingApi(ipcRenderer),
});
```

The factory module is regenerated per build with either the full method block or an empty `() => ({})`. Comments inside the generated file deliberately do NOT contain the gated method-name literals (otherwise bundle-grep would match prose).

### Verification gates

Four CI-runnable scripts mechanically prove the contract end-to-end:

- `npm run verify:oauth-gating` — 4 scenarios (default + each OAuth provider individually disabled). Greps both `src/dist/assets/*.js` and `preload.js` + `preload-gcal.generated.cjs` for provider-specific symbols. ~2–4 min runtime (4 sequential renderer builds).
- `npm run verify:feature-gating` — 4 scenarios (default + each feature flag individually enabled). Greps both `src/dist/assets/*.js` and `preload.js` + `preload-{billing,referrals,streaming}.generated.cjs`. Symmetric inverse of the OAuth gate (default expects ABSENT, opt-in expects PRESENT).
- `npm run verify:provider-lockdown` — 2 scenarios (default + `OPENWHISPR_PROVIDER_LOCKDOWN=true`). Greps `src/dist/assets/*.js` and `preload.js` + all `preload-*.generated.cjs` (including `preload-byok.generated.cjs`) for four target groups — OAuth desktop-sign-in literals, alternative-cloud provider key-console URLs, BYOK IPC channels, and enterprise key-management channels. The `default` scenario asserts every literal is PRESENT (upstream parity), the `lockdown` scenario asserts every literal is ABSENT. ~1–2 min runtime (2 builds + 1 restore build).
- `npm run verify:pack-regen` — CFG-08 regression: runs `OPENWHISPR_OAUTH_GOOGLE=false npm run pack` end-to-end and asserts the generator actually re-ran (the previously committed `build-config.generated.ts` is overwritten with `OAUTH_GOOGLE_ENABLED = false`). Catches the original Phase 4 smoke-test bug where `prepack` did not chain the generator step.

## Worked Examples

### Example 1: Corporate-Minimal Default Build (post-2026-05-08 pivot)

```bash
npm run build
# or:
npm run pack
```

Produces the **corporate-minimal** binary: dictation + transcription + reasoning + Google/Microsoft/Apple OAuth, with Stripe billing, the referral program, and live (WebSocket) ASR all stripped from the bundle. This is the new default posture as of 2026-05-08.

What's IN by default:

- All 16 endpoint variables resolve to their documented defaults.
- All three OAuth providers visible (Google + Microsoft on every platform; Apple on macOS only).
- Whisper.cpp local transcription + OpenAI Whisper file-mode cloud transcription.
- Multi-provider reasoning via runtime-supplied API keys (BYOK).

What's OUT by default (must opt-in via the Phase 04.1 feature flags):

- Stripe checkout / billing portal / switch-plan UI and the four `/api/stripe/*` IPC handlers (`OPENWHISPR_BILLING=true` to enable).
- Referral program UI and the three `/api/referrals/*` IPC handlers (`OPENWHISPR_REFERRALS=true` to enable).
- AssemblyAI / Deepgram WebSocket live ASR — the entire 141 kB `useChatStreaming` chunk and the `/api/{streaming,deepgram-streaming}-token` endpoints (`OPENWHISPR_STREAMING=true` to enable).

All 16 endpoint variables resolve to their documented defaults, and all 6 boolean gating flags (3 OAuth + 3 feature) are at their default values (OAuth = `true`, feature = `false`). This baseline is mechanically verified by `scripts/verify-defaults-parity.js`, `scripts/verify-oauth-gating.js`, and `scripts/verify-feature-gating.js` — see *Verifying parity* below.

### Example 1b: Upstream Parity Build

```bash
OPENWHISPR_BILLING=true \
  OPENWHISPR_REFERRALS=true \
  OPENWHISPR_STREAMING=true \
  npm run build
```

Produces a binary behaviorally identical to the pre-pivot upstream Yambr fork — Stripe checkout reachable, referral nav entry visible, live AssemblyAI / Deepgram ASR available. Opt-in to all three feature flags is required; the default build (Example 1) does NOT include this surface.

### Example 2: Custom backend only

```bash
OPENWHISPR_BACKEND_URL=https://api.example.com \
OPENWHISPR_AUTH_URL=https://auth.example.com \
OPENWHISPR_BACKEND_URL_PATTERN="https://api.example.com/*" \
npm run build
```

Produces a binary that contacts `api.example.com` for backend operations and `auth.example.com` for sign-in. All three OAuth providers remain visible. The webRequest filter in `main.js` registers the new pattern so backend headers are forwarded same-origin.

> Note: if you override `OPENWHISPR_BACKEND_URL`, you almost always need to override `OPENWHISPR_BACKEND_URL_PATTERN` too — the two are related but separate variables (the pattern is a `webRequest` filter, the URL is the base). Mismatched values produce a binary that calls `api.example.com` but only forwards headers same-origin to the default `api.openwhispr.com`, which silently breaks authenticated requests.

### Example 3: Self-hosted variant with subset of OAuth

```bash
OPENWHISPR_BACKEND_URL=https://api.example.com \
OPENWHISPR_AUTH_URL=https://auth.example.com \
OPENWHISPR_BACKEND_URL_PATTERN="https://api.example.com/*" \
OPENWHISPR_OAUTH_GOOGLE=true \
OPENWHISPR_OAUTH_APPLE=false \
OPENWHISPR_OAUTH_MICROSOFT=false \
npm run build
```

Expected behavior:

- Only the Google sign-in button is visible in the onboarding UI.
- On macOS, the Apple button is absent (the build flag overrides the otherwise-default macOS-only render).
- Microsoft sign-in code path is removed from the renderer bundle.
- Google Calendar IPC handlers (`gcal-*`) remain registered (Google is enabled).

Verify mechanically with the bundle-grep snippet below — Apple and Microsoft strings must be absent, Google strings must remain:

```bash
# After npm run build, verify Apple and Microsoft are fully absent:
grep -r 'signInWithSocial("apple")'      dist/ && echo "FAIL: apple still present" || echo "OK: apple absent"
grep -r 'AppleIcon'                       dist/ && echo "FAIL: AppleIcon still present" || echo "OK: AppleIcon absent"
grep -r 'auth.social.continueWithApple'   dist/ && echo "FAIL: apple i18n still present" || echo "OK"
grep -r 'signInWithSocial("microsoft")'   dist/ && echo "FAIL: microsoft still present" || echo "OK"
grep -r 'MicrosoftIcon'                   dist/ && echo "FAIL: MicrosoftIcon still present" || echo "OK"
grep -r 'auth.social.continueWithMicrosoft' dist/ && echo "FAIL" || echo "OK"

# Confirm Google IS still present:
grep -rq 'oauth2.googleapis.com' dist/ && echo "OK: Google preserved" || echo "FAIL: Google missing"
```

### Example 4: Custom backend with realtime ASR via Speaches relay (Phase 05 default)

```bash
OPENWHISPR_BACKEND_URL=https://api.example.com \
OPENWHISPR_AUTH_URL=https://auth.example.com \
OPENWHISPR_BACKEND_URL_PATTERN="https://api.example.com/*" \
npm run build
```

Produces a binary that:

- Sends batch + reasoning traffic to `api.example.com` (Phase 3).
- Connects realtime ASR via `wss://api.example.com/v1/realtime?intent=transcription` (Phase 05) — derived automatically from `OPENWHISPR_BACKEND_URL`.
- Ships streaming-enabled by default (Phase 05 amendment).

The backend MUST implement `WSS /v1/realtime` per [BACKEND_SPEC § Realtime WebSocket Contract](./BACKEND_SPEC.md#realtime-websocket-contract). If the realtime relay is not yet deployed, override the routing or opt out of streaming entirely:

```bash
# Override realtime to a separate WSS-only ingress:
OPENWHISPR_BACKEND_URL=https://api.example.com \
  OPENWHISPR_REALTIME_WSS_URL=wss://realtime.example.com/v1/realtime \
  npm run build

# OR opt out of streaming entirely (file-mode whisper.cpp + OpenAI Whisper still work):
OPENWHISPR_BACKEND_URL=https://api.example.com \
  OPENWHISPR_STREAMING=false \
  npm run build
```

## Verifying parity

After any build, run `node scripts/verify-defaults-parity.js` (or `npm run verify:parity`). Exit `0` means every documented default value lives in exactly one allow-listed source-of-truth file and that no Phase 3 hardcode has been re-introduced. Exit `1` prints `<file>:<line>: <reason>` for each regression — fix the offending file, do not add the offending line to the allow-list.

For end-to-end behavioural parity (does the binary actually call the documented URLs at runtime, not just contain them as strings?), walk the smoke checklist in [`docs/SELF_HOSTING.md`](SELF_HOSTING.md#phase-3-smoke-checklist). That checklist covers the seven critical flows — sign-in, Google Calendar OAuth, transcription, MCP, custom protocol redirect, password reset, and account deletion — and is the human-UAT half of the parity gate. This document does not duplicate the checklist; it is the single source.

Run all three gating scripts before any release:

```bash
npm run verify:oauth-gating    # 4 scenarios: default + each OAuth provider individually disabled
npm run verify:feature-gating  # 4 scenarios: default + each feature flag individually enabled
npm run verify:pack-regen      # CFG-08 regression: pack pipeline regenerates build-config
```

For OAuth provider gating verification (does `OPENWHISPR_OAUTH_<P>=false` actually remove the provider from the bundle?), `node scripts/verify-oauth-gating.js` wraps the bundle-grep targets shown in Example 3 and asserts the documented absence/presence per provider. For feature-flag gating verification (do `OPENWHISPR_BILLING` / `OPENWHISPR_REFERRALS` / `OPENWHISPR_STREAMING` actually remove their respective IPC literals?), `node scripts/verify-feature-gating.js` runs the symmetric inverse — default build expects the literals ABSENT, opt-in builds expect them PRESENT. The corresponding human-UAT flows for each gated build are listed in [`docs/SELF_HOSTING.md`](SELF_HOSTING.md) under the Phase 4 OAuth-gating and Phase 04.1 Feature Gating sections.

## Testing

The repo ships a vitest harness covering the Phase 04/04.1/05 build-time configuration logic — URL derivation, boolean resolution, the B1 streaming auto-disable matrix, and the realtime empty-URL guard.

| Command | What it does |
|---|---|
| `npm test` | Run all unit tests once (CI mode). Exits non-zero on failure. |
| `npm run test:watch` | Interactive watch mode — re-runs affected tests on save. |
| `npm run test:coverage` | Generate a v8 coverage report scoped to phase-work files (`scripts/generate-build-config.js`, `src/helpers/openaiRealtimeStreaming.js`). HTML report at `coverage/index.html`. |

Tests run in CI as part of `.github/workflows/verify-gating.yml`. They execute BEFORE the slower bundle gates so unit-test failures abort the workflow in ~30 seconds rather than after multiple minutes of bundle builds.

**Scope:** Phase 04/04.1/05 additions only. Upstream legacy code is intentionally NOT covered by unit tests at this layer — it is exercised indirectly by the `verify:*` bundle gates and manual UAT.
