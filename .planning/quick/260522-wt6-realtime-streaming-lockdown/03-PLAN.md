---
quick_id: 260522-wt6
plan: 03
title: Live verification — drive a real recording, assert WSS target
files_modified:
  - tests/ui/realtime-lockdown.spec.ts
  - scripts/verify-provider-lockdown.js
  - docs/BACKEND_SPEC.md
---

<objective>
Prove the fix end-to-end with REAL exercise of the recording/streaming path —
not bundle-greps alone. Add Playwright Electron-UI coverage that triggers a
dictation in the corporate build and asserts the realtime connection targets
OUR server's WSS proxy, and that no `api.openai.com` connection is attempted.
Extend `verify-provider-lockdown.js` so `api.openai.com` cannot survive as a
reachable realtime target in the lockdown bundle. Update `BACKEND_SPEC.md` to
document Design B as the corporate `/v1/realtime` contract.

Purpose: the owner is angry that recording was never actually exercised. This
plan makes a live recording run mandatory.
Output: a new spec + verifier extension + doc; a verified live run.
</objective>

<context>
@tests/ui/corporate-lockdown.spec.ts
@tests/ui/playwright.config.ts
@scripts/verify-provider-lockdown.js
@scripts/verify-realtime-routing.js
@docs/BACKEND_SPEC.md
@src/helpers/openaiRealtimeStreaming.js

Key facts from source:
- `corporate-lockdown.spec.ts` launches the real Electron app with
  `OPENWHISPR_PROVIDER_LOCKDOWN=true`, `OPENWHISPR_BACKEND_URL=http://localhost:4000`,
  loads the built `src/dist` renderer in production mode, finds the
  `panel=true` window. Uses `clickText()` / `bodyText()` helpers.
- `tests/ui/global-setup.ts` builds the lockdown bundle before the run.
- The realtime WSS connection happens in the MAIN process
  (`openaiRealtimeStreaming.js`, `new WebSocket(url, ...)`), not the renderer —
  so renderer network interception alone will not see it. The connection
  TARGET URL is derivable: it is `OPENWHISPR_REALTIME_WSS_URL` +
  `?intent=transcription`. The debug log line "OpenAI Realtime connecting"
  fires on every connect attempt.
- `verify-provider-lockdown.js` bundle-greps `src/dist` for literals that DCE
  should remove; `verify-realtime-routing.js` already bans
  `wss://api.openai.com/v1/realtime` in src/ and dist/.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Realtime-lockdown Electron-UI spec — drive a recording, assert WSS target</name>
  <files>tests/ui/realtime-lockdown.spec.ts</files>
  <action>
Create `tests/ui/realtime-lockdown.spec.ts`, a sibling of
`corporate-lockdown.spec.ts`, reusing its Electron-launch boilerplate (same
`electron.launch` args/env with `OPENWHISPR_PROVIDER_LOCKDOWN=true`,
`OPENWHISPR_BACKEND_URL=http://localhost:4000`, the `panel=true` window
discovery, `beforeAll`/`afterAll`).

The spec must actually exercise the streaming path, not bundle-grep. Approach:

1. Capture main-process stdout/stderr from the launched app
   (`app.process().stdout` / `.stderr`) into a buffer for the whole session, so
   the realtime debug log lines are observable. Launch with
   `OPENWHISPR_LOG_LEVEL=debug` in env so `debugLogger` emits the
   "OpenAI Realtime connecting" / "WebSocket opened" / "WebSocket error" lines.

2. Test "realtime connect targets our WSS proxy, not OpenAI":
   - In the renderer, read the build config the app actually loaded and assert
     `OPENWHISPR_REALTIME_WSS_URL` resolves to a `ws(s)://localhost:4000/...`
     host (our server) — `main.evaluate` reading the exposed config, or assert
     via the debug log. It MUST NOT be an `api.openai.com` URL.
   - Trigger the realtime warmup/connect path. Prefer driving the actual UI
     dictation control (find the record affordance on the panel and activate
     it). If headless audio capture is not feasible, invoke the realtime warmup
     IPC directly from the renderer via `window.electronAPI.dictationRealtimeWarmup({})`
     (this is the SAME code path the recorder uses — it calls
     `connectDictationStreaming` → `fetchRealtimeToken` → `OpenAIRealtimeStreaming.connect`).
   - Assert from the captured main-process log buffer: a connect attempt was
     made AND no line contains `api.openai.com`. Assert the connect used our
     host. If a 401 appears, fail with the log excerpt (that is the regression
     this whole task fixes).

3. Test "no OpenAI-direct fallback log": assert the captured log NEVER contains
   "falling back to OpenAI default" or a connect to an `api.openai.com` host.

