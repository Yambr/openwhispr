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

**Status:** ✅ **CLOSED 2026-05-20** (via R13). First reported "closed
2026-05-19", then re-opened when the shipped endpoint returned `401`
on every request (handler sat behind the production `dualAuthHook`).
Genuinely closed by server commit `8f30df26` — the route now declares
`config: { auth: false }` to opt out of the dual-auth hook, and R13's
verification curl returns `200 {token, user}`. See [R13](#r13--apit_testseed-tenant-rejects-every-request-with-401--r1-regression--non-conformance).

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

**Status:** ✅ **CLOSED 2026-05-20** — server commit `85a67858` (Phase 59 Track D, folded into R15). The `?email=` param is now OPTIONAL in the `VerificationStatusQuery` wire-schema: present or absent, the route succeeds (200) and identity is always session-derived. A present value is still RFC-5321-validated.

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

**Status:** ✅ **CLOSED 2026-05-20** — server commit `8f30df26`
(`fix(R13): seed-tenant reachable without a bearer — opt out of
dualAuthHook`). Root cause: the global `dualAuthHook` only skips a
route when `routeOptions.config.auth === false`; the shipped
seed-tenant route declared `config: { rateLimit: false }` with no
`auth: false`, so the production auth gate fired ahead of the handler.
Fix added `auth: false` to the route config (same as `reset-setup`).

Secondary blocker also fixed in the same commit: Phase 57 Track E
`validateIngressBoot` refuses a plaintext `http://` ingress origin
under `NODE_ENV=production`, which prevented the no-Traefik slim stack
from booting at all. `docker-compose.yml` `NODE_ENV` is now
`${NODE_ENV:-production}` (prod default unchanged) and the slim-test
`.env` opts down to `development`.

Verification triplet now returns the spec-required `404 → 200 → 404`:

```
POST /api/_test/does-not-exist → 404
POST /api/_test/seed-tenant    → 200 {"token":"...","user":{...,"emailVerified":true,...}}
GET  /api/_test/seed-tenant    → 404
```

Minted bearer confirmed usable: `Authorization: Bearer <token>` on
`/api/_test/health-authed` → 200; the same route without a bearer
still → 401 (auth not globally disabled).

---

## R13 verification protocol

14. **R13 seed-tenant auth bypass** — the verification curl above
    returns `200 {token, user}` (not 401). `npm run test:e2e` against
    slim-core with `OPENWHISPR_TEST_ROUTES=true` exits 0. Until then,
    Phase 9 cannot reach DONE — it is DONE-with-server-followups with
    R13 as the blocking follow-up.

---

## R14 — `/api/_test/seed-tenant` 500s on a duplicate-email POST instead of 409/idempotent

**Status:** ✅ **CLOSED 2026-05-20** — server commits `c96ed3e9` + `d391961e` (Phase 59 Track A). seed-tenant is now idempotent on a duplicate email: a re-POST returns `200 {token,user}` for the existing user, never 500.

**Discovered:** 2026-05-20, Phase 9 e2e third full run triage (Task 7).

**Severity:** MEDIUM. The Phase 9 e2e harness has been fixed to never
re-send a duplicate email (every `makeTenant()` call now yields a
globally unique address), so this no longer blocks the suite. But the
server still violates its own error contract for a constraint
violation, and any future caller that re-submits an email — including
the server team's own contract tests — will hit an opaque 500.

**Violation:** A second `POST /api/_test/seed-tenant` with an
already-seeded email returns:

```
HTTP/1.1 500 Internal Server Error
{"error":"Internal server error"}
```

Reproduction (clean, against the slim-test stack):

```
$ DUPE="r14-dupe-$(date +%s)@test.local"
$ curl -sS -X POST http://localhost:4000/api/_test/seed-tenant \
    -H 'content-type: application/json' \
    -d '{"email":"'$DUPE'","password":"P-test-1!","name":"t","verified":true}' -w ' (%{http_code})'
{"token":"...","user":{...,"emailVerified":true,...}} (200)

$ curl -sS -X POST http://localhost:4000/api/_test/seed-tenant \
    -H 'content-type: application/json' \
    -d '{"email":"'$DUPE'","password":"P-test-1!","name":"t","verified":true}' -w ' (%{http_code})'
{"error":"Internal server error"} (500)
```

A bare `500 {"error":"Internal server error"}` on a unique-constraint
violation is wrong on two counts:

1. **Wrong status.** A duplicate email is a *client* error, not a
   server fault. It must be `409 Conflict` with a structured body
   (`{"error":"...","code":"email_already_seeded"}` or equivalent) —
   OR the endpoint must be genuinely idempotent (re-mint and return
   `200 {token, user}` for the existing tenant). The R1 spec comment
   in this very file (and the now-corrected harness docstring)
   originally *claimed* the endpoint "is idempotent on email" — that
   claim was false. Pick one of the two correct behaviors and make it
   true.
2. **Opaque body.** A 500 with `Internal server error` masks the
   cause. The handler is clearly catching a Postgres unique-violation
   and rethrowing it as a generic 500 rather than mapping it. Map the
   `users_email_unique` (or equivalent) violation explicitly.

**Required server behavior:** EITHER

- **(a) idempotent** — on a duplicate email, look up the existing
  user, re-mint a fresh bearer, return `200 {token, user}` with the
  existing user's `id`. This is the simplest fix and matches what the
  R1 docstring promised; OR
- **(b) clean 409** — return `409 {"error":"email already seeded",
  "code":"email_already_seeded"}`.

Either is acceptable. A `500` is not.

**Reject:**
- "The harness should just use unique emails" — the harness *has* been
  fixed to do exactly that, but that does not excuse the server
  returning a 500 for a constraint violation. R14 stands as a server
  contract bug independent of the harness fix.
- "Catch-all 500 is fine for a test-only route" — test routes are
  still routes; an opaque 500 on a foreseeable, well-defined input
  (re-seed) wastes every future debugger's time.

**Verification (must pass before R14 is closed):**

```
# Seed once → 200, seed the SAME email again →
#   EITHER 200 {token, user}  (idempotent)
#   OR     409 {error, code}  (clean conflict)
# NEVER 500.
```

---

## R15 — `/api/auth/verification-status` and `/api/auth/delete-account` reject every valid auth form with 401

**Status:** ✅ **CLOSED 2026-05-20** — server commit `85a67858` (Phase 59 Track D). Facet 1 fixed: `verification-status` `?email=` is now OPTIONAL (200 when absent, not 400) — this also closes the re-opened **R5**. Facets 2+3 ("401 a valid session") did NOT reproduce on a live re-probe: a genuine Better Auth session **cookie** resolves correctly (200) on both `verification-status` and `delete-account`. The relayed 401 was the seed-tenant **Bearer** token hitting the cookie-only routes — correct-by-design per BACKEND_SPEC (cookie-only, no Bearer). No resolver bug; no server change needed for 2+3.

**Discovered:** 2026-05-20, Phase 9 e2e third full run triage (Task 7).
Re-opens **R5** (which was marked "closed 2026-05-19").

**Severity:** HIGH. `/api/auth/delete-account` is a documented,
default-enabled client route (account deletion is a real user
journey). `/api/auth/verification-status` is on the email-verification
path (`src/components/EmailVerificationStep.tsx`). Both are unusable.

**Violation — three distinct facets, all reproduced with clean curls
against the slim-test stack:**

**(1) `verification-status` now *requires* `?email=` — the exact
inverse of R5.** R5 was filed to make the server *tolerate* the
`?email=` param. The shipped behavior went the other way: the param
is now *mandatory* and its absence is a 400:

```
$ curl -sS '.../api/auth/verification-status' -H "Authorization: Bearer <seed-token>"
{"error":"querystring/email Invalid input: expected string, received undefined"} (400)
```

R5's required behavior (this file, lines 241-251) is explicit:
"Continue deriving user from session/Bearer … Accept the `email` query
param **without warning, without error**." A hard 400 when the param
is absent is a direct R5 non-conformance.

**(2) `verification-status` returns 401 for EVERY auth form, including
a genuine fresh Better Auth session.** With `?email=` supplied, the
endpoint rejects:

```
# seed-tenant bearer
$ curl -sS '.../api/auth/verification-status?email=<x>' -H "Authorization: Bearer <seed-token>"
{"error":"Session expired"} (401)

# genuine /api/auth/sign-in/email set-auth-token, used as Bearer
$ curl -sS '.../api/auth/verification-status?email=<x>' -H "Authorization: Bearer <set-auth-token>"
{"error":"unauthorized"} (401)

# genuine fresh Better Auth session COOKIE from the same sign-in
$ curl -sS '.../api/auth/verification-status?email=<x>' -H "Cookie: __Secure-openwhispr.session_token=<...>"
{"error":"unauthorized"} (401)
```

A route that 401s a *just-minted, valid* session cookie is broken
auth wiring, not a credential problem.

**(3) `/api/auth/delete-account` rejects the same three auth forms
identically.** A fresh sign-in cookie AND the fresh `set-auth-token`
bearer both yield `401 {"error":"unauthorized"}`:

```
$ curl -sS -X DELETE '.../api/auth/delete-account' -H "Cookie: <fresh-session-cookie>"
{"error":"unauthorized"} (401)
$ curl -sS -X DELETE '.../api/auth/delete-account' -H "Authorization: Bearer <fresh-set-auth-token>"
{"error":"unauthorized"} (401)
```

Note: the *same* fresh seed bearer works fine on the custom
Bearer-middleware routes — `/api/usage`, `/api/notes/list`,
`/api/v1/keys/list` all return 200. So the credential is valid; it is
specifically the **Better-Auth-mounted routes** (`/api/auth/*` beyond
`sign-in`/`sign-out`/`check-user`) whose auth resolution is broken.

**Root-cause hypothesis (for the server team to confirm):** the
`/api/auth/verification-status` and `/api/auth/delete-account`
handlers resolve the session through a code path that does not share
the Better Auth cookie/Bearer resolver used by `sign-in`/`sign-out`.
Either they sit behind a stale custom auth hook, or they call
`auth.api.getSession()` with a request object that has lost its
cookies/headers. `sign-in` and `sign-out` work; these two do not —
the divergence is server-internal.

**Required server behavior:**

- `GET /api/auth/verification-status` — derive identity from
  session/Bearer using the SAME resolver `sign-in`/`sign-out` use.
  Accept `?email=` as an OPTIONAL param (R5 contract). Return
  `200 {emailVerified, ...}` for a valid session. Do NOT 400 on a
  missing `?email=`.
- `DELETE /api/auth/delete-account` — accept a valid Better Auth
  session cookie OR bearer, return `200` on success. Currently 401s
  unconditionally.
- The seed-tenant bearer (R1/R13) must be honored by Better Auth
  session routes too, not only by the custom Bearer middleware — OR
  the server team must state explicitly that seed-tenant tokens are
  Bearer-middleware-only, in which case R1 needs amending and the
  e2e harness will drive `/api/auth/*` scenarios via a real sign-in
  instead. As shipped, neither path works (a real sign-in cookie also
  401s), so this is a server bug regardless.

**Reject:**
- "The harness should send the right credential" — the harness was
  probed with the seed bearer, a genuine `set-auth-token`, and a
  genuine fresh session cookie. All three 401. There is no "right
  credential" the harness is failing to send.
- "verification-status requiring `?email=` is fine" — it directly
  contradicts R5, which the client team filed and the server team
  marked closed. Closing a requirement by implementing its inverse is
  not closure.
- "delete-account is low priority" — it is a documented client route
  on a real user journey (account deletion). HIGH.

**Verification (must pass before R15 is closed):**

```
# 1. verification-status without ?email= → 200 (NOT 400), session-derived
# 2. verification-status?email=<x> with a valid session → 200
# 3. delete-account with a valid session → 200
# Phase 9 e2e: auth.feature "Verification status accepts ?email=" and
# "Delete account returns 200" both pass (currently tagged @blocked-r15).
```

**Cross-reference:** Re-opens R5. R5's status flips from "closed
2026-05-19" back to OPEN, folded into R15.

---

## R16 — `/readyz` LiteLLM subsystem self-blocked by the server's own SSRF allowlist

**Status:** ✅ **CLOSED 2026-05-20** — server commits `f512dea5` + `d416f231` (Phase 59 Track B). Facet 1: the internal `litellm` compose host is added to the SSRF outbound allowlist (the purpose-built `OUTBOUND_PRIVATE_HOST_ALLOWLIST` mechanism — `.env.full.example` already carried it; the slim `.env` was incomplete). `/readyz` now returns `200` with `litellm.ok:true`; an intentionally-absent litellm is honestly reported `skipped` and excluded from the aggregate. Facet 2: `POST /api/transcribe` rejects a zero-byte file part with `400 EMPTY_AUDIO` before any upstream call (streaming-safe — only one chunk is peeked, O(1) memory preserved).

**Discovered:** 2026-05-20, Phase 9 e2e third full run triage (Task 7).

**Severity:** MEDIUM. Does not block the core Phase 9 e2e suite (the
harness now asserts the postgres subsystem ok flag directly rather than
the aggregate `/readyz` 200, and all LLM-feature scenarios are
`@requires-paid-keys` and excluded by default). But it keeps the
aggregate readiness probe permanently red, and if it reflects a real
outbound-policy misconfiguration it would also break every LLM route at
runtime.

**Violation:** `GET /readyz` returns `503` because the LiteLLM
subsystem check fails:

```
$ curl -sS http://localhost:4000/readyz
{"postgres":{"ok":true,"latency_ms":3},
 "valkey":{"ok":true,"latency_ms":3},
 "litellm":{"ok":false,"latency_ms":2,
            "error":"Outbound blocked by SSRF policy (host_not_allowed; host=litellm)"}}
(503)
```

postgres and valkey are healthy. The LiteLLM check fails because the
server's own SSRF / outbound allowlist rejects the hostname `litellm`
— i.e. the server is blocking a request to its own internal compose
service. An SSRF allowlist that blocks the app's own first-party
internal dependency is misconfigured: internal service hostnames
(`litellm`, `postgres`, `valkey`, …) must be on the allowlist, or the
readiness check must use a connection path that is not subject to the
user-facing SSRF policy.

**Required server behavior:** EITHER

- add the internal LiteLLM service host to the SSRF outbound
  allowlist (internal compose service names are first-party, not
  user-supplied URLs — they are not an SSRF surface); OR
- have the `/readyz` LiteLLM probe bypass the SSRF policy entirely
  (it is a server-controlled internal health ping, not a
  user-directed fetch).

**If instead the slim-test stack legitimately does not run LiteLLM**,
the LiteLLM subsystem should be reported as `skipped`/`not_configured`
rather than `ok:false` with an SSRF error — and must not drag the
aggregate probe to 503. A subsystem that is intentionally absent is
not a readiness failure.

**Reject:**
- "503 on a degraded subsystem is correct probe behavior" — true in
  general, but the *cause* here is the server blocking itself, which
  is a config bug, not a genuine dependency outage.

**Verification:** `GET /readyz` returns `200` with `litellm.ok:true`
(allowlist fixed) OR `litellm` reported as `skipped` and excluded from
the aggregate. The Phase 9 `health.feature` "/readyz" scenario already
tolerates 200-or-503 and asserts postgres ok, so it passes either way;
R16 is about getting the aggregate probe honest.

**Second facet — `POST /api/transcribe` returns `502 {"error":"Upstream
blocked by SSRF policy"}` for an EMPTY file instead of `400`.** The
same SSRF allowlist self-block surfaces on the transcription path:

```
$ printf "" > /tmp/empty.wav
$ curl -sS -X POST http://localhost:4000/api/transcribe \
    -H "Authorization: Bearer <seed-token>" \
    -F "file=@/tmp/empty.wav;type=audio/wav" -w ' (%{http_code})'
{"error":"Upstream blocked by SSRF policy"} (502)
```

Two distinct server defects on this one request:

1. **No empty-file input validation.** A zero-byte upload must be
   rejected with `400` *before* any upstream call. The server instead
   forwards it to the STT upstream. (Phase 9 `transcription.feature`
   "Empty file returns 400" asserts the documented `400`.)
2. **SSRF policy blocks the internal STT upstream** — same allowlist
   misconfiguration as the `/readyz` LiteLLM facet above. The internal
   LiteLLM / STT service host is first-party and must be allowlisted
   (or the proxy path must bypass the user-facing SSRF policy).

The empty-file scenario is therefore tagged `@blocked-r16` in the
Phase 9 suite until BOTH facets are fixed: empty input → `400`, and a
non-empty input reaches the upstream without an SSRF self-block.

---

## R17 — `POST /api/v1/keys/create` enforces API-key name uniqueness GLOBALLY instead of per-tenant

**Status:** ✅ **CLOSED 2026-05-20** — server commit `3a7098af` (Phase 59 Track E). Scope determination: the `/api/v1/keys` list + revoke handlers both scope by `user_id`, so API keys are USER-owned. Migration `0028_api_keys_name_scope` re-scopes the active-name partial unique index from `(tenant_id, name)` (functionally global in v1's single-default-tenant RLS posture) to `(user_id, name) WHERE revoked_at IS NULL`. Two distinct owners can each hold a key with the same name; the same owner reusing an active name still gets `409 API_KEY_NAME_TAKEN`.

**Discovered:** 2026-05-20, Phase 9 e2e third full run triage (Task 7).

**Severity:** HIGH — this is a **tenant-isolation defect**. One
tenant's choice of API-key names constrains every other tenant's
namespace, and it leaks the existence of other tenants' key names
(tenant B learns "a key named X exists somewhere" from the 409).

**Violation:** Two *distinct* seeded tenants cannot both create an API
key with the same `name`. The second tenant gets a 409:

```
# tenant A creates a key named "dupname" → 200
$ curl -sS -X POST .../api/v1/keys/create -H "Authorization: Bearer <tenantA>" \
    -d '{"name":"dupname","scopes":["read"]}'
{"success":true,"data":{"id":"...","name":"dupname","key":"pak_..."}}

# tenant B — a completely separate seeded tenant — creates a key with
# the SAME name → 409
$ curl -sS -X POST .../api/v1/keys/create -H "Authorization: Bearer <tenantB>" \
    -d '{"name":"dupname","scopes":["read"]}'
{"success":false,"error":"An API key with that name already exists","code":"API_KEY_NAME_TAKEN"}
```

The uniqueness constraint on the API-keys table is on `name` alone
rather than on `(tenant_id, name)` (or `(user_id, name)`). API-key
names are per-tenant labels; they must be scoped to the owning tenant.

**Required server behavior:** The uniqueness constraint MUST be
composite — `(tenant_id, name)` / `(user_id, name)`. Two different
tenants creating keys with the same human-readable name is normal and
must succeed. `API_KEY_NAME_TAKEN` should only fire when the *same*
tenant reuses a name.

This requires a migration to drop the global unique index on `name`
and add the composite one. Since the server is < 24h old and not in
production, there is no data-migration cost.

**Reject:**
- "The e2e harness should use unique key names" — the harness *has*
  been updated to suffix names with a unique token so the suite is
  green, but that does not excuse the server constraint being wrong.
  A real BYOK user on tenant B will hit `API_KEY_NAME_TAKEN` for a
  name they have never used. R17 stands.
- "Global key-name uniqueness is a feature" — it is not; it is a
  cross-tenant information leak and a usability bug.

**Verification (must pass before R17 is closed):** two distinct
tenants each create an API key with the identical `name` — both
return `200`. The same tenant reusing a name still returns `409`.

---

## R18 — `POST /api/auth/sign-in/email` rejects every non-browser caller with `403 MISSING_OR_NULL_ORIGIN`

**Status:** ✅ **CLOSED 2026-05-20** — server commits `22d29d7c` + `cd4c4f9e` (Phase 59 Track C). A verify-first Node-`fetch` re-probe with valid seeded credentials REPRODUCED the `403 MISSING_OR_NULL_ORIGIN` (re-probe log committed at `.planning/phases/59-client-e2e-server-followups/r18-reprobe.log` in the server repo). Better Auth throws this before `trustedOrigins` is consulted, so a predicate cannot rescue it. Fix: `validateOriginBoot()` + `advanced.disableOriginCheck`, double-gated on `OPENWHISPR_TEST_ROUTES==="true"` AND non-production — production CSRF posture unchanged. Live-verified: Node-`fetch` `sign-in/email` with valid seeded creds now returns `200`.

**Discovered:** 2026-05-20, Phase 9 e2e third full run triage (Task 7).
This is the **original GA-1 problem** (Better Auth Origin rejection)
resurfacing on the `sign-in` route specifically — R1's seed-tenant
endpoint bypassed it, but plain `/api/auth/sign-in/email` was never
covered.

**Severity:** MEDIUM. Does not block the core suite (seed-tenant
already proves authenticated access; the sign-in scenario is
additional coverage), but it means the documented `sign-in` route is
untestable from any non-browser client and the scenario is tagged
`@blocked-r18`.

**Violation:** `POST /api/auth/sign-in/email` with valid credentials
for a verified user returns:

```
HTTP/1.1 403 Forbidden
{"message":"Missing or null Origin","code":"MISSING_OR_NULL_ORIGIN"}
```

whenever the request carries no `Origin` header or `Origin: null`.

Critically, the e2e harness uses Node's built-in `fetch` (undici).
**undici sends `Origin: null` on a non-browser request** — it does not
omit the header, it sends the literal `null`. Better Auth's
trustedOrigins check treats `null` as a rejected origin → 403.

Reproduction (Node, exactly as the harness runs):

```js
const r = await fetch("http://localhost:4000/api/auth/sign-in/email", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email, password }),
});
// → 403  {"message":"Missing or null Origin","code":"MISSING_OR_NULL_ORIGIN"}
```

A raw `curl` (which sends NO Origin header at all, not `null`) gets
`200` — so the rejection is specifically triggered by `Origin: null`.

**Why the harness cannot work around this:** per Phase 9 CONTEXT
operating rule 3 ("No client-side workarounds. No header spoofing in
e2e") and memory `client_immutable`, the harness is forbidden from
spoofing an `Origin` header. The real Electron client sets a correct
Origin via `webRequest` in `main.js` — but the harness drives raw
`fetch`, and replicating the browser Origin would be a spoof.

**Required server behavior:** When `OPENWHISPR_TEST_ROUTES === "true"`
AND `NODE_ENV !== "production"` (the same double-gate as R1's
seed-tenant), Better Auth's trustedOrigins must accept a missing /
`null` Origin on `/api/auth/sign-in/email`. This is the SAME bypass
already implemented for `/api/_test/seed-tenant`; it just needs to
extend to the credential sign-in route under the test gate.

Equivalently: the server may expose the sign-in path through the same
test-route family with the Origin bypass. The constraint is that a
seeded test tenant must be able to complete a real `sign-in/email`
round trip from a non-browser test client without a header spoof.

**Reject:**
- "Make the harness send `Origin: http://localhost`" — header spoof,
  forbidden by CONTEXT rule 3.
- "Set `trustedOrigins: ['*']` globally" — too broad; R1 already
  rejected this. Gate it on `OPENWHISPR_TEST_ROUTES` like seed-tenant.
- "Drop the sign-in scenario" — sign-in is a documented route on a
  real user journey; it deserves coverage. The fix belongs server-side.

**Verification (must pass before R18 is closed):** with
`OPENWHISPR_TEST_ROUTES=true`, a Node-`fetch` `POST
/api/auth/sign-in/email` with valid seeded credentials returns `200`
with a session token. The Phase 9 `auth.feature` "Sign-in with
verified user" scenario (currently `@blocked-r18`) passes.

---

## R14 / R15 / R16 / R17 / R18 verification protocol

15. **R14 seed-tenant duplicate** — re-POSTing a seeded email returns
    200 (idempotent) or 409 (clean conflict), never 500.
16. **R15 better-auth routes** — `verification-status` (with and
    without `?email=`) and `delete-account` return 2xx for a valid
    session. The two `@blocked-r15`-tagged auth.feature scenarios pass
    once this lands.
17. **R16 readyz litellm** — `/readyz` returns 200 with `litellm.ok`
    true, or reports litellm as `skipped` and not counted against the
    aggregate. Second facet: `POST /api/transcribe` with an empty file
    returns `400` (input validation), and a non-empty upload reaches
    the STT upstream without a `502` SSRF self-block.
18. **R17 api-key name scope** — two distinct tenants can each create
    an API key with the same `name` (both 200); a single tenant
    reusing a name still 409s.
19. **R18 sign-in Origin** — with `OPENWHISPR_TEST_ROUTES=true`, a
    Node-`fetch` `POST /api/auth/sign-in/email` with valid seeded
    credentials returns `200` (not `403 MISSING_OR_NULL_ORIGIN`).

---

## R19 — slim-core worker cannot deliver verification email: SMTP target `192.168.96.2:587` is unreachable; real sign-up → sign-in is impossible

**Status:** ✅ **CLOSED 2026-05-20** — server commit `988171b6`
(`fix(61): ship mailpit in slim-core base so sign-up email delivers`).
Recommended option (a) applied: `mailpit` is now a first-class service
in the base `docker-compose.yml` (no overlay required), and
`SMTP_PORT=1025` is pinned on the base api + worker services so they
reach it on its real port. The redundant `mailpit` + `SMTP_PORT`
entries were removed from `compose/docker-compose.dev-tools.yml`.

Verified end-to-end on a plain `docker compose up -d` (no overlays):
real `POST /api/auth/sign-up/email` → worker logs `email.sent` (zero
`ECONNREFUSED`) → verification email delivered to the bundled Mailpit
(`http://127.0.0.1:8025`) → `verify-email` 302 → `POST
/api/auth/sign-in/email` returns `200` with a session and
`emailVerified:true`. The real first-run user journey now completes.

**R19 follow-up facet — RE-OPENED 2026-05-21 (verification link host).**
The delivered email's verification link points at
`http://api.localhost/api/auth/verify-email?token=…` — the internal
Traefik hostname. `docker-compose.yml` defaults `OPENWHISPR_API_URL` /
`AUTH_URL` / `INGRESS_BASE_URL` to `https://api.localhost` (lines
248-257), and the email-link builder uses that base URL. `api.localhost`
does not resolve outside the Docker network, so a developer (or a real
self-hoster on a non-Traefik slim deploy) clicking the link from a
normal mail client gets a dead link — the link only works from inside
the compose network. The R19 manual verification only completed
because the probe rewrote the host to the published `localhost:4000`.

Required: on the slim-core profile, the verification-email base URL
must be a host reachable from where the user reads their mail. Either
default `INGRESS_BASE_URL` (or the dedicated email-link base) to the
published `http://localhost:4000` on the no-Traefik slim profile, or
document that slim-core operators must set it. The link in the email
must be clickable from a normal browser without manual rewriting.
Severity: LOW for slim-core dev (workaround = rewrite host), but it
WILL break a real self-hoster who doesn't front the stack with Traefik.

**Discovered:** 2026-05-20, live manual probe of the cloud sign-up
journey against the slim-core stack (not an e2e harness run — a real
`POST /api/auth/sign-up/email` followed by `POST /api/auth/sign-in/email`).

**Severity:** HIGH. This is not a test-harness concern — it breaks the
**real first-run user journey**. A genuine new user cannot create an
account and sign in to the cloud:

1. `POST /api/auth/sign-up/email` → `200 {token: null, user: {...,
   emailVerified: false}}` — Better Auth defers the session pending
   email verification (correct).
2. `POST /api/auth/sign-in/email` → `403 {"code":"EMAIL_NOT_VERIFIED"}`
   — correct *given* an unverified user.
3. The verification email that step 1 is supposed to send **never
   arrives**, so the user is permanently stuck at step 2. The slim-core
   `OPENWHISPR_TEST_ROUTES` seed endpoint (R1/R13) bypasses this by
   minting a pre-verified user — but that is a test-only route. A real
   user has no path through.

**Root cause (from `docker compose logs worker`):** the worker's email
job fails on every attempt with:

```
{"level":50,"service":"worker","event":"email.failed",
 "to":"livetest-...@test.local",
 "subject":"Verify your OpenWhispr email address",
 "err":{"code":"ESOCKET","syscall":"connect","errno":-111,
        "address":"192.168.96.2","port":587,
        "message":"connect ECONNREFUSED 192.168.96.2:587"},
 "msg":"email send failed"}
```

The worker is configured to send SMTP to `192.168.96.2:587`. Two
distinct problems:

1. **No SMTP host on `:587` exists in the slim-core network.** The job
   `ECONNREFUSED`s on every retry. Whatever `192.168.96.2` was, it is
   not listening on 587 in the running stack.
2. **Mailpit is not a service in the slim-core `docker-compose.yml`.**
   `docker compose ps mailpit` → `no such service`, even though a
   Mailpit container is running (`Up 42 hours`) — it belongs to a
   different compose project / overlay. Mailpit's SMTP listener is on
   **1025**, not 587. So even if the worker pointed at Mailpit's IP,
   the port would be wrong, and Mailpit is not part of the stack the
   slim-core base compose brings up.

**Required server behavior:** the slim-core stack (`docker compose
up -d`, no overlays — same bar as R6) MUST deliver verification email
end-to-end so a real sign-up → verify → sign-in journey completes.
Either:

- **(a)** include a dev mail catcher (Mailpit) as a first-class service
  in the slim-core `docker-compose.yml`, and point the worker's SMTP
  config at it by compose service name on its real port (Mailpit SMTP
  = `1025`, not 587). A developer then reads the verification link from
  the Mailpit UI; OR
- **(b)** under the existing `OPENWHISPR_TEST_ROUTES` / non-production
  gate, expose the verification token through a test-only route (e.g.
  `GET /api/_test/verification-token?email=`) so the sign-up → verify
  → sign-in journey can be driven without SMTP at all; OR
- **(c)** make the slim-core profile auto-verify on sign-up when
  `OPENWHISPR_TEST_ROUTES === "true"` AND `NODE_ENV !== "production"`
  — but this couples sign-up to the test gate and is the least clean
  of the three.

(a) is the most faithful to a real deployment and is the recommended
fix. The constraint is that a plain slim-core bring-up must not leave
the worker `ECONNREFUSED`-looping on a dead SMTP host.

**Reject:**
- "Tell users to use the seed endpoint" — seed-tenant is a test-only
  route; it is not a real user journey and is not exposed in
  production. The sign-up path is the documented client journey
  (`src/components/EmailVerificationStep.tsx` exists precisely because
  the client expects an email-verification step).
- "Point the worker at the host's mail relay" — there is no relay; the
  slim-core stack must be self-contained per R6.
- "It's fine, the e2e suite is green" — the e2e suite seeds
  pre-verified tenants and never exercises SMTP. R19 is exactly the
  gap that proves green contract tests are not a substitute for a real
  first-run journey check.
- Any client-side change — the client correctly POSTs sign-up and
  polls `verification-status`; the failure is 100% server-side mail
  delivery.

**Verification (must pass before R19 is closed):** against a plain
`docker compose up -d` slim-core stack, a real `POST
/api/auth/sign-up/email` results in a delivered verification email
(retrievable from the bundled Mailpit, or a test-route token), and
after verification `POST /api/auth/sign-in/email` returns `200` with a
session. `docker compose logs worker` shows `email.sent`, not
`email.failed` / `ECONNREFUSED`.

---

## R19 verification protocol

20. **R19 verification email delivery** — on a plain slim-core
    `docker compose up -d`, a real sign-up delivers a verification
    email (Mailpit or test-route token), and post-verification sign-in
    returns `200`. No `ECONNREFUSED 192.168.96.2:587` in the worker
    logs.

---

## R20 — sync routes (`/api/notes/*`, `/api/usage`, …) reject every Better Auth bearer token; only the session cookie is accepted — the real signed-in client cannot sync

**Discovered:** 2026-05-21, live manual probe of the real cloud sync
journey against the slim-core stack, immediately after R19 unblocked
sign-up → verify → sign-in. Not an e2e harness run — a genuine
sign-up → email-verify → sign-in → `notes/create`, exactly as the
shipped client does it.

**Severity:** BLOCKER for the real product. The e2e suite is green
ONLY because it authenticates via `/api/_test/seed-tenant`, whose
bearer the custom Bearer middleware happens to accept. A genuine
signed-in user — the actual product flow — cannot create, list, or
sync a single note. The cloud product is non-functional for real
users despite a 44/0/0 e2e run.

**Violation:** After a real verified sign-in, NONE of the bearer tokens
Better Auth issues are accepted by the sync routes. Only the raw
session cookie works:

```
# Probed on GET /api/notes/list, real verified user, fresh sign-in:
session.token (from GET /api/auth/get-session)  → 401 unauthorized
set-auth-token response header (from sign-in)   → 401 unauthorized
session cookie                                  → 200  ✅
GET /api/auth/token  (Better Auth bearer plugin endpoint) → 404
```

Same result on `/api/usage` (401 bearer, 200 cookie). So the failure is
the whole sync-route family behind the custom Bearer middleware, not a
single route.

**Why this is a server bug, not a client one** — the shipped client's
auth-header resolver (`src/helpers/ipcHandlers.js:3395-3402`,
`getAuthHeaderFromWindow`) is explicit:

```js
// Bearer auth is preferred. Cookie fallback covers the brief window before
// main.js's startup migration bridge runs (or if it failed for this user).
const token = tokenStore.get();
if (token) return { Authorization: `Bearer ${token}` };
// ... else Cookie
```

and `main.js:499-518` (`exchangeSignedTokenForRawBearer`) deliberately
calls `GET /api/auth/get-session` to obtain `session.token`, stores it
in `tokenStore`, and from then on every sync request carries
`Authorization: Bearer <session.token>`. The client's entire design
assumes **`session.token` is a bearer the API accepts.** The comment
even says "the raw session.token the bearer plugin expects". The
server does not honor it. This is a contract break on the server side.

**Root-cause hypotheses (for the server team to confirm):**

1. The Better Auth **bearer plugin is not mounted** — `GET
   /api/auth/token` returns `404`, which is the plugin's own endpoint.
   If the bearer plugin were enabled, `session.token` presented as
   `Authorization: Bearer …` would resolve. Without it, Better Auth
   only accepts the session cookie.
2. OR the custom Bearer middleware in front of `/api/notes/*` etc.
   validates against a *different* token namespace (e.g. the
   `/api/v1/keys` API-key tokens, or the seed-tenant bearer) and was
   never wired to resolve a Better Auth `session.token`. The
   seed-tenant bearer works only because seed-tenant mints a token in
   exactly the shape that middleware expects — a test artifact, not the
   real sign-in path.

**Required server behavior:** A user who completes a real
`sign-up → verify → sign-in` MUST be able to authenticate to every
documented sync route (`/api/notes/*`, `/api/folders/*`,
`/api/conversations/*`, `/api/transcriptions/*`, `/api/usage`,
`/api/v1/keys/*`, …) with the bearer the client actually holds. Pick
one and make it true end-to-end:

- **(a)** Mount the Better Auth **bearer plugin** so `session.token`
  presented as `Authorization: Bearer <token>` resolves on every route
  the cookie resolves on. This is the smallest change and matches the
  client comment ("the bearer plugin expects"). `GET /api/auth/token`
  should then stop 404ing. **Recommended.**
- **(b)** Make the custom Bearer middleware resolve a Better Auth
  `session.token` (look the session up by token, same as the cookie
  resolver does). Then `get-session` → `session.token` → `Authorization:
  Bearer` works without the plugin.

Either way: the seed-tenant bearer and the real-sign-in bearer must
resolve through the **same** code path. Today they diverge — that
divergence is exactly why the e2e suite is green while the real product
is broken.

**Reject:**
- "The client should use the cookie" — the client's documented,
  shipped design prefers Bearer and only falls back to cookie for a
  brief upgrade window. Per `client_immutable`, the client is not
  modified to match the server. (And even the cookie fallback only
  works because the renderer's Electron jar holds the cookie — the
  `cloudApiRequest` path the e2e suite verified drives Bearer.)
- "seed-tenant works, so auth is fine" — seed-tenant is a test-only
  route. Its bearer working proves the middleware accepts *a* token
  shape, not *the* token a real user gets. R20 is precisely the gap
  between those two.
- "BACKEND_SPEC doesn't pin the bearer mechanism" — BACKEND_SPEC's
  every authenticated route says `Authorization: Bearer <session-token>`.
  The session token IS `session.token`. The server must honor it.
- Any client-side change — the client correctly exchanges cookie →
  `session.token` → Bearer. The 401 is 100% server-side token
  resolution.

**Verification (must pass before R20 is closed):**

```
# Real journey, no seed-tenant, no test routes:
1. POST /api/auth/sign-up/email      → 200
2. (verify via emailed link)         → 302
3. POST /api/auth/sign-in/email      → 200, capture session cookie
4. GET  /api/auth/get-session        → 200, capture session.token
5. GET  /api/notes/list
     with Authorization: Bearer <session.token>  → 200  (currently 401)
6. POST /api/notes/create
     with Authorization: Bearer <session.token>  → 201  (currently 401)
```

All four authenticated families (`notes`, `folders`, `conversations`,
`transcriptions`) plus `/api/usage` must accept the real-sign-in
bearer. `GET /api/auth/token` should return 200 if option (a) is
chosen.

---

## R20 verification protocol

21. **R20 real-sign-in bearer on sync routes** — a bearer obtained
    from a genuine `sign-up → verify → sign-in → get-session` round
    trip (the `session.token`) is accepted as `Authorization: Bearer`
    on `/api/notes/*`, `/api/folders/*`, `/api/conversations/*`,
    `/api/transcriptions/*`, and `/api/usage`. The seed-tenant bearer
    and the real-sign-in bearer resolve through the same middleware
    path.
