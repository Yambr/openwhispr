# Phase 9 — Client E2E Tests (Playwright + Cucumber)

**Goal:** A runnable Gherkin/Cucumber + Playwright e2e suite drives the Electron client via `_electron.launch` against a locally-running slim-core `openwhispr-server` (`docker compose up` in `../openwhispr-server`), covering the four CJM areas: auth, notes sync, cloud transcription + LLM reasoning, and OAuth/billing/health.

**Requirements:** QA-04, QA-05, QA-06.

**Depends on:** Phase 8 (matrix + fixes + gaps already produced).

**Scope decisions (from Phase 8 VERIFICATION.md):**
- IN: 8 CJM endpoint clusters — auth, transcribe, reason, agent stream + web-search, AssemblyAI realtime token, Deepgram realtime token, usage + streaming-usage, stt-config + note-recording-config, health
- SKIP-with-TODO: OpenAI Realtime path (blocked on F2/S1 — `/api/openai-realtime-token` shape mismatch)
- OUT: Stripe billing flows, Referrals (UI-gated in corporate-minimal, no server routes)
- OUT: BYOK third-party providers (OpenAI/Anthropic/Gemini/etc. — not openwhispr-server contract)

---

## Architecture

**Stack:**
- `@playwright/test` — for `_electron.launch` and assertions
- `@cucumber/cucumber` — Gherkin runner, TypeScript step definitions
- `playwright-bdd` — bridges Cucumber `.feature` files to Playwright test runner. Alternative: pure cucumber-js with Playwright-as-library. Plan picks **playwright-bdd** because it gives the Playwright reporter + traces and parallel sharding for free.
- `tsx` — already in client devDeps for TS execution

**Server harness:** the test runner spawns nothing — the operator brings up the slim-core server out-of-band via `docker compose up` in `../openwhispr-server/`. A pre-test fixture pings `http://localhost:4000/livez` (mapped from api:3000 inside the network) and fails fast if it isn't reachable. Test tenant seeded via a tiny `tests/e2e/fixtures/seed.ts` that POSTs `/api/auth/sign-up/email` and stores the bearer token in a shared world object.

**Electron launch:** `_electron.launch({ args: ['.', '--no-sandbox'], env: { OPENWHISPR_E2E_BACKEND_URL: 'http://localhost:4000', NODE_ENV: 'test', ... } })`. Tests target `npm run dev` build (vite-served renderer + electron main on raw source, no packaging). A test-only env var `OPENWHISPR_E2E_AUTH_TOKEN` short-circuits the OAuth dance by injecting a pre-seeded bearer token into `safeStorage` on launch.

**Directory layout:**

```
tests/e2e/
├── README.md                          — how to bring up server + run suite
├── CJM.md                             — coverage matrix (Phase-8-MATCHed endpoint → feature/scenario)
├── KNOWN-FAILURES.md                  — triaged failures linked to FIXES-CLIENT/SERVER-GAPS
├── playwright.config.ts
├── cucumber.config.ts                 — playwright-bdd → cucumber adapter config
├── fixtures/
│   ├── seed.ts                        — test-tenant signup + token persistence
│   ├── electron-launch.ts             — _electron.launch wrapper with env injection
│   └── audio/                         — short test WAV files for transcription
│       └── hello-world-3s.wav
├── features/
│   ├── auth.feature
│   ├── notes-sync.feature
│   ├── transcription.feature
│   ├── reasoning.feature
│   ├── agent-stream.feature
│   ├── realtime-token.feature         — AssemblyAI + Deepgram only; OpenAI marked @skip
│   ├── usage-config.feature
│   └── health.feature
└── steps/
    ├── shared.ts                      — Given/When/Then for app boot, login, navigation
    ├── auth.steps.ts
    ├── notes.steps.ts
    ├── transcription.steps.ts
    ├── reasoning.steps.ts
    ├── agent.steps.ts
    ├── realtime.steps.ts
    ├── usage.steps.ts
    └── health.steps.ts
```

---

## Tasks

### 9-01 — Bring up slim-core server, verify reachability

Operator-side, but the artifact is documentation. Verify:
- `cd ../openwhispr-server && docker compose up -d` brings up 6 long-running services
- `curl http://localhost:4000/livez` returns `200 {"status":"ok"}`
- `curl -X POST http://localhost:4000/api/auth/sign-up/email -H 'content-type: application/json' -d '{"email":"e2e@test.local","password":"...","name":"e2e"}'` returns 200 with a session
- Capture any required env vars (POSTGRES_OWNER_PASSWORD etc.) into a `.env.e2e.example` in `tests/e2e/`

**Artifact:** `tests/e2e/README.md` — operator runbook.

**Commit:** `docs(e2e): runbook for slim-core local boot`.

### 9-02 — Install Playwright + Cucumber, scaffold config

