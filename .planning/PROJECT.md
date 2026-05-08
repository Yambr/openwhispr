# Yambr OpenWhispr Fork

## What This Is

A **minimalist corporate self-hosted fork** of OpenWhispr (Electron-based dictation desktop app) that ships only what an enterprise deployment needs: dictation, transcription, and reasoning against the organization's own backend. Consumer-facing features from upstream OpenWhispr (paid Stripe billing UI, referral program, real-time streaming via third-party ASR vendors) are **disabled by default** and must be opted-in explicitly via build-time env vars.

The first milestone reverse-engineers the existing OpenWhispr cloud backend, documents the wire-level contract in the repository so the corporate backend can be implemented to spec, and replaces hardcoded URLs / OAuth client configs / consumer-feature paths with build-time configurable variables.

## Core Value

**A corporate maintainer runs `npm run build` and gets a minimal, opinionated dictation binary that talks to their own backend, shows only the OAuth providers their org uses, and ships none of the consumer monetization or vendor-streaming UI.** Opt-ins are explicit env vars, never automatic.

**Default build (no env vars) is the minimal corporate build — NOT the upstream Yambr fork.** This is an intentional pivot away from upstream parity. Maintainers who want upstream behavior set every flag to `true` explicitly.

## Requirements

### Validated

<!-- Capabilities the existing brownfield codebase already provides. Locked. -->

- ✓ Cross-platform Electron desktop dictation (macOS / Windows / Linux) — existing
- ✓ Local transcription via whisper.cpp + sherpa-onnx (NVIDIA Parakeet) — existing
- ✓ Cloud transcription via OpenAI Whisper API — existing
- ✓ Multi-provider AI reasoning (OpenAI, Anthropic, Gemini, OpenWhispr cloud, enterprise, LAN, local llama.cpp) — existing
- ✓ Local semantic search (Qdrant + MiniLM ONNX) — existing
- ✓ Meeting detection (process + audio + Google Calendar) — existing
- ✓ Global hotkeys (incl. GNOME / Hyprland Wayland, Windows push-to-talk) — existing
- ✓ Encrypted secret storage via Electron `safeStorage` — existing
- ✓ Signed/notarized build pipeline (Yambr fork — `com.yambr.openwhispr` bundle ID) — existing
- ✓ **DOC-01**: Backend wire spec published (`docs/BACKEND_SPEC.md`) — validated in Phase 1
- ✓ **DOC-02**: OAuth provider spec published (`docs/OAUTH_SPEC.md`) — validated in Phase 1
- ✓ **DOC-03**: Self-hosting guide published (`docs/SELF_HOSTING.md`) — validated in Phase 1

### Active

<!-- v1: Documentation + build-time configurability. -->

- [ ] **DOC-04**: Application architecture doc published in repo (`docs/ARCHITECTURE.md`) — IPC surface, secrets, models, transcription, embeddings, sidecars
- [ ] **CFG-01**: Inventory of every hardcoded backend URL / OAuth client config / enterprise endpoint / model registry default in source (`docs/CONFIG_INVENTORY.md`)
- [x] **CFG-02**: All inventoried hardcodes replaced with build-time env variables (Vite `define`, electron-builder env, `.env.production`) — *Validated in Phase 3 (mechanical parity gate); runtime smoke walk pending in Phase 4*
- [ ] **CFG-03**: Build-time flags to disable individual OAuth providers (e.g., `OPENWHISPR_OAUTH_GOOGLE=false`, `..._APPLE=false`)
- [x] **CFG-04**: Build-time flag to override backend base URL (`OPENWHISPR_BACKEND_URL=...`) — *Validated in Phase 3*
- [ ] **CFG-05**: `docs/BUILD_CONFIG.md` documents every build-time variable with defaults and examples
- [ ] ~~**CFG-06**: Default build (no env vars) is byte-for-byte behaviorally identical to current Yambr fork~~ *Superseded by pivot 2026-05-08 — see CFG-09*
- [ ] **CFG-07**: OAuth gating physically tree-shakes disabled provider code paths from the renderer bundle (verify-oauth-gating gate must pass with `OPENWHISPR_OAUTH_GOOGLE=false` etc.)
- [ ] **CFG-08**: `npm run pack` and `npm run build` both regenerate `build-config.generated.{ts,cjs}` so env-var overrides actually take effect (currently only `prebuild` runs the generator — `prepack` does not)
- [ ] **CFG-09**: Three new feature flags, **all default `false`** (corporate-minimal posture):
  - `OPENWHISPR_BILLING_ENABLED` — Stripe checkout/portal/switch-plan UI + `/api/stripe/*` calls
  - `OPENWHISPR_REFERRALS_ENABLED` — referral stats / invite UI + `/api/referrals/*` calls
  - `OPENWHISPR_STREAMING_ENABLED` — AssemblyAI / Deepgram WebSocket live dictation + `/api/{streaming,deepgram-streaming}-token` calls

  Each flag must tree-shake its UI and IPC handlers when `false` (verified via grep gate analogous to CFG-07).

### Out of Scope

<!-- v2 and beyond — not this milestone. -->

- Custom backend implementation with LDAP authentication — v2, separate project (Active backlog)
- Proxying transcription/diarization to self-hosted LiteLLM — v2
- Realtime transcription / diarization features — v2
- Calendar integration enhancements — v2
- Runtime (post-build) backend reconfiguration UI — out of scope (v1 is build-time only by design; reduces attack surface)
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
- **Build-time only**: All v1 configurability happens at build time, NOT runtime. Reduces attack surface and keeps the binary auditable.
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
*Last updated: 2026-05-08 after Phase 3 (Build-time Env Refactor) complete — runtime parity smoke walk deferred to Phase 4*
