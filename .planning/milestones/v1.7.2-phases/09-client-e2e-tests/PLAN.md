---
phase: 09-client-e2e-tests
plan: 1
type: execute
wave: 1
gap_closure: true
depends_on: []
files_modified:
  - tests/e2e/fixtures/seed.ts
  - tests/e2e/fixtures/electron-launch.ts
  - tests/e2e/features/auth.feature
  - tests/e2e/features/notes-sync.feature
  - tests/e2e/features/notes-cjm.feature
  - tests/e2e/features/folders-cjm.feature
  - tests/e2e/features/conversations-cjm.feature
  - tests/e2e/features/transcriptions-cjm.feature
  - tests/e2e/features/api-keys.feature
  - tests/e2e/features/realtime-token.feature
  - tests/e2e/features/health.feature
  - tests/e2e/features/transcription.feature
  - tests/e2e/features/reasoning.feature
  - tests/e2e/features/agent-stream.feature
  - tests/e2e/features/usage-config.feature
  - tests/e2e/steps/world.ts
  - tests/e2e/steps/auth.steps.ts
  - tests/e2e/steps/notes.steps.ts
  - tests/e2e/steps/folders.steps.ts
  - tests/e2e/steps/conversations.steps.ts
  - tests/e2e/steps/transcriptions.steps.ts
  - tests/e2e/steps/api-keys.steps.ts
  - tests/e2e/steps/sync-cjm.steps.ts
  - tests/e2e/steps/health.steps.ts
  - tests/e2e/steps/realtime.steps.ts
  - tests/e2e/CJM.md
  - tests/e2e/KNOWN-FAILURES.md
  - tests/e2e/README.md
autonomous: false
requirements: [QA-04, QA-05, QA-06]
must_haves:
  truths:
    - "`npm run test:e2e` against a slim-core server (booted with OPENWHISPR_TEST_ROUTES=true) exits 0 with no @blocked-r1 tags filtering scenarios out"
    - "Seed fixture uses POST /api/_test/seed-tenant and returns a Better-Auth-compatible bearer without an email-verify round trip"
    - "Sync CJM (Notes, Folders, Conversations, Transcriptions) is exercised through the Electron client via cloudApiRequest IPC — not raw HTTP — and all CRUD verbs pass against the live server"
    - "API key UI surface (if present) is exercised through the renderer; if no UI exists, api-keys.feature documents server-contract-only coverage and CJM.md records that disposition"
    - "Old @blocked-s5 tags and @server-only marker on notes-sync.feature are gone; new @blocked-r1 tag is documented as the single gate (and is empty because R1 is closed) and remaining gates are operator-controlled (@requires-paid-keys) or fixture-pending only"
    - "/api/health scenario asserts NO Deprecation header (per R4 — server flipped to first-class /api/health)"
    - "OpenAI realtime token scenario sends {model, language, streams:1} and asserts {clientSecret} per R3 — no longer @skip"
    - "verification-status scenario sends ?email=… and asserts 200 per R5"
    - "CJM.md lists the 23 sync endpoints + 3 v1/keys endpoints under MATCH rows mapped to specific feature.scenario coverage"
    - "KNOWN-FAILURES.md reflects R1-R12 closure: only the audio-fixture pending row and any e2e bugs surfaced during this run remain"
  artifacts:
    - path: tests/e2e/fixtures/seed.ts
      provides: "Seed via POST /api/_test/seed-tenant; no email-verify dance"
      contains: "/api/_test/seed-tenant"
    - path: tests/e2e/features/notes-cjm.feature
      provides: "Notes CRUD exercised through cloudApiRequest IPC (the real client wire path)"
    - path: tests/e2e/features/folders-cjm.feature
      provides: "Folders CRUD via cloudApiRequest IPC"
    - path: tests/e2e/features/conversations-cjm.feature
      provides: "Conversations + messages CRUD via cloudApiRequest IPC"
    - path: tests/e2e/features/transcriptions-cjm.feature
      provides: "Transcriptions CRUD via cloudApiRequest IPC"
    - path: tests/e2e/features/api-keys.feature
      provides: "v1/keys list+create+revoke through renderer, or server-contract-only with note"
    - path: tests/e2e/CJM.md
      provides: "Coverage map listing 23 sync + 3 v1/keys endpoints under MATCH"
      contains: "/api/notes/create"
    - path: tests/e2e/KNOWN-FAILURES.md
      provides: "Post-R1-R12 closure state — short list, no R-blocked rows"
  key_links:
    - from: tests/e2e/fixtures/seed.ts
      to: "POST /api/_test/seed-tenant"
      via: "fetch with NODE_ENV=test + OPENWHISPR_TEST_ROUTES=true server gate"
      pattern: "/api/_test/seed-tenant"
    - from: tests/e2e/steps/sync-cjm.steps.ts
      to: "window.electronAPI.cloudApiRequest"
      via: "ElectronApplication.evaluate(...) calling preload bridge inside the renderer"
      pattern: "cloudApiRequest"
