# Phase 1: Wire Contract Documentation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in `01-CONTEXT.md` — this log preserves the alternatives considered.

**Date:** 2026-05-08
**Phase:** 01-wire-contract-documentation
**Areas discussed:** Spec scope boundary, Spec format / rigor, Reverse-engineering depth, SELF_HOSTING.md shape

---

## Spec Scope Boundary

### Q: Should BACKEND_SPEC.md document third-party APIs (OpenAI, Anthropic, Gemini) in detail, or just point to vendor docs?

| Option | Description | Selected |
|--------|-------------|----------|
| Point to vendor docs only | List provider + base URL + auth header + file:line, link to vendor docs | |
| Document fully alongside OpenWhispr cloud | Treat them as part of the wire surface; full schemas | (initial pick, walked back) |
| Inventory only (one-liner per call) | file:line, method, URL, purpose; no payload schemas | ✓ (after clarification) |

**User's choice:** Inventory only.
**Notes:** User initially picked "Document fully" but in a follow-up free-text answer wrote "хочу только свайпнуть openwhispr cloud, остальное на этом этапе не трогать" — only OpenWhispr cloud is the v2 swap target. Resolved with a clarifying question: minimal inventory for everything that is NOT OpenWhispr cloud.

### Q: What about Google Calendar API specifically?

| Option | Description | Selected |
|--------|-------------|----------|
| Document the OpenWhispr-Google contract only | OAuth detailed; payloads link to Google docs | ✓ |
| Document Google Calendar payloads in detail | Full RE of request/response shapes | |

**User's choice:** OpenWhispr-Google contract only.

### Q: Enterprise endpoints (Bedrock / Azure OpenAI / Vertex) — same treatment as cloud BYOK or as own-cloud?

| Option | Description | Selected |
|--------|-------------|----------|
| Treat as third-party (point to vendor docs) | Env vars + auth wiring + file references; vendor owns wire format | |
| Treat as own-cloud (full RE) | Document everything in case of self-hosted Bedrock-shaped proxy | |
| Inventory + auth only | Config surface only, no payload details | ✓ (via the clarifying question) |

**User's choice:** Inventory only — same as third-party BYOK.
**Notes:** Captured via the follow-up "Non-OW cloud" clarification question.

### Q: OAUTH_SPEC scope — every OAuth client ID location, or just current providers?

| Option | Description | Selected |
|--------|-------------|----------|
| Every provider currently in source | Enumerate Google Calendar + OpenWhispr cloud + any others (Apple, etc.) | ✓ |
| Only OpenWhispr cloud sign-in | Narrower scope; Calendar OAuth treated as feature, not core auth | |

**User's choice:** Every provider currently in source. Sets up CFG-03 (per-provider gating in Phase 4) cleanly.

---

## Spec Format / Rigor

### Q: What format for the OpenWhispr cloud endpoint specs in BACKEND_SPEC.md?

| Option | Description | Selected |
|--------|-------------|----------|
| Structured tables + JSON examples | Markdown table per endpoint + fenced JSON request/response blocks | ✓ |
| Full OpenAPI 3.1 schema | Checked-in `openapi.yaml`, machine-validatable | |
| Prose with code excerpts | Narrative + actual fetch() snippets from source | |
| Tables + JSON Schema (no OpenAPI) | Schemas for bodies, lighter than OpenAPI | |

**User's choice:** Structured tables + JSON examples.

### Q: Where do request/response shapes come from — derived from TS types or hand-written?

| Option | Description | Selected |
|--------|-------------|----------|
| Hand-written from observation | Read call sites + handlers; write schemas by hand | ✓ |
| Derived from existing TS types where they exist | Paste/reference typed interfaces; partial coverage | |
| Generate from runtime trace | Capture real payloads, infer schema | |

**User's choice:** Hand-written from observation.

### Q: Source-of-truth pointer in each endpoint entry — how granular?

| Option | Description | Selected |
|--------|-------------|----------|
| `file:line` of fetch() call + handler function | Exact pointer; trivial drift detection via grep | ✓ |
| File only, no line | Cheaper to maintain; harder to verify | |
| Permalink to GitHub at commit SHA | Frozen; needs SHA refresh whenever spec is updated | |

**User's choice:** file:line of fetch() + handler.

### Q: Error responses — documented per-endpoint or as a global error model?

