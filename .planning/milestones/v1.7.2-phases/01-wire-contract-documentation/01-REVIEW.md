---
phase: 01-wire-contract-documentation
reviewed: 2026-05-08T00:00:00Z
depth: quick
files_reviewed: 3
files_reviewed_list:
  - docs/BACKEND_SPEC.md
  - docs/OAUTH_SPEC.md
  - docs/SELF_HOSTING.md
findings:
  critical: 0
  warning: 0
  info: 1
  total: 1
status: issues_found
---

# Phase 1: Code Review Report

**Reviewed:** 2026-05-08
**Depth:** quick (docs-only adaptation)
**Files Reviewed:** 3
**Status:** issues_found (one info-level inconsistency)

## Summary

Phase 1 is a docs-only phase delivering three reverse-engineered wire-contract artifacts: `BACKEND_SPEC.md` (per-endpoint cloud contract), `OAUTH_SPEC.md` (OAuth provider catalogue), and `SELF_HOSTING.md` (narrative walkthrough). A traditional source-code security/bug review does not apply.

Reviewed for what IS reviewable in documentation at quick depth:

- **Internal consistency between the three docs** — terminology, endpoint names, status-code semantics, channel-variant scheme names, custom-protocol URL shapes, token-storage locations all agree across files.
- **Cross-link correctness** — relative links between the three docs resolve. Inbound anchors used from `SELF_HOSTING.md` (e.g., `BACKEND_SPEC.md#post-apicheck-user`, `BACKEND_SPEC.md#delete-apiauthdelete-account`, `BACKEND_SPEC.md#global-error-envelope`, `OAUTH_SPEC.md#openwhispr-cloud-sign-in`, `OAUTH_SPEC.md#custom-protocol-reference`) match GitHub-flavored slug rules for the corresponding headings. Forward-looking links (`BUILD_CONFIG.md` "forthcoming"; `../.planning/REQUIREMENTS.md` and `../.planning/ROADMAP.md`) are explicitly flagged as such or are committed roadmap artifacts.
- **Fenced-block / table syntax** — all JSON/code fences open and close cleanly; markdown tables are well-formed.
- **Factual contradictions** — none found between the three files. Auth-header semantics, error envelope, 401/503 retry behavior, channel-scheme list, and token-storage descriptions are stated identically (or as deliberate per-endpoint deviations).

One numeric inconsistency was found and is recorded below as info.

## Info

### IN-01: Endpoint count claim disagrees with documented endpoints

**File:** `docs/SELF_HOSTING.md:67`
**Issue:** The walkthrough states "The current desktop client calls 19 distinct OpenWhispr cloud endpoints plus a generic passthrough channel." A direct count of dedicated endpoint cards in `BACKEND_SPEC.md` § OpenWhispr Cloud Endpoints yields 22:

1. `POST /api/check-user`
2. `GET /api/auth/verification-status`
3. `DELETE /api/auth/delete-account`
4. `POST /api/transcribe`
5. `GET /api/health`
6. `POST /api/reason`
7. `POST /api/agent/stream`
8. `POST /api/agent/web-search`
9. `POST /api/streaming-usage`
10. `GET /api/usage`
11. `GET /api/stt-config`
12. `GET /api/note-recording-config`
13. `POST /api/streaming-token`
14. `POST /api/deepgram-streaming-token`
15. `POST /api/openai-realtime-token`
16. `POST /api/stripe/checkout`
17. `POST /api/stripe/portal`
18. `POST /api/stripe/switch-plan`
19. `POST /api/stripe/preview-switch`
20. `GET /api/referrals/stats`
21. `POST /api/referrals/invite`
22. `GET /api/referrals/invites`

The "Operational / quota endpoints (recommended)" table in the same `SELF_HOSTING.md` (lines 141-159) lists 19 rows, which is plausibly the source of the "19" figure — but that table excludes the three auth-lifecycle endpoints documented immediately above it. Total cloud endpoints documented is 22 (auth lifecycle: 3 + operational: 19), not 19.

This will not mislead a careful implementer (the BACKEND_SPEC table of contents and the MVB checklist in `SELF_HOSTING.md` § Minimum Viable Backend Checklist enumerate everything correctly), but the headline count is off and could confuse a skim-reader.

**Fix:** Update `docs/SELF_HOSTING.md:67` to:

> "The current desktop client calls 22 distinct OpenWhispr cloud endpoints plus a generic passthrough channel."

Or, if the intent was to count only the operational/quota endpoints separately from the three auth-lifecycle endpoints, rephrase to: "The current desktop client calls 3 auth-lifecycle endpoints plus 19 operational/quota endpoints (22 total) plus a generic passthrough channel."

---

_Reviewed: 2026-05-08_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: quick_
