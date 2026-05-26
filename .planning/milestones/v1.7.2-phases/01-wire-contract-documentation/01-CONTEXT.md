# Phase 1: Wire Contract Documentation - Context

**Gathered:** 2026-05-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 1 produces three repo-committed docs that capture the OpenWhispr client's external wire surface — `docs/BACKEND_SPEC.md`, `docs/OAUTH_SPEC.md`, `docs/SELF_HOSTING.md` — sufficient for a third party to implement a drop-in replacement for the **OpenWhispr cloud backend** specifically (not third-party AI APIs, not enterprise providers).

This phase is **documentation-only**. No source code is modified. No new dependencies. No live cloud traffic captured. The spec is derived strictly from reading the client source.

</domain>

<decisions>
## Implementation Decisions

### Spec Scope Boundary

- **D-01:** OpenWhispr's own cloud backend + Google Calendar OAuth flow are documented **in detail** (every endpoint, request/response schema, auth header, error model). These are the surfaces v2 will replace.
- **D-02:** All third-party APIs (OpenAI, Anthropic, Gemini, Mistral, Groq, AssemblyAI, Deepgram) and enterprise providers (Bedrock, Azure OpenAI, Vertex) get **inventory-only treatment** — one-line entry per call site (file:line, base URL, SDK used, link to vendor docs). No payload schemas, no error models. Rationale: v1's swap target is *only* OpenWhispr cloud; reverse-engineering vendor APIs is explicitly out of scope per `REQUIREMENTS.md`.
- **D-03:** Google Calendar API: OAuth flow documented in detail (scopes, redirect URI, token storage, where client ID lives in source). API payload bodies link to Google's official docs. Justification: OAuth is part of the auth surface v2 must satisfy; payload bodies are Google's contract.
- **D-04:** OAUTH_SPEC.md enumerates **every** OAuth provider currently in the source (OpenWhispr cloud sign-in + Google Calendar + any others discovered during phase research, e.g., Apple if present). Each entry: authorization endpoint, token endpoint, scopes, redirect URI scheme, file:line of client ID, token storage location. Sets up CFG-03 (per-provider gating in Phase 4) without re-auditing.

### Spec Format / Rigor

- **D-05:** Format: **structured tables + JSON request/response examples** in markdown. Per endpoint: a table with columns `method | URL | auth header | source file:line` followed by fenced JSON blocks for example request body and example response body. No OpenAPI, no JSON Schema, no extra tooling.
- **D-06:** Schema source: **hand-written from observation** of call sites and IPC handlers. Reading the code IS the source of truth.
- **D-07:** Source pointers: every endpoint entry must link to **`file:line` of the fetch() call AND the IPC handler / wrapper function** (e.g., `src/lib/auth.ts:114`, `src/helpers/ipcHandlers.js:3327`). Enables drift detection — when source changes, doc verification is one git-grep away.
- **D-08:** Error responses: document a **global error envelope** (status codes + JSON shape) once at the top of BACKEND_SPEC.md, then note any per-endpoint deviations inline. Reduces duplication.

### Reverse-Engineering Depth

- **D-09:** **Source-only** — do not capture live runtime traces. The client code is the contract; if the deployed cloud differs, that's a separate bug, not Phase 1's concern. No live OpenWhispr cloud account required for the phase.
- **D-10:** Document **only what the client observes**. Do not speculate about server-side behavior (rate limits, async jobs, retry semantics) beyond what the client's retry/timeout logic reveals. v2 backend can implement whatever rate-limiting strategy it wants — client adapts via existing logic.
- **D-11:** **Client-driven scope** — do not hunt for hidden cloud endpoints (admin, webhooks, internal APIs) the client doesn't call. The wire surface is whatever the *current OpenWhispr binary* sends; that's the v2 conformance target.

### SELF_HOSTING.md Shape

