# Server Requirements

Capabilities the **server** must provide so the **client** can stay
upstream-parity. These are NOT "things the client could work around" —
they are architectural requirements that belong on our backend.

Verification protocol: every entry below has been checked against
known architectural anti-patterns. Entries that would force client
drift, mocks, or secret-material embedding are rejected.

Format: most recent first.

---

## R1 — Allow Electron client Origin in `trustedOrigins`

**Discovered:** 2026-05-19, Phase 9 e2e first unblocked run after S5 closed.

**Symptom:** `POST /api/auth/sign-up/email` from a plain `fetch()` in
the e2e harness returns HTTP 403:
```json
{"message":"Missing or null Origin","code":"MISSING_OR_NULL_ORIGIN"}
```
Better Auth's `trustedOrigins` policy on the server rejects requests
with no Origin header.

**Why this belongs on the server (not the client):**
- Upstream OpenWhispr's Electron client *already* spoofs Origin via
  `session.defaultSession.webRequest.onBeforeSendHeaders` in `main.js`
  (see lines around 712–760). That code path runs for real users.
- The e2e harness uses plain Node `fetch()` to exercise the wire
  contract directly — that's the right way to test the contract
  (matches `BACKEND_SPEC.md`). Adding `origin: BACKEND_URL` to e2e
  fetch headers would be a client-side workaround for a server policy
  decision, not a contract test.
- Anti-pattern rejected: "make the e2e fetches spoof Origin". That
  hides the server policy from the test contract.

**Required server behavior:**
- The `trustedOrigins` allowlist on the server MUST include a
  developer/test mode where one of:
  - (a) The slim-core dev profile sets a permissive
    `trustedOrigins: ["*"]` (or equivalent dev escape) and clearly
    flags this in the server's `.env` template / docs; OR
  - (b) `apps/api` exposes a test-only seed endpoint
    (`POST /api/_test/seed-tenant`) that bypasses Better Auth's
    Origin check and provisions a tenant + returns a bearer. Gate it
    on `NODE_ENV !== "production"` server-side, never expose in
    production builds.

**Reference contract for option (b):**
```http
POST /api/_test/seed-tenant
Content-Type: application/json

{ "email": "e2e+<run_id>@test.local",
  "password": "...",
  "name": "..." }

→ 200
Content-Type: application/json
{ "token": "<bearer>",
  "user": { "id": "...", "email": "..." } }
```

**Severity:** BLOCKER for Phase 9 contract-level e2e. Every scenario
that needs a seeded tenant currently fails at signup. The Electron-UI
scenarios (which use the real client Origin-spoof) would still work.

**Status:** open. Client side: no change. Awaiting server fix.

---

## R2 — Bearer token in signup response body

**Observed:** Live `POST /api/auth/sign-up/email` returns:
```json
{
  "token": null,
  "user": { ... }
}
```

The server creates the user but the `token` field is null. Likely
Better Auth requires email verification before issuing a bearer.

**Why this belongs on the server (not the client):**
- Production client behavior: user verifies email via link, then signs
  in via `POST /api/auth/sign-in/email`. That's the right CJM.
- E2E option A: walk that full flow — require Mailpit (already in
  slim-core compose) to intercept the verification link, scrape, click.
  Costly per scenario, slow.
- E2E option B: server exposes a test-only "verify + issue bearer"
  endpoint at `POST /api/_test/verify-and-mint` taking `{email}` and
  returning `{token}`. Same NODE_ENV gate as R1.
- Anti-pattern rejected: "client e2e parses Mailpit's HTTP API to
  click the link". That couples the test runner to Mailpit specifics
  and makes every e2e scenario fight email IO.

**Required server behavior:** Option B (test-only mint endpoint) is
preferred. It composes with R1 cleanly: the seed endpoint could
return a pre-verified user + bearer in one call.

**Severity:** HIGH (every authenticated scenario depends on it; ~22 of
28 e2e scenarios).

**Status:** open. Subsumed by R1 if option (b) is chosen.

---

## R3 — Default-corporate behavior under `OPENWHISPR_BACKEND_URL` override

**Context:** When `OPENWHISPR_E2E_BACKEND_URL=http://localhost:4000` is
passed to the Electron client (or to e2e fetches), every HTTP call
points at the slim-core api container. The server must behave
identically to the upstream cloud backend for the documented contract
(`docs/BACKEND_SPEC.md`).

**Required server behavior:** every endpoint listed as `MATCH` in
`COMPATIBILITY-MATRIX.md` returns the same shape, status codes, and
headers when invoked from a non-cloud origin. This is the
self-hosting contract — already covered by the server's existing
contract-test suite. Stays here as a verification gate, not a new
requirement.

**Severity:** N/A — contract baseline.

---

## Architectural Patterns / Anti-Patterns Used for Verification

Every requirement above was filtered through these:

**Allowed patterns (server takes the work):**
- Test-only routes gated on `NODE_ENV !== "production"` + a stable
  prefix (`/api/_test/*`) that the server's existing tools already
  recognise (see `apps/api/_test/*` per `SERVER-ROUTES.md`)
- Server-side trustedOrigins / CORS policy expressed in server `.env`
  and documented in `SELF_HOSTING.md`
- Dev/test compose profile or overlay (`compose/overlays/dev.yml`)
  that flips server policies for local development without changing
  the production-grade build

**Anti-patterns rejected:**
- Client-side header spoofing to satisfy server policies
- Test-only branches inside `main.js`, `preload.js`, or `src/` that
  diverge from upstream
- Embedding secrets/tokens in the client binary
- Mocking server responses in e2e step defs
- Mailpit HTML scraping from the test runner
- Backwards-compat shims in the client that bridge server gaps
- Any "if it's just for e2e" reasoning that touches packaged client code

**Upstream-parity constraint:** every change to `main.js`,
`preload.js`, `src/`, the renderer entry, or the build pipeline must
be either (a) build-time env gating per Phase 3/4, or (b)
documented feature drift in `docs/`. Test-mode hatches do NOT
qualify under either bucket — they go on the server.
