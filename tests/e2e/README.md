# OpenWhispr Client E2E Tests

End-to-end suite driving the Electron client via Playwright `_electron.launch` against a locally-running `openwhispr-server` (slim-core).

Stack: `@playwright/test` + `@cucumber/cucumber` + `playwright-bdd`.

See `../../.planning/phases/09-client-e2e-tests/PLAN.md` for the full design.

---

## Prerequisites

- Node 24 (`nvm exec 24`)
- Docker + Docker Compose (for the server)
- A clone of `openwhispr-server` at `../openwhispr-server` (sibling directory)

---

## 1. Bring up slim-core server

From the **server** repo:

```bash
cd ../openwhispr-server

# MANDATORY for e2e: the server .env must include BOTH of these.
# The seed fixture posts to /api/_test/seed-tenant, which is double-gated
# server-side:
#
#   NODE_ENV !== "production"             (compose-default)
#   OPENWHISPR_TEST_ROUTES === "true"     ← exact env-var name, NOT
#                                           OPENWHISPR_ALLOW_TEST_ROUTES
#
# If OPENWHISPR_TEST_ROUTES is missing or false, /api/_test/seed-tenant
# returns 404 and every authenticated scenario fails with a clear error.
#
# LITELLM_MASTER_KEY is required for any @requires-paid-keys scenario
# to reach the upstream provider.
grep -E '^(OPENWHISPR_TEST_ROUTES|LITELLM_MASTER_KEY)=' .env

docker compose up -d
```

This brings up 6 long-running services + a one-shot `migrate` init container:

- `postgres` (5432/tcp, internal)
- `valkey` (6379/tcp, internal)
- `litellm` (4000/tcp, internal)
- `api` (3000/tcp internal → host 4000)
- `web` (3000/tcp → host 3000)
- `worker` (no published port)

Wait for `api` to report `healthy`:

```bash
docker compose ps
# openwhispr-api-1   ...   Up X seconds (healthy)   0.0.0.0:4000->3000/tcp
```

### Smoke test

```bash
curl -s http://localhost:4000/livez
# {"status":"ok"}

curl -i http://localhost:4000/api/health
# HTTP/1.1 200 OK
# (no deprecation header, no link header — R4 closed 2026-05-19)
# {"status":"ok","migrations_completed":true}

# R1 smoke — confirms OPENWHISPR_TEST_ROUTES=true is wired through.
curl -sS -X POST http://localhost:4000/api/_test/seed-tenant \
  -H 'content-type: application/json' \
  -d '{"email":"smoke@test.local","password":"P-test-1!","name":"smoke","verified":true}' \
  | jq .
# { "token": "...", "user": { "id": "...", "email": "smoke@test.local",
#   "emailVerified": true, "createdAt": "..." } }
```

If the `seed-tenant` smoke check returns 404, the server did NOT pick
up `OPENWHISPR_TEST_ROUTES=true`. Stop the stack, edit `.env`, restart.

The seed flow no longer requires Mailpit / email verification (R1
closed): the endpoint mints a pre-verified user and a Better-Auth
bearer in a single round trip.

---

## 2. Configure e2e environment

Copy the example env and edit as needed:

```bash
cp tests/e2e/.env.e2e.example tests/e2e/.env.e2e
```

Required variables:

| Variable | Default | Purpose |
|---|---|---|
| `OPENWHISPR_E2E_BACKEND_URL` | `http://localhost:4000` | Where the Electron app and HTTP-level scenarios point |
| `OPENWHISPR_E2E_RUN_ID` | (auto-generated) | Disambiguates test-tenant emails across parallel runs |

Optional (gate paid-key scenarios):

| Variable | Default | Purpose |
|---|---|---|
| `OPENWHISPR_E2E_ASSEMBLYAI_AVAILABLE` | `false` | If `1`, run AssemblyAI realtime-token scenarios (server must have `ASSEMBLYAI_API_KEY` set) |
| `OPENWHISPR_E2E_DEEPGRAM_AVAILABLE` | `false` | Same for Deepgram |

---

## 3. Run the suite

```bash
npm run test:e2e
```

Outputs:

- `tests/e2e/reports/html/` — Playwright HTML report
- `tests/e2e/reports/cucumber.json` — Cucumber JSON for CI
- `tests/e2e/reports/traces/` — Playwright traces on failure

Filter by tag:

```bash
npm run test:e2e -- --grep "@auth"                     # only auth scenarios
npm run test:e2e -- --grep-invert "@requires-paid-keys" # exclude paid scenarios
```

---

## 4. Triaging failures

For every failure, consult `KNOWN-FAILURES.md`. Triage rules (post
R1–R12 closure):

- Listed there → expected, no action.
- NEW server bug → file in
  `../../.planning/phases/09-client-e2e-tests/SERVER-REQUIREMENTS.md`
  as a new R-row. Use harsh language; the server is < 24h old, every
  spec deviation is a bug, not a migration plan.
- NEW client-side gap → two options ONLY (per `client_immutable`
  rule): (a) server adapts → SERVER-REQUIREMENTS.md, or (b) feature
  cut from client → `CLIENT-CUTS.md`. Never patch the client to
  bridge a server gap.
- Harness flake → fix the test, atomic commit. Do NOT mask a real
  failure.

See `CJM.md` for the coverage matrix: every Phase-8-MATCHed endpoint
mapped to its scenario.

---

## 5. Cleanup

No cleanup hook is needed: `/api/_test/seed-tenant` is idempotent on
email and the server team handles test-tenant pruning. The
`delete-account` round trip from the pre-R1 fixture is gone.

---

## Tag legend (post R1–R12 closure)

- `@requires-paid-keys` — operator gate; needs upstream STT/LLM keys
  configured on the server (e.g. `OPENAI_API_KEY`).
- `@requires-assemblyai` / `@requires-deepgram` — operator gate; needs
  the corresponding env var **and** `OPENWHISPR_E2E_ASSEMBLYAI_AVAILABLE=1`
  / `OPENWHISPR_E2E_DEEPGRAM_AVAILABLE=1` on the e2e harness.

Retired tags (do not reintroduce): `blocked-s5`, `blocked-rN`,
`skip` (for OpenAI realtime), `server-only` — all stripped of their `@`
prefix here so static-grep checks can distinguish active tags from
documented history. See KNOWN-FAILURES.md § "Server requirement
closure log" for the full mapping.

---

## Out of scope (do NOT add scenarios here)

- BYOK third-party providers (OpenAI/Anthropic/Gemini direct calls)
- Stripe billing flows (CLIENT-CUT per
  `../../.planning/phases/09-client-e2e-tests/CLIENT-CUTS.md` CC-1)
- Referrals flows (CLIENT-CUT per CC-2)
- Cross-platform (Windows/Linux) — Phase 9 is macOS only

---

## References

- Phase 9 plan: `../../.planning/phases/09-client-e2e-tests/PLAN.md`
- Phase 9 context (locked decisions): `../../.planning/phases/09-client-e2e-tests/CONTEXT.md`
- Phase 9 client cuts: `../../.planning/phases/09-client-e2e-tests/CLIENT-CUTS.md`
- Phase 8 compatibility matrix: `../../.planning/phases/08-client-server-audit/COMPATIBILITY-MATRIX.md`
- Phase 8 server requirements (all closed): `../../.planning/phases/08-client-server-audit/SERVER-REQUIREMENTS.md`
- Backend wire spec (oracle): `../../docs/BACKEND_SPEC.md`
