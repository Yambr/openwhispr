# Phase 1: Backend URL SoT Consolidation + Dynamic Better Auth — PLAN

**Created:** 2026-05-26
**Phase goal (from SPEC.md):** The renderer reads exactly one build-time variable for the backend host (`OPENWHISPR_BACKEND_URL`), and the Better Auth client respects runtime changes to a persisted Server URL setting — without altering byte-identical behavior for ordinary `openwhispr.yambr.com` users.
**Plans:** 7 plans (TDD-first, atomic commit per plan)

## Plan Index

| # | File | Wave | Requirements | Acceptance criteria covered |
|---|------|------|--------------|------------------------------|
| 01-01 | [01-01-tests-red-PLAN.md](./01-01-tests-red-PLAN.md) | Wave 0 — TDD red | — | tests authored failing |
| 01-02 | [01-02-host-03-sweep-PLAN.md](./01-02-host-03-sweep-PLAN.md) | Wave 1 | HOST-03 | AC-3, AC-4, AC-5, AC-6 (3 grep + CONFIG_INVENTORY rows) |
| 01-03 | [01-03-host-01-renderer-PLAN.md](./01-03-host-01-renderer-PLAN.md) | Wave 2 | HOST-01 (renderer) | AC-1, AC-2 partial (renderer side) |
| 01-04 | [01-04-host-01-main-PLAN.md](./01-04-host-01-main-PLAN.md) | Wave 3 | HOST-01 (main) + HOST-02 plumbing | AC-1, AC-2 (main side) |
| 01-05 | [01-05-host-02-proxy-PLAN.md](./01-05-host-02-proxy-PLAN.md) | Wave 4 | HOST-02 | AC-7, AC-8 |
| 01-06 | [01-06-release-yml-PLAN.md](./01-06-release-yml-PLAN.md) | Wave 5 | HOST-01 (CI) | AC-10 |
| 01-07 | [01-07-verification-PLAN.md](./01-07-verification-PLAN.md) | Wave 6 — green | all | AC-9 (live verify), full gate sweep |

## Acceptance Criteria → Plan Map

From SPEC.md acceptance section:

| AC | Description | Plan |
|----|-------------|------|
| AC-1 | `grep OPENWHISPR_API_URL` zero matches | 01-03 + 01-04 |
| AC-2 | `grep VITE_OPENWHISPR_API_URL` zero in src/scripts/.github | 01-03 + 01-04 + 01-06 |
| AC-3 | `https://openwhispr.com/auth/desktop-callback` only in defaults.ts/generated | 01-02 |
| AC-4 | `https://openwhispr.com/reset-password` only in defaults.ts/generated | 01-02 |
| AC-5 | `https://notes.openwhispr.com` only in defaults.ts/generated | 01-02 |
| AC-6 | CONFIG_INVENTORY.md has 3 new rows | 01-02 |
| AC-7 | `git diff upstream/main -- src/lib/auth.ts` shows only internal diffs | 01-05 (verified in 01-07) |
| AC-8 | Renderer integration test for runtime URL change | 01-01 (RED) + 01-05 (GREEN) |
| AC-9 | Default-build smoke against `openwhispr.yambr.com` works live | 01-07 |
| AC-10 | release.yml simplified, CI still produces signed/notarized artifact | 01-06 + 01-07 |

## Hard Rules (Carry Forward to Every Plan)

- **`[upstream_parity]`**: any plan touching `src/lib/auth.ts` MUST end with `git diff upstream/main -- src/lib/auth.ts | grep -E "^[-+]export"` returning empty. Internal-implementation diffs only.
- **`[client_immutable]`**: no edits to `../openwhispr-server/`. Server-side env-var findings surfaced in SUMMARY only.
- **`[live_verification_over_green_tests]`**: 01-07 must include CDP-driven live verify against packed app per `[[cdp_renderer_debug]]`.
- **`[rolldown_tree_shake]`**: new `defaults.ts` exports use direct named re-export.
- **TDD discipline**: 01-01 produces RED tests. Subsequent plans turn them GREEN only as their own code change lands.

## Execution Order

Strict serial: 01-01 → 01-02 → 01-03 → 01-04 → 01-05 → 01-06 → 01-07.

Plans 01-02..01-05 each commit independently and may be temporarily out of step (e.g., 01-03 deletes `OPENWHISPR_API_URL` from `constants.ts` before 01-04 collapses `getApiUrl()` in main). The repo is in a "build-but-not-launch-stable" state between commits in 01-03 through 01-04. **Do not interrupt the chain** — finish through 01-05 before running the app manually.

## Out-of-Scope (Carried from SPEC.md)

- Onboarding UI for entering Server URL (Phase 4)
- Build-time gate `OPENWHISPR_ALLOW_CUSTOM_HOST` (Phase 3)
- Policy ADR amendment (Phase 2)
- Reachability probe + validation logic (Phase 4)
- i18n keys for UI (Phase 4)
- Full E2E + signed/notarized verification (Phase 5)

---

_Phase: 01-backend-url-sot-consolidation-dynamic-better-auth_
_Plan created: 2026-05-26_
_Next: /gsd-execute-phase 1_
