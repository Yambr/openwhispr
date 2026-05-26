---
phase: 1
plan: 3
type: execute
wave: 2
depends_on: [01-01, 01-02]
files_modified:
  - docs/SELF_HOSTING.md
autonomous: true
requirements: [DOC-03]
must_haves:
  truths:
    - "docs/SELF_HOSTING.md exists in repo"
    - "A third-party / OSS contributor can read the doc top-to-bottom and stand up a minimal compatible OpenWhispr cloud backend without reading source code"
    - "The doc enumerates required endpoints, expected request/response payloads, the auth contract, and the OAuth flow"
    - "The doc cross-links to BACKEND_SPEC.md and OAUTH_SPEC.md (per Success Criterion 3 in ROADMAP)"
    - "Auth section is prescriptive (single contract, not pluggable) per D-14"
  artifacts:
    - path: "docs/SELF_HOSTING.md"
      provides: "End-to-end self-hosting walkthrough for external implementers"
      contains: "BACKEND_SPEC"
  key_links:
    - from: "docs/SELF_HOSTING.md"
      to: "docs/BACKEND_SPEC.md, docs/OAUTH_SPEC.md"
      via: "inline markdown links"
      pattern: "BACKEND_SPEC\\.md|OAUTH_SPEC\\.md"
---

<objective>
Produce `docs/SELF_HOSTING.md` — a top-to-bottom walkthrough for an external third party / OSS contributor to stand up a minimal compatible OpenWhispr cloud backend, covering required endpoints, expected payloads, the prescriptive auth contract, the OAuth flow, and edge cases.

