# Phase 2: Architecture Doc + Hardcode Inventory - Context

**Gathered:** 2026-05-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 2 produces two repo-committed docs that complete the v1 documentation surface:

- `docs/ARCHITECTURE.md` — application architecture for an external implementer (process model, IPC surface, secret storage, model registry, transcription pipeline, embeddings pipeline, sidecar binaries).
- `docs/CONFIG_INVENTORY.md` — every hardcoded backend URL, OAuth client ID, enterprise endpoint, default model registry override, and LiteLLM-shaped URL in the source tree, each with file:line + current value + proposed `OPENWHISPR_*` env-var name.

This phase is **documentation-only**. No source code is modified. No new dependencies. No runtime behavior changes. CONFIG_INVENTORY is the cataloguing pass that makes Phase 3's refactor mechanical.

</domain>

<decisions>
## Implementation Decisions

### ARCHITECTURE.md — Authoring Strategy

- **D-01:** Write `docs/ARCHITECTURE.md` as a **fresh, self-contained doc**. The existing `.planning/codebase/ARCHITECTURE.md`, `STACK.md`, `STRUCTURE.md`, `INTEGRATIONS.md`, and root `CLAUDE.md` are inputs (read them, cite them), but the published doc does not depend on `.planning/` being readable. Mirrors Phase 1's BACKEND_SPEC pattern: `docs/` is the single source of truth for external readers; `.planning/` is internal scaffolding.
- **D-02:** **Audience matches Phase 1 SELF_HOSTING (Phase 1 D-13)** — external third-party / OSS contributor implementing a compatible backend or auditing the client. Tone: explanatory, complete, no insider jargon. Internal v2 team consumes the same doc.
- **D-03:** **Per-topic depth: diagram + 1–2 paragraphs + key files.** Each of the 8 REQ DOC-04 topics gets a small block diagram (ASCII or Mermaid), 1–2 prose paragraphs explaining flow/responsibilities, and a bullet list of key source files with `file:line` citations. Implementation-detail-light — enough for an implementer to orient, not a re-write of source. Documentation that rots fast (verbatim code excerpts, exhaustive function signatures) is explicitly avoided.
- **D-04:** **Source pointers everywhere** — same convention as Phase 1 D-07. Every claim about how a subsystem works is paired with `file:line` citations enabling drift detection via `git grep`. No "see somewhere in the codebase" hand-waves.

### ARCHITECTURE.md — Topic Coverage

- **D-05:** **Required topics (REQ DOC-04):** process model (main / renderer / preload / ONNX worker), IPC surface, secret storage (`safeStorage` + per-key files), model registry (cloud + local), transcription pipeline (whisper.cpp / Parakeet / cloud / streaming), embeddings pipeline (MiniLM via ONNX), sidecar binaries (whisper-server, sherpa-onnx, qdrant, key/mic listeners). One H2 section per topic.
- **D-06:** **IPC surface section: categorized summary, NOT exhaustive table.** Group ~150+ channels by domain (`db-*`, `transcribe-*`, `get-*-key` / `save-*-key`, `window-*`, `hotkey-*`, `meeting-*`, `cloud-*`, etc.). For each category: contract pattern, example channel, args/return shape. Cite `preload.js` as the authoritative full list. Avoids a 200-row table that drifts on every PR.
- **D-07:** **Sidecar binaries section** must enumerate every spawned external process (whisper-server, llama-server, sherpa-onnx, qdrant, ONNX worker, native key/mic listeners on each platform), where its binary lives in `resources/bin/`, who downloads it (`scripts/download-*.js`), how it's started, and how it's reaped (`sidecarReaper.js`).
- **D-08:** **Secret storage section** must explicitly document the 12 `SECRET_KEYS` from `src/helpers/environment.js`, the per-key encrypted file convention in `userData/secure-keys/`, the OS-keychain fallback story (Keychain / DPAPI / libsecret), the Linux-without-keyring plaintext fallback, and that build-time env vars are NEVER for secret material (see Phase 1 PROJECT.md constraint).

### CONFIG_INVENTORY.md — Scope

- **D-09:** **Strict REQ CFG-01 scope.** Inventory only:
  1. Hardcoded backend URLs (OpenWhispr cloud and any per-service overrides)
  2. OAuth client IDs and per-provider client config (Google Calendar today; OpenWhispr cloud sign-in shim provider list)
  3. Enterprise endpoints (Bedrock region defaults, Azure OpenAI base URLs, Vertex project IDs, etc.)
  4. Default model registry overrides (cloud + local model lists in `src/models/modelRegistryData.json` and any in-source defaults)
  5. LiteLLM-shaped URLs (every place the client constructs an OpenAI-compatible base URL — custom endpoint settings, llama.cpp endpoint probe, enterprise compatible-mode flags)
  Do NOT inventory: HuggingFace download URLs, GitHub release URLs for sidecar binaries, build-tool URLs, or anything not in the above five buckets. v1 swap target is the OpenWhispr cloud + per-deployment provider gating; binary download mirrors are out of scope.
