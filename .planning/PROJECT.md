# Yambr OpenWhispr Fork

## What This Is

A **minimalist corporate self-hosted fork** of OpenWhispr (Electron-based dictation desktop app) that ships only what an enterprise deployment needs: dictation, transcription, and reasoning against the organization's own backend. Consumer-facing features from upstream OpenWhispr (paid Stripe billing UI, referral program, real-time streaming via third-party ASR vendors) are **disabled by default** and must be opted-in explicitly via build-time env vars.

The first milestone reverse-engineers the existing OpenWhispr cloud backend, documents the wire-level contract in the repository so the corporate backend can be implemented to spec, and replaces hardcoded URLs / OAuth client configs / consumer-feature paths with build-time configurable variables.

## Core Value

**A corporate maintainer runs `npm run build` and gets a minimal, opinionated dictation binary that talks to their own backend, shows only the OAuth providers their org uses, and ships none of the consumer monetization or vendor-streaming UI.** Opt-ins are explicit env vars, never automatic.

**Default build (no env vars) is the minimal corporate build — NOT the upstream Yambr fork.** This is an intentional pivot away from upstream parity. Maintainers who want upstream behavior set every flag to `true` explicitly.

## Current State

**Shipped:** v1.7.2 milestone (2026-05-26, tag `v1.7.9`). Corporate-minimal default build with build-time configurability for backend URL, OAuth providers (Google/Apple/Microsoft), and consumer-feature flags (BILLING/REFERRALS/STREAMING). E2E suite 44/44 green against slim-core `openwhispr-server`. Provider lockdown verified live.

**Next Milestone Goals — v1.8.0 Custom Server URL Onboarding:**

End-users (corporate self-hosters and third-party deployments) can point an installed binary at their own backend via a runtime "Server URL" field on the onboarding screen, without rebuilding. This consciously relaxes the "Build-time only configurability" rule for backend host selection — a tradeoff documented in v1.8.0 Phase 1 ADR.

**Mandatory phase order** (per `.planning/milestones/v1.7.2-MILESTONE-AUDIT.md` integration-check):
1. **Phase 1 — Backend URL consolidation + dynamic Better Auth.** Collapse `OPENWHISPR_API_URL` + `OPENWHISPR_BACKEND_URL` to one SoT. Refactor `src/lib/auth.ts:12` from frozen module-singleton to lazy factory or mutable proxy that reads persisted settings. Sweep 3 hardcoded URLs (`auth.ts:177`, `auth.ts:227`, `ShareNoteDialog.tsx:26`) into `defaults.ts`. **Non-negotiable first.**
2. **Phase 2 — PROJECT.md amendment + ADR.** Document the conscious relaxation of "Build-time only configurability" for backend host. Threat model: phishing via malicious host capturing BYOK + session tokens.
3. **Phase 3 — Build-time gate plumbing.** Add `OPENWHISPR_ALLOW_CUSTOM_HOST` flag. Verify Rolldown DCE removes the field UI from default builds.
4. **Phase 4 — Onboarding UI.** Add Server URL field (empty, no placeholder), validation, reachability probe, persist to settings. i18n in 9 locales.
5. **Phase 5 — E2E + verification.** Playwright test for corporate-minimal build entering a custom host; default Yambr build still hides the field; live UAT.

Out of scope for v1.8.0: auto-discovery (DNS SRV / `.well-known`), deeplinks, MDM, runtime host switching after sign-in.

## Requirements

### Validated

<!-- Capabilities the existing brownfield codebase already provides + v1.7.2 deliverables. Locked. -->

