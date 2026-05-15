# Known Failures

Scenarios currently expected to fail or be skipped. Each row links the
failure to either a Phase 8 finding (F# / S#) or a new ticket. Re-run
this list whenever a Phase 8 finding ships a fix; the goal is to keep it
short.

| Tag | Scenario | Root cause | Owner | Linked finding | Last verified |
|---|---|---|---|---|---|
| `@blocked-s5` | 21 scenarios across auth/notes/transcription/reasoning/agent-stream/realtime-token/usage-config + health::readyz | Slim-core compose missing pgbouncer overlay — `apps/api` resolves `pgbouncer:5432` via `DATABASE_URL` but the overlay file doesn't exist in the server repo. All DB-backed routes 500 with empty body. | server | Phase 8 **S5** | 2026-05-15 |
| `@skip` | `realtime-token.feature → OpenAI realtime token mint` | Schema mismatch: client sends `{model, language, streams}` and expects `{clientSecret}` / `{clientSecrets[]}`; server accepts empty body and returns `{token}`. | client OR server (pick one) | Phase 8 **F2 / S1** | 2026-05-15 |
| `@requires-paid-keys` | 8 scenarios in transcription/reasoning/agent-stream/realtime-token | LiteLLM proxy on the server needs upstream API keys configured (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `ASSEMBLYAI_API_KEY`, `DEEPGRAM_API_KEY`). Not a bug — operator gate. | operator | n/a (env) | 2026-05-15 |
| pending fixture | `transcription.feature → Multipart upload with a real WAV returns transcribed text` | Audio fixture file not yet checked in: `tests/e2e/fixtures/audio/hello-world-3s.wav`. Step def short-circuits via `test.skip()`. | client | n/a | 2026-05-15 |

## Triage protocol

When a new failure appears:

1. **Is it already on this list?** No-op.
2. **Is the root cause a Phase 8 finding?** Confirm the symptom matches that finding, then tag the scenario `@blocked-<ID>` and append a row here.
3. **Is the root cause a NEW client bug?** Fix it in this repo, atomic commit. Do not add a row — the scenario should go green.
4. **Is the root cause a NEW server bug?** Add the gap to `../../.planning/phases/08-client-server-audit/SERVER-GAPS.md` as an amendment row, tag the scenario `@blocked-<new-ID>`, append a row here.
5. **Is it harness flakiness?** Fix the test, atomic commit. Do not tag.

## Last full run

- 2026-05-15 — 4 unblocked scenarios PASS (`/livez`, `/api/health` with
  deprecation header, `/api/reason` no-auth → 401, `/api/transcribe`
  no-auth → 401). Other 25 scenarios in the suite are tagged out via
  `@blocked-s5` or `@skip`.