- **D-10:** **LiteLLM entries are inventory-only.** v1 records every LiteLLM-shaped URL and proposes an env-var name. v1 does NOT reshape runtime behavior, does NOT introduce a LiteLLM proxy. Phase 3 swaps the *defaults*; v2 (downstream project) handles LiteLLM proxy integration. Annotating future v2 relevance is not done in v1 docs (avoids over-specifying v2 inside v1 deliverables).

### CONFIG_INVENTORY.md — Format

- **D-11:** **Single 5-column table, one row per hardcode**, mirroring Phase 1's structured-table style:

  | file:line | current value | proposed env-var | category | notes |

  Categories: `backend` | `oauth` | `enterprise` | `model-registry` | `litellm`. Notes column captures anything Phase 3 needs (e.g., "value used in 3 call sites — consolidate to single export", "renderer-only — needs `VITE_` prefix at consumption site"). Single table is grep-friendly and gives Phase 3 a flat checklist.

- **D-12:** **Env-var naming: `OPENWHISPR_*` prefix, kebab→snake meaning.** Examples:
  - `OPENWHISPR_BACKEND_URL` (already locked by REQ CFG-04)
  - `OPENWHISPR_OAUTH_GOOGLE_CLIENT_ID`
  - `OPENWHISPR_OAUTH_<PROVIDER>` (CFG-03 boolean gate)
  - `OPENWHISPR_ENTERPRISE_BEDROCK_REGION`
  - `OPENWHISPR_ENTERPRISE_AZURE_OPENAI_URL`
  - `OPENWHISPR_LITELLM_TRANSCRIPTION_URL`

  Renderer-side consumption uses the existing `VITE_` prefix convention (Vite expects `VITE_*` to expose vars at build time). The inventory records the **logical** name (`OPENWHISPR_*`); Phase 3 maps it to the build-tool prefix at the consumption site, with the inventory's `notes` column flagging where this mapping is needed. Avoids doubling the inventory row count.

- **D-13:** **Cross-link, don't duplicate.** When an entry corresponds to an endpoint already documented in `docs/BACKEND_SPEC.md` or an OAuth flow in `docs/OAUTH_SPEC.md`, the `notes` column links to the section anchor. CONFIG_INVENTORY is a *catalogue*; it doesn't repeat payload details.

### Reverse-Engineering Depth (carried from Phase 1)

- **D-14:** **Source-only** (Phase 1 D-09) — no live runtime traces. Source IS the contract.
- **D-15:** **Client-driven scope** (Phase 1 D-11) — only inventory hardcodes that the *current binary* embeds; do not invent endpoints the source doesn't reference.

### Claude's Discretion

- ARCHITECTURE.md table-of-contents ordering (process model first vs. data flow first vs. by-subsystem)
- Whether to use ASCII or Mermaid for diagrams (consistency within the doc matters; either is acceptable)
- Heading hierarchy depth (h2 vs h3 splits per topic)
- Whether to merge "transcription pipeline" + "embeddings pipeline" into a single "AI/ML pipeline" section or keep them separate per REQ DOC-04
- Inventory row ordering (by file path? by category? by env-var alphabetical?) — pick one and apply consistently
- Whether to add a top-of-doc summary table in CONFIG_INVENTORY ("X entries: Y backend, Z oauth, ...")

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents (researcher, planner) MUST read these before producing PLAN.md.**

### Project-level inputs
- `.planning/PROJECT.md` — Yambr fork vision, v1/v2 split, key decisions table
- `.planning/REQUIREMENTS.md` §v1 Requirements — DOC-04 (architecture doc topics), CFG-01 (inventory categories), and CFG-02/CFG-03/CFG-04/CFG-05/CFG-06 to understand what *consumes* the inventory in Phase 3+
- `.planning/ROADMAP.md` §"Phase 2" — Goal + Success Criteria 1, 2, 3
- `.planning/phases/01-wire-contract-documentation/01-CONTEXT.md` — locked Phase 1 decisions; inherits D-09 (source-only), D-11 (client-driven scope), D-13 (audience), D-07 (file:line citations)

