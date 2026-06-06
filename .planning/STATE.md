---
gsd_state_version: 1.0
milestone: v1.8.0
milestone_name: Custom Server URL Onboarding
status: ready-to-ship
last_updated: "2026-05-27T10:40:00.000Z"
last_activity: 2026-06-03 — v1.7.18: explicit requestKind discriminator on /api/reason body (cleanup|agent|summary|title), replacing server-side systemPrompt heuristic. Contract agreed byte-for-byte with server peer. 149/149 vitest, tsc clean, review GO. Prior: v1.7.17 (#8/#9/WR-01) released, 18 assets.
progress:
  total_phases: 5
  completed_phases: 5
  total_plans: 10
  completed_plans: 10
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-26)

**Core value:** A maintainer or end-user can produce a corporate-minimal OpenWhispr binary that talks to their own backend with only the OAuth providers they want — at build time today, and at runtime via onboarding starting in v1.8.0.
**Current focus:** v1.8.0 Phase 1 — Backend URL SoT Consolidation + Dynamic Better Auth.

## Current Position

Phase: 1 of 5 (Backend URL SoT Consolidation + Dynamic Better Auth)
Plan: — (not yet planned)
Status: Not started — roadmap created, ready to plan Phase 1
Last activity: 2026-06-06 — Completed quick task 260606-p6k: diarization MessagePort transferList crash fix (→v1.7.22). Local speaker-embedding extraction crashed "Port at index 0 is not a valid port" (onnxWorker.js:392) — Electron MessagePortMain.postMessage accepts only MessagePort in transferList, NOT ArrayBuffer (unlike web MessageChannel); the worker reply pushed result.embeddingBuffer + speakerEmbeddings passed [samplesBuffer]. FIX (owner-sanctioned MINIMAL upstream edit — genuine Electron platform bug still unfixed on upstream/main): drop the ArrayBuffer from both transferLists → structured-clone (few-KB buffers, cheap; nothing relied on transfer-neutering — verified worker returns fresh buffers). Diarization STAYS LOCAL (server diarization endpoint was removed in server v1.2.5). TIGHT 2-hunk diff vs upstream; onnxWorkerClient/localEmbeddings/vectorIndex stay diff-clean; cloud bge-m3 files untouched. 237/237, tsc clean, regression test models the MessagePortMain constraint behaviorally. NEXT: tag v1.7.22 (review_before_tag → bump → e2e → tag → monitor). FILE UPSTREAM PR so fork drift converges. LIVE-VERIFY on the released build (real 2+ speaker meeting). ——— PRIOR: 260605-p6l capability-probe-before-auth → v1.7.21 RELEASED (embeddings activate after login). 260604-tsa cloud embeddings → v1.7.20 RELEASED. Server pair: client 1.7.21 + server 1.2.5. HARD CONSTRAINT: never write the corp org/model namespace anywhere (generic placeholders only). On the corp lockdown build (v1.7.20) embeddings were disabled all session because embeddingsBootstrap probed /api/capabilities at STARTUP, before the OIDC token landed → no-token → fail-closed forever (proven by Nick's live log "capabilities: no auth token"). The server was correctly configured (operator set the embedding model); the CLIENT defeated itself by probing without a token. FIX (fork-only): serverCapabilities now returns a `reason` discriminator; embeddingsBootstrap seeds a STABLE non-frozen delegating facade and exposes reinstall() that re-probes when auth-set-token fires and swaps the delegate stub→cloud IN PLACE on the same object vectorIndex captured at module-load → embeddings activate mid-session, no restart. Only "no-token" arms the retry (no storm on server-false/unauthorized/error); concurrency-guarded; default build strict no-op. 231/231 tests, tsc clean, 4 upstream embed files diff-clean, auth-set-token additive-only, crux proven by test, 7/7 must-haves. Batches into v1.7.21 with the server's #14 agent-stream system-first fix. ——— PRIOR: 260604-tsa cloud embeddings (→v1.7.20, RELEASED 18 assets). #13 onnx crash CLOSED by code (proven by logs: onnx never spawns on 1.7.20). #14 chat 400 "system must be first" = SERVER bug (agent-stream route; client body byte-identical upstream) — peer fixing. HARD CONSTRAINT: never write the corp org/model namespace anywhere (generic placeholders only).
PRIOR-LAST-ACTIVITY (260604-tsa): Completed quick task 260604-tsa: cloud embeddings to corp backend (→v1.7.20). The upstream-immutable onnx worker crashes at onnxWorker.js:392 (MessagePort transferList — RC-4 packaged it but the runtime crash remained); route note embeddings to the self-hosted /api/embeddings, gated by PROVIDER_LOCKDOWN_ENABLED + runtime features.embeddings (GET /api/capabilities), via an always-seed require.cache shim so onnx NEVER spawns under lockdown (CloudEmbeddings when caps-true, throw-fast stub→FTS5 when caps-false). + qdrant dim 384→1024 migration, honest reindex probe (10 locales), and a lockdown-aware meeting realtime empty-catalog fallback (no api.openai.com path). 4 upstream embed files diff-clean, 210/210 tests, tsc clean, 11/11 must-haves. Server peer shipped /api/embeddings+rerank+capabilities (502/503-never-401 error semantics) on server main. PRE-RELEASE GATE before v1.7.20: corp live-verification (real lockdown build hitting in-perimeter /api/capabilities + /api/embeddings → semantic search works; meeting realtime stays on self-hosted relay, no reconnect storm). HARD CONSTRAINT: never write the corp org/model namespace anywhere (generic placeholders only).

Progress: [░░░░░░░░░░] 0%

## Deferred Items

Items acknowledged and deferred at v1.7.2 milestone close on 2026-05-26:

| Category | Item | Status | Notes |
|----------|------|--------|-------|
| uat | phase-03 03-HUMAN-UAT.md | partial | 2 pending scenarios (default-build smoke walk, custom-protocol Google Calendar smoke) |
| uat | phase-04 04-HUMAN-UAT.md | unsigned | SC #4 signed-build sign-off blank; de-facto verified by shipped v1.7.6/7/8 releases |
| verification | phase-04 04-VERIFICATION.md | gaps_found | CFG-03 partial (IntegrationsView.tsx Google Calendar card not gated standalone — superseded in default by Phase 10 PROVIDER_LOCKDOWN_ENABLED) |
| quick_task | 260521-wt4-corporate-minimal-ui-fixes | done | sentinel present, audit-open false-positive |
| quick_task | 260522-wt5-lockdown-leaks-notes-mcp | done | findings committed (39fe0576); SUMMARY pending bookkeeping |
| quick_task | 260522-wt6-realtime-streaming-lockdown | done | sentinel + live-run.mjs present |
| quick_task | 260523-byok-preload-hotfix | done | work shipped in commit 16543048; REVIEW.md filed, SUMMARY pending bookkeeping |
| quick_task | 260526-ix4-client-realtime-wss-pass-settings-prefer | done | SUMMARY present |
| quick_task | 260526-lang-realtime-preferred-language | done | work shipped in commits 081493a2, 146868cc, 6909d5fc (under ix4 follow-up) |

All 9 items are documented as known tech debt in MILESTONES.md and accepted at close.
See `.planning/milestones/v1.7.2-MILESTONE-AUDIT.md` and `.planning/v1.7.2-INTEGRATION-CHECK.md` for the full audit.

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.

Recent decisions affecting current work:

- 2026-05-26 (v1.8.0 milestone): Backend host selection moves to runtime via onboarding screen, gated by build-time `OPENWHISPR_ALLOW_CUSTOM_HOST`. All other configurability stays build-time. Threat model + mitigations to be formalized in v1.8.0 Phase 2 ADR.

### Pending Todos

None yet.

### Blockers/Concerns

None blocking. Phase 1 carries forward two v1.7.2 integration-check findings as scope-included work (not blockers):

- **INT-01** (HIGH): `src/lib/auth.ts:12` `authClient` is a frozen module-singleton — runtime URL reconfig requires refactor → HOST-02.
- **INT-02** (MED): Two parallel env-var systems for backend host (`OPENWHISPR_BACKEND_URL` vs `OPENWHISPR_API_URL`) need collapsing → HOST-01.
- **INT-03/04/05** (MED): 3 hardcoded URLs in `src/lib/auth.ts:177`, `auth.ts:227`, `ShareNoteDialog.tsx:26` → HOST-03.

### Quick Tasks Completed

| # | Description | Date | Commit | Status | Directory |
|---|-------------|------|--------|--------|-----------|
| 260530-ms3 | Adopt upstream #835 — skip API key check for self-hosted transcription servers | 2026-05-30 | fdc9527c |  | [260530-ms3-adopt-upstream-835-skip-api-key-check-fo](./quick/260530-ms3-adopt-upstream-835-skip-api-key-check-fo/) |
| 260603-ogm | Fix #8 (HIGH auth-leak) — desktop OIDC sign-in honors runtime serverUrl instead of build-time AUTH_URL | 2026-06-03 | eb9716d4 |  | [260603-ogm-fix-8-desktop-oidc-sign-in-uses-build-ti](./quick/260603-ogm-fix-8-desktop-oidc-sign-in-uses-build-ti/) |
| 260603-qhw | #9 client half — server-driven local-login gating (hide email/password form when localLogin.enabled:false) + review fixes | 2026-06-03 | 9bbc7ed3, 2fe15b58 |  | [260603-qhw-implement-client-half-of-9-server-driven](./quick/260603-qhw-implement-client-half-of-9-server-driven/) |
| 260603-r0p | WR-01 security — gate prod renderer test-hooks (`__zustand_setServerUrl` SSRF-bypass) behind e2e runtime signal; live-proven via CDP | 2026-06-03 | be1cb424 |  | [260603-r0p-wr-01-gate-auth-ts-prod-test-hooks-behin](./quick/260603-r0p-wr-01-gate-auth-ts-prod-test-hooks-behin/) |
| 260604-eij | Custom-host onboarding UX — hoist Server URL field out of localLogin gate (BUG 1, self-hoster could never reach own server) + add Settings host-change section (BUG 2) + WR-01 DCE stub-alias so field is absent from default bundle | 2026-06-04 | a51bfdee | Verified | [260604-eij-custom-host-onboarding-ux-server-url-field](./quick/260604-eij-custom-host-onboarding-ux-server-url-field/) |
| 260604-gpc | Corporate self-hosted data-plane + onnx pack (v1.7.19): RC-1 cold-start serverUrl push to main (all /api/* timed out), RC-2 runtime-derive realtime WSS host (both connect sites), RC-3 kill byok under lockdown (gate + self-heal reconciler), RC-4 package onnxWorker.js. + BL-01 review fix (relocate deriveRealtimeWssUrl to packaged helper — scripts/ require crashed packed binary). 173/173 tests | 2026-06-04 | f3a2da91, a51bfdee→HEAD | Verified (pre-tag gates: pack-smoke + corp live) | [260604-gpc-v1718-corporate-host-data-plane-onnx-pack](./quick/260604-gpc-v1718-corporate-host-data-plane-onnx-pack/) |
| 260604-tsa | Cloud embeddings to corp backend + realtime fallback (→v1.7.20): the upstream-immutable onnx worker crashes at onnxWorker.js:392 (MessagePort transferList) — route note embeddings to the self-hosted backend (POST /api/embeddings) gated by PROVIDER_LOCKDOWN_ENABLED + runtime features.embeddings (GET /api/capabilities), via an always-seed require.cache shim (CloudEmbeddings when caps-true, throw-fast stub when caps-false → onnx NEVER spawned under lockdown), qdrant dim 384→1024 migration, honest reindex probe + i18n (10 locales). PLUS meeting realtime lockdown-aware empty-catalog fallback (no api.openai.com, no hardcoded OpenAI model). 4 upstream embed files diff-clean vs upstream/main. 210/210 tests, tsc clean. Server peer impl /api/embeddings+rerank+capabilities on server main. PRE-RELEASE GATE: corp live-verify (real lockdown build vs in-perimeter /api/capabilities + /api/embeddings) | 2026-06-04 | 048096b5,d2eba344,3d1ff4b4,4a206d2e,c34c6279 | Verified (11/11; pre-release: corp live) | [260604-tsa-cloud-embeddings-corp-backend](./quick/260604-tsa-cloud-embeddings-corp-backend/) |
| 260605-p6l | Capability-probe-before-auth fix (→v1.7.21): on the corp lockdown build embeddings stayed disabled ALL session because embeddingsBootstrap.install() probed /api/capabilities at startup BEFORE the OIDC token landed → no-token → fail-closed forever (Nick's live log 15:02:48 "capabilities: no auth token"). FIX: serverCapabilities returns a `reason` (no-token/unauthorized/server-false/error); install() seeds ONE STABLE non-frozen delegating facade (stub delegate); reinstall() re-probes when auth-set-token fires and swaps _delegate stub→cloud IN PLACE on the SAME object vectorIndex captured at module-load (vectorIndex.js:2) → captured ref flips transparently, no restart, no upstream edit. Only "no-token" arms the retry (no storm); concurrency-guarded; default build strict no-op. 4 upstream embed files diff-clean, auth-set-token additive-only insertion, 231/231 tests, tsc clean, crux proven by test (capture ref before reinstall → routes to cloud after). | 2026-06-05 | ac4db5c6,04b13626,d11dce9f | Verified (7/7) | [260605-p6l-embeddings-capability-reprobe-on-auth](./quick/260605-p6l-embeddings-capability-reprobe-on-auth/) |
| 260606-p6k | Diarization MessagePort transferList crash (→v1.7.22): local speaker-embedding extraction crashed "Port at index 0 is not a valid port" (onnxWorker.js:392). Electron MessagePortMain.postMessage accepts ONLY MessagePort in transferList — NOT ArrayBuffer (unlike web MessageChannel). Two sites put an ArrayBuffer there: onnxWorker.js dispatch() reply (pushed result.embeddingBuffer) + speakerEmbeddings.js request (`[samplesBuffer]` 3rd arg). FIX (owner-sanctioned minimal upstream edit — genuine Electron platform bug, still unfixed on upstream/main 2026-06-06): drop the ArrayBuffer from both transferLists → structured-clone (cheap, few-KB buffers). Diarization stays LOCAL (server diarization endpoint removed in server v1.2.5). TIGHT 2-hunk diff vs upstream (transferList lines only); onnxWorkerClient/localEmbeddings/vectorIndex diff-clean. 237/237 tests, tsc clean, regression test models the MessagePortMain constraint behaviorally (RED proven against pre-fix). FILE UPSTREAM PR (drift converges). LIVE-VERIFY recommended (vitest can't run real Electron): packed app, 2+ speaker meeting, confirm "Speaker embedding extraction skipped" gone + labels attach. | 2026-06-06 | 6bb4aa90,1557fb4f | Verified 6/6 (human_needed: live diarization) | [260606-p6k-diarization-messageport-transferlist-fix](./quick/260606-p6k-diarization-messageport-transferlist-fix/) |

## Session Continuity

Last session: 2026-05-26
Stopped at: v1.8.0 roadmap created (5 phases, 12 requirements mapped to 4 phases; Phase 2 is unmapped policy work)
Resume file: None

## Operator Next Steps

- Plan Phase 1 with `/gsd-plan-phase 1`
- Phase 1 MUST land before Phase 3 (build-time gate) and Phase 4 (UI) — see INT-01/INT-02 in v1.7.2-INTEGRATION-CHECK.md