| Option | Description | Selected |
|--------|-------------|----------|
| Global error model + per-endpoint deviations | Common envelope at top + inline notes for outliers | ✓ |
| Per-endpoint full error list | Self-contained per endpoint; verbose | |
| Skip errors at v1 (TODO for v2) | Lighter; v2 derives from source | |

**User's choice:** Global error model + per-endpoint deviations.

---

## Reverse-Engineering Depth

### Q: Capture a live runtime trace of OpenWhispr cloud requests/responses, or rely on source reading alone?

| Option | Description | Selected |
|--------|-------------|----------|
| Source-only, no live trace | Code IS the contract | ✓ |
| Optional trace for cheap-to-hit endpoints | Selective verification | |
| Mandatory live trace for every endpoint | Most accurate; needs full auth flow | |

**User's choice:** Source-only.

### Q: How deep on cloud-side behavior we can't see from client (rate limits, retry, async jobs)?

| Option | Description | Selected |
|--------|-------------|----------|
| Document only what client observes | Spec stays grounded in observable behavior | ✓ |
| Speculate from client retry/timeout logic | Useful for v2 to match expectations; risk of guessing | |
| Defer to v2 (mark as TBD) | Server-side concerns are v2's call | |

**User's choice:** Document only what client observes.

### Q: Hunt for undocumented OpenWhispr cloud endpoints we don't call?

| Option | Description | Selected |
|--------|-------------|----------|
| No — spec is client-driven only | Wire surface = whatever this client sends | ✓ |
| Hunt via runtime trace + browser network tab | Discover everything reachable | |

**User's choice:** No — client-driven only.

---

## SELF_HOSTING.md Shape

### Q: What shape should SELF_HOSTING.md take?

| Option | Description | Selected |
|--------|-------------|----------|
| Quick-start + reference links | Short doc; minimum endpoints + links to BACKEND_SPEC / OAUTH_SPEC | |
| Full reference (every endpoint, edge case) | Comprehensive walkthrough; some duplication accepted | ✓ |
| Minimal pointer doc | One page: "read BACKEND_SPEC.md and OAUTH_SPEC.md" | |
| Hybrid: quick-start + worked example with sample server | Quick-start + TypeScript Express stub | |

**User's choice:** Full reference.
**Notes:** Diverged from Claude's recommended quick-start. User wants SELF_HOSTING to be the third-party reader's primary entry point, self-sufficient even if they never open BACKEND_SPEC / OAUTH_SPEC.

### Q: Who is the primary reader of SELF_HOSTING.md?

| Option | Description | Selected |
|--------|-------------|----------|
| Internal v2 team (us) | Optimize for someone who already knows client architecture | |
| External third party (OSS contributor) | Explain client behavior + auth from scratch | ✓ |
| Both equally | Sections for orientation + quick-reference tables | |

**User's choice:** External third party / OSS contributor.

### Q: Auth model section — prescriptive or pluggable?

| Option | Description | Selected |
|--------|-------------|----------|
| Prescriptive: describe the current auth contract | Document what the client expects; v2 implements to match | ✓ |
| Pluggable: discuss multiple auth strategies | Anticipate LDAP / magic-link variants | |

**User's choice:** Prescriptive.

### Q: Include a "minimum viable backend" code stub?

| Option | Description | Selected |
|--------|-------------|----------|
| No — spec is enough | Stub is its own implementation task; risks drift | ✓ |
| Yes — minimal Express/Hono stub | Concrete code helps; maintenance burden | |
| Yes — but in a separate companion repo (out of scope) | Note as future v2 deliverable | |

**User's choice:** No sample server stub.

---

## Claude's Discretion

The following were deliberately left to Claude during planning/execution:

- Internal table-of-contents and heading hierarchy of each of the three docs
- Whether OAUTH_SPEC.md and BACKEND_SPEC.md cross-reference each other inline or only via SELF_HOSTING.md
- Markdown formatting / table layout details
- Whether to use a unified "endpoint card" template across docs or let each evolve separately

## Deferred Ideas

- Reference backend implementation (sample server stub) — out of scope for v1, belongs in v2 / companion repo
- Pluggable auth strategy documentation (LDAP / magic-link) — defer to v2 docs
- Live runtime trace validation — could be added later if client/server drift is suspected
- Hunting for hidden cloud endpoints — out of scope; spec is client-driven
- OpenAPI / JSON Schema machine-readable spec — not chosen for v1; possible future enhancement
