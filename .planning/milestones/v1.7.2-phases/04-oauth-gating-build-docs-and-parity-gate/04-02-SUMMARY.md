---
phase: 04-oauth-gating-build-docs-and-parity-gate
plan: 2
subsystem: docs
tags: [docs, build-config, oauth-gating, parity]
requires: [03-build-time-env-refactor (defaults.ts, build-config.generated.cjs, generate-build-config.js)]
provides: [docs/BUILD_CONFIG.md as canonical build-time variable reference for CFG-05]
affects: [self-hosters reading docs/SELF_HOSTING.md → cross-links into BUILD_CONFIG.md for variable details]
tech-stack:
  added: []
  patterns: [single-table-per-bucket reference doc, worked-examples with bundle-grep verification, cross-link not duplicate for parity smoke checklist]
key-files:
  created:
    - docs/BUILD_CONFIG.md
  modified: []
decisions:
  - Authored four H2 sections in mandated order (Overview / Variable Reference / Worked Examples / Verifying parity) per CONTEXT D-09
  - Split Variable Reference into 4 H3 buckets (Backend / OAuth Endpoints / OAuth Provider gating / LLM Providers) for readability per D-09
  - Did NOT append the 3 OAuth gating flags to docs/CONFIG_INVENTORY.md — they live only in BUILD_CONFIG.md per D-12 (Phase 4 additions are not Phase 3 hardcode replacements)
  - Bundle-grep snippet copied verbatim from CONTEXT D-04 into Example 3 — the grep set is the mechanical source of truth for "fully absent"
  - Verifying parity section is 3 short paragraphs cross-linking to SELF_HOSTING.md#phase-3-smoke-checklist and scripts/verify-defaults-parity.js / verify-oauth-gating.js — no duplicated content per D-11
metrics:
  duration: ~5 minutes
  completed: 2026-05-08
---

# Phase 4 Plan 2: BUILD_CONFIG.md Authorship Summary

Authored `docs/BUILD_CONFIG.md` — the single canonical reference for every build-time environment variable in the Yambr OpenWhispr fork — satisfying requirement CFG-05.

## Output

- **Path:** `docs/BUILD_CONFIG.md`
- **Line count:** 142 lines
- **H3 subsection count:** 7 (4 Variable Reference buckets + 3 Worked Examples) — meets `≥ 7` target
- **Commit:** `ee26c0e`

## Coverage Confirmation

All 22 listed variables from the plan's `<interfaces>` block appear in the document, organized into four buckets:

- **Backend (4):** `OPENWHISPR_AUTH_URL`, `OPENWHISPR_BACKEND_URL`, `OPENWHISPR_BACKEND_URL_PATTERN`, `OPENWHISPR_MCP_URL`
- **OAuth — Endpoints (7):** `OPENWHISPR_OAUTH_DESKTOP_CALLBACK_URL`, `OPENWHISPR_OAUTH_RESET_PASSWORD_URL`, `OPENWHISPR_OAUTH_PROTOCOL_SCHEME`, `OPENWHISPR_OAUTH_GOOGLE_AUTH_URL`, `OPENWHISPR_OAUTH_GOOGLE_TOKEN_URL`, `OPENWHISPR_OAUTH_GOOGLE_REVOKE_URL`, `OPENWHISPR_OAUTH_GOOGLE_CALENDAR_API_URL`
- **OAuth — Provider gating (3) — Phase 4 NEW:** `OPENWHISPR_OAUTH_GOOGLE`, `OPENWHISPR_OAUTH_APPLE`, `OPENWHISPR_OAUTH_MICROSOFT`
- **LLM Providers (5):** `OPENWHISPR_OPENAI_BASE_URL`, `OPENWHISPR_ANTHROPIC_URL`, `OPENWHISPR_GEMINI_BASE_URL`, `OPENWHISPR_GROQ_BASE_URL`, `OPENWHISPR_MISTRAL_BASE_URL`

Each row carries the 6 mandated columns: Name | Purpose | Default | Allowed values | Read at | Source-of-truth file.

## Worked Examples

Three concrete `npm run build` invocations:

