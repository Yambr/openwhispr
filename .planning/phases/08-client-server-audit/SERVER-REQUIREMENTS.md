# Server Requirements

Authoritative list of what `openwhispr-server` must change to conform
to `docs/BACKEND_SPEC.md` / `docs/OAUTH_SPEC.md` and serve the
upstream-parity Electron client without client-side adapters.

**Context:** The server was implemented by a separate session against
the spec the client team produced in Phase 1. It is **not yet in
production**, so breaking changes carry zero migration cost. The rule
on this side is **server adapts, client stays upstream-parity** — see
`/Users/nick/openwhispr/CLAUDE.md` § "Server Repo Boundary". No
back-compat aliases, no "configurable", no "deprecate-then-keep". Spec
is the spec.

The server team's job is to take this list and conform to it.
Counter-arguments belong in code review of the resulting PR, not in
softening this document.

---

## R1 — `/api/_test/seed-tenant` (NEW endpoint required)

**Status:** ⚠️ **RE-OPENED 2026-05-20 via R13.** Reported "closed
2026-05-19" by the server team, but the shipped endpoint returns
`401` on every request (handler mounted behind production auth
middleware). R1 is NOT closed until R13's verification curl returns
`200 {token, user}`. See [R13](#r13--apit_testseed-tenant-rejects-every-request-with-401--r1-regression--non-conformance).

**Discovered:** 2026-05-19, Phase 9 e2e first unblocked run.

**Violation:** Better Auth on the server rejects every non-browser
`fetch()` with `HTTP 403 {"message":"Missing or null Origin","code":"MISSING_OR_NULL_ORIGIN"}`,
AND `POST /api/auth/sign-up/email` returns `{token: null, user: ...}`
because email verification is pending. Combined, this makes
contract-level e2e testing of every authenticated endpoint impossible
without a Mailpit-scraping kludge — anti-pattern rejected per
`SERVER-REQUIREMENTS.md` filter.

**Required server behavior:** Implement a new test-only seed
endpoint. Spec:

```http
POST /api/_test/seed-tenant
Content-Type: application/json

{ "email": "e2e+<run_id>@test.local",
  "password": "<password>",
  "name": "<display name>",
  "verified": true }

→ 200
Content-Type: application/json
{ "token": "<raw bearer matching session.token from Better Auth>",
  "user": { "id": "<uuid>",
            "email": "<email>",
            "emailVerified": true,
            "createdAt": "<iso>" } }
```

**Gates (both required):**
1. `process.env.NODE_ENV !== "production"` — refuse in production
   builds, return 404
2. `process.env.OPENWHISPR_TEST_ROUTES === "true"` — explicit opt-in.
   Default-deny: if the env var is unset, return 404 regardless of
   NODE_ENV. Production builds and dev builds that don't opt in are
   both safe.

**Bypasses required inside the handler:**
- Skip the `trustedOrigins` / `MISSING_OR_NULL_ORIGIN` check entirely
- Skip email verification — write `emailVerified: true` straight into
  the user row
- Mint a bearer that downstream `Authorization: Bearer <token>`
  requests accept (same path Better Auth uses for verified-user
  signin)

**Reject:**
- "Just make `trustedOrigins: ['*']` in dev profile" — too broad, hides
  the policy from every dev workflow
- "Auto-verify emails in dev mode globally" — couples test seeding to
  email-verification policy, which has its own security surface
- "Make the client send the right Origin header" — client is
  upstream-parity, doesn't get modified for server policy
- Any per-test runtime config flag that has to be threaded through
  multiple service classes; this is one route, contained

**Severity:** BLOCKER — 22 of 28 Phase 9 e2e scenarios depend on a
seeded authenticated tenant.

---

## R2 — Stripe + Referrals routes: REMOVE from server contract entirely

**Discovered:** Phase 8 audit (S2, S3) + 2026-05-08 corporate-minimal
pivot.

**Violation:** `docs/BACKEND_SPEC.md` documents 7 routes that the
server does not implement:
- `POST /api/stripe/checkout`
- `POST /api/stripe/portal`
- `POST /api/stripe/switch-plan`
- `POST /api/stripe/preview-switch`
- `GET /api/referrals/stats`
- `POST /api/referrals/invite`
- `GET /api/referrals/invites`

The client UI for these is already hidden in corporate-minimal builds
(commit `c4d2ca5e`). The client never calls these routes in
production. The spec documents them only because Phase 1 reverse-
engineered them from the cloud predecessor.

**Required action:** Coordinated cut on BOTH sides.

- **Client side** (this repo): remove the 7 endpoint cards from
  `docs/BACKEND_SPEC.md`. Add a one-line note: "Stripe billing and
  referrals are out of scope for the corporate-minimal contract."
  Filed as a CLIENT-CUT task in this Phase 9 work order.
- **Server side** (`openwhispr-server`): confirm in
  `packages/contract-tests/` that no tests reference these paths.
  No new server work required if contract tests already don't cover
  them.

**Reject:**
- "Implement them on the server for completeness" — corporate-minimal
  pivot decided this is out of scope. Reverting the pivot is its own
  milestone, not a Phase 9 fix.
- "Leave them in BACKEND_SPEC and mark `(unimplemented)`" — spec lies
  to self-hosters who'd try to build a compatible server.

**Severity:** MEDIUM (docs lie; no runtime impact).

---

## R3 — `/api/openai-realtime-token` — conform to OpenAI Realtime naming

**Discovered:** Phase 8 audit (F2/S1).

**Violation:** `docs/BACKEND_SPEC.md` § `POST /api/openai-realtime-token`
specifies:
- Request body: `{ model: string, language: string, streams: 1|2 }`
- Response: `{ clientSecret: "<key>" }` for `streams===1`,
  `{ clientSecrets: ["<k1>","<k2>"] }` for `streams===2`

Server (`apps/api/src/routes/tokens/openai-realtime.ts:53` per Phase
8 SERVER-ROUTES.md row #38) accepts **empty body** and returns
`{ token: "<key>" }`. Both shape and behavior diverge from spec.

The naming `clientSecret` is the **OpenAI Realtime API standard**
([platform.openai.com/docs/api-reference/realtime-sessions](https://platform.openai.com/docs/api-reference/realtime-sessions));
`token` is a Yambr-server invention. Self-hosters reading
BACKEND_SPEC will build to the spec and break the client.

**Required server behavior:**

```http
POST /api/openai-realtime-token
Authorization: Bearer <session-token>
Content-Type: application/json

{ "model": "gpt-4o-realtime-preview-2024-12-17",
  "language": "en",
  "streams": 1 }

→ 200
{ "clientSecret": "<ephemeral-key>" }

# OR streams=2:
→ 200
{ "clientSecrets": ["<ephemeral-key-1>", "<ephemeral-key-2>"] }
```

- Accept all three request fields. Defaults if absent: `model` from
  server config, `language` = `"en"`, `streams` = `1`. Reject
  `streams ∉ {1, 2}` with `400`.
- Response field name MUST be `clientSecret` / `clientSecrets[]`. No
  `token` field. No dual-emission.

**Reject:**
- "Add `clientSecret` as a duplicate field next to `token` for
  back-compat" — server is < 24h old, nothing to be back-compat with
- "Make response shape configurable" — contract is the contract
- "Add a separate `/api/openai-realtime-client-secret` route" — keep
  the documented path, fix the shape

**Severity:** HIGH (breaks realtime feature at first use; the only
documented contract mismatch on a default-enabled endpoint).

---

## R4 — `/api/health` deprecation: REMOVE the deprecation, support both paths as first-class

**Discovered:** Phase 8 audit (F1/S4). Live-probed 2026-05-15.

**Violation:** Server's `apps/api/src/routes/probes.ts:121` (per
SERVER-ROUTES.md row #52) serves `/api/health` with
`deprecation: true` header and a `link: </livez>; rel="successor-version"`
pointing at `/livez`. This is **server-imposed deprecation against a
< 24h-old endpoint that has no migration-cost reason**.

The client uses `/api/health` per `docs/BACKEND_SPEC.md` § `GET /api/health`
(`src/helpers/ipcHandlers.js:3514`). Per `client_immutable` rule,
client doesn't migrate. The deprecation header is therefore noise.

**Required server behavior:**

- `GET /api/health` → 200 `{ "status": "ok", "migrations_completed": bool }`,
  **NO** `deprecation` header, **NO** `link` header pointing elsewhere
- `GET /livez` → 200 `{ "status": "ok" }`, kept for Kubernetes liveness
  probes per K8s naming convention
- Both endpoints are first-class. Neither is a "successor" of the
  other. They serve different audiences (`/api/health` for the
  Electron client per BACKEND_SPEC; `/livez` for kubelet).

**Reject:**
- "Keep deprecation header, document it as informational" — deprecation
  headers mean migrate. Mixed signals.
- "Delete `/api/health` entirely, force client to `/livez`" —
  client-immutable rule rejects this
- "Make `/api/health` an internal route that proxies `/livez`" —
  unnecessary indirection

**Severity:** LOW (alias works today; cosmetic cleanup).

---

## R5 — `GET /api/auth/verification-status?email=<x>`: server must accept the param

**Discovered:** Phase 8 audit (F3).

**Violation:** Client calls
`GET ${OPENWHISPR_API_URL}/api/auth/verification-status?email=<urlencoded>`
per BACKEND_SPEC.md § `GET /api/auth/verification-status`
(`src/components/EmailVerificationStep.tsx:31, 35`). Server
(`verification-status.ts:40` per SERVER-ROUTES.md) ignores the `email`
query param entirely and derives the user from session/Bearer.

Spec includes the param. Client sends it. Server silently drops it.
This is **server diverging from documented contract**, not "client
sending unused noise".

**Required server behavior:**

- Continue deriving user from session/Bearer (security correct — don't
  trust client-supplied email)
- Accept the `email` query param without warning, without error.
  Tolerate it as a documented contract field even if the value isn't
  authoritatively used.
- Optional: if the param's email doesn't match the session-derived
  email, return `400 {"error": "email_mismatch"}`. Decide based on
  whether the param has a security purpose; if not, just ignore it
  silently per current behavior.

**Reject:**
- "Tell the client to stop sending the param" — client-immutable rule
- "Update BACKEND_SPEC to drop the param" — client is the authority on
  BACKEND_SPEC; if Phase 1 documented `?email=`, the spec stays. Server
  conforms.

**Severity:** LOW (no current functional impact; cosmetic contract
adherence).

---

## R6 — Slim-core compose: bring up directly bootable (resolves Phase 8 S5)

**Discovered:** Phase 9 live probe 2026-05-15, marked closed 2026-05-19
(user reports server now boots clean — verify on next rebuild).

**Violation (historical):** `apps/api` and `apps/worker` set
`DATABASE_URL=postgres://...@pgbouncer:5432/...`, but slim-core base
`docker-compose.yml` (per its top-of-file SLIM-01 comment) explicitly
moved pgbouncer to overlay `compose/overlays/storage.yml`, which did
not exist. Result: `getaddrinfo ENOTFOUND pgbouncer`, every DB-backed
route returned 500.

**Required server behavior:** Plain `docker compose up -d` (no
`--profile`, no extra `-f`) MUST bring up a fully functional slim-core
stack where every endpoint listed in BACKEND_SPEC.md returns its
documented response. No overlays required for the basic dev workflow.

**Apparent status:** user reports this is now fixed. Verify on next
`docker compose ps` — postgres healthy, no pgbouncer ENOTFOUND in
`docker compose logs api`. Re-open this row if it regresses.

**Severity:** Was BLOCKER. Currently apparently closed.

---

## R7 — Apps/api Dockerfile build chain: byok-guard COPY (resolves Phase 8 S6)

**Discovered:** Phase 9 docker rebuild 2026-05-15, apparently closed
2026-05-19 by user.

**Violation (historical):** `apps/api/package.json` listed
`@openwhispr/byok-guard` as a workspace dep, and the package existed
at `packages/byok-guard/`, but neither `apps/api/Dockerfile` nor
`apps/worker/Dockerfile` had COPY directives for it. `docker compose
build` failed with `ERR_PNPM_WORKSPACE_PKG_NOT_FOUND`.

**Required server behavior:** Every workspace dependency declared in
`apps/{api,worker}/package.json` MUST have a corresponding
`COPY packages/<name>/package.json packages/<name>/` line in the
matching Dockerfile builder + prod-deps stages, AND a
`COPY packages/<name> packages/<name>` line in the builder source
block. This is the existing pattern (data, contract-tests,
litellm-client, observability, wire-schemas, email all follow it).

**Apparent status:** user reports fixed and rebuilt. Verify by running
`docker compose build` cleanly from scratch.

**Severity:** Was BLOCKER for any rebuild. Currently apparently closed.

---

## Sync surface conventions (R8–R12)

The Electron client wires a full CRUD surface for Notes, Folders,
Conversations, Transcriptions, and API keys. Phase 8 audit's first
pass missed this because it grepped for literal `fetch(`; the real
wire path goes through:

```
src/services/<Resource>Service.ts
  └─→ src/services/cloudApi.ts   (cloudGet/cloudPost/cloudPatch/cloudDelete)
        └─→ window.electronAPI.cloudApiRequest()  (preload bridge)
              └─→ ipcMain.handle("cloud-api-request")
                    src/helpers/ipcHandlers.js:6001
                      └─→ HTTPS to ${OPENWHISPR_API_URL}${path}
                          with Authorization: Bearer <session-token>
```

So every endpoint below is a **MATCH** target the server must
implement and contract-test, not a `MISSING(client)` row to be
discarded.

**Authentication for all sync endpoints:** `Authorization: Bearer
<session-token>` injected by the preload bridge from
`tokenStore`. The server-side handler runs under
`requireAuth` middleware (per Phase 8 SERVER-ROUTES.md), so 401 must
be returned for missing/invalid tokens.

**Status code convention** (uniform across all CRUD verbs unless
noted):
- `POST /<resource>/create` → 201 with the created entity
- `POST /<resource>/batch-create` → 201 with `{ created: [...] }`
- `GET /<resource>/list` → 200 with `{ <resources>: [...] }`
- `PATCH /<resource>/update` → 200 with the updated entity
- `DELETE /<resource>/delete` → 204 (no body) — body carries `{id}`
- `DELETE /<resource>/delete-all` → 200 with `{ deleted: <n> }`
- `POST /<resource>/search` → 200 with `{ <resources>: [...] }`

**Field naming convention:** camelCase in JSON payloads (matching
client TypeScript types). snake_case used only inside
batch-create response items per the existing
`{ client_note_id, id }` shape.

---

## R8 — Notes CRUD endpoints

**Client wire path:** `src/services/NotesService.ts`
(lines 50, 56, 63, 67, 80, 85, 98). Type
`CloudNote` from `src/types/CloudNote.ts` (verify path; cited type
imported in NotesService).

**Required endpoints** (all `Authorization: Bearer <token>` required):

| Method | Path | Request body | Response (success) | Notes |
|---|---|---|---|---|
| POST | `/api/notes/create` | `CloudNote` (id optional; server may assign) | `CloudNote` | Used at `NotesService.ts:50` |
| POST | `/api/notes/batch-create` | `{ notes: CloudNote[] }` | `{ created: { client_note_id: string; id: string }[] }` | snake_case `client_note_id` preserves client-assigned ids; `id` is server-assigned. Used at `NotesService.ts:56` |
| PATCH | `/api/notes/update` | `{ id: string, ...Partial<CloudNote> }` | `CloudNote` | Update sends id in body, not in URL path. Used at `NotesService.ts:63` |
| DELETE | `/api/notes/delete` | `{ id: string }` | empty body, 204 | Delete sends id in body, not URL. Used at `NotesService.ts:67` |
| GET | `/api/notes/list[?<query>]` | none | `{ notes: CloudNote[] }` | Query string is server-defined filter (currently free-form). Used at `NotesService.ts:80` |
| DELETE | `/api/notes/delete-all` | none | `{ deleted: number }` | Returns count. Used at `NotesService.ts:85` |
| POST | `/api/notes/search` | (server-defined search body) | `{ notes: SearchResult[] }` | `SearchResult` likely extends `CloudNote` with relevance score. Used at `NotesService.ts:98` |

**Tests required (TDD per server constitutional rule):**
- Happy path: create → list contains, update reflects, delete removes
- 401 on missing/invalid bearer
- 400 on missing required fields
- Tenant isolation: tenant A cannot see/modify tenant B's notes
- batch-create idempotency: re-submitting the same `client_note_id` does
  NOT create a duplicate
- delete-all only affects the calling tenant

**Severity:** HIGH (this is the core notes-app feature; broken means
the product doesn't work).

---

## R9 — Folders CRUD endpoints

**Client wire path:** `src/services/FoldersService.ts` (lines 22, 26, 30, 39).

| Method | Path | Request body | Response | File:Line |
|---|---|---|---|---|
| POST | `/api/folders/create` | `CloudFolder` | `CloudFolder` | `FoldersService.ts:22` |
| POST | `/api/folders/batch-create` | `{ folders: CloudFolder[] }` | `{ created: CloudFolder[] }` | `:26` |
| PATCH | `/api/folders/update` | `{ id, ...Partial<CloudFolder> }` | `CloudFolder` | `:30` |
| DELETE | `/api/folders/delete` | `{ id }` | 204 | (referenced indirectly) |
| GET | `/api/folders/list[?<query>]` | none | `{ folders: CloudFolder[] }` | `:39` |

**Tests required:** same battery as Notes. Plus referential integrity —
deleting a folder must either cascade-delete contained notes (server's
call) or reject with 409 if non-empty. Document the chosen semantic.

**Severity:** HIGH (paired with Notes).

---

## R10 — Conversations + Messages endpoints

**Client wire path:** `src/services/ConversationsService.ts` (lines 39, 46,
67, 78, 88, 95).

| Method | Path | Request body | Response | File:Line |
|---|---|---|---|---|
| POST | `/api/conversations/create` | `CloudConversation` (partial) | `CloudConversation` | `ConversationsService.ts:39` |
| PATCH | `/api/conversations/update` | `{ id, ...updates }` | `CloudConversation` | `:46` |
| GET | `/api/conversations/list` (or similar) | none | `{ conversations: CloudConversationWithMessages[] }` | `:67` |
| POST | `/api/conversations/messages` | `{ conversationId, content, role, ... }` | `CloudMessage` | `:78` (create message) |
| GET | `/api/conversations/messages?<params>` | none | `{ messages: CloudMessage[] }` | `:88` (list messages) |
| POST | `/api/conversations/search` | (search body) | `{ conversations: CloudConversation[] }` | `:95` |
| DELETE | `/api/conversations/delete` | `{ id }` | 204 | (referenced) |

**Tests required:**
- Standard CRUD battery
- Conversation deletion cascades messages (or rejects per server choice)
- Message ordering: list returns messages in creation order
- Tenant isolation across both conversations and their messages

**Severity:** HIGH (powers the AI chat surface).

---

## R11 — Transcriptions endpoints

**Client wire path:** `src/services/TranscriptionsService.ts` (lines 33, 39,
54, 64).

| Method | Path | Request body | Response | File:Line |
|---|---|---|---|---|
| POST | `/api/transcriptions/create` | `CloudTranscription` (partial) | `CloudTranscription` | `:33` |
| POST | `/api/transcriptions/batch-create` | `{ transcriptions: CloudTranscription[] }` | `{ created: CloudTranscription[] }` | `:39` |
| GET | `/api/transcriptions/list[?<query>]` | none | `{ transcriptions: CloudTranscription[] }` | `:54` |
| POST | `/api/transcriptions/batch-delete` | `{ ids: string[] }` | `{ deleted: string[] }` | `:64` |
| DELETE | `/api/transcriptions/delete` | `{ id }` | 204 | (referenced) |

**Note:** Distinct from `/api/transcribe` (audio→text inference, R-from-
LiteLLM). These store **transcription records** as user data — the
audio→text result, metadata, paid against the user's account. Two
different surfaces; do not conflate.

**Tests required:** standard CRUD battery + tenant isolation. Plus:
batch-delete is atomic (all-or-none) OR partial — document and test
the chosen semantic.

**Severity:** HIGH (transcribed notes are core data).

---

## R12 — API Keys v1 endpoints

**Client wire path:** `src/services/ApiKeysService.ts` (lines 28, 33, 42).

| Method | Path | Request body | Response | File:Line |
|---|---|---|---|---|
| GET | `/api/v1/keys/list` | none | `V1Response<{ keys: ApiKey[] }>` | `:28` |
| POST | `/api/v1/keys/create` | (server-defined input shape) | `V1Response<CreateApiKeyResponse>` | `:33` |
| POST | `/api/v1/keys/:id/revoke` | none | (any 2xx) | `:42` |

**Envelope convention:** `V1Response<T>` wraps every response:
```ts
{ success: boolean,
  data?: T,
  error?: string,
  code?: string }
```
This is the **only** sync endpoint family that uses the v1 envelope.
All other sync families (R8–R11) return entities directly. Server must
honor both conventions per family.

**Tests required:**
- Create → list contains, revoke removes
- 401 on missing bearer
- Plaintext key value is returned ONCE on create, never again
- Revoke is idempotent (revoking already-revoked key returns 2xx, not 409)

**Severity:** HIGH (BYOK / per-tenant API key flow depends on this).

---

## Verification protocol after server fixes land

For each row above, the protocol to verify the fix is:

1. **R1 seed-tenant** — `curl -X POST http://localhost:4000/api/_test/seed-tenant`
   with proper body returns `{token, user}`. Phase 9 e2e suite runs
   without `@blocked-r1` skips.
2. **R2 stripe/referrals** — `grep -E "stripe|referrals" docs/BACKEND_SPEC.md`
   returns no endpoint cards. Phase 8 matrix updated to reflect cut.
3. **R3 realtime-token** — Live `POST /api/openai-realtime-token` with
   `{model, language, streams: 1}` returns `{clientSecret}`. With
   `streams: 2`, returns `{clientSecrets: [s1, s2]}`. Phase 9 e2e
   scenario `realtime-token.feature` "OpenAI realtime token mint" passes
   (previously `@skip`).
4. **R4 health alias** — `curl -i http://localhost:4000/api/health`
   returns 200 with NO `deprecation` header. Phase 9 e2e scenario
   `health.feature` "GET /api/health" passes without the deprecation
   assertion.
5. **R5 verification-status param** — `curl '.../api/auth/verification-status?email=x@y'`
   returns 200 regardless of param. No 400 unless documented.
6. **R6 slim-core boot** — `docker compose up -d && docker compose ps`
   shows all healthy. `curl /readyz` returns 200 with no postgres
   ENOTFOUND.
7. **R7 byok-guard build** — `docker compose build` from clean state
   completes successfully.
8. **R8 Notes CRUD** — Phase 9 e2e `notes-sync.feature` (re-tagged
   without `@server-only`) passes against a tenant seeded via R1.
   Each verb returns documented shape + status code.
9. **R9 Folders CRUD** — same; new `folders-sync.feature` covers
   list, create, batch-create, update, delete + folder-delete
   semantic (cascade vs reject-non-empty).
10. **R10 Conversations** — new `conversations.feature` covers
    conversation CRUD + nested message create/list. Tenant isolation
    asserted.
11. **R11 Transcriptions** — new `transcriptions-sync.feature` covers
    transcription record CRUD (distinct from audio inference).
    Batch-delete semantic asserted.
12. **R12 API Keys v1** — new `api-keys.feature` covers list/create/
    revoke. Plaintext-once-only assertion. Revoke idempotency asserted.
13. **All sync endpoints (R8–R12) ship with vitest contract tests in
    `packages/contract-tests/`** per the server's TDD constitutional
    rule. The Phase 9 e2e suite is downstream verification, not a
    substitute for server-side contract coverage.

Phase 9 `KNOWN-FAILURES.md` and `tests/e2e/features/*.feature` get
updated as each row closes. No `@blocked-rN` tag is permanent.

---

## R13 — `/api/_test/seed-tenant` rejects every request with 401 — R1 regression / non-conformance

**Discovered:** 2026-05-20, Phase 9 e2e full run (Task 7).

**Severity:** BLOCKER — 46 of 52 Phase 9 e2e scenarios depend on a
seeded authenticated tenant. The suite is dead in the water until this
is fixed. This is R1 re-opened: R1 was reported "closed 2026-05-19" but
the shipped endpoint does not honor the R1 contract.

**Violation:** The endpoint is *registered* (the route exists — see
proof below) but the handler unconditionally returns
`HTTP 401 {"error":"unauthorized"}` for every request, regardless of
body, headers, or `Origin`. The R1 spec (this file, lines 33-69)
mandates the handler:

- returns `200 {token, user}` for a valid POST body,
- **"Skip the `trustedOrigins` / `MISSING_OR_NULL_ORIGIN` check
  entirely"**,
- **mints a bearer** for an as-yet-unauthenticated caller.

An endpoint whose sole purpose is to mint the *first* bearer for a
test tenant cannot itself require a bearer. Requiring auth to call the
auth-bootstrap endpoint is circular and makes the endpoint unusable —
which is exactly what the 401 indicates is happening.

**Proof the route is registered (gates pass, handler rejects):**

```
# Nonexistent test route — 404 (route not found)
$ curl -sS -X POST http://localhost:4000/api/_test/does-not-exist -i | head -1
HTTP/1.1 404 Not Found

# seed-tenant POST — 401 (route FOUND, handler rejects)
$ curl -sS -X POST http://localhost:4000/api/_test/seed-tenant \
    -H 'content-type: application/json' \
    -d '{"email":"smoke@test.local","password":"P-test-1!","name":"smoke","verified":true}' -i | head -1
HTTP/1.1 401 Unauthorized
{"error":"unauthorized"}

# seed-tenant GET — 404 (method not allowed → route is POST-only, as designed)
$ curl -sS -X GET http://localhost:4000/api/_test/seed-tenant -i | head -1
HTTP/1.1 404 Not Found
```

The 404→401→404 triplet proves: `OPENWHISPR_TEST_ROUTES=true` IS wired
(the route mounted), but the seed-tenant handler is gated behind the
**same auth middleware as production routes**. The R1 "bypasses
required inside the handler" list was not implemented — the handler is
sitting behind the Better Auth session middleware instead of in front
of it.

Adding `Origin: http://localhost:3000` does not change the result —
the rejection is `unauthorized` (missing session), not
`MISSING_OR_NULL_ORIGIN`. This is an *authentication* gate, not an
origin gate.

**Required server behavior:** Mount the `/api/_test/seed-tenant`
handler **before / outside** the Better Auth session-required
middleware, exactly as R1 specified. The handler itself performs the
gate checks (`NODE_ENV !== "production"` AND
`OPENWHISPR_TEST_ROUTES === "true"`) and then creates the user +
mints the bearer with no prior session. A valid POST must return
`200 {token, user: {id, email, emailVerified: true, createdAt}}`.

**Verification (must pass before R13 is closed):**

```
curl -sS -X POST http://localhost:4000/api/_test/seed-tenant \
  -H 'content-type: application/json' \
  -d '{"email":"r13@test.local","password":"P-test-1!","name":"r13","verified":true}'
# EXPECT: 200  {"token":"<bearer>","user":{"id":"...","email":"r13@test.local","emailVerified":true,"createdAt":"..."}}
# ACTUAL: 401  {"error":"unauthorized"}
```

Then `npm run test:e2e` from the client repo must exit 0 (currently
46 failed / 6 passed, all 46 failures = this one bug).

**Reject:**
- "The e2e harness should send a bearer to seed-tenant" — there is no
  bearer to send; seed-tenant is the thing that produces the first
  bearer. Circular.
- "Add a static test bearer to the client/harness env" — embedded
  credentials, anti-pattern (memory `client_immutable` / project
  CLAUDE.md § Secrets).
- "Harness seeds via `/api/auth/sign-up/email` instead" — that path
  returns `token: null` pending email verification; it is exactly the
  problem R1 was filed to solve. Regressing to it is not an option.

**Cross-reference:** This re-opens R1. R1's status in this document's
summary table should flip from "closed 2026-05-19" back to OPEN until
R13's verification curl returns 200.

---

## R13 verification protocol

14. **R13 seed-tenant auth bypass** — the verification curl above
    returns `200 {token, user}` (not 401). `npm run test:e2e` against
    slim-core with `OPENWHISPR_TEST_ROUTES=true` exits 0. Until then,
    Phase 9 cannot reach DONE — it is DONE-with-server-followups with
    R13 as the blocking follow-up.
