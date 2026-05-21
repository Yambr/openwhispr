# Roadmap: Yambr OpenWhispr — v1 Documentation + Build-time Configurability

## Overview

This milestone reverse-engineers the existing OpenWhispr cloud backend, documents the full wire-level contract in `docs/` so third parties can build compatible servers, then replaces every hardcoded URL, OAuth client config, and provider default with build-time environment variables. The result: a maintainer can run `npm run build` with their own env vars and produce a fully-working binary targeting their own backend and showing only the OAuth providers they choose — while the default build (no env vars) remains byte-for-byte behaviorally identical to the current Yambr fork.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Wire Contract Documentation** - Reverse-engineer and document every external HTTP call and OAuth flow the app makes
- [x] **Phase 2: Architecture Doc + Hardcode Inventory** - Document the application's internal architecture and enumerate every hardcoded value that must become configurable
- [ ] **Phase 3: Build-time Env Refactor** - Replace all inventoried hardcodes with build-time variables via Vite define and electron-builder env
- [ ] **Phase 4: OAuth Gating, Build Docs, and Parity Gate** - Add per-provider OAuth flags, write BUILD_CONFIG.md, and verify default-build behavioral parity
- [x] **Phase 8: Client↔Server Compatibility Audit** - Cross-repo audit of every client HTTP call against openwhispr-server routes; produced COMPATIBILITY-MATRIX (21 MATCH, 2 MISMATCH, 7 MISSING-server, 13 MISSING-client), FIXES-CLIENT (F1-F5), SERVER-GAPS (S1-S4). 0 blockers for corporate-minimal default build; 1 HIGH for OpenAI Realtime path.
- [x] **Phase 9: Client E2E Tests (Playwright + Cucumber)** - Gherkin/CJM e2e suite (12 features) driving the real client wire path against a local slim-core openwhispr-server (`docker compose up`, `http://localhost:4000` only — no direct upstream calls). Playwright + @cucumber/cucumber + playwright-bdd. Final run: 44 passed / 0 failed / 0 skipped, `npm run test:e2e` exits 0. All server requirements R1-R18 filed and closed (server Phase 59), re-verified live. Only standing gate is operator-controlled @requires-paid-keys. 0 client/src changes — client-immutable preserved.

## Phase Details

### Phase 1: Wire Contract Documentation
**Goal**: Every external HTTP call and OAuth flow is documented in the repo so a third party can implement a compatible backend without reading source code
**Depends on**: Nothing (first phase)
**Requirements**: DOC-01, DOC-02, DOC-03
**Success Criteria** (what must be TRUE):
  1. `docs/BACKEND_SPEC.md` exists and covers every external HTTP call (method, URL, request schema, response schema, auth header, source file+function) including OpenWhispr cloud and enterprise endpoints in enough detail to implement a drop-in replacement
  2. `docs/OAUTH_SPEC.md` exists and covers every OAuth provider currently in the codebase — authorization endpoint, token endpoint, scopes, redirect URI scheme, where the client ID lives in source, how the token is stored
  3. `docs/SELF_HOSTING.md` exists and walks a third party through standing up a minimal compatible backend: required endpoints, expected payloads, auth model, and links to BACKEND_SPEC and OAUTH_SPEC
**Plans:** 3 plans
Plans:
- [ ] 01-01-PLAN.md — Reverse-engineer and write docs/BACKEND_SPEC.md
- [ ] 01-02-PLAN.md — Reverse-engineer and write docs/OAUTH_SPEC.md
- [ ] 01-03-PLAN.md — Write docs/SELF_HOSTING.md walkthrough

### Phase 2: Architecture Doc + Hardcode Inventory
**Goal**: The application's internal process model and IPC surface are documented, and every hardcoded value targeted for replacement is catalogued with its proposed env-var name
**Depends on**: Phase 1
**Requirements**: DOC-04, CFG-01
**Success Criteria** (what must be TRUE):
  1. `docs/ARCHITECTURE.md` exists and covers process model (main / renderer / preload / ONNX worker), IPC surface (channels and contracts), secret storage, model registry, transcription pipeline, embeddings pipeline, and sidecar binaries
  2. `docs/CONFIG_INVENTORY.md` exists and lists every hardcoded backend URL, OAuth client ID, enterprise endpoint, default model registry override, and LiteLLM-shaped URL — each entry includes file path, line number, current value, and proposed env-var name
  3. CONFIG_INVENTORY entries are complete enough that a developer can execute the Phase 3 refactor without re-auditing the source tree
