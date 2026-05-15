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
# deprecation: true
# link: </livez>; rel="successor-version"
# ...
# {"status":"ok","migrations_completed":true}
```

The `deprecation: true` header on `/api/health` is expected — see Phase 8 finding **F1**. The alias is what the client currently uses; migration to `/livez` is tracked separately.

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
| `OPENWHISPR_E2E_ASSEMBLYAI_AVAILABLE` | `false` | If `true`, run AssemblyAI realtime-token scenarios (server must have `ASSEMBLYAI_API_KEY` set) |
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
npm run test:e2e -- --grep "@auth"           # only auth scenarios
npm run test:e2e -- --grep-invert "@skip"    # exclude @skip
```

---

## 4. Triaging failures

For every failure, consult `KNOWN-FAILURES.md`:

- Listed there with `@known-failure` tag → expected, no action
- Not listed, root cause is **client** → fix it, atomic commit
- Not listed, root cause is **server** → file in `../../.planning/phases/08-client-server-audit/SERVER-GAPS.md` as a Phase-8 amendment, then tag the scenario `@known-failure` and update this doc

See `CJM.md` for the coverage matrix: every Phase-8-MATCHed endpoint mapped to its scenario.

---

## 5. Cleanup

The seed fixture deletes its tenant on suite exit (`/api/auth/delete-account`). If a run is killed mid-way, run:

```bash
node tests/e2e/fixtures/cleanup-stale.ts
```

This deletes any `e2e+*@test.local` accounts older than 1 hour.

---

## Out of scope (do NOT add scenarios here)

- BYOK third-party providers (OpenAI/Anthropic/Gemini direct calls)
- Stripe billing flows (no server route in corporate-minimal)
- Referrals flows (same)
- OpenAI Realtime WSS roundtrip (blocked on Phase 8 finding F2/S1)
- Cross-platform (Windows/Linux) — Phase 9 is macOS only

---

## References

- Phase 9 plan: `../../.planning/phases/09-client-e2e-tests/PLAN.md`
- Phase 8 compatibility matrix: `../../.planning/phases/08-client-server-audit/COMPATIBILITY-MATRIX.md`
- Backend wire spec (oracle): `../../docs/BACKEND_SPEC.md`
