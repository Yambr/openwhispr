# Phase 10: Corporate-Minimal Provider Lockdown - Context

**Gathered:** 2026-05-21
**Status:** Ready for planning
**Source:** Live client↔server verification against the slim-core openwhispr-server + owner scope decisions

<domain>
## Phase Boundary

A build-time gate that strips every alternative AI provider and every
BYOK (bring-your-own-key) surface from the OpenWhispr client, leaving
**strictly two processing paths**: **Cloud** (our `openwhispr-server`
only) and **Local** (offline whisper.cpp / Parakeet).

**Why this phase exists.** Live UI verification against the slim-core
server surfaced two concrete client↔server mismatches:

1. The welcome screen shows **Apple / Google / Microsoft** OAuth
   buttons. The server (genericOAuth plugin) supports only
   `google` / `github` / `oidc` — never Apple, never Microsoft — and on
   the slim-core deployment **zero** providers are configured.
   `POST /api/auth/sign-in/social` returns `404` for all three. The
   client advertises sign-in paths the product cannot fulfil.
2. The Transcription and Reasoning settings expose **OpenAI / Groq /
   Mistral / Custom** (and enterprise **Bedrock / Azure / Vertex**) as
   selectable providers, plus a "Paste your API key" BYOK input. In the
   corporate-minimal product, Cloud-mode requests go **only** to our
   server, which routes to upstream providers internally via LiteLLM.
   "Groq" / "OpenAI" as a *user-facing provider choice* is an upstream
   implementation detail the user must never see or configure.

**What this phase delivers.** One new build-time flag
`OPENWHISPR_PROVIDER_LOCKDOWN` (emitted as the `PROVIDER_LOCKDOWN_ENABLED`
constant). When enabled, the client:
- shows **no OAuth buttons** — email/password only;
- offers **only Cloud and Local** as transcription/reasoning/agent
  processing modes;
- exposes **no alternative cloud provider** choice (OpenAI/Groq/Mistral/
  Custom) and **no enterprise provider** UI (Bedrock/Azure/Vertex);
- exposes **no BYOK** surface — no API-key input, no key management,
  no `v1/keys` UI.

When the flag is **off** (default), the client behaves exactly as
today — no behavioral drift for non-corporate builds. This is the same
build-time gating pattern already shipped for Stripe billing
(`BILLING_ENABLED`), referrals (`REFERRALS_ENABLED`), and realtime
streaming (`STREAMING_ENABLED`).

**Out of scope:** the server-side "strictly Claude" reasoning-model
change (LiteLLM config + `DEFAULT_MODEL` + `ANTHROPIC_API_KEY`) is a
separate task owned by the `openwhispr-server` repo — the client never
chooses a model. Local processing (whisper.cpp / Parakeet) is **kept**.

</domain>

<decisions>
## Implementation Decisions

### Build-time flag (LOCKED)
- A single new flag: env var `OPENWHISPR_PROVIDER_LOCKDOWN`, emitted as
  the constant `PROVIDER_LOCKDOWN_ENABLED`. One flag governs everything:
  alternative cloud providers, BYOK, and enterprise providers.
- Default: `false` (opt-in). Default builds are unaffected — upstream
  parity for non-corporate users preserved.
- Follows the existing `BOOL_DEFAULTS` pattern in
  `scripts/generate-build-config.js` and the **direct named re-export**
  pattern in `src/config/defaults.ts` (`export { X } from
  "./build-config.generated"`) so Rolldown can dead-code-eliminate
  gated branches. The namespace-alias anti-pattern is forbidden — see
  the existing OAuth gating and the [[rolldown_tree_shake]] rules.

### OAuth (LOCKED)
- When `PROVIDER_LOCKDOWN_ENABLED` is true, all three OAuth provider
  flags effectively resolve off — **no Apple, Google, or Microsoft
  button**. The welcome screen is email/password only.