- **D-12:** **Full reference doc** (not a quick-start). SELF_HOSTING.md is a top-to-bottom walkthrough of every endpoint, the auth contract, OAuth flow expectations, and edge cases an implementer needs. Some duplication with BACKEND_SPEC.md / OAUTH_SPEC.md is accepted — SELF_HOSTING is the reader's entry point and should be self-sufficient for a first-pass implementation.
- **D-13:** **Primary audience: external third party / open-source contributor.** Doc explains client architecture, auth model, and expected payloads from scratch. Does not assume reader is familiar with OpenWhispr internals.
- **D-14:** **Prescriptive auth section.** SELF_HOSTING describes the exact auth contract the client expects (token format, header names, sign-in response payload). It does NOT discuss pluggable strategies (LDAP, magic links). Forward-compatibility for v2 LDAP is achieved by v2 making its identity provider issue a token in the same shape — the client's auth surface stays unchanged.
- **D-15:** **No sample server stub** included in SELF_HOSTING.md or this repo. The spec is the deliverable; reference implementations belong in v2 / future work.

### Claude's Discretion

- Document file ordering / table-of-contents structure inside each of the three docs
- Heading hierarchy (h2 vs h3 for endpoint groupings)
- Whether OAUTH_SPEC.md and BACKEND_SPEC.md cross-reference each other inline or only via SELF_HOSTING.md
- Markdown table widths / readability tradeoffs (when to break a long URL onto its own row, etc.)
- Whether to use a unified "endpoint card" template across the three docs or let each doc evolve its own conventions

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents (researcher, planner) MUST read these before producing RESEARCH.md / PLAN.md.**

### Project-level inputs
- `.planning/PROJECT.md` — Yambr fork vision, v1/v2 split rationale, key decisions table
- `.planning/REQUIREMENTS.md` §v1 Requirements — DOC-01, DOC-02, DOC-03 acceptance criteria; explicit out-of-scope items (third-party API RE, runtime config, sample backend implementation)
- `.planning/ROADMAP.md` §"Phase 1" — Goal, Success Criteria items 1–3 (the three deliverable docs)
- `.planning/codebase/INTEGRATIONS.md` — Pre-existing inventory of every external integration; Phase 1's BACKEND_SPEC inventory section can lean heavily on this

### Codebase entry points for OpenWhispr cloud reverse-engineering
- `src/config/constants.ts:116` — central `OPENWHISPR_API_URL` constant (build-time `VITE_OPENWHISPR_API_URL`)
- `src/lib/auth.ts` — auth helper used by renderer (incl. `/api/auth/delete-account`)
- `src/components/AuthenticationStep.tsx:154–159` — `/api/check-user` call site (sign-in onboarding)
- `src/components/EmailVerificationStep.tsx:29–31` — `/api/auth/verification-status` polling
- `src/helpers/ipcHandlers.js` (search for `OPENWHISPR_API_URL` / `VITE_OPENWHISPR_API_URL` — line ~3327 onward) — main-process auth/cloud handlers
- `src/helpers/tokenStore.js` — cloud token storage / lifecycle
- `runtime-env.json` (built artifact in `src/dist/`) — runtime view of the env vars used in production builds