**Plans:** 2 plans
Plans:
- [x] 02-01-PLAN.md — Write docs/ARCHITECTURE.md (process model, IPC surface, secrets, model registry, transcription, embeddings, sidecars)
- [x] 02-02-PLAN.md — Write docs/CONFIG_INVENTORY.md (5-column hardcode inventory with proposed OPENWHISPR_* env-vars)

### Phase 3: Build-time Env Refactor
**Goal**: Every entry in CONFIG_INVENTORY is replaced with a build-time variable; no production code path reads the new variables at runtime
**Depends on**: Phase 2
**Requirements**: CFG-02, CFG-04
**Success Criteria** (what must be TRUE):
  1. Running `grep` for each former hardcoded value in CONFIG_INVENTORY finds zero occurrences in source (values are gone, replaced by variable references)
  2. `OPENWHISPR_BACKEND_URL` (and any per-service URL overrides from CFG-01) controls the backend base URL at build time — setting it to a custom value produces a binary that contacts that URL instead of the default
  3. All new env variables are consumed via Vite `define` (renderer) or `process.env` at build time (main process) — none are read at runtime in production code paths
  4. Default build (no env vars set) produces a binary whose network behavior is identical to pre-refactor — same URLs, same endpoints
**Plans:** 6 plans
Plans:
- [ ] 03-01-PLAN.md — Create src/config/defaults.ts SoT, generated build-config module, Vite define extension
- [ ] 03-02-PLAN.md — Refactor auth cluster (src/lib/auth.ts, main.js, ipcHandlers.js) — CFG-04 anchor lands here
- [ ] 03-03-PLAN.md — Convert electron-builder.json → electron-builder.config.js + protocol scheme env override
- [ ] 03-04-PLAN.md — Refactor Google OAuth cluster (googleCalendarOAuth.js, googleCalendarManager.js)
- [ ] 03-05-PLAN.md — Refactor model-registry + LiteLLM bucket (constants.ts, modelRegistryData.json, ModelRegistry.ts, McpIntegrationCard.tsx, ipcHandlers.js mirrors)
- [ ] 03-06-PLAN.md — Ship scripts/verify-defaults-parity.js gate + Phase 3 smoke checklist in SELF_HOSTING.md

### Phase 4: OAuth Gating, Build Docs, and Parity Gate
**Goal**: Each OAuth provider can be individually disabled at build time, every build-time variable is documented with examples, and the default build is verified to be behaviorally identical to the current Yambr fork
**Depends on**: Phase 3
**Requirements**: CFG-03, CFG-05, CFG-06
**Success Criteria** (what must be TRUE):
  1. Setting `OPENWHISPR_OAUTH_GOOGLE=false` (or equivalent per-provider flag) at build time produces a binary where that provider is fully absent — not visible in UI, not present in IPC handlers, not in bundled assets
  2. `docs/BUILD_CONFIG.md` exists and documents every build-time variable: name, purpose, default value, allowed values, and a worked example of building a self-hosted variant with custom backend and subset of OAuth providers
  3. A smoke checklist (in BUILD_CONFIG.md or SELF_HOSTING.md) exists and passes: default build with no env vars shows same providers, same default endpoints, and same OAuth options as the current Yambr fork
  4. Existing Developer ID signing flow (`afterSign.js`, electron-builder) continues working with the env-driven config — signed build passes notarization
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Wire Contract Documentation | 0/TBD | Not started | - |
| 2. Architecture Doc + Hardcode Inventory | 3/3 | Complete | 2026-05-08 |
| 3. Build-time Env Refactor | 0/TBD | Not started | - |
| 4. OAuth Gating, Build Docs, and Parity Gate | 0/TBD | Not started | - |

### Phase 04.1: Tree-shaking fix for OAUTH_*_ENABLED gating + ensure prepack regenerates build-config (INSERTED)