- Mechanism preference: the corporate-minimal build sets
  `OPENWHISPR_OAUTH_APPLE=false`, `OPENWHISPR_OAUTH_GOOGLE=false`,
  `OPENWHISPR_OAUTH_MICROSOFT=false`. The planner decides whether
  `PROVIDER_LOCKDOWN` *implies* these (a single corporate build sets
  all four) or whether the OAuth flags stay independent and the
  corporate `.env`/build profile sets all of them together. Either way
  the shipped corporate build shows zero OAuth buttons.
- `AuthenticationStep.tsx` already gates the three buttons behind
  `OAUTH_*_ENABLED`; the `SocialProvider` type and `signInWithSocial`
  in `src/lib/auth.ts` must not leave dangling references when all
  three are off.

### Processing modes (LOCKED)
- **Cloud + Local both kept.** Two paths exactly: Cloud = our server,
  Local = offline whisper.cpp / Parakeet. Local is NOT cut.
- What is cut is the **cloud provider choice within Cloud mode**:
  OpenAI / Groq / Mistral / Custom disappear. Cloud mode talks only to
  our server (`/api/transcribe`, `/api/reason`, `/api/agent/stream`).

### Provider lockdown scope (LOCKED)
- Cut everywhere: transcription provider picker, reasoning provider
  selector, chat-agent and dictation-agent provider settings.
- Cut all alternative cloud providers: OpenAI, Groq, Mistral, Custom.
- Cut all enterprise providers: AWS Bedrock, Azure, Google Vertex —
  centralized AI provisioning now lives on the server; the client must
  not carry enterprise-credential UI.
- Cut all BYOK surfaces: the "Paste your API key" inputs, per-provider
  key storage (`openaiApiKey`, `anthropicApiKey`, `geminiApiKey`,
  `groqApiKey`, `mistralApiKey`, `customTranscriptionApiKey`,
  `customReasoningApiKey`, and the bedrock/azure/vertex credential
  fields), `CustomModelInput`, and any `v1/keys` BYOK management UI.

### Upstream-parity constraint (LOCKED)
- This is build-time gating ONLY (per Project Constraints / Phase 3-4).
  No runtime config, no behavioral drift when the flag is unset.
- The client is not "patched to match the server" — gated code is
  physically removed from the corporate bundle via DCE, exactly like
  Stripe/Referrals. Default build keeps every provider.

### Verification (LOCKED)
- Build with the flag OFF → every provider present, default behavior
  unchanged.
- Build with the flag ON → bundle-grep (model: existing
  `scripts/verify-oauth-gating.js`) confirms disabled provider code and
  BYOK code are physically absent from the bundle.
- Live check against the slim-core `openwhispr-server`: launch the
  corporate build, confirm welcome screen is email/password only, and
  the Transcription/Reasoning UI offers only Cloud/Local with no
  provider dropdown and no API-key input.

### Claude's Discretion
- Whether `PROVIDER_LOCKDOWN` is one flag that *also* forces the three
  `OAUTH_*` flags off at build-config generation, or whether the
  corporate build profile sets all four env vars — planner's call,
  guided by the existing generator structure.
- Exact mechanism for conditionally compiling out the settings-store
  API-key fields vs. leaving the fields but gating only the UI — pick
  whichever keeps the DCE clean and the store typings honest.
- Whether a `preload-byok.generated.cjs` submodule is warranted (by
  analogy with `preload-billing`/`preload-referrals`) to gate BYOK IPC
  channels, or whether IPC-handler-level gating suffices.
- i18n: whether to delete now-dead translation keys or leave them
  (dead keys are harmless; deletion across 9 locales is churn).
- Task ordering and chunking.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Build-time gating pattern (the model to copy)
- `scripts/generate-build-config.js` — `BOOL_DEFAULTS`, `resolveBool`,
  the `.ts` + `.cjs` emit, and the preload-submodule generators
  (`preload-billing`, `preload-referrals`, `preload-streaming`).
- `src/config/defaults.ts` — the direct named re-export pattern
  (lines ~77-106) that keeps gated branches DCE-eligible.
- `scripts/verify-oauth-gating.js` — the bundle-grep verification model
  to replicate for this phase.