---

<objective>
Replan Phase 9 (Client E2E Tests) in gap-closure mode after the 2026-05-19 advisor session locked new decisions. The original plan (PLAN.md predating the advisor session) was written against a stale set of assumptions:
- It assumed `MISSING(client)` for the sync surface, when in fact 23 sync endpoints + 3 v1/keys endpoints flow through the cloud-api passthrough layer (`cloudApi.ts` → `cloud-api-request` IPC) and are MATCH.
- It assumed @blocked-s5 (pgbouncer) was the gating server failure; in reality the gate became R1 (seed-tenant endpoint) after the advisor session reframed the problem.
- It treated /api/health Deprecation header as a stable contract; R4 closed it (server drops the header).
- It tagged `/api/openai-realtime-token` as @skip permanently; R3 closed it (server now returns {clientSecret}).
- It documented client-side migrations (F1 client → /livez, F3 client drops ?email=) that are now dead per `client_immutable` — server adapts in R4/R5.

All twelve server requirements R1-R12 (filed in Phase 8 SERVER-REQUIREMENTS.md) are CLOSED by the server team as of 2026-05-19. This phase's job is to drive a green e2e run against that closed server, with full sync surface coverage exercised through the real client wire path (cloudApiRequest IPC), not raw HTTP.

Purpose: Validate the closed-R1-R12 server against the upstream-parity Electron client end-to-end. Surface any remaining gaps as either server-side findings (file in `SERVER-REQUIREMENTS.md`) or harness bugs (fix in this phase).

Output: A `tests/e2e/` suite where `npm run test:e2e` exits 0 against `cd ../openwhispr-server && docker compose up -d` with `OPENWHISPR_TEST_ROUTES=true` + `LITELLM_MASTER_KEY` in the server `.env`, with sync CJM scenarios driving the real Electron client wire path. CJM.md + KNOWN-FAILURES.md updated to reflect closure.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/09-client-e2e-tests/CONTEXT.md
@.planning/phases/09-client-e2e-tests/CLIENT-CUTS.md
@.planning/phases/08-client-server-audit/SERVER-REQUIREMENTS.md
@.planning/phases/08-client-server-audit/COMPATIBILITY-MATRIX.md
@docs/BACKEND_SPEC.md
@tests/e2e/README.md
@tests/e2e/CJM.md
@tests/e2e/KNOWN-FAILURES.md
@tests/e2e/fixtures/seed.ts
@tests/e2e/fixtures/electron-launch.ts
@tests/e2e/playwright.config.ts
@tests/e2e/features/notes-sync.feature
@tests/e2e/features/auth.feature
@tests/e2e/features/health.feature
@tests/e2e/features/realtime-token.feature
@src/services/cloudApi.ts
@src/services/NotesService.ts
@src/services/FoldersService.ts
@src/services/ConversationsService.ts
@src/services/TranscriptionsService.ts
@src/services/ApiKeysService.ts
@src/helpers/ipcHandlers.js

<interfaces>
Cloud-api passthrough wire path (sync CJM scenarios MUST exercise this, not raw fetch):

  src/services/<Resource>Service.ts
    └─→ src/services/cloudApi.ts  (cloudGet / cloudPost / cloudPatch / cloudDelete)
          └─→ window.electronAPI.cloudApiRequest({ method, path, body? })
                └─→ ipcMain.handle("cloud-api-request")  (src/helpers/ipcHandlers.js:6018)
                      └─→ HTTPS to ${OPENWHISPR_API_URL}${path}
                          with Authorization: Bearer <token from tokenStore>

In Playwright/Electron tests, call this path via `electronApp.evaluate(async ({ ipcMain: _ }, opts) => { ... })` or by exposing a renderer-side helper that calls `window.electronAPI.cloudApiRequest`. Do NOT use raw `fetch(BACKEND_URL + path)` for sync CRUD — that bypasses the real client wire path and defeats the purpose of these scenarios.

Seed-tenant endpoint contract (per R1 in Phase 8 SERVER-REQUIREMENTS.md):

  POST /api/_test/seed-tenant
  Content-Type: application/json
  { "email": "e2e+<label>-<runId>@test.local",
    "password": "<password>",
    "name": "<display>",
    "verified": true }
  → 200 { "token": "<bearer>",
          "user": { "id": "<uuid>",
                    "email": "<email>",
                    "emailVerified": true,
                    "createdAt": "<iso>" } }

Gates (both required, both server-side):
- NODE_ENV !== "production"
- OPENWHISPR_TEST_ROUTES === "true"   ← env-var name actually used by server

The endpoint bypasses Origin check and skips email verification entirely.

v1 envelope (per R12) — only the api-keys family uses this:
  V1Response<T> = { success: boolean, data?: T, error?: string, code?: string }