**Goal:** Fix the OAuth gating tree-shake bug discovered during Phase 04 smoke testing AND extend the same gating pattern to three new corporate-minimal feature flags (BILLING, REFERRALS, STREAMING) — all defaulting to `false` per the 2026-05-08 corporate-minimal pivot.
**Requirements**: CFG-07, CFG-08, CFG-09
**Depends on:** Phase 04
**Plans:** 6/6 plans complete

Plans:
- [x] 04.1-01-PLAN.md — `pack`/`dist` regenerate build-config (CFG-08)
- [x] 04.1-02-PLAN.md — Tree-shake fix for OAuth gating in IntegrationsView (CFG-07)
- [x] 04.1-03-PLAN.md — Add OPENWHISPR_BILLING flag (CFG-09 part 1)
- [x] 04.1-04-PLAN.md — Add OPENWHISPR_REFERRALS flag (CFG-09 part 2)
- [x] 04.1-05-PLAN.md — Add OPENWHISPR_STREAMING flag (CFG-09 part 3)
- [x] 04.1-06-PLAN.md — Update docs/BUILD_CONFIG.md and docs/SELF_HOSTING.md

### Phase 5: Route all realtime ASR/diarization streaming through corporate backend (no direct AssemblyAI/Deepgram from client). Adapt to Yambr's speeches/audio server. Remove hardcoded Deepgram key vulnerability. Replace upstream's three streaming providers with single Yambr-protocol WebSocket pointed at corporate backend.

**Goal:** When `OPENWHISPR_BACKEND_URL` is set at build time, all realtime streaming traffic routes through the corporate backend's `WSS /v1/realtime` (Speaches+LiteLLM, OpenAI-Realtime-compatible) instead of direct connections to api.openai.com / api.deepgram.com / streaming.assemblyai.com. New build var `OPENWHISPR_REALTIME_WSS_URL` derives from backend URL automatically. STREAMING default flips to true (no third-party leak from default build).
**Requirements**: CFG-04, CFG-05, CFG-09
**Depends on:** Phase 4
**Plans:** 4 plans

Plans:
- [ ] 05-01-PLAN.md — Add OPENWHISPR_REALTIME_WSS_URL build var with backend-derived default (TDD)
- [ ] 05-02-PLAN.md — Replace hardcoded api.openai.com realtime URL in openaiRealtimeStreaming.js (TDD)
- [ ] 05-03-PLAN.md — Flip OPENWHISPR_STREAMING_ENABLED default false→true (TDD, CFG-09 amendment)
- [ ] 05-04-PLAN.md — Document Phase 05 realtime routing in BUILD_CONFIG + BACKEND_SPEC + SELF_HOSTING + README


### Phase 6: Merge upstream OpenWhispr v1.7.2 (and ongoing). Resolve conflicts with our build-time gating + corporate-minimal default. Verify all gates still pass after merge. Ongoing process — repeat for each upstream release.

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 5
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 6 to break down)

### Phase 7: Add unit + integration tests for Phase 04/04.1/05 phase work — vitest setup, tests for deriveRealtimeWssUrl, generate-build-config logic, shouldUseStreaming gate, gating helpers. Target ~50-100 tests covering our additions; upstream legacy code stays uncovered.

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 6
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 7 to break down)


### Phase 8: Client↔Server Compatibility Audit

**Goal:** Produce an authoritative, file:line-anchored mapping of every HTTP call the client makes to every route exposed by `openwhispr-server` (apps/api), plus a list of mismatches the client needs fixed and gaps in server coverage that the server team must close before client e2e can pass.
**Requirements:** QA-01, QA-02, QA-03
**Depends on:** Phase 1 (BACKEND_SPEC.md as oracle)
**Plans:** TBD

Success Criteria (what must be TRUE):
  1. `.planning/phases/08-client-server-audit/COMPATIBILITY-MATRIX.md` exists and lists every client HTTP call (file:line, method, URL pattern, request shape, auth, expected response shape) alongside the matching server route (apps/api file:line, method, URL, request schema, response schema, auth middleware) with a verdict per row: `MATCH` / `MISMATCH(<detail>)` / `MISSING(client | server)`
  2. `.planning/phases/08-client-server-audit/FIXES-CLIENT.md` lists every client-side change required to align with the server (URL paths, request fields, auth header format, error code handling)
  3. `.planning/phases/08-client-server-audit/SERVER-GAPS.md` lists every endpoint the client needs but the server does not implement (or implements differently from BACKEND_SPEC.md), framed as requirements the server team can ingest
  4. Audit is read-only against `openwhispr-server` — no commits to that repo from this phase