- `docs/BUILD_CONFIG.md` — build-time env var reference; the new flag
  must be documented here.
- `docs/CONFIG_INVENTORY.md` — hardcoded-value inventory; update if the
  provider lists move behind the gate.

### Affected client surfaces (31 files mapped — see RESEARCH/PATTERNS)
- OAuth: `src/components/AuthenticationStep.tsx`, `src/lib/auth.ts`.
- Transcription: `src/components/TranscriptionModelPicker.tsx`.
- Reasoning: `src/components/ReasoningModelSelector.tsx`,
  `src/components/settings/{InferenceConfigEditor,ChatAgentSettings,DictationAgentSettings}.tsx`.
- Enterprise: `src/components/EnterpriseProviderConfig.tsx`,
  `src/components/EnterpriseSection.tsx`,
  `src/helpers/enterpriseProviderErrors.js`,
  `src/helpers/enterpriseAiProviders.js`,
  `src/services/ai/inferenceProviders/enterprise.ts`.
- BYOK / keys: `src/stores/settingsStore.ts`, `src/hooks/useSettings.ts`,
  `src/utils/byokDetection.ts`, `src/components/ui/CustomModelInput.tsx`,
  `src/services/ApiKeysService.ts`, `src/helpers/ipcHandlers.js`.
- Provider metadata: `src/components/ui/ProviderIcon.tsx`,
  `src/utils/providerIcons.ts`, `src/models/ModelRegistry.ts`.
- Onboarding/settings mounts: `src/components/OnboardingFlow.tsx`,
  `src/components/SettingsPage.tsx`,
  `src/components/notes/NotesOnboarding.tsx`.

### Project rules
- `CLAUDE.md` — Project Constraints (build-time-only configurability,
  default-build = upstream parity, signing must keep working),
  Internationalization (9 locales), GSD workflow requirement.
- `.planning/phases/04-oauth-gating-build-docs-and-parity-gate/` and
  `04.1-tree-shaking-fix-*/` — the precedent phase; this phase extends
  the same gating mechanism. Read its PLAN/SUMMARY for the proven
  approach and the tree-shaking gotcha.
- `docs/SELF_HOSTING.md` — third-party deployment doc; mention the new
  flag if it affects self-hosters.

### Server context (read-only — informs scope, not edited here)
- `.planning/phases/08-client-server-audit/SERVER-REQUIREMENTS.md` —
  R1-R23 closure history; the server↔client audit that surfaced this
  mismatch. The server supports only `google/github/oidc` OAuth
  (none on slim) and routes all Cloud-mode AI internally via LiteLLM.

</canonical_refs>

<specifics>
## Specific Ideas

- The single corporate-minimal build profile should, when built, yield:
  welcome screen with **only** "Continue with email"; Transcription
  Setup with **only** a Cloud/Local choice (no OpenAI/Groq/Mistral/
  Custom tabs, no "API Key" / "Paste your API key" field); Reasoning
  settings likewise; no Enterprise provider section anywhere.
- Mirror the Stripe/Referrals precedent exactly: the gate is the same
  shape, the DCE expectation is the same, the bundle-grep verification
  is the same. Reviewers should see this as "another `BILLING_ENABLED`".
- The flag default is `false` so a plain `npm run pack` with no env
  still produces the full-provider build — upstream parity intact.

</specifics>

<deferred>
## Deferred Ideas

- Server-side "strictly Claude" reasoning model (LiteLLM `claude-*`
  model entry + `DEFAULT_MODEL` + `ANTHROPIC_API_KEY`) — owned by the
  `openwhispr-server` repo, tracked there, not in this client phase.
- Deleting dead i18n keys across all 9 locales — optional cleanup;
  dead keys are harmless and deletion is pure churn. Planner may
  include or defer.
- Cross-device OAuth / any new OAuth provider wiring — not in scope;
  this phase only *removes* OAuth surfaces for the corporate build.

</deferred>

---

*Phase: 10-corporate-minimal-provider-lockdown-build-time-gate-cutting-*
*Context gathered: 2026-05-21 via live client/server verification + owner scope decisions*