- ✓ Cross-platform Electron desktop dictation (macOS / Windows / Linux) — existing
- ✓ Local transcription via whisper.cpp + sherpa-onnx (NVIDIA Parakeet) — existing
- ✓ Cloud transcription via OpenAI Whisper API — existing
- ✓ Multi-provider AI reasoning (OpenAI, Anthropic, Gemini, OpenWhispr cloud, enterprise, LAN, local llama.cpp) — existing
- ✓ Local semantic search (Qdrant + MiniLM ONNX) — existing
- ✓ Meeting detection (process + audio + Google Calendar) — existing
- ✓ Global hotkeys (incl. GNOME / Hyprland Wayland, Windows push-to-talk) — existing
- ✓ Encrypted secret storage via Electron `safeStorage` — existing
- ✓ Signed/notarized build pipeline (Yambr fork — `com.yambr.openwhispr` bundle ID) — existing
- ✓ **DOC-01**: Backend wire spec published (`docs/BACKEND_SPEC.md`) — v1.7.2 Phase 1
- ✓ **DOC-02**: OAuth provider spec published (`docs/OAUTH_SPEC.md`) — v1.7.2 Phase 1
- ✓ **DOC-03**: Self-hosting guide published (`docs/SELF_HOSTING.md`) — v1.7.2 Phase 1
- ✓ **DOC-04**: Application architecture doc (`docs/ARCHITECTURE.md`) — v1.7.2 Phase 2
- ✓ **CFG-01**: Hardcode inventory (`docs/CONFIG_INVENTORY.md`) — v1.7.2 Phase 2 (3 gaps surfaced for v1.8.0 sweep: auth.ts:177, auth.ts:227, ShareNoteDialog.tsx:26)
- ✓ **CFG-02**: All inventoried hardcodes replaced with build-time env variables — v1.7.2 Phase 3
- ✓ **CFG-04**: `OPENWHISPR_BACKEND_URL` build-time override — v1.7.2 Phase 3 (renderer-side SoT consolidation deferred to v1.8.0 Phase 1)
- ✓ **CFG-05**: `docs/BUILD_CONFIG.md` documents every build-time variable — v1.7.2 Phase 4
- ✓ **CFG-07**: OAuth gating tree-shakes disabled provider code from renderer bundle — v1.7.2 Phase 04.1
- ✓ **CFG-08**: `npm run pack` and `npm run build` both regenerate `build-config.generated.{ts,cjs}` — v1.7.2 Phase 04.1
- ✓ **CFG-09**: BILLING/REFERRALS/STREAMING feature flags (BILLING+REFERRALS default false; STREAMING default true with B1 auto-disable) — v1.7.2 Phase 04.1 + Phase 5 amendment
- ✓ **PLD-01..06**: Corporate-minimal provider lockdown (`OPENWHISPR_PROVIDER_LOCKDOWN`) — v1.7.2 Phase 10
- ✓ **QA-01..03**: Client↔Server compatibility audit (`COMPATIBILITY-MATRIX.md`) — v1.7.2 Phase 8
- ✓ **QA-04..06**: Client E2E suite (Playwright + Cucumber, 44/44) — v1.7.2 Phase 9
- ⚠ **CFG-03**: Per-provider OAuth flags — v1.7.2 Phase 4, partial (IntegrationsView.tsx Google Calendar card not gated standalone; superseded in default by PROVIDER_LOCKDOWN_ENABLED)
- ⊘ **CFG-06**: ~~Default-build parity with upstream Yambr fork~~ — *Superseded by CFG-09 + PLD-* per 2026-05-08 corporate-minimal pivot*

### Active

<!-- v1.8.0: Custom Server URL Onboarding -->

- [ ] **HOST-01**: Single SoT for backend host — collapse `OPENWHISPR_API_URL` and `OPENWHISPR_BACKEND_URL` into one variable; renderer + main consume the same source. (Phase 1)
- [ ] **HOST-02**: Better Auth client supports runtime base URL change — refactor `src/lib/auth.ts:12` from frozen singleton to lazy factory or mutable proxy. (Phase 1)
- [ ] **HOST-03**: Build-time flag `OPENWHISPR_ALLOW_CUSTOM_HOST` (default `false`) gates the Server URL field. Default Yambr build hides the field and uses compiled-in default; field is physically DCE'd from default bundle. (Phase 3)
- [ ] **HOST-04**: Onboarding screen has a third field "Server URL" (empty by default, no placeholder text). User must enter `https://` URL; field validated for syntax and reachability (probe `GET /api/auth/get-session` — 401 OK, 5xx/timeout = fail with localized error). User cannot proceed on validation failure. (Phase 4)
- [ ] **HOST-05**: Chosen Server URL persisted in settings; all subsequent Better Auth and `/api/*` calls use it. Re-onboarding (after logout or wipe) re-shows the empty field. (Phase 4)
- [ ] **HOST-06**: i18n keys for all new Server URL strings in 9 locale files (en, es, fr, de, pt, it, ru, zh-CN, zh-TW). (Phase 4)
- [ ] **HOST-07**: E2E test for corporate-minimal build entering a custom host and signing in; default Yambr build still hides the field; signed + notarized build still passes. (Phase 5)

<details>
<summary>Closed v1.7.2 Active section (archived)</summary>