Purpose: The reader's primary entry point. Self-sufficient (per D-12): some duplication with BACKEND_SPEC / OAUTH_SPEC is accepted so the reader doesn't have to bounce between three docs to get a working first-pass implementation.
Output: One markdown file at `docs/SELF_HOSTING.md`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/REQUIREMENTS.md
@.planning/phases/01-wire-contract-documentation/01-CONTEXT.md
@docs/BACKEND_SPEC.md
@docs/OAUTH_SPEC.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Write SELF_HOSTING.md walkthrough</name>
  <files>docs/SELF_HOSTING.md</files>
  <read_first>
    Read these files first (the two upstream plan outputs are the source of truth — duplicate / restructure rather than re-discover):
    - docs/BACKEND_SPEC.md (entire file — produced by Plan 01)
    - docs/OAUTH_SPEC.md (entire file — produced by Plan 02)
    - .planning/phases/01-wire-contract-documentation/01-CONTEXT.md (for D-12, D-13, D-14, D-15 — shape and tone of this doc)
    - .planning/REQUIREMENTS.md §DOC-03 (acceptance criteria)
    - CLAUDE.md (project guideline: docs live under `docs/`, no new deps)

    No source code reads required — all source-of-truth pointers already live in BACKEND_SPEC.md and OAUTH_SPEC.md.
  </read_first>
  <action>
    Create `docs/SELF_HOSTING.md` as a self-sufficient walkthrough. Per D-12 it is a FULL reference, not a quick-start. Per D-13 the audience is an external third party / OSS contributor — explain client architecture, auth model, and expected payloads from scratch; do NOT assume familiarity with OpenWhispr internals. Per D-14 the auth section prescribes a single contract — do NOT discuss pluggable strategies (LDAP, magic links, etc.). Per D-15 do NOT include sample server code.

    Required sections in order:

    1. `# Self-Hosting OpenWhispr Cloud`
       Intro paragraph: what this doc is, what it is not (no sample server, no pluggable auth design, no third-party AI API specs — those are vendor-documented). State that BACKEND_SPEC.md and OAUTH_SPEC.md are the machine-readable wire references; SELF_HOSTING is the human walkthrough.

    2. `## Audience and Scope`
       - Audience: external implementers building a drop-in OpenWhispr cloud backend.
       - In-scope: OpenWhispr cloud sign-in, account verification, account deletion, any other `/api/...` endpoints the client calls.
       - Out-of-scope: third-party AI APIs (vendor docs are authoritative), enterprise providers, hidden cloud endpoints the client never calls (per D-11), live trace validation (per D-09), reference backend code (per D-15).

    3. `## How the Client Talks to the Cloud`
       Plain-prose explanation (no code). Cover:
       - Build-time base URL: `VITE_OPENWHISPR_API_URL` is baked into the binary at build (cite that this becomes `OPENWHISPR_BACKEND_URL` in Phase 3 / CFG-04 — forward link).
       - All cloud calls are HTTPS JSON over `${OPENWHISPR_API_URL}/api/...`.
       - Two call paths exist: renderer-direct fetch() and main-process IPC handler. Both end up hitting the same URLs from the server's perspective.
       - The custom protocol `openwhispr://` is how the cloud sends the user back to the desktop app after sign-in. Channels: `openwhispr` / `openwhispr-dev` / `openwhispr-staging`.
       - Cross-link: see `docs/BACKEND_SPEC.md` for per-endpoint detail.

    4. `## Required Endpoints`
       For each cloud endpoint enumerated in BACKEND_SPEC.md `## OpenWhispr Cloud Endpoints`, restate the contract here in walkthrough form. Per endpoint:
       - One paragraph explaining when and why the client calls it.
       - Method + URL.
       - Request body example (JSON code block — copy from BACKEND_SPEC).
       - Response body example (JSON code block — copy from BACKEND_SPEC).
       - Status codes the server SHOULD return and how the client reacts to each.

       Minimum endpoints (derive the actual full list from BACKEND_SPEC.md `## OpenWhispr Cloud Endpoints`):
       - `POST /api/check-user` — user existence / sign-in initiation
       - `GET /api/auth/verification-status` — post-sign-in polling
       - `DELETE /api/auth/delete-account` — account deletion

       If BACKEND_SPEC.md documents additional endpoints (it should — Plan 01 discovers them), include them here too.

    5. `## Authentication Contract` (PRESCRIPTIVE per D-14)
       This section describes the EXACT auth contract the desktop client expects. Do NOT discuss alternative auth strategies (LDAP, magic-link, etc.) — those are deferred to v2 in a separate repo.

       Required subsections:
       - `### Token format` — what the client expects to receive (string token; documented header it is sent as on subsequent requests; cross-link to BACKEND_SPEC `## Conventions`).
       - `### Sign-in response payload` — what JSON shape the cloud must return when the user completes sign-in in the browser; what URL the cloud must redirect the user's browser to (the `openwhispr://...?token=...` pattern from OAUTH_SPEC).
       - `### Token storage` — note that the client persists the token via `tokenStore.js` (file pointer); server-side this means the token must be long-lived enough to survive between launches, or the server must support refresh.
       - `### Token refresh / 401 handling` — describe the `withSessionRefresh` retry-once behavior on 401 the client uses; the server SHOULD return 401 when the token is invalid/expired.
       - `### Account deletion` — describe what the client expects after a successful `DELETE /api/auth/delete-account`.

       At the END of this section add: "v2 LDAP / alternative identity providers should issue a token in the SAME shape so the client's auth surface stays unchanged. This document does not enumerate alternative auth strategies; it prescribes the single contract the current client requires."

    6. `## OAuth Flow Walkthrough`
       Restate the OpenWhispr cloud sign-in OAuth flow from OAUTH_SPEC.md `## OpenWhispr Cloud Sign-In` step-by-step in prose:
       1. User clicks Sign In in the desktop app.
       2. App opens the OS default browser at `${OPENWHISPR_API_URL}/...` (or `${VITE_AUTH_URL}` — cite which).
       3. Cloud handles sign-in (whatever mechanism the implementer chooses — Google, email, etc.).
       4. Cloud redirects the browser to `openwhispr://...?token=...` (channel-specific).
       5. OS hands the URL to the desktop app via the registered protocol handler.
       6. Main process parses the URL and forwards the token to the renderer via IPC.
       7. Renderer persists the token via `tokenStore.js`.
       8. App calls `GET /api/auth/verification-status` until the cloud returns success (or the user verifies via email).

       Then a subsection `### Custom Protocol Channel Variants` listing the three channel-scoped schemes and which build channel uses which (cite OAUTH_SPEC.md). Implementers must build the redirect URL using the matching channel.

       Then a subsection `### Google Calendar` summarizing the Calendar OAuth flow at a high level + cross-link to OAUTH_SPEC.md `## Google Calendar` for full detail. Note that the Google Calendar OAuth flow is between the desktop client and Google directly — the self-hosted cloud has no role in it.

    7. `## Minimum Viable Backend Checklist`
       A bulleted task list an implementer can work through:
       - [ ] HTTPS endpoint serving `${OPENWHISPR_BACKEND_URL}/api/...`
       - [ ] Implements `POST /api/check-user` per BACKEND_SPEC
       - [ ] Implements `GET /api/auth/verification-status` per BACKEND_SPEC
       - [ ] Implements `DELETE /api/auth/delete-account` per BACKEND_SPEC
       - [ ] Returns 401 on invalid/expired tokens (so client's withSessionRefresh path triggers)
       - [ ] Honors the global error envelope (cross-link to BACKEND_SPEC `## Global Error Envelope`)
       - [ ] Sign-in completion redirects browser to `openwhispr://...?token=...` using the build channel's protocol scheme
       - [ ] Tokens are usable as `Authorization: Bearer ...` (or whatever header BACKEND_SPEC documents)
       - [ ] Any additional `/api/...` endpoints discovered by BACKEND_SPEC are implemented

       (List item count must reflect actual endpoint count after BACKEND_SPEC is finalized — adjust during execution.)

    8. `## Edge Cases and Quirks`
       Surface the client-observable behaviors an implementer needs to know:
       - Email verification polling cadence (cross-link to EmailVerificationStep notes in BACKEND_SPEC)
       - 401 retry-once behavior via `withSessionRefresh`
       - Channel-specific protocol scheme — building the wrong scheme means the redirect never reaches the app
       - Behavior when the OpenWhispr cloud is unreachable: client falls back / shows error (describe based on what BACKEND_SPEC documents)
       - HTTPS required (no plaintext HTTP supported by the client)

    9. `## Cross-References`
       - `docs/BACKEND_SPEC.md` — full per-endpoint contract with source-pointer annotations
       - `docs/OAUTH_SPEC.md` — full OAuth provider catalogue including the OpenWhispr cloud sign-in entry
       - `.planning/REQUIREMENTS.md` — milestone scope; this doc satisfies DOC-03

    10. `## Future Work (out of scope for v1)`
        Per D-15: a reference backend implementation belongs in v2 / a separate companion repo. Per D-14: pluggable auth strategies (LDAP, magic links) are v2 docs in the downstream backend project. Per D-09: live runtime trace validation is a possible future v1.x patch but not a v1 deliverable.

    Constraints:
    - Markdown only — no OpenAPI / JSON Schema (D-05).
    - Per D-15: NO sample server code blocks. JSON request/response examples (which describe the wire format, not server logic) are fine and required.
    - Per D-13: write for someone who has never seen the OpenWhispr code. Define terms before using them.
    - Per D-12: it is OK to repeat content from BACKEND_SPEC.md and OAUTH_SPEC.md — SELF_HOSTING.md is meant to be readable end-to-end without bouncing.
    - Cross-references to the other two docs MUST appear (use relative paths like `./BACKEND_SPEC.md`, `./OAUTH_SPEC.md`).
  </action>
  <verify>
    <automated>test -f docs/SELF_HOSTING.md && grep -q '^## Required Endpoints' docs/SELF_HOSTING.md && grep -q '^## Authentication Contract' docs/SELF_HOSTING.md && grep -q '^## OAuth Flow Walkthrough' docs/SELF_HOSTING.md && grep -q '^## Minimum Viable Backend Checklist' docs/SELF_HOSTING.md && grep -q '^## Audience and Scope' docs/SELF_HOSTING.md && grep -q '^## Edge Cases and Quirks' docs/SELF_HOSTING.md && grep -q '^## Cross-References' docs/SELF_HOSTING.md && grep -q 'BACKEND_SPEC' docs/SELF_HOSTING.md && grep -q 'OAUTH_SPEC' docs/SELF_HOSTING.md && grep -q '/api/check-user' docs/SELF_HOSTING.md && grep -q '/api/auth/verification-status' docs/SELF_HOSTING.md && grep -q '/api/auth/delete-account' docs/SELF_HOSTING.md && grep -q 'openwhispr://' docs/SELF_HOSTING.md && grep -q 'openwhispr-dev' docs/SELF_HOSTING.md && grep -q 'openwhispr-staging' docs/SELF_HOSTING.md && ! grep -qE '^openapi:|"openapi"' docs/SELF_HOSTING.md && ! grep -qE '\bLDAP\b|\bmagic[ -]?link\b' <(sed -n '/^## Authentication Contract/,/^## /p' docs/SELF_HOSTING.md | head -n -1 | sed '$d')</automated>
  </verify>
  <acceptance_criteria>
    - File exists: `test -f docs/SELF_HOSTING.md`
    - Contains required section headings: `## Audience and Scope`, `## Required Endpoints`, `## Authentication Contract`, `## OAuth Flow Walkthrough`, `## Minimum Viable Backend Checklist`, `## Edge Cases and Quirks`, `## Cross-References`
    - Contains references to `BACKEND_SPEC` and `OAUTH_SPEC` (cross-links per ROADMAP Success Criterion 3)
    - Restates required endpoints by name: `/api/check-user`, `/api/auth/verification-status`, `/api/auth/delete-account`
    - Mentions custom protocol scheme `openwhispr://` and channel variants `openwhispr-dev`, `openwhispr-staging`
    - NO OpenAPI tooling
    - Authentication Contract section does NOT mention "LDAP" or "magic link" (per D-14 — auth is prescriptive, not pluggable; alternatives belong in v2 docs)
  </acceptance_criteria>
  <done>
    `docs/SELF_HOSTING.md` exists; reads top-to-bottom as a self-sufficient walkthrough; cross-links to BACKEND_SPEC.md and OAUTH_SPEC.md; auth section is prescriptive (no pluggable strategies); no sample server code; minimum-viable-backend checklist enumerates every required endpoint.
  </done>
</task>

</tasks>

<verification>
- `docs/SELF_HOSTING.md` exists with all required section headings.
- Cross-links to `BACKEND_SPEC.md` and `OAUTH_SPEC.md` are present (ROADMAP Phase 1 Success Criterion 3).
- Authentication contract is prescriptive (no LDAP / magic-link discussion in that section per D-14).
- Custom protocol channels documented.
- All endpoints from BACKEND_SPEC.md `## OpenWhispr Cloud Endpoints` appear in the `## Required Endpoints` section and the minimum-viable-backend checklist.
</verification>

<success_criteria>
DOC-03 satisfied: an external third party can read `docs/SELF_HOSTING.md` end-to-end and stand up a minimum compatible OpenWhispr cloud backend, with the other two docs available as deeper reference. ROADMAP Phase 1 Success Criteria 1, 2, 3 are jointly satisfied across the three plans.
</success_criteria>

<output>
After completion, create `.planning/phases/01-wire-contract-documentation/01-03-SUMMARY.md` per the summary template.
</output>