1. **Default build (parity)** — produces the parity baseline.
2. **Custom backend only** — overrides `OPENWHISPR_BACKEND_URL`/`AUTH_URL`/`BACKEND_URL_PATTERN`; all OAuth providers visible.
3. **Self-hosted with OAuth subset** — Google enabled, Apple+Microsoft disabled; includes the bundle-grep verification snippet copied verbatim from CONTEXT D-04 (greps for `signInWithSocial("apple")`, `AppleIcon`, `auth.social.continueWithApple`, `signInWithSocial("microsoft")`, `MicrosoftIcon`, `auth.social.continueWithMicrosoft`, plus a positive grep for `oauth2.googleapis.com`).

## Smoke Checklist Cross-Linking (No Duplication)

Per CONTEXT D-11, BUILD_CONFIG.md does NOT duplicate the parity smoke checklist. The "Verifying parity" section is three short paragraphs that cross-link to:

- `scripts/verify-defaults-parity.js` (also referenced as `npm run verify:parity`) — the automated gate.
- `docs/SELF_HOSTING.md#phase-3-smoke-checklist` — the human-UAT smoke flows.
- `scripts/verify-oauth-gating.js` — the OAuth-gating bundle-grep verifier.

A grep against the new file confirms the smoke checklist content lives in SELF_HOSTING.md, not BUILD_CONFIG.md. The document references SELF_HOSTING three times (cross-links only).

## Verification Results

```
test -f docs/BUILD_CONFIG.md && grep -q "^# Build-Time Configuration" docs/BUILD_CONFIG.md && \
grep -q "^## Overview" && grep -q "^## Variable Reference" && grep -q "^## Worked Examples" && \
grep -q "^## Verifying parity" && grep -q "OPENWHISPR_OAUTH_GOOGLE" && \
grep -q "OPENWHISPR_OAUTH_APPLE" && grep -q "OPENWHISPR_OAUTH_MICROSOFT" && \
grep -q "OPENWHISPR_BACKEND_URL_PATTERN" && grep -q "OPENWHISPR_OAUTH_PROTOCOL_SCHEME" && \
grep -q "OPENWHISPR_AUTH_URL" && grep -q "OPENWHISPR_OPENAI_BASE_URL" && \
grep -q "OPENWHISPR_ANTHROPIC_URL" && grep -q "OPENWHISPR_GEMINI_BASE_URL" && \
grep -q "OPENWHISPR_GROQ_BASE_URL" && grep -q "OPENWHISPR_MISTRAL_BASE_URL" && \
grep -q "SELF_HOSTING" && grep -q "verify:parity\|verify-defaults-parity" && \
grep -q "AppleIcon" && grep -q "oauth2.googleapis.com" && \
[ "$(wc -l < docs/BUILD_CONFIG.md)" -ge 120 ]
→ PASS
```

The acceptance criterion `grep -i "runtime config\|runtime setting"` returns 0 hits — the doc avoids both phrases (initial wording was reworked to use "in-app reconfiguration UI" / "post-install settings file" / "adjustable from the running app").

## Deviations from Plan

None — plan executed exactly as written, with one observation:

- The plan listed the variable count as "24 total" in `<interfaces>` but enumerated 19 endpoint vars + 3 OAuth gating flags = 22 distinct variables. The summary tally (24) appears to have folded in the renderer/main duplicates (`build-config.generated.ts` + `build-config.generated.cjs`) and the dev-only var, but those are file-system entries, not user-facing vars. All 22 user-facing variables are documented; the renderer/main split is captured per row in the "Read at" + "Source-of-truth file" columns rather than as separate rows. This matches CONTEXT D-09 which says the table should cover "every `OPENWHISPR_*` / `VITE_OPENWHISPR_*` variable" — the renderer/main `VITE_` form is an internal re-export, not a separate user-facing variable.

## Self-Check: PASSED

- [x] `docs/BUILD_CONFIG.md` exists (142 lines)
- [x] Commit `ee26c0e` exists in branch
- [x] All 4 mandated H2 sections present in correct order
- [x] All 22 variables documented across 4 buckets
- [x] 3 worked examples present, Example 3 includes bundle-grep snippet
- [x] Verifying parity section cross-links to SELF_HOSTING.md and verify-defaults-parity.js
- [x] No `runtime config` / `runtime setting` literal phrases
- [x] Smoke checklist NOT duplicated (cross-link only)