- [x] **DOC-04**: Application architecture doc → validated
- [x] **CFG-01**: Hardcode inventory → validated (with v1.8.0 sweep TODO)
- [x] **CFG-02**: Build-time env refactor → validated
- [⚠] **CFG-03**: Per-provider OAuth flags → partial, superseded by PROVIDER_LOCKDOWN in default
- [x] **CFG-04**: Backend URL override → validated (renderer SoT to v1.8.0)
- [x] **CFG-05**: BUILD_CONFIG.md → validated
- [⊘] **CFG-06**: ~~Default-build parity~~ → superseded
- [x] **CFG-07**: OAuth tree-shake gate → validated
- [x] **CFG-08**: pack+build regenerate build-config → validated
- [x] **CFG-09**: BILLING/REFERRALS/STREAMING feature flags — **all default `false`** (corporate-minimal posture):
  - `OPENWHISPR_BILLING_ENABLED` — Stripe checkout/portal/switch-plan UI + `/api/stripe/*` calls
  - `OPENWHISPR_REFERRALS_ENABLED` — referral stats / invite UI + `/api/referrals/*` calls
  - `OPENWHISPR_STREAMING_ENABLED` — Realtime ASR via WebSocket. **Phase 05 amendment (2026-05-09):** default flipped `false` → `true` because streaming now routes through the corporate backend's `WSS /v1/realtime` (Speaches+LiteLLM, OpenAI-Realtime-compatible) rather than direct third-party WebSockets. The original corporate-minimal privacy rationale for default-off no longer applies. **B1 auto-disable**: when the user did not explicitly set `OPENWHISPR_STREAMING` AND no realtime URL is resolvable (no backend, no override), the generator forces `STREAMING_ENABLED=false` so a default offline build does not crash on first record. Maintainers can still opt out explicitly via `OPENWHISPR_STREAMING=false` (escape hatch preserved). Related new var: `OPENWHISPR_REALTIME_WSS_URL` (Phase 05).

  Each flag must tree-shake its UI and IPC handlers when `false` (verified via grep gate analogous to CFG-07).

</details>

### Out of Scope

<!-- v2 and beyond — not this milestone. -->

- Custom backend implementation with LDAP authentication — v2, separate project (Active backlog)
- Proxying transcription/diarization to self-hosted LiteLLM — v2
- Realtime transcription / diarization features — v2
- Calendar integration enhancements — v2
- ~~Runtime (post-build) backend reconfiguration UI~~ — **moved into scope for v1.8.0** (Custom Server URL Onboarding). The original "build-time only" framing is consciously relaxed for backend host selection only. All other configurability (OAuth providers, model registry, feature gates) remains build-time only.
- Auto-discovery of corporate backend (DNS SRV records, `.well-known/openwhispr-config`) — deferred beyond v1.8.0
- Deeplink `openwhispr://configure?host=…` — deferred beyond v1.8.0
- MDM / config profile / Group Policy distribution — deferred beyond v1.8.0
- Runtime host switching after sign-in (Settings UI for host change post-onboarding) — deferred beyond v1.8.0
- Replacing the Electron app with a web UI — out of scope (desktop-native is core to OpenWhispr)
- Removing existing cloud providers from the codebase — out of scope (default build keeps current behavior)

## Context

- Brownfield: forked from `OpenWhispr/openwhispr` and rebranded to `com.yambr.openwhispr` with Developer ID signing/notarization (commits `c190bc0`, `7c57df0`)
- Codebase already mapped — see `.planning/codebase/{ARCHITECTURE,STACK,STRUCTURE,INTEGRATIONS,CONCERNS,CONVENTIONS,TESTING}.md`
- Stack pinned: Electron 41, React 19, TypeScript, Tailwind v4, better-sqlite3, whisper.cpp, sherpa-onnx, Qdrant, ONNX Runtime, Node.js 24 (lockfile pinned to Node 24)
- Existing settings have **12 secret env vars** (7 BYOK API keys + 5 enterprise creds) defined in `SECRET_KEYS` of `src/helpers/environment.js`
- Existing 4 LLM scopes (`dictationCleanup`, `dictationAgent`, `noteFormatting`, `chatIntelligence`) and 8 inference providers (`anthropic`, `enterprise`, `gemini`, `groq`, `lan`, `local`, `openai`, `openwhispr`) — see `src/services/ai/inferenceProviders/`
- Existing OAuth: Google Calendar (see `googleCalendarManager.js`); other OAuth providers (Apple, etc.) — to be enumerated during DOC-02
- v2 (downstream project): self-hosted backend with LDAP, LiteLLM proxy for diarization + realtime transcription. Knowing this informs which abstractions v1 needs to expose.

## Constraints

