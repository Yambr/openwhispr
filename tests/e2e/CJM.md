# CJM Coverage Matrix (stub)

Full matrix lands in task 9-10. This file currently captures only the
fixture / harness notes that the 9-04..9-09 step defs assume.

## Pending fixtures

- `tests/e2e/fixtures/audio/hello-world-3s.wav` — a checked-in 3-second
  WAV with the known transcript "hello world". Required by the
  `@requires-paid-keys` scenario in `features/transcription.feature`
  ("Multipart upload with a real WAV returns transcribed text"). Until
  the file is on disk the step def calls `test.skip(true, "audio fixture pending")`,
  so the scenario enumerates but does not execute.

## Tag conventions used by 9-04..9-09

- `@blocked-s5` — depends on DB-backed routes; blocked by Phase 8
  finding S5 (slim-core compose missing pgbouncer overlay).
- `@requires-paid-keys` — depends on upstream STT/LLM keys provisioned
  on the server (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, etc.).
- `@requires-assemblyai` / `@requires-deepgram` — additionally gated on
  per-vendor env flags `OPENWHISPR_E2E_ASSEMBLYAI_AVAILABLE=1` and
  `OPENWHISPR_E2E_DEEPGRAM_AVAILABLE=1`.
- `@skip` — permanently skipped pending a Phase 8 finding (currently
  the OpenAI realtime token scenario; see F2/S1).
- `@server-only` — scenario drives the server contract directly via
  `fetch()`, not through the Electron UI.