### Phase 1 outputs (already published)
- `docs/BACKEND_SPEC.md` — wire-level contract; CONFIG_INVENTORY's backend / enterprise / litellm entries cross-link to its endpoint cards
- `docs/OAUTH_SPEC.md` — OAuth provider catalogue; CONFIG_INVENTORY's `oauth` category cross-links here
- `docs/SELF_HOSTING.md` — third-party walkthrough; ARCHITECTURE.md may be linked from its "further reading" section

### Codebase maps (analysis inputs — read, cite, don't depend on)
- `.planning/codebase/ARCHITECTURE.md` — process model already mapped; primary input for ARCHITECTURE.md process model + layers + data flow sections
- `.planning/codebase/INTEGRATIONS.md` — every external endpoint already enumerated with env vars and file paths; primary input for CONFIG_INVENTORY discovery
- `.planning/codebase/STACK.md` — tech stack pinning (Electron 41 / React 19 / Node 24 / etc.); ARCHITECTURE.md "Tech Stack" subsection sources from here
- `.planning/codebase/STRUCTURE.md` — file structure; useful for ARCHITECTURE.md's "where does X live" pointers
- `.planning/codebase/CONVENTIONS.md` — IPC naming, error handling, logging conventions — informs IPC surface section's contract description
- `.planning/codebase/CONCERNS.md` — known issues / debt; ARCHITECTURE.md may briefly note where current architecture has known limitations
- `CLAUDE.md` (root) — extensive project reference; large overlap with intended ARCHITECTURE.md content (good cross-check; do NOT duplicate verbatim — write fresh per D-01)

### Codebase entry points for ARCHITECTURE.md
- `main.js` — Electron main process entry, sidecar lifecycle, IPC handler registration
- `preload.js` — full IPC surface (used as authoritative source per D-06)
- `src/main.jsx`, `src/App.jsx`, `src/AppRouter.jsx` — renderer entry points
- `src/workers/onnxWorker.js`, `src/helpers/onnxWorkerClient.js` — ONNX utility worker
- `src/helpers/sidecarReaper.js`, `src/helpers/sidecarRegistry.js`, `src/helpers/sidecarPidFile.js` — sidecar lifecycle pattern
- `src/helpers/environment.js` (`SECRET_KEYS` constant) — secret storage list
- `src/helpers/database.js` — SQLite schema for transcriptions, notes, etc.
- `src/helpers/whisper.js`, `src/helpers/parakeet.js`, `src/helpers/parakeetServer.js`, `src/helpers/whisperServer.js` — transcription pipelines
- `src/helpers/localEmbeddings.js`, `src/helpers/qdrantManager.js`, `src/helpers/vectorIndex.js` — embeddings pipeline
- `src/models/ModelRegistry.ts`, `src/models/modelRegistryData.json` — model registry
- `src/services/ai/inferenceProviders/` — 8 inference provider implementations (architecture topic, not inventory)

### Codebase entry points for CONFIG_INVENTORY.md
- `src/config/constants.ts` — central config constants (e.g., `OPENWHISPR_API_URL` at `:116`)
- `runtime-env.json` (built artifact in `src/dist/`) — runtime view of env vars actually exposed to renderer at build time
- `vite.config.mjs` — Vite `define()` block; shows which `VITE_*` vars exist today
- `src/helpers/environment.js` — env-var loading, `.env` file persistence, secret-key list
- `src/services/ai/inferenceProviders/{enterprise,openwhispr,openai,anthropic,gemini,groq}.ts` — base URL hardcodes per provider
- `src/services/ai/openaiBase.ts` — OpenAI-compatible base URL handling (LiteLLM-shaped)
- `src/helpers/googleCalendarOAuth.js`, `src/helpers/googleCalendarManager.js` — Google OAuth client ID + token handling
- `src/components/AuthenticationStep.tsx`, `main.js` (custom protocol registration) — OpenWhispr cloud sign-in OAuth wiring
- `electron-builder.json` — bundle ID, channel-aware protocol scheme, build-time env hooks

### Out-of-scope reminders (don't over-document)
- Anything beyond REQ DOC-04's 8 topics (e.g., UI architecture, i18n internals) — keep ARCHITECTURE.md focused
- HuggingFace / GitHub release URLs for sidecar binary downloads — not in CFG-01 scope
- Runtime backend reconfiguration paths — v1 is build-time only
- Reference backend implementation — out of scope (Phase 1 D-15 still applies)
- Annotating CONFIG_INVENTORY entries with v2 LiteLLM relevance — over-specification per D-10

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Phase 1 docs are published** — `docs/BACKEND_SPEC.md` (815 lines, 19 endpoint cards) and `docs/OAUTH_SPEC.md` (210 lines, OAuth catalogue) are the cross-link targets for CONFIG_INVENTORY's `notes` column. No need to repeat payload details.
- **`.planning/codebase/INTEGRATIONS.md`** already enumerates every external endpoint with env vars and file paths. Phase 2's CONFIG_INVENTORY discovery sweep can use it as a draft starting list (then verify each entry against current source — drift since 2026-05-07).
- **`runtime-env.json`** in `src/dist/` is the runtime ledger of which env vars are exposed at build time today — direct evidence for the inventory.
- **`src/config/constants.ts`** centralizes constants behind `VITE_*` defaults; many entries will live here, making the inventory mechanical for Phase 3.