```
npm install --save-dev @playwright/test @cucumber/cucumber playwright-bdd
npx playwright install chromium  # for any non-electron flows; electron embeds its own chromium
```

Files to add:
- `tests/e2e/playwright.config.ts` — Electron project + reporter (html + list), retries: 1, workers: 1 (serial — shared electron app instance), `globalSetup` runs `fixtures/seed.ts`
- `tests/e2e/cucumber.config.ts` — feature glob, steps glob, format `progress-bar` + `html`
- `package.json` script: `"test:e2e": "playwright test --config tests/e2e/playwright.config.ts"`
- `tsconfig.json` — extend or add `tests/e2e/tsconfig.json` with `"types": ["@playwright/test", "@cucumber/cucumber"]`

**Verification:** `npm run test:e2e -- --list` enumerates the (empty) feature files without error.

**Commit:** `chore(e2e): install playwright-bdd + cucumber-js + scaffold config`.

### 9-03 — Test-tenant seed fixture + electron launch wrapper

`tests/e2e/fixtures/seed.ts`:
- Reads `OPENWHISPR_E2E_BACKEND_URL` (default `http://localhost:4000`)
- POSTs `/api/auth/sign-up/email` with deterministic test creds (timestamped email to avoid collisions: `e2e+${run-id}@test.local`)
- Stores session token in `process.env.OPENWHISPR_E2E_AUTH_TOKEN`
- Cleanup hook calls `/api/auth/delete-account` after the run

`tests/e2e/fixtures/electron-launch.ts`:
- Wraps `_electron.launch` with merged env: bearer token, backend URL, `NODE_ENV=test`, `DISABLE_HARDWARE_ACCEL=1`
- Returns the `ElectronApplication` + first window
- A test-only hook in `main.js` reads `OPENWHISPR_E2E_AUTH_TOKEN` and seeds `safeStorage` on boot, bypassing the sign-in UI for non-auth features. **This is a small client change** — gated on `if (process.env.OPENWHISPR_E2E_AUTH_TOKEN)` and a guard that it ONLY runs when `NODE_ENV === 'test'`.

**Commit:** `feat(e2e): seed fixture and electron-launch wrapper`.

### 9-04 — Feature file: auth.feature

Scenarios:
- Sign-up new user → see email-verification prompt
- Sign-in with verified user → reach main app
- Refresh token (wait past expiry or call refresh endpoint) → next request succeeds
- Sign-out → return to sign-in screen
- Delete account → server returns 200, subsequent login fails

Step defs in `tests/e2e/steps/auth.steps.ts` cover all of the above. Reuses the seed fixture.

**Commit:** `test(e2e): auth.feature + steps`.

### 9-05 — Feature file: notes-sync.feature

Per Phase 8 matrix, full Notes CRUD is `MISSING(client)` — the server has `/api/notes/*` routes but the client doesn't yet wire them up to the Electron UI. So this feature file lives in `tests/e2e/features/notes-sync.feature` but is tagged `@server-only` and **drives the server directly via HTTP**, not through Electron UI. It validates the contract from the client's perspective using the same fetch wrapper the client would use, and asserts the responses match what `BACKEND_SPEC.md` promises.

Scenarios:
- Create note → returns 201 + note id
- List notes → returns array including the created note
- Update note → returns 200 + updated body
- Delete note → returns 204; subsequent get returns 404

If/when client wires UI for notes, this feature gains a parallel `@client-ui` variant.

**Commit:** `test(e2e): notes-sync.feature (server-contract level) + steps`.

### 9-06 — Feature file: transcription.feature

Scenarios (driven through Electron UI):
- User starts a recording (programmatically: trigger hotkey IPC, paste a fixture WAV) → cloud transcription → text appears in clipboard / overlay
- File upload transcription → POST `/api/transcribe` directly + verify response shape matches client expectation
- Chunked transcription → multiple `/api/transcribe` POSTs with chunked audio (real flow uses `audio/file` field per Phase 08.5 fix)

Use `tests/e2e/fixtures/audio/hello-world-3s.wav` — checked-in 3-second WAV with known transcript "hello world".

**Commit:** `test(e2e): transcription.feature + steps + fixture WAV`.

### 9-07 — Feature file: reasoning.feature + agent-stream.feature

`reasoning.feature`:
- Send a prompt → `/api/reason` → assert non-empty text response, latency < 30s, finishReason ok
- Send a prompt with system message override → response respects it

`agent-stream.feature`:
- Open an SSE stream from `/api/agent/stream` → assert NDJSON line-flush, content-bearing chunks, terminal `finishReason:"stop"`
- Agent + web-search tool → POST `/api/agent/web-search`, assert sources array

**Commit:** `test(e2e): reasoning + agent-stream features`.

### 9-08 — Feature file: realtime-token.feature

