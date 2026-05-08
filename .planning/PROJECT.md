# Yambr OpenWhispr Fork

## What This Is

A self-hostable fork of OpenWhispr (Electron-based dictation desktop app) that allows organizations to point the build at their own backend, model providers, and identity provider — configured at build time via environment variables. The first milestone reverse-engineers the existing OpenWhispr cloud backend, documents the wire-level contract directly in the repository so third parties can implement compatible servers, and replaces hardcoded URLs / OAuth client configs / provider lists with build-time configurable variables.

## Core Value

**A maintainer can run `npm run build` with a set of env vars and get a fully-working OpenWhispr binary that talks to their own backend and shows only the OAuth providers they want — without touching source code.** Default build (no env vars) must continue to behave identically to the upstream Yambr fork.

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

### Active

<!-- v1: Documentation + build-time configurability. -->

- [ ] **DOC-01**: Reverse-engineered backend wire spec published in repo (`docs/BACKEND_SPEC.md`) — every external HTTP call, payload schema, auth flow
- [ ] **DOC-02**: OAuth provider spec published in repo (`docs/OAUTH_SPEC.md`) — current providers, endpoints, scopes, redirect URIs, client-ID locations
- [ ] **DOC-03**: Self-hosting guide published in repo (`docs/SELF_HOSTING.md`) — how a third party can stand up a compatible backend
- [ ] **DOC-04**: Application architecture doc published in repo (`docs/ARCHITECTURE.md`) — IPC surface, secrets, models, transcription, embeddings, sidecars
- [ ] **CFG-01**: Inventory of every hardcoded backend URL / OAuth client config / enterprise endpoint / model registry default in source (`docs/CONFIG_INVENTORY.md`)
- [ ] **CFG-02**: All inventoried hardcodes replaced with build-time env variables (Vite `define`, electron-builder env, `.env.production`)
- [ ] **CFG-03**: Build-time flags to disable individual OAuth providers (e.g., `OPENWHISPR_OAUTH_GOOGLE=false`, `..._APPLE=false`)
- [ ] **CFG-04**: Build-time flag to override backend base URL (`OPENWHISPR_BACKEND_URL=...`)
- [ ] **CFG-05**: `docs/BUILD_CONFIG.md` documents every build-time variable with defaults and examples
- [ ] **CFG-06**: Default build (no env vars) is byte-for-byte behaviorally identical to current Yambr fork

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
- **Behavior**: Default build (no env) MUST be identical to current upstream Yambr binary — no behavioral drift for existing users.
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
| Default build behavior unchanged when no env vars set | Zero risk to existing Yambr fork users; opt-in self-hosting | — Pending |
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
*Last updated: 2026-05-08 after initialization*