### Established Patterns
- **OpenWhispr cloud calls** are split renderer-direct vs. main-process via IPC (Phase 1 finding). ARCHITECTURE.md's IPC surface section must capture this duality; CONFIG_INVENTORY's `notes` may flag entries that need the dual-path treatment.
- **`VITE_*` prefix is mandatory for renderer-exposed build-time vars.** D-12 records the *logical* name; Phase 3 will need to add `VITE_` at the consumption site for renderer code paths. Note this in the inventory's `notes` column on a per-entry basis.
- **Sidecar lifecycle pattern** (`sidecarReaper.js` + `sidecarRegistry.js` + `sidecarPidFile.js`) is consistent across all spawned binaries — ARCHITECTURE.md's sidecar section can describe the pattern once and apply it to each binary.
- **IPC channel naming convention** is kebab-case domain-prefixed (CLAUDE.md §IPC Patterns). Group rules in ARCHITECTURE.md follow these existing prefixes.

### Integration Points
- **Phase 3 consumes CONFIG_INVENTORY directly** — Success Criterion 3 from ROADMAP.md says entries must be "complete enough that a developer can execute the Phase 3 refactor without re-auditing the source tree." Inventory completeness is the phase exit gate.
- **Phase 4 consumes CONFIG_INVENTORY's `oauth` rows for CFG-03 per-provider gating** — inventory must surface every OAuth provider as its own row even if they share infrastructure (e.g., the OpenWhispr cloud sign-in shim provider list from Phase 1 D-04).
- **Phase 4's BUILD_CONFIG.md (CFG-05) sources its variable list from CONFIG_INVENTORY** — every env-var proposed in Phase 2 reappears in BUILD_CONFIG with default + example.

</code_context>

<specifics>
## Specific Ideas

- ARCHITECTURE.md should sit alongside Phase 1 docs (`BACKEND_SPEC`, `OAUTH_SPEC`, `SELF_HOSTING`) as a peer reference, not a sub-doc. Cross-links flow both ways: SELF_HOSTING.md "Further Reading" can link to ARCHITECTURE.md once published.
- The CONFIG_INVENTORY env-var names are *proposed* in v1, *implemented* in Phase 3, *documented for users* in Phase 4 (BUILD_CONFIG.md). Naming churn should happen in Phase 2 — once written, downstream phases lock to the names. Use Phase 1's CFG-04 lock (`OPENWHISPR_BACKEND_URL`) as the naming anchor.
- "v1 swap target is OpenWhispr cloud only" (Phase 1 specific idea) — same anchor for Phase 2: when in doubt about whether to inventory a hardcode, ask "would a self-hoster swap this when pointing at their own backend?". If no → not in inventory scope per D-09.

</specifics>

<deferred>
## Deferred Ideas

- **Mirroring sidecar binary download URLs (sherpa-onnx, qdrant, llama-server) for air-gapped deployments** — Considered in gray area Q2; deferred. Useful for some self-hosters but not required by REQ CFG-01 / CFG-02. Could be a future v1.x or v2 item; not a Phase 2 blocker.
- **Annotating CONFIG_INVENTORY rows with v2 LiteLLM relevance** — Per D-10, v1 docs do not over-specify v2. v2's downstream project handles LiteLLM proxy integration with its own design docs.
- **Full per-channel IPC contract table** — Per D-06, IPC section is categorized, not exhaustive. A machine-readable contract table (TypeScript types from preload.js, etc.) could be a future enhancement; not in v1 scope.
- **Architectural ADR series** — `docs/ARCHITECTURE.md` is descriptive (current state), not decision-driven. ADR-style decision records for past/future architectural choices are out of scope for v1; v2 may introduce them.
- **Diagram tooling beyond ASCII / Mermaid** — D-03 allows either; investing in a custom diagram pipeline (PlantUML, draw.io exports, etc.) is deferred.

</deferred>

---

*Phase: 02-architecture-doc-hardcode-inventory*
*Context gathered: 2026-05-08*