Scenarios (per Phase 8 MATCH rows):
- POST `/api/assemblyai-realtime-token` → returns `{token}` with non-empty value
- POST `/api/deepgram-realtime-token` → same
- POST `/api/openai-realtime-token` — **tagged `@skip` with TODO referencing F2/S1**

**Commit:** `test(e2e): realtime-token.feature (AssemblyAI + Deepgram; OpenAI @skip)`.

### 9-09 — Feature file: usage-config.feature + health.feature

`usage-config.feature`:
- GET `/api/usage` → assert shape per BACKEND_SPEC
- GET `/api/streaming-usage` → same
- GET `/api/stt-config` → assert provider list non-empty
- GET `/api/note-recording-config` → assert shape

`health.feature`:
- GET `/api/health` → 200 + Deprecation header (verifies the back-compat alias)
- GET `/livez` → 200 (preferred endpoint per F1)
- GET `/readyz` → 200
- After F1 ships, `health.feature` gains a scenario that fails if `/api/health` is still called from client (caught via Playwright `page.route` interception)

**Commit:** `test(e2e): usage-config + health features`.

### 9-10 — CJM coverage matrix + KNOWN-FAILURES.md

`tests/e2e/CJM.md`:
- For every MATCH/MISMATCH row in Phase 8 COMPATIBILITY-MATRIX.md, list the feature file + scenario name that covers it
- MISSING(server) rows are explicitly listed as "out of scope (UI-gated)"
- MISSING(client) rows are listed as "server-contract only" or "deferred"

`tests/e2e/KNOWN-FAILURES.md`:
- Pre-seed with F2/S1 OpenAI realtime as the one known skip
- Template for future entries: scenario name, last-pass-date, failure mode, linked Phase-8 finding (F#/S#), owner (client | server)

**Commit:** `docs(e2e): CJM coverage matrix + KNOWN-FAILURES template`.

### 9-11 — Run the suite, triage failures, fix client side

Execute `npm run test:e2e` end-to-end. For every failure:
- If it's a known F# from Phase 8 — confirm it matches that signature, leave as `@known-failure`
- If it's new and root cause is client — fix the client code, atomic commit per fix
- If it's new and root cause is server — file in SERVER-GAPS.md as a Phase-8-amendment row, mark scenario `@known-failure`
- If it's harness/flake — fix the test, atomic commit

**Acceptance:** Suite runs to completion. PASS count + KNOWN-FAILURES count = total scenarios. No silent skips.

**Commit per fix:** `fix(<area>): <description>` (one per fix).

### 9-12 — Verification

Write `VERIFICATION.md`:
- Check 1: every MATCH endpoint in Phase 8 matrix is exercised by ≥1 e2e scenario — PASS/FAIL with grep evidence
- Check 2: `npm run test:e2e` exits 0 on a clean run against slim-core server — PASS/FAIL with last run timestamp + counts
- Check 3: CJM.md is complete (no `TBD` cells) — PASS/FAIL
- Check 4: KNOWN-FAILURES.md entries each link to a Phase 8 finding or a new ticket — PASS/FAIL

**Commit:** `docs(planning/09): verification report`.

---

## Out of Scope

- BYOK third-party provider e2e (OpenAI/Anthropic/Gemini direct calls) — not part of openwhispr-server contract
- Stripe billing UI/flow tests (UI-gated, no server route in corporate-minimal)
- Referrals e2e (same reason)
- OpenAI Realtime WSS roundtrip — blocked on F2/S1
- Cross-platform Electron e2e (Windows / Linux) — Phase 9 runs on macOS only; CI matrix is a follow-up
- Visual regression / pixel diffs
- Performance / load testing (server has its own Phase 08 load tests)

## Risks and Mitigations

- **Risk: Electron+Playwright on macOS requires unsigned-binary entitlement quirks.**
  Mitigation: use `npm run dev` (vite + electron on raw source) rather than packaged binary; signing is irrelevant for `_electron.launch`.

- **Risk: Test tenant pollution if seed cleanup fails.**
  Mitigation: deterministic timestamped emails; nightly cleanup script in `tools/` that calls `/api/auth/delete-account` for any `e2e+*@test.local` older than 24h.

- **Risk: AssemblyAI/Deepgram realtime tokens require real upstream API keys configured on the server.**
  Mitigation: server `.env` must set `ASSEMBLYAI_API_KEY` and `DEEPGRAM_API_KEY` from operator's accounts; if absent, tag scenarios `@requires-paid-keys` and skip in CI. Document in `tests/e2e/README.md`.

- **Risk: `OPENWHISPR_E2E_AUTH_TOKEN` injection in main.js becomes a security hole if shipped.**
  Mitigation: hard gate on `NODE_ENV === 'test'` AND `process.env.OPENWHISPR_E2E_AUTH_TOKEN` AND a compile-time `if (import.meta.env.MODE !== 'production')` check. Vite tree-shakes the entire block in prod builds.