- **Tech stack**: Existing — must not introduce new core deps without strong reason. Node 24 / Electron 41 / Vite are pinned.
- **Default-deny posture**: Default build (no env vars) ships the **minimal corporate surface**: dictation + transcription + reasoning against the configured backend, no Stripe billing UI, no referral UI, no third-party streaming ASR. Upstream-parity behavior is opt-in via explicit `OPENWHISPR_*_ENABLED=true` flags, not the default. This is a deliberate departure from earlier "default = upstream parity" framing.
- **Tree-shaking is required, not optional**: Every gated feature must be physically removed from the renderer bundle and main-process IPC when disabled — both for binary size and for reducing the attack/audit surface in corporate deployments. Boolean checks at runtime are insufficient; the disabled code paths must not exist in the shipped artifact.
- **Build-time configurability is the default**: Provider gating, OAuth flags, model registry overrides, feature flags — all build-time. Reduces attack surface, keeps the binary auditable. **Exception for v1.8.0+**: backend host selection is consciously moved to runtime (user enters Server URL on onboarding). Documented as a tradeoff with explicit threat model (phishing via malicious host → BYOK + session token exfiltration). Field visibility itself remains build-time gated (`OPENWHISPR_ALLOW_CUSTOM_HOST`).
- **Documentation lives in repo**: Backend / OAuth / build-config docs must be in `docs/` (committed), not just `.planning/` — third parties need them.
- **Signing**: Existing Developer ID signing flow (`afterSign.js`, electron-builder) must continue working with env-driven config.
- **Secrets**: API keys remain user-provided at runtime via Electron `safeStorage` — build-time vars are for *defaults and endpoints*, never for secret material.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| v1 = docs + build-time config only; v2 = own backend separately | Reverse-engineer first to define a stable wire contract; only then build a server. Avoids coupling client refactor to backend invention. | — Pending |
| Backend spec lives in `docs/` in the repo (not just `.planning/`) | Enables third parties to implement compatible servers without reading planning docs | — Pending |
| Build-time configuration via Vite `define` + electron-builder env (not runtime config files) | Smaller attack surface, simpler ops, binary is self-contained per deployment | — Pending |
| Default build behavior unchanged when no env vars set | Zero risk to existing Yambr fork users; opt-in self-hosting | **Reversed 2026-05-08** — see pivot below |
| **Pivot 2026-05-08: Corporate-minimal default** | Project goal narrowed to "minimalist binary for corporate self-hosting." Stripe billing UI, referral program, and third-party streaming ASR (AssemblyAI, Deepgram) are removed from the default build to reduce surface area, audit burden, and accidental data flows to consumer endpoints. Upstream parity is now an explicit opt-in (set every `OPENWHISPR_*_ENABLED=true`), not the default. CFG-06 superseded by CFG-09. | Active |
| OAuth providers gated individually (per-provider flags), not globally | Allows a deployment to keep some providers while removing others (e.g., LDAP-only later) | — Pending |
| Coarse phase granularity (3-5 phases) | Scope is well-defined and brownfield; over-slicing adds overhead without value | — Pending |
| **Pivot 2026-05-09 (Phase 05 amendment): STREAMING default true again, with B1 auto-disable** | Phase 04.1's default-off was conservative because streaming meant direct third-party WebSocket connections (AssemblyAI, Deepgram, OpenAI). Phase 05 routes realtime through the corporate backend (Speaches+LiteLLM) so the privacy/audit rationale for default-off no longer holds. Default flipped to `true`; `OPENWHISPR_STREAMING=false` remains as an explicit escape hatch. To preserve "default-build-works" for offline builds, an auto-disable rule forces STREAMING_ENABLED=false when the user did not explicitly opt in AND no realtime URL is resolvable. New build var `OPENWHISPR_REALTIME_WSS_URL` derives from `OPENWHISPR_BACKEND_URL`. | Active |
| **Pivot 2026-05-26 (v1.8.0 milestone): Backend host selection moves to runtime** | Corporate self-hosters and third-party deployments need to point an installed binary at their own backend without rebuilding. The "Build-time only configurability" rule is consciously relaxed for the backend host (and ONLY the host — all other configurability stays build-time). User enters Server URL on the onboarding screen; client validates syntax + reachability + persists to settings. Field visibility is still build-time gated via `OPENWHISPR_ALLOW_CUSTOM_HOST` so default Yambr build hides it. Threat model: phishing via malicious host capturing BYOK API keys + Better Auth session tokens. Mitigations: explicit user entry (no auto-discovery, no deeplinks), reachability probe, validated `https://` only, no migration path from old host (forces re-auth on every host change). | Active |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-05-26 after v1.7.2 milestone close + v1.8.0 milestone goals captured (Custom Server URL Onboarding)*