All other sync families return entities directly.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Swap seed fixture to /api/_test/seed-tenant (per R1)</name>
  <files>tests/e2e/fixtures/seed.ts</files>
  <action>
Replace the `signUp(tenant)` function (currently POSTing /api/auth/sign-up/email and dealing with `token: null` because of pending email verification) with `seedTenant(tenant)` which POSTs `/api/_test/seed-tenant` with body `{ email, password, name, verified: true }` and parses `{ token, user }` from the JSON response. The response always includes `token` (R1 contract). No cookie parsing, no email-verify dance, no Mailpit, no fallback chains.

Keep `makeTenant(label)`, `BACKEND_URL`, `RUN_ID`, and the `TestTenant` shape unchanged. Update `SignUpResult` to `SeedResult` (`{ ok: true; token; user; tenant }` or `{ ok: false; status; body; tenant }`).

Update the file-top docstring: the seed gate is now R1 (closed). The endpoint is gated server-side by `NODE_ENV !== "production"` AND `OPENWHISPR_TEST_ROUTES === "true"`; if either is missing the server returns 404 and this fixture surfaces a clear actionable error ("server not running with OPENWHISPR_TEST_ROUTES=true").

Drop the cleanup hook that called `/api/auth/delete-account` (no longer needed; seed-tenant is idempotent on email and the server team handles test-tenant pruning).

Per D-R1: use the exact env-var name `OPENWHISPR_TEST_ROUTES` (NOT `OPENWHISPR_ALLOW_TEST_ROUTES`).
  </action>
  <verify>
    <automated>grep -c "/api/_test/seed-tenant" tests/e2e/fixtures/seed.ts | grep -v '^0$'</automated>
    <automated>grep -c "sign-up/email" tests/e2e/fixtures/seed.ts | tr -d '\n' | grep -q '^0$'</automated>
    <automated>grep -c "OPENWHISPR_TEST_ROUTES" tests/e2e/fixtures/seed.ts | grep -v '^0$'</automated>
    <automated>node --check tests/e2e/fixtures/seed.ts 2>&1 || npx tsc --noEmit tests/e2e/fixtures/seed.ts</automated>
  </verify>
  <done>seed.ts uses /api/_test/seed-tenant exclusively; no references to sign-up/email or to email verification; OPENWHISPR_TEST_ROUTES env var is documented in the file header.</done>
</task>

<task type="auto">
  <name>Task 2: Strip @blocked-s5/@server-only tags; rewrite KNOWN-FAILURES + README for R1-R12 closure</name>
  <files>tests/e2e/features/notes-sync.feature, tests/e2e/KNOWN-FAILURES.md, tests/e2e/README.md</files>
  <action>
1. `tests/e2e/features/notes-sync.feature` — remove the `@server-only` feature-level tag from line 1. The file becomes either (a) deleted in favor of `notes-cjm.feature` in Task 3, OR (b) retained as a thin HTTP-level smoke test of the server contract distinct from the IPC-based CJM coverage. Pick (a): delete the file entirely; its coverage is replaced and broadened by `notes-cjm.feature` in Task 3.

2. `tests/e2e/KNOWN-FAILURES.md` — full rewrite. Drop the `@blocked-s5` row (R6 closed), the `@skip` row for OpenAI realtime (R3 closed), and the `@blocked-s5` row for readyz. Retain only:
   - `pending fixture` row for `tests/e2e/fixtures/audio/hello-world-3s.wav` — still pending as a follow-up. Per advisor decision: "Audio fixture pending stays pending — once R1 lands, the @requires-paid-keys transcription scenario can run; the fixture is its own follow-up."
   - `@requires-paid-keys` operator-gate row — repurpose to document that this is an operator concern, not a server bug. Lists exactly which scenarios are gated.

   Add a section "Server requirement closure log" listing R1-R12 with their closure date (2026-05-19) and the scenario tag that was retired for each (e.g. R1 → @blocked-r1 never shipped to .feature files because R1 closed before this plan ran; R3 → @skip retired from realtime-token.feature; R4 → Deprecation-header assertion flipped from "expect present" to "expect absent" in health.feature; R6 → @blocked-s5 retired wholesale).

3. `tests/e2e/README.md` — update the operator runbook:
   - Server boot command MUST now include `OPENWHISPR_TEST_ROUTES=true` in the server `.env` (alongside `LITELLM_MASTER_KEY`). Document explicitly that this is the server env-var name, NOT `OPENWHISPR_ALLOW_TEST_ROUTES`.
   - Note that the seed flow no longer requires Mailpit / email verification.
   - Tag legend updated to reflect current state.