Use precise assertions (the false-positive discipline from
`corporate-lockdown.spec.ts`). If the test environment cannot reach a real
`localhost:4000` server, the connect will fail at the network layer — that is
acceptable as long as the TARGET asserted is our host and NOT openai; document
this in a comment (the test asserts routing/target, the live-run gate in this
plan's verification asserts a successful end-to-end transcription).

Register the spec so `npm run test:lockdown-ui` picks it up (it runs the
`tests/ui/playwright.config.ts` project — confirm the config globs
`tests/ui/*.spec.ts`; if it names specs explicitly, add this one).
  </action>
  <verify>
    <automated>npm run test:lockdown-ui 2>&1 | tail -15</automated>
  </verify>
  <done>
`realtime-lockdown.spec.ts` runs under `test:lockdown-ui`, drives the real
realtime connect path in the corporate Electron build, and asserts the WSS
target is our server with no `api.openai.com` connection and no OpenAI-direct
fallback log.
  </done>
</task>

<task type="auto">
  <name>Task 2: verify-provider-lockdown — ban api.openai.com as reachable realtime target</name>
  <files>scripts/verify-provider-lockdown.js</files>
  <action>
Extend `verify-provider-lockdown.js` with a new target group asserting that
`api.openai.com` cannot be a reachable realtime connection target in the
lockdown bundle. Add a check that greps the lockdown `src/dist` bundle AND the
main-process realtime source for:
  - `wss://api.openai.com`
  - `api.openai.com/v1/realtime`
  - the `/api/openai-realtime-token` route literal reachable from a lockdown
    code path.

The literal `api.openai.com` may legitimately appear in the default bundle
(BYOK / Design A) — so this check asserts ABSENCE only in the `lockdown` build,
PRESENCE-allowed in `default`, matching the existing group structure. For
`/api/openai-realtime-token`: it is fine for the string to exist in main-process
source behind a `PROVIDER_LOCKDOWN_ENABLED` guard, so scope this to the renderer
`src/dist` bundle (the renderer never needs that route under lockdown).

Keep it consistent with `verify-realtime-routing.js`'s existing
`wss://api.openai.com/v1/realtime` ban — do not duplicate; if the routing
verifier already fully covers the src/ + dist/ ban, this task's contribution is
the lockdown-bundle-specific assertion plus the `/api/openai-realtime-token`
renderer-bundle absence check. Update the verifier's header comment to list the
new group.
  </automated>
  <action-note>The verify is the script itself; gate below runs it.</action-note>
  <verify>
    <automated>npm run verify:provider-lockdown 2>&1 | tail -8</automated>
  </verify>
  <done>
`verify:provider-lockdown` fails if `api.openai.com` or
`/api/openai-realtime-token` is reachable from the lockdown renderer bundle;
passes on the current corrected build.
  </done>
</task>

<task type="auto">
  <name>Task 3: BACKEND_SPEC.md — document Design B as the corporate /v1/realtime contract</name>
  <files>docs/BACKEND_SPEC.md</files>
  <action>
Rewrite the WSS `/v1/realtime` realtime card in `docs/BACKEND_SPEC.md`:

- Document Design B as the corporate (PROVIDER_LOCKDOWN) path: the desktop
  opens a WebSocket to `OPENWHISPR_REALTIME_WSS_URL` (our server's
  `/v1/realtime`, derived from `OPENWHISPR_BACKEND_URL`) and authenticates with
  the Better Auth session bearer in the `Authorization: Bearer <token>` header
  — NOT an OpenAI API key and NOT an ephemeral `client_secret`. The server
  validates the session, strips the desktop's `Authorization`, and substitutes
  `LITELLM_MASTER_KEY` for the upstream LiteLLM connection. Egress is
  LiteLLM-only; the desktop never contacts `api.openai.com` under lockdown.
- Keep Design A documented as the default-build path: `POST
  /api/openai-realtime-token` mints an ephemeral OpenAI `client_secret` for
  client→OpenAI-direct streaming. Make explicit that Design A is NOT used under
  PROVIDER_LOCKDOWN.
- Note the corporate default realtime model is `gpt-realtime`.
- No new user-facing strings, so no i18n changes. If the spec references the
  model gate, keep it factual.
  </action>
  <verify>
    <automated>node -e "const s=require('fs').readFileSync('docs/BACKEND_SPEC.md','utf8'); if(!/Design B/.test(s)||!/v1\/realtime/.test(s)) throw new Error('BACKEND_SPEC realtime card not updated'); console.log('OK')"</automated>
  </verify>
  <done>
`BACKEND_SPEC.md` documents Design B as the corporate `/v1/realtime` contract
(session bearer in, LITELLM_MASTER_KEY upstream) and keeps Design A as the
default-build path.
  </done>
</task>

</tasks>

<verification>
Full gate — ALL must pass:
- `npm run typecheck`
- `npm run verify:provider-lockdown`
- `npm run verify:realtime-routing`
- `npm run test:lockdown-ui`
- `npm run test:build-config`

MANDATORY LIVE RUN (non-negotiable — the owner requires recording to be
actually exercised): with the corporate build and a reachable
`localhost:4000` server, launch the real Electron app, sign in, and perform an
actual dictation recording. Confirm in the debug log that the realtime path
connects to our `/v1/realtime` proxy with the session bearer, receives a
transcription, and that NO `api.openai.com` connection and NO 401 appears.
Drive the live app — do not substitute a bundle-grep for this step.
</verification>

<success_criteria>
A real recording in the corporate Electron build transcribes via our server's
WSS proxy with the Better Auth bearer; no OpenAI-direct connection, no 401, no
OpenAI-direct fallback log. All five verify gates green.
</success_criteria>

<output>
Atomic commit per task. Commit messages:
- `test(ui): drive real realtime connect in corporate lockdown build`
- `test(verify): ban api.openai.com as reachable realtime target under lockdown`
- `docs(backend-spec): document Design B corporate /v1/realtime contract`
</output>
