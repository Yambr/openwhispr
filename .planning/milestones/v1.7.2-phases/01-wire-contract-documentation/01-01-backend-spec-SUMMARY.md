---
phase: 01-wire-contract-documentation
plan: 01
subsystem: docs
tags: [backend-spec, wire-contract, openwhispr-cloud, reverse-engineering, ipc, better-auth]

requires:
  - phase: 00-init
    provides: ".planning/codebase/INTEGRATIONS.md inventory of external endpoints"
provides:
  - "docs/BACKEND_SPEC.md — wire-level contract for the OpenWhispr cloud backend with detailed endpoint cards (19 endpoints) and inventory of third-party AI/enterprise APIs"
  - "Per-endpoint source-pointer convention (fetch-site + IPC handler file:line) third parties can use to detect drift"
  - "Documented global error envelope (200/401/503/network) and auth header semantics (Bearer + cookie fallback)"
affects: [01-02-oauth-spec, 01-03-self-hosting-guide, 02-config-inventory, 03-build-time-config, 04-oauth-gating]

tech-stack:
  added: []
  patterns:
    - "Endpoint card template: method/URL/auth/fetch-site/IPC-site table + JSON request + JSON response + error deviations + notes"
    - "Source-pointer drift detection via path:line citations to fetch() and ipcMain.handle sites"
    - "Global error envelope with per-endpoint deviations called out inline"

key-files:
  created:
    - docs/BACKEND_SPEC.md
  modified: []

key-decisions:
  - "OpenWhispr cloud documented in detail (19 endpoint cards), third-party APIs (OpenAI/Anthropic/Gemini/Mistral/Groq/AssemblyAI/Deepgram) and enterprise (Bedrock/Azure/Vertex) treated as inventory-only per D-01/D-02"
  - "Source-only reverse engineering — no live HTTP traces captured, source is the contract per D-09"
  - "Markdown tables + fenced JSON examples (no OpenAPI/JSON Schema) per D-05"
  - "Every endpoint card cites both fetch() call site and ipcMain.handle file:line per D-07; renderer-direct calls explicitly marked"
  - "Global error envelope documented once with 401/503/network special handling; per-endpoint deviations called out inline per D-08"

patterns-established:
  - "Endpoint card structure for OAUTH_SPEC.md and SELF_HOSTING.md to mirror"
  - "OpenWhispr-cloud calls flow either renderer-direct (pre-auth check-user, verification-status, delete-account) or main-process via proxyFetch with getAuthHeader (everything else)"

requirements-completed: [DOC-01]

duration: 6min
completed: 2026-05-08
---

# Phase 1 Plan 1: Backend Spec Summary

**Wire-level contract `docs/BACKEND_SPEC.md` reverse-engineered from client source: 19 OpenWhispr cloud endpoints (transcribe / reason / agent / referrals / stripe / streaming-tokens / quota / health / auth) cataloged with method, URL, auth header, request JSON, response JSON, error semantics, and dual source pointers (fetch-site + IPC handler) — plus inventory-only treatment of all third-party AI and enterprise providers**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-05-08T08:14:19Z
- **Completed:** 2026-05-08T08:20:00Z (approx)
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Documented all 19 OpenWhispr-cloud endpoints the current client calls: `/api/check-user`, `/api/auth/verification-status`, `/api/auth/delete-account`, `/api/transcribe`, `/api/health`, `/api/reason`, `/api/agent/stream`, `/api/agent/web-search`, `/api/streaming-usage`, `/api/usage`, `/api/stt-config`, `/api/note-recording-config`, `/api/streaming-token`, `/api/deepgram-streaming-token`, `/api/openai-realtime-token`, `/api/stripe/{checkout,portal,switch-plan,preview-switch}`, `/api/referrals/{stats,invite,invites}`, plus generic `cloud-api-request` passthrough
- Captured global error envelope (200/400/401/403/404/429/503/network) with per-endpoint deviations inline (e.g., `/api/transcribe` exposes `limitReached: true` at HTTP 200; referral handlers throw vs. return success-envelope)
- Documented auth header semantics: Bearer token from `tokenStore.js` is preferred; cookie jar (scoped to OPENWHISPR_API_URL + AUTH_URL) is the fallback. Token persistence at `userData/auth-token.bin` via Electron `safeStorage` documented
- Documented `openwhispr://` custom protocol redirect with channel-specific variants (production/staging/development) and forward-link to OAUTH_SPEC.md for the full OAuth round-trip
- Inventoried 17 third-party / enterprise call sites with file:line and vendor doc links: OpenAI Responses/Chat/Models/Whisper/Realtime, Anthropic, Gemini, Groq, Mistral Voxtral, AssemblyAI realtime + token, Deepgram, Bedrock, Azure OpenAI, Vertex, LAN, llama.cpp loopback, plus the OpenWhispr cloud-reasoning row

## Task Commits

1. **Task 1: Reverse-engineer OpenWhispr cloud + inventory third-party calls and write BACKEND_SPEC.md** — `7cb48fc` (docs)

## Files Created/Modified
- `docs/BACKEND_SPEC.md` (new, 815 lines) — Wire-level contract: scope/conventions/global-error-envelope/19 endpoint cards/custom-protocol/third-party-inventory/out-of-scope

## Decisions Made
- Cited `src/helpers/ipcHandlers.js:3326-3330` and `src/config/constants.ts:116` as the canonical resolution chain for OPENWHISPR_API_URL (covers VITE_OPENWHISPR_API_URL renderer-side and runtime-env.json main-process fallback)
- Kept the Better Auth desktop-signin shim (`${AUTH_URL}/api/desktop-signin/<provider>`) as a sketch only in BACKEND_SPEC.md; full OAuth flow deferred to OAUTH_SPEC.md per D-01 boundary
- Documented `cloud-api-request` as a generic passthrough rather than enumerating its callers, since it is a meta-channel that exposes arbitrary `${OPENWHISPR_API_URL}` paths to the renderer

## Deviations from Plan

None - plan executed exactly as written. The plan listed minimum-required endpoint cards (`/api/check-user`, `/api/auth/verification-status`, `/api/auth/delete-account`) and instructed me to "discover others while reading source and add them" — I added 16 more cards based on grep of `${apiUrl}/api/` and `OPENWHISPR_API_URL`. This is in-scope per the plan's explicit instruction.

## Issues Encountered
None.

## User Setup Required
None - documentation-only plan.

## Next Phase Readiness
- BACKEND_SPEC.md is ready for OAUTH_SPEC.md (Plan 01-02) and SELF_HOSTING.md (Plan 01-03) to cross-reference
- Endpoint cards establish the template OAUTH_SPEC.md should mirror for provider entries (auth endpoint / token endpoint / scopes / redirect URI / file:line)
- Inventory section provides the canonical list of integration sites future phases (CFG-01 inventory) will revisit when replacing hardcoded URLs with build-time env vars

## Self-Check: PASSED

- FOUND: docs/BACKEND_SPEC.md
- FOUND: 7cb48fc (commit)
- All 9 acceptance-criteria grep checks PASS (Global Error Envelope, OpenWhispr Cloud Endpoints, Third-Party API Inventory, Conventions, /api/check-user, /api/auth/verification-status, /api/auth/delete-account, source pointers in src/lib/auth.ts + AuthenticationStep.tsx + ipcHandlers.js, vendor URLs api.openai.com/api.anthropic.com/api.mistral.ai)
- 100 markdown table rows (≥ 15 required)
- No OpenAPI / JSON Schema artifacts present

---
*Phase: 01-wire-contract-documentation*
*Completed: 2026-05-08*
