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