Per D-R1, D-R3, D-R4, D-R6: every R-row from Phase 8 is closed; no @blocked-rN tag should remain active in the suite after this plan.
  </action>
  <verify>
    <automated>test ! -f tests/e2e/features/notes-sync.feature</automated>
    <automated>grep -E "@blocked-s5|@blocked-r1" tests/e2e/features/*.feature tests/e2e/KNOWN-FAILURES.md | grep -v -E '^[^:]+:[[:space:]]*#' | grep -c . | tr -d '\n' | grep -q '^0$'</automated>
    <automated>grep -c "OPENWHISPR_TEST_ROUTES" tests/e2e/README.md | grep -v '^0$'</automated>
    <automated>grep -c "pending fixture" tests/e2e/KNOWN-FAILURES.md | grep -v '^0$'</automated>
  </verify>
  <done>notes-sync.feature deleted; no active @blocked-s5 or @blocked-r1 tags remain (only documented in KNOWN-FAILURES history); README documents OPENWHISPR_TEST_ROUTES=true requirement.</done>
</task>

<task type="auto">
  <name>Task 3: Sync CJM features (notes/folders/conversations/transcriptions) via cloudApiRequest IPC</name>
  <files>tests/e2e/features/notes-cjm.feature, tests/e2e/features/folders-cjm.feature, tests/e2e/features/conversations-cjm.feature, tests/e2e/features/transcriptions-cjm.feature, tests/e2e/steps/sync-cjm.steps.ts, tests/e2e/steps/notes.steps.ts, tests/e2e/steps/folders.steps.ts, tests/e2e/steps/conversations.steps.ts, tests/e2e/steps/transcriptions.steps.ts</files>
  <action>
Create four new Gherkin feature files exercising the cloud-api passthrough wire path documented in `<interfaces>` (NOT raw HTTP). Each scenario boots the Electron app via the existing electron-launch fixture (with the seeded bearer from Task 1), and calls `window.electronAPI.cloudApiRequest({ method, path, body })` from inside the renderer using `electronApp.evaluate()` or a small renderer-exposed test bridge.

**notes-cjm.feature** — covers MATCH rows #34-40 from COMPATIBILITY-MATRIX.md amendment:
- POST /api/notes/create → 201 + CloudNote (id assigned)
- POST /api/notes/batch-create with [n1, n2] → 201 + `{ created: [{client_note_id, id}, ...] }` (snake_case preserved per R8)
- GET /api/notes/list → 200 + `{ notes: [...] }` includes the created notes
- PATCH /api/notes/update with {id, title:"renamed"} → 200 + updated CloudNote
- POST /api/notes/search with a query that matches → 200 + `{ notes: [...] }`
- DELETE /api/notes/delete {id} → 204; subsequent list does not include it
- DELETE /api/notes/delete-all → 200 + `{ deleted: <n> }`; list empty after

**folders-cjm.feature** — MATCH rows #41-45 (R9):
- POST /api/folders/create → 201 + CloudFolder
- POST /api/folders/batch-create → 201 + `{ created: [...] }`
- GET /api/folders/list → 200 + `{ folders: [...] }`
- PATCH /api/folders/update → 200 + updated folder
- DELETE /api/folders/delete → 204 OR 409 (whichever the server picked per R9 referential-integrity choice — assert one and document it)

**conversations-cjm.feature** — MATCH rows #46-51 (R10):
- POST /api/conversations/create → 201 + CloudConversation
- POST /api/conversations/messages → CloudMessage created on that conversation
- GET /api/conversations/messages?conversationId=… → returns messages in creation order
- PATCH /api/conversations/update → 200 + updated conversation
- POST /api/conversations/search → 200 + `{ conversations: [...] }`
- DELETE /api/conversations/delete → 204; subsequent messages list returns empty or 404 (assert one per R10 cascade choice)

**transcriptions-cjm.feature** — MATCH rows #52-56 (R11) — these are RECORD CRUD, NOT audio inference (do not confuse with /api/transcribe):
- POST /api/transcriptions/create → 201 + CloudTranscription
- POST /api/transcriptions/batch-create → 201 + `{ created: [...] }`
- GET /api/transcriptions/list → 200 + `{ transcriptions: [...] }`
- POST /api/transcriptions/batch-delete {ids: [...]} → `{ deleted: [...] }`
- DELETE /api/transcriptions/delete → 204

**Step defs:**
- `tests/e2e/steps/sync-cjm.steps.ts` — shared helpers: `cloudCall(method, path, body?)` which routes through `electronApp.evaluate` to invoke `window.electronAPI.cloudApiRequest(...)` and returns `{ status, body }`. Common Given/When/Then for "the test tenant is authenticated", "the response status is N", "the response body contains key 'X'".
- `tests/e2e/steps/notes.steps.ts` — refit existing file (currently targeting raw-fetch notes-sync.feature) to drive the new notes-cjm.feature scenarios via cloudCall. Delete any raw `fetch(BACKEND_URL + '/api/notes/...')` usage.
- `folders.steps.ts`, `conversations.steps.ts`, `transcriptions.steps.ts` — NEW, mirror the notes.steps.ts pattern for each respective resource.

Tag every scenario with no R-blocked tag — R1-R12 are all closed. Operator-gated scenarios get `@requires-paid-keys` only where appropriate (sync CRUD does NOT need paid keys, so no tags on these four feature files).

Per advisor "Phase 9 re-plan needed" §2: "Add sync CJM scenarios … These must exercise the cloud-api passthrough path … via the Electron client, NOT raw HTTP." If any scenario falls back to raw fetch, it's wrong.
  </action>
  <verify>
    <automated>test -f tests/e2e/features/notes-cjm.feature && test -f tests/e2e/features/folders-cjm.feature && test -f tests/e2e/features/conversations-cjm.feature && test -f tests/e2e/features/transcriptions-cjm.feature</automated>
    <automated>grep -lE 'fetch\([^)]*BACKEND_URL.*\/api\/(notes|folders|conversations|transcriptions)\/' tests/e2e/steps/ 2>/dev/null | grep -c . | tr -d '\n' | grep -q '^0$'</automated>
    <automated>grep -c "cloudApiRequest" tests/e2e/steps/sync-cjm.steps.ts | grep -v '^0$'</automated>
    <automated>npx tsc --noEmit -p tests/e2e/tsconfig.json</automated>
  </verify>
  <done>Four CJM feature files exist; step defs route through cloudApiRequest IPC; no raw-fetch calls to sync endpoints from steps/; TypeScript compiles clean.</done>
</task>

<task type="auto">
  <name>Task 4: Update existing features for R3/R4/R5 closure + add api-keys.feature</name>
  <files>tests/e2e/features/health.feature, tests/e2e/features/realtime-token.feature, tests/e2e/features/auth.feature, tests/e2e/features/api-keys.feature, tests/e2e/steps/health.steps.ts, tests/e2e/steps/realtime.steps.ts, tests/e2e/steps/auth.steps.ts, tests/e2e/steps/api-keys.steps.ts</files>
  <action>
**health.feature** (per R4 closure):
- GET /api/health → assert `status === "ok"` AND assert NO `deprecation` response header AND assert NO `link` header pointing at `/livez`. Previously the scenario asserted the deprecation header was present — flip the assertion.
- GET /livez → unchanged (200, `{"status":"ok"}`)
- GET /readyz → 200 (R6 closed; postgres now reachable)

**realtime-token.feature** (per R3 closure):
- Remove `@skip` tag from the OpenAI scenario.
- Rewrite the scenario to POST `/api/openai-realtime-token` with body `{model:"gpt-4o-realtime-preview-2024-12-17", language:"en", streams:1}` and assert `{clientSecret: <non-empty string>}` in the response. Do NOT assert `token` field — that was the pre-R3 server shape and is gone.
- Add a second scenario with `streams:2` asserting `{clientSecrets: [s1, s2]}` (length 2, both non-empty).
- Keep `@requires-paid-keys` on these (they call upstream OpenAI to mint the ephemeral key).
- AssemblyAI + Deepgram scenarios unchanged.

**auth.feature** (per R5 closure):
- Add a scenario: "Verification status accepts ?email= query param" — GET `/api/auth/verification-status?email=<seeded-email>` with Bearer auth → 200, response shape matches BACKEND_SPEC. This asserts R5 closure (server tolerates the param).
- The signed-up/email-verify scenarios can stay but should now go through the seed-tenant path from Task 1 rather than the old sign-up/email flow. Any scenario that previously gated on email verification now uses the pre-verified user from seed-tenant.

**api-keys.feature** (per R12 closure) — NEW file covering MATCH rows #57-59:
First, determine whether the renderer has a UI surface for API keys. Run `grep -rE "ApiKeysService|api.?keys" src/components/ src/pages/ 2>/dev/null` to check. If a UI component exists, the scenario boots the app, navigates to the API keys page, clicks "Create key", asserts the plaintext key is shown ONCE, then revokes it and asserts it's gone from the list. If no UI component exists (very plausible — corporate-minimal default may hide it), the feature file contains a single scenario tagged `@server-contract-only` that invokes ApiKeysService methods through `cloudCall` (the same helper from Task 3) and asserts the v1 envelope shape `{success: true, data: {...}}` per R12. Document the chosen disposition in the feature file's top comment AND in CJM.md (Task 5).

**Steps:**
- `health.steps.ts` — update the deprecation-header assertion (flip from present → absent).
- `realtime.steps.ts` — add steps for `{model, language, streams}` request body and `{clientSecret}` / `{clientSecrets[]}` response assertions.
- `auth.steps.ts` — add steps for the `?email=` verification-status scenario; refit any sign-up/email scenarios to use the seed-tenant fixture.
- `api-keys.steps.ts` — NEW. UI driver if UI exists, else cloudCall-based contract driver.
  </action>
  <verify>
    <automated>! grep -E "deprecation.*true|@skip.*OpenAI realtime" tests/e2e/features/health.feature tests/e2e/features/realtime-token.feature</automated>
    <automated>grep -c "clientSecret" tests/e2e/features/realtime-token.feature | grep -v '^0$'</automated>
    <automated>grep -c "verification-status" tests/e2e/features/auth.feature | grep -v '^0$'</automated>
    <automated>test -f tests/e2e/features/api-keys.feature && grep -cE "v1/keys|success.*true" tests/e2e/features/api-keys.feature | grep -v '^0$'</automated>
    <automated>npx tsc --noEmit -p tests/e2e/tsconfig.json</automated>
  </verify>
  <done>health.feature asserts NO deprecation header; realtime-token.feature OpenAI scenario un-skipped and asserts clientSecret; auth.feature has the ?email= scenario; api-keys.feature exists with disposition documented.</done>
</task>

<task type="auto">
  <name>Task 5: Update CJM.md to reflect 23 sync + 3 v1/keys MATCH rows + post-closure status</name>
  <files>tests/e2e/CJM.md</files>
  <action>
Full rewrite of `tests/e2e/CJM.md`:

1. **Add the Sync Surface table** — 23 endpoints (Notes 7 + Folders 5 + Conversations 6 + Transcriptions 5) mapped one-to-one onto `notes-cjm.feature` / `folders-cjm.feature` / `conversations-cjm.feature` / `transcriptions-cjm.feature` scenarios from Task 3. Use the same row format as COMPATIBILITY-MATRIX.md Sync Surface section (endpoint → feature.scenario → status icon).

2. **Add API Keys table** — 3 endpoints (#57-59) mapped onto `api-keys.feature` scenarios from Task 4, with the disposition (renderer-driven or @server-contract-only) noted.

3. **Update existing Auth/Transcription/Reasoning/Realtime/Usage/Health tables**: replace every 🔒 @blocked-s5 status with ✅ PASS (R6 closed) or 💳 @requires-paid-keys (where applicable). Replace ⏭️ @skip for OpenAI realtime with ✅ PASS (R3 closed). Update the /api/health row to note "PASS — Deprecation header REMOVED per R4".

4. **Update Status legend**: drop 🔒 @blocked-s5 (no longer used); keep 💳 @requires-paid-keys and 🚫 OUT (for the Stripe + Referrals CLIENT-CUT rows). Add a "Server requirements closed" note at the top citing R1-R12 closure dates.

5. **Out-of-scope section**: keep Stripe + Referrals (CLIENT-CUT per CC-1, CC-2 in CLIENT-CUTS.md). Keep BYOK direct calls. Add a line referencing `.planning/phases/09-client-e2e-tests/CLIENT-CUTS.md`.

6. **Pending fixtures section**: keep the audio fixture entry only.

Per advisor "Phase 9 re-plan needed" §5: "Update tests/e2e/CJM.md to list the 23 sync endpoints under new MATCH rows."
  </action>
  <verify>
    <automated>grep -cE "/api/notes/(create|list|update|delete|search|batch-create|delete-all)" tests/e2e/CJM.md | tr -d '\n' | awk '{ exit ($1 < 7) }'</automated>
    <automated>grep -cE "/api/folders/(create|list|update|delete|batch-create)" tests/e2e/CJM.md | tr -d '\n' | awk '{ exit ($1 < 5) }'</automated>
    <automated>grep -cE "/api/conversations/(create|update|delete|list|search|messages)" tests/e2e/CJM.md | tr -d '\n' | awk '{ exit ($1 < 6) }'</automated>
    <automated>grep -cE "/api/transcriptions/(create|batch-create|list|delete|batch-delete)" tests/e2e/CJM.md | tr -d '\n' | awk '{ exit ($1 < 5) }'</automated>
    <automated>grep -cE "/api/v1/keys/(list|create|.*revoke)" tests/e2e/CJM.md | tr -d '\n' | awk '{ exit ($1 < 3) }'</automated>
    <automated>! grep -E "@blocked-s5|@blocked-r1" tests/e2e/CJM.md | grep -v "history\\|closure log\\|retired"</automated>
  </verify>
  <done>CJM.md contains all 7 Notes + 5 Folders + 6 Conversations + 5 Transcriptions + 3 v1/keys rows mapped to specific feature.scenario coverage; no active @blocked-s5 references; CLIENT-CUTS.md referenced in Out-of-scope.</done>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 6: Operator boots slim-core server with OPENWHISPR_TEST_ROUTES=true</name>
  <what-built>Tasks 1-5 produced a refit e2e harness pointing at /api/_test/seed-tenant and at the closed-R1-R12 server contract. Before Task 7 runs the suite, the operator must bring up the actual server with the right env vars set.</what-built>
  <how-to-verify>
1. In a separate terminal:
   ```
   cd /Users/nick/openwhispr-server
   # Ensure server .env contains BOTH:
   #   OPENWHISPR_TEST_ROUTES=true
   #   LITELLM_MASTER_KEY=<value>
   docker compose up -d
   docker compose ps      # all healthy
   ```
2. Smoke-check the seed endpoint:
   ```
   curl -sS -X POST http://localhost:4000/api/_test/seed-tenant \
     -H 'content-type: application/json' \
     -d '{"email":"smoke@test.local","password":"P-test-1!","name":"smoke","verified":true}' \
     | jq .
   ```
   Expected: 200 JSON with `token` and `user.emailVerified === true`.
3. Smoke-check /api/health:
   ```
   curl -sSI http://localhost:4000/api/health
   ```
   Expected: 200, NO `deprecation` header, NO `link` header.
4. Smoke-check /readyz:
   ```
   curl -sS http://localhost:4000/readyz | jq .
   ```
   Expected: 200, all subsystems `ok:true`.
  </how-to-verify>
  <resume-signal>Reply with "approved" once all four smoke checks pass, or paste the failing curl output if any check fails. If R1/R3/R4/R6 regression is observed, that's a server bug — file in `.planning/phases/09-client-e2e-tests/SERVER-REQUIREMENTS.md` (NEW file) and abort this plan; the server team must reopen the affected R-row before Phase 9 can proceed.</resume-signal>
</task>

<task type="auto">
  <name>Task 7: Run npm run test:e2e end-to-end, triage failures</name>
  <files>tests/e2e/KNOWN-FAILURES.md, .planning/phases/09-client-e2e-tests/SERVER-REQUIREMENTS.md</files>
  <action>
Execute the full e2e suite against the running server (from Task 6):

```
npm run test:e2e
```

Triage every failure per the rules in `tests/e2e/KNOWN-FAILURES.md` § Triage protocol:

1. Already-known operator gate (@requires-paid-keys with missing upstream keys) → no action, document in KNOWN-FAILURES if not already there.
2. NEW client bug — per `client_immutable` rule (memory `client_immutable`): two options ONLY: (a) server adapts → file in `.planning/phases/09-client-e2e-tests/SERVER-REQUIREMENTS.md` as a new R-row with severity + repro + suggested fix, OR (b) feature cut from client → file in `.planning/phases/09-client-e2e-tests/CLIENT-CUTS.md` as a new CC-row. NEVER patch the client to bridge a server gap (per memory `upstream_parity`). NEVER add mocks/header-spoofs/test-only branches to main.js/preload.js/src.
3. NEW server bug — file in `.planning/phases/09-client-e2e-tests/SERVER-REQUIREMENTS.md`. Use harsh language per memory `server_harsh_review` (server is <24h old, not in prod; deviations are bugs, not migrations).
4. Harness/flake — fix the test code in `tests/e2e/`, atomic commit. Do NOT mask a real failure as a harness flake.

After triage, update `tests/e2e/KNOWN-FAILURES.md` to list every remaining tagged-out scenario with its actual gate (operator or filed-finding). The audio-fixture pending row stays; everything else should be either resolved or filed.

**Stop condition (per advisor "Critical" #1 + plan goal):** `npm run test:e2e` exits 0 against the closed-R1-R12 server. If R-regression is found, the plan halts and a new R-row is filed; this task does NOT attempt server fixes from inside this repo (read-only boundary per memory `server_repo_boundary`).

Do NOT commit any client-side workarounds. Do NOT add mocks. If a real failure cannot be resolved by either (a) filing a server requirement or (b) fixing the test harness, halt and report to the user — do not paper over it.
  </action>
  <verify>
    <automated>npm run test:e2e 2>&1 | tee /tmp/e2e-final-run.log; grep -E "^[[:space:]]*[0-9]+ (passed|failed)" /tmp/e2e-final-run.log</automated>
    <automated>grep -cE "^[[:space:]]*0 failed|✓.*passed.*0 failed" /tmp/e2e-final-run.log || true</automated>
  </verify>
  <done>npm run test:e2e exits 0 with all unblocked scenarios PASSing; remaining tagged-out scenarios are documented in KNOWN-FAILURES with their actual gate (operator or filed server requirement); no client-side workarounds were committed; if R-regressions exist they are filed in `.planning/phases/09-client-e2e-tests/SERVER-REQUIREMENTS.md`.</done>
</task>

<task type="auto">
  <name>Task 8: Verification report + final SUMMARY</name>
  <files>.planning/phases/09-client-e2e-tests/VERIFICATION.md, .planning/phases/09-client-e2e-tests/09-01-SUMMARY.md</files>
  <action>
Overwrite `.planning/phases/09-client-e2e-tests/VERIFICATION.md` with the post-replan verification report. The old VERIFICATION.md from the first execute pass is stale (references S5/F2/F3, old @blocked-s5 nomenclature) — replace it entirely.

Required checks:

1. **Sync CJM coverage** — Every MATCH row in Phase 8 COMPATIBILITY-MATRIX.md (47 MATCH rows post-amendment) is exercised by ≥1 scenario. Provide row-by-row grep evidence: for each endpoint, `grep "<endpoint>" tests/e2e/CJM.md` returns a hit AND the cited feature.scenario exists.

2. **`npm run test:e2e` exits 0** against slim-core with OPENWHISPR_TEST_ROUTES=true. Report PASS/FAIL count + timestamp from Task 7.

3. **No client-side workarounds were introduced** — `git diff main -- main.js preload.js src/` shows zero changes (or only changes that are NOT test-only branches, header spoofs, mocks, or embedded credentials).

4. **CJM.md complete** — no TBD cells; 23 sync + 3 v1/keys rows present.

5. **KNOWN-FAILURES.md** — only operator-gated + fixture-pending rows remain; no @blocked-rN active.

6. **R1-R12 closure verified at runtime** — for each R, cite the test scenario that exercised it and its PASS status (or the new R-row filed if regression found).

Then write `.planning/phases/09-client-e2e-tests/09-01-SUMMARY.md` per the GSD summary template, summarizing what was changed, what files were touched, what server requirements were verified, and what (if any) new findings were filed.
  </action>
  <verify>
    <automated>test -f .planning/phases/09-client-e2e-tests/VERIFICATION.md && grep -cE "R1|R3|R4|R12" .planning/phases/09-client-e2e-tests/VERIFICATION.md | grep -v '^0$'</automated>
    <automated>test -f .planning/phases/09-client-e2e-tests/09-01-SUMMARY.md</automated>
    <automated>! grep -E "@blocked-s5|S5|F2/S1" .planning/phases/09-client-e2e-tests/VERIFICATION.md</automated>
  </verify>
  <done>VERIFICATION.md replaced with post-closure report citing R1-R12 by name; SUMMARY.md written; no stale S5/F2 nomenclature in either file.</done>
</task>

</tasks>

<verification>
Phase-level checks (run after Task 8):

1. `npm run test:e2e` exits 0 against the live slim-core server with OPENWHISPR_TEST_ROUTES=true + LITELLM_MASTER_KEY in server `.env`.
2. The four new CJM feature files (notes-cjm, folders-cjm, conversations-cjm, transcriptions-cjm) all drive `window.electronAPI.cloudApiRequest` and not raw `fetch(BACKEND_URL/api/...)`. Grep: `grep -rE 'fetch\([^)]*BACKEND_URL.*\/api\/(notes|folders|conversations|transcriptions)\/' tests/e2e/steps/` returns 0 hits.
3. seed.ts uses `/api/_test/seed-tenant`; no `sign-up/email` or email-verification logic remains in fixtures.
4. health.feature asserts NO Deprecation header; realtime-token.feature OpenAI scenario un-skipped and asserts `{clientSecret}`; auth.feature asserts ?email= acceptance.
5. CJM.md covers all 47 MATCH endpoints (4 auth + 3 transcription + 5 reasoning + 2 agent + 3 usage + 3 health + 3 token + 23 sync + 3 v1/keys + 3 oauth/realtime = 52 rows including the previously-OOS sync surface, minus 5 OOS rows = 47 MATCH). Allow ±2 for row-counting edge cases.
6. KNOWN-FAILURES.md has no active @blocked-rN rows; only operator-gated + fixture-pending.
7. Zero diff in `main.js`, `preload.js`, `src/**` from the start of this plan (upstream-parity preserved per `client_immutable`).
8. CLIENT-CUTS.md (CC-1 Stripe, CC-2 Referrals) is preserved and referenced from CJM.md.
</verification>

<success_criteria>
- Plan reflects the advisor session decisions: server-adapts (R1-R12 closed), CLIENT-CUTs (Stripe + Referrals), no client-side workarounds (memory `client_immutable`).
- All 23 sync + 3 v1/keys endpoints have e2e scenarios exercising the cloudApiRequest IPC wire path (the real client wire path), not raw HTTP.
- `npm run test:e2e` exits 0 against the closed server.
- VERIFICATION.md + SUMMARY.md document closure cleanly without stale S5/F2/F3 nomenclature.
- If new gaps surface, they are filed (server → SERVER-REQUIREMENTS.md, client-feature-drop → CLIENT-CUTS.md). Never patched in the client.
</success_criteria>

<output>
After Task 8, the artifacts produced by this plan are:
- `.planning/phases/09-client-e2e-tests/09-01-SUMMARY.md` (new)
- `.planning/phases/09-client-e2e-tests/VERIFICATION.md` (replaced)
- Updated harness in `tests/e2e/` (Tasks 1-5, 7)
- Possibly `.planning/phases/09-client-e2e-tests/SERVER-REQUIREMENTS.md` (NEW, only if Task 7 surfaces R-regressions)
</output>