### Codebase entry points for OAuth reverse-engineering
- `src/helpers/googleCalendarOAuth.js` — Google OAuth flow (auth endpoint, token exchange, refresh)
- `src/helpers/googleCalendarManager.js` — token storage in SQLite, refresh on expiry
- `src/components/AuthenticationStep.tsx`, `src/components/EmailVerificationStep.tsx` — OpenWhispr cloud sign-in UI
- `main.js` — `openwhispr://` custom protocol handler registration (search for `setAsDefaultProtocolClient`)
- `preload.js` — IPC surface exposing auth methods to renderer
- `src/dist/assets/auth-*.js` — compiled auth bundle (useful for confirming what's actually shipped)

### Codebase entry points for inventory-only items (third-party + enterprise)
- `src/services/ai/inferenceProviders/{openai,anthropic,gemini,groq,enterprise,lan,local,openwhispr}.ts` — one provider per file; each has its base URL + auth wiring
- `src/services/ai/openaiBase.ts` — shared OpenAI Responses-API logic
- `src/helpers/{openaiRealtimeStreaming,assemblyAiStreaming,deepgramStreaming}.js` — streaming transcription endpoints
- `src/helpers/ipcHandlers.js` — Mistral transcription + Anthropic IPC bridge handlers

### Out-of-scope reminders (don't over-document)
- Third-party AI APIs (OpenAI/Anthropic/Gemini/etc.) — vendor docs are authoritative, link only
- Enterprise providers (Bedrock/Azure/Vertex) — same treatment as third-party BYOK
- Runtime backend reconfiguration — v1 is build-time only (Phase 3 + 4)
- Sample backend implementation code — out of scope for v1

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `.planning/codebase/INTEGRATIONS.md` already enumerates external endpoints, env vars, and auth flows — Phase 1 docs can quote / restructure rather than re-discover. Treat it as a draft outline.
- `src/config/constants.ts:116` is the single source of truth for the OpenWhispr cloud base URL. Every cloud endpoint is `${OPENWHISPR_API_URL}/api/...` — makes inventorying mechanical.
- IPC channel naming convention is consistent (kebab-case, see `CLAUDE.md` §IPC Patterns) — table format for OAUTH_SPEC can mirror it.

### Established Patterns
- **OpenWhispr cloud calls** are split: some originate in the renderer (`fetch(...)` directly with `OPENWHISPR_API_URL`), some go through the main process via `ipcHandlers.js`. The spec must capture both call paths per endpoint.
- **Anthropic / Mistral** route via IPC to dodge renderer CORS — pattern note for OAUTH_SPEC: OAuth flows likewise sometimes need main-process handling.
- **Token storage** uses Electron `safeStorage` + per-key `.enc` files in `userData/secure-keys/` for the 12 secret keys, but cloud auth tokens use `src/helpers/tokenStore.js` which is a different storage path — clarify in OAUTH_SPEC.

### Integration Points
- Custom protocol handler `openwhispr://` (channels: openwhispr-dev, openwhispr-staging) is registered in `main.js` and used by the cloud auth redirect flow. Phase 1 must document this as part of the OAuth contract.
- `googleCalendarManager.js` polls every 2 minutes with exponential backoff — relevant for OAUTH_SPEC's "token refresh / token revocation" sections.

</code_context>

<specifics>
## Specific Ideas

- The user explicitly framed v1's goal as: *"я хочу только свайпнуть openwhispr cloud, остальное на этом этапе не трогать"* — only OpenWhispr cloud is the swap target. This anchors every "should we document X?" question: if X is not OpenWhispr cloud (or its OAuth flow), inventory-only.
- SELF_HOSTING.md is for **external third parties / OSS contributors**, not the internal v2 team. Tone: explanatory, complete, walkthrough-oriented. Acceptable to repeat content from BACKEND_SPEC.md / OAUTH_SPEC.md to keep SELF_HOSTING self-sufficient.
- The auth section is **prescriptive, not pluggable**. The doc describes the current contract. v2 LDAP work makes its identity provider issue a token in the *same shape* — the client's auth surface remains unchanged. Don't pre-design pluggability into v1 docs.

</specifics>

<deferred>
## Deferred Ideas

- **Reference backend implementation (sample server stub)** — Out of scope for v1. Belongs in v2 / a separate companion repo. Note in SELF_HOSTING.md as a future-work pointer if desired, but do not write code.
- **Pluggable auth strategy documentation (LDAP / magic-link / etc.)** — Defer to v2 docs in the downstream backend project. v1 prescribes the current contract only.
- **Live runtime trace validation** — If drift between client expectations and deployed cloud is suspected later, capture-and-diff can be added as a v1.x patch or v2 prereq. Not a Phase 1 blocker.
- **Documenting hidden / undocumented OpenWhispr cloud endpoints** (admin, webhooks, internal APIs the client doesn't call) — Out of scope. The spec is client-driven; v2 only needs to satisfy what this client sends.
- **OpenAPI / JSON Schema machine-readable spec** — Not chosen for v1 (markdown tables + JSON examples instead). Could be a future enhancement if v2 wants generated client stubs.

</deferred>

---

*Phase: 01-wire-contract-documentation*
*Context gathered: 2026-05-08*
