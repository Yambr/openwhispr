# Phase 9 — CONTEXT (advisor discuss-phase output)

Decisions locked during the advisor session on 2026-05-19, after
Phase 9 first execute pass exposed multiple findings. Downstream
re-planning and re-execution agents should treat the choices below as
final, not gray areas.

## Operating rules locked

1. **Server adapts, client stays upstream-parity.** Two options for
   any contract gap: (a) server requirement filed in
   `SERVER-REQUIREMENTS.md`, or (b) feature cut from client UI via
   build-time gate. No third option — client doesn't migrate to match
   server, even for one-liners. (See client repo CLAUDE.md § Server
   Repo Boundary + memory `client_immutable`.)
2. **Harsh server review.** `openwhispr-server` is < 24h old, not in
   production. Every deviation from `docs/BACKEND_SPEC.md` /
   `docs/OAUTH_SPEC.md` is a bug to file with direct language.
   No back-compat aliases, no migration windows, no soft asks.
3. **No client-side workarounds.** No header spoofing in e2e, no
   mocks, no test-only branches in `main.js`/`preload.js`/`src/`, no
   embedded credentials, no Mailpit HTML scraping.
4. **Read-only against server repo.** All server findings go into
   `.planning/phases/<N>/SERVER-REQUIREMENTS.md`. Server team makes
   the actual fixes.

## Gray area resolutions

### GA-1+2 — Better Auth Origin rejection + signup `token: null`

**Decision:** Single server requirement R1 → `POST /api/_test/seed-tenant`
endpoint. Double-gated (`NODE_ENV !== "production"` AND
`OPENWHISPR_TEST_ROUTES === "true"`, aligning with the existing
convention used by `/api/_test/*` routes). Bypasses Origin check, skips
email verification, mints a real Better-Auth-compatible bearer.
Rejected: trustedOrigins `["*"]` in dev (too broad), client-side
Origin spoof (anti-pattern), Mailpit HTML scrape (anti-pattern).
Severity: BLOCKER.

### GA-3 — `/api/openai-realtime-token` schema

**Decision:** Server requirement R3 → conform to `docs/BACKEND_SPEC.md`
shape (`{model, language, streams}` request, `{clientSecret}` or
`{clientSecrets[]}` response, matching OpenAI Realtime API
conventions). Rejected: keep `{token}` + client adapter (client-
immutable), skip realtime to v2 (silent prod break).
Severity: HIGH.

### GA-4 — Stripe + Referrals routes not implemented

**Decision:** CLIENT-CUT (UI already hidden by `c4d2ca5e`) + scrub
the 7 endpoint cards from `docs/BACKEND_SPEC.md` and add a corporate-
minimal disclaimer. Server-side R2 confirms `packages/contract-tests/`
doesn't reference these paths. Rejected: implement on server (reverts
corporate-minimal pivot, month of work), leave spec lying (perpetual
docs drift).
Severity: MEDIUM (docs).

### GA-5 — `/api/health` deprecation header

**Decision:** Server requirement R4 → remove the deprecation header
from `/api/health` and treat both `/api/health` and `/livez` as
first-class endpoints. `/api/health` for the Electron client per
BACKEND_SPEC; `/livez` for K8s kubelet probes. Rejected: migrate
client to `/livez` (client-immutable), delete `/api/health`
(client-immutable), keep deprecation header (false signal — nothing
to migrate from).
Severity: LOW.

### GA-6 — sync surface (Notes/Folders/Conversations/Transcriptions)

**Decision:** **Phase 8 audit had a critical gap.** Client DOES wire
the full sync surface via `src/services/{Notes,Folders,Conversations,
Transcriptions}Service.ts` → `src/services/cloudApi.ts` → IPC
`cloud-api-request` (`src/helpers/ipcHandlers.js:6001`) → server.
Phase 8 inventory only grepped for direct `fetch(` calls and missed
the cloud-api passthrough layer; 23 endpoints were misclassified as
`MISSING(client)`.

Required actions:
- **Phase 8 amendment** (sub-phase 8.1 or in-place edit):
  - Add 23 sync endpoint rows to `COMPATIBILITY-MATRIX.md` as MATCH
    candidates, sourced by listing the distinct paths used through
    `cloudPost/cloudGet/cloudPatch/cloudDelete` across `src/services/`
    and `src/components/`
  - Update audit methodology note to grep through the cloud-api
    helper layer, not just literal `fetch(`
  - Recount verdict totals
- **Phase 9 scope extension:**
  - Add e2e scenarios for the sync CJM (Notes CRUD, Folders CRUD,
    Conversations CRUD, Transcriptions create/list/delete) — exercising
    the actual client wire path (cloudApiRequest IPC) so the e2e mirrors
    real user behavior, not raw HTTP
  - `notes-sync.feature` is re-tagged: drop `@server-only` since this
    IS the real client wire path, just abstracted through IPC

### GA-7 — `?email=` query on `/api/auth/verification-status`

**Decision:** Server requirement R5 → server accepts the query param
without warning or error, continues deriving identity from
session/Bearer. Optionally validate match; otherwise ignore silently.
Rejected: client drops the param (client-immutable), update
BACKEND_SPEC to drop the param (client owns BACKEND_SPEC).
Severity: LOW.

## Server requirements summary

All filed in `../08-client-server-audit/SERVER-REQUIREMENTS.md`:

| ID | Severity | Subject |
|---|---|---|
| R1 | BLOCKER | `/api/_test/seed-tenant` endpoint (closes Phase-8 R1+R2) |
| R2 | MEDIUM | Confirm Stripe+Referrals not in contract-tests |
| R3 | HIGH | `/api/openai-realtime-token` shape per BACKEND_SPEC |
| R4 | LOW | Drop `Deprecation` header from `/api/health` |
| R5 | LOW | Accept `?email=` on `/api/auth/verification-status` |
| R6 | apparently closed | Slim-core compose boots clean |
| R7 | apparently closed | Dockerfile byok-guard COPY |

## Client-side cuts summary

To be filed in a new `.planning/phases/09-client-e2e-tests/CLIENT-CUTS.md`:

- Scrub Stripe + Referrals endpoint cards from `docs/BACKEND_SPEC.md`
  (7 endpoints). Add corporate-minimal scope disclaimer.

## Phase 8 amendment

To be filed as either Phase 8.1 INSERTED in roadmap, or in-place
amendment of:
- `COMPATIBILITY-MATRIX.md` — re-classify 23 sync endpoints from
  `MISSING(client)` to `MATCH`, recount totals
- audit methodology note — flag the cloud-api passthrough layer as a
  separate inventory surface for future audits

## Phase 9 re-plan needed

The current `PLAN.md` predates these decisions. Re-plan must:

1. Drop client-side fixes from any task — there are none in scope
2. Add a `feature/notes-cjm.feature` + folders/conversations/
   transcriptions feature files exercising the sync CJM via the
   real `cloudApiRequest` IPC path (not raw fetch)
3. Add `@blocked-r1` tag handling — every authenticated scenario
   gates on R1 instead of the old `@blocked-s5`
4. Drop the audio fixture pending — once R1 lands, the
   `@requires-paid-keys` transcription scenario can run; the fixture
   is its own follow-up
5. Update `CJM.md` to list the 23 sync endpoints under new MATCH rows
6. Update `KNOWN-FAILURES.md` to reflect R1-R5 as the open server
   work, not the old S1-S6

## Next step

Run `/gsd-plan-phase 9 --gaps` to regenerate the Phase 9 plan from
this CONTEXT.md, then execute the new plan once server team confirms
R1 (the seed-tenant endpoint).