Plans:
- [ ] TBD (run /gsd-plan-phase 8 to break down)


### Phase 9: Client E2E Tests (Playwright + Cucumber)

**Goal:** A runnable Gherkin/Cucumber + Playwright e2e suite drives the Electron client via `_electron.launch` against a locally-running slim-core openwhispr-server (`docker compose up` in the server repo), covering the four CJM areas: auth (signup/login/refresh/logout), notes sync (CRUD), cloud transcription + LLM reasoning, and OAuth/billing/health. Test failures triage into either client fixes (applied here) or server gaps (filed back via Phase 8 SERVER-GAPS).
**Requirements:** QA-04, QA-05, QA-06
**Depends on:** Phase 8
**Plans:** 09-01 (complete)

Success Criteria (what must be TRUE):
  1. `tests/e2e/` exists in the client repo with: Playwright config, `@cucumber/cucumber` config, `.feature` files for each of the 4 CJM areas, and TypeScript step definitions ✅
  2. `npm run test:e2e` boots the Electron app via `_electron.launch` against `npm run dev`, points it at `http://localhost:4000` (slim-core api), and executes all features end-to-end ✅
  3. README in `tests/e2e/` documents how to bring up the slim-core server (`docker compose up` in `../openwhispr-server`), seed a test tenant, and run the suite ✅
  4. CJM coverage matrix in `tests/e2e/CJM.md` maps every Phase-8-MATCHed endpoint to at least one Gherkin scenario; every client-shipped user journey has at least one Background → Given/When/Then path ✅
  5. All scenarios either PASS, or fail with a recorded ticket in `tests/e2e/KNOWN-FAILURES.md` linked to the server gap or client bug that caused it ✅

Plans:
- [x] 09-01-PLAN.md — Re-plan post-R1-R12 closure: CJM features via cloudApiRequest IPC wire path, seed-tenant fixture, worker-scoped Electron app. Final: 44/0/0, R1-R18 closed.

### Phase 10: Corporate-minimal provider lockdown — build-time gate cutting all OAuth buttons (Apple/Google/Microsoft), all alternative transcription/reasoning/agent providers (OpenAI/Groq/Mistral/Custom), and all BYOK surfaces (API key input, EnterpriseProviderConfig bedrock/azure/vertex). Client offers strictly two processing paths: Cloud (our server) or Local. Verified live against the local openwhispr-server slim stack.

**Goal:** A single build-time flag `OPENWHISPR_PROVIDER_LOCKDOWN` (default `false`) produces a corporate-minimal client: zero OAuth buttons (email/password only), Cloud + Local as the only processing modes, and no alternative cloud provider, BYOK, or enterprise provider surface — all physically DCE'd from the bundle. Flag unset = byte-identical upstream parity.
**Requirements**: PLD-01, PLD-02, PLD-03, PLD-04, PLD-05, PLD-06
**Depends on:** Phase 9
**Plans:** 1/6 plans executed

Plans:
- [x] 10-01-PLAN.md — Add OPENWHISPR_PROVIDER_LOCKDOWN flag to build-config generator + defaults.ts re-export (PLD-01)
- [ ] 10-02-PLAN.md — Lockdown implies all three OAuth provider flags off (PLD-02)
- [ ] 10-03-PLAN.md — Gate transcription cloud-provider tabs + BYOK input under lockdown (PLD-03)
- [ ] 10-04-PLAN.md — Gate reasoning cloud-provider selector + EnterpriseSection under lockdown (PLD-04)
- [ ] 10-05-PLAN.md — Gate BYOK/enterprise key IPC, preload, CustomModelInput, ApiKeysService (PLD-05)
- [ ] 10-06-PLAN.md — verify-provider-lockdown bundle-grep gate + docs + live UAT (PLD-06)
