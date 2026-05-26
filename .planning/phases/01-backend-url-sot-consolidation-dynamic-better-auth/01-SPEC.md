# Phase 1: Backend URL SoT Consolidation + Dynamic Better Auth — Specification

**Created:** 2026-05-26
**Ambiguity score:** 0.10 (gate: ≤ 0.20)
**Requirements:** 3 locked (HOST-01, HOST-02, HOST-03)

## Goal

The renderer reads exactly one build-time variable for the backend host (`OPENWHISPR_BACKEND_URL`), and the Better Auth client respects runtime changes to a persisted Server URL setting — without altering byte-identical behavior for ordinary `openwhispr.yambr.com` users.

## Background

Three independent integration findings from the v1.7.2 audit (`.planning/v1.7.2-INTEGRATION-CHECK.md`) make this phase a non-negotiable prerequisite for the rest of v1.8.0:

**INT-02 (dual env-var channel for backend host).** The codebase carries two parallel variables for the same semantic:

- `OPENWHISPR_BACKEND_URL` (Phase 3 declared SoT, `src/config/defaults.ts:27`) — consumed only by `scripts/generate-build-config.js` (for WSS URL derivation), `main.js` webRequest allowlist, and `src/helpers/openaiRealtimeStreaming.js`. **The renderer never imports it.**
- `OPENWHISPR_API_URL` (from `env.VITE_OPENWHISPR_API_URL`, `src/config/constants.ts:116`) — what the renderer actually uses: `src/components/onboarding/AuthenticationStep.tsx` (lines 11, 164), `src/components/onboarding/EmailVerificationStep.tsx` (lines 3, 31), `src/lib/auth.ts` (lines 2, 120), and **26 call sites in `src/helpers/ipcHandlers.js`** via `getApiUrl()` (`ipcHandlers.js:3387-3391` reads three env-var sources in fallback order, none of them the declared SoT).

CI (`.github/workflows/release.yml:114-117, 128-131`) papers over by setting both vars to the same `vars.VITE_OPENWHISPR_API_URL`. Convention, not architecture. If v1.8.0 introduces a runtime Server URL field on top of this, the user types `acme.com`, the Better Auth bearer flow goes to `acme.com`, and the 26 `getApiUrl()` consumers continue hitting the build-time default.

**INT-01 (Better Auth client is a frozen module-singleton).** `src/lib/auth.ts:12` calls `createAuthClient({ baseURL: AUTH_URL })` at module load. `AUTH_URL = import.meta.env.VITE_AUTH_URL || "https://auth.openwhispr.com"` is build-time-only via Vite `define`. Every renderer consumer captures the same `authClient` instance at first import; the `baseURL` cannot be changed at runtime. `git log -1 -L12,12:src/lib/auth.ts` shows commit `56f4efb8` (upstream OpenWhispr "switch desktop to Better Auth + add Microsoft sign-in"), authored by Gabriel Stein — this is **upstream-origin code**, not Yambr-fork drift. Per `[upstream_parity]` rule, refactor must preserve byte-identical API surface to minimize future merge cost.

**INT-03, INT-04, INT-05 (three hardcoded URL literals missing from CONFIG_INVENTORY).** `defaults.ts` already exports the right constants for two of these (`OPENWHISPR_OAUTH_DESKTOP_CALLBACK_URL`, `OPENWHISPR_OAUTH_RESET_PASSWORD_URL`), but `src/lib/auth.ts:177` and `src/lib/auth.ts:232` hardcode the literals anyway instead of importing them. `src/components/notes/ShareNoteDialog.tsx:26` hardcodes `https://notes.openwhispr.com` with no matching constant in `defaults.ts`.

## Requirements

1. **HOST-01: Single SoT for backend host (renderer + main).**
   - Current: `src/config/constants.ts:116` exports `OPENWHISPR_API_URL = (env.VITE_OPENWHISPR_API_URL as string) || ""`. The renderer imports this from 5 files; `src/helpers/ipcHandlers.js:3387-3391` reads `process.env.OPENWHISPR_API_URL || process.env.VITE_OPENWHISPR_API_URL || runtimeEnv.VITE_OPENWHISPR_API_URL` (three sources, no SoT). `OPENWHISPR_BACKEND_URL` (declared SoT in `defaults.ts:27`) is NOT consumed by any of these paths.
   - Target: Exactly one variable carries the backend host. The survivor is `OPENWHISPR_BACKEND_URL` (matches Phase 3 declaration and build-time gating convention). `OPENWHISPR_API_URL` is removed entirely from `src/config/constants.ts`; all 5 renderer imports rewritten to `OPENWHISPR_BACKEND_URL` from `src/config/defaults.ts`; `getApiUrl()` in `ipcHandlers.js` collapsed to read from one source (the generated `build-config.generated.cjs` via existing `BuildConfig.OPENWHISPR_BACKEND_URL`). CI `release.yml` simplified to set only `OPENWHISPR_BACKEND_URL` (drop the dual-var convention).
   - Acceptance: `grep -rn "OPENWHISPR_API_URL\b" src/` returns zero matches; `grep -rn "VITE_OPENWHISPR_API_URL\b" src/ scripts/` returns zero matches; default-build sign-in against `openwhispr.yambr.com` still works end-to-end (verified by re-running the live v178 sign-in path captured in `[[v178_prod_live_results]]`).

2. **HOST-02: Better Auth client supports runtime base URL change.**
   - Current: `src/lib/auth.ts:11-12` — `AUTH_URL = import.meta.env.VITE_AUTH_URL || "https://auth.openwhispr.com"`; `authClient = createAuthClient({ baseURL: AUTH_URL })`. Frozen module-singleton, build-time-baked URL. Upstream-origin commit `56f4efb8`.
   - Target: `authClient` exported symbol kept (preserves upstream API surface) but implemented as a **mutable proxy** whose `baseURL` is re-resolved on each method invocation from `persistedServerUrl ?? AUTH_URL`. The proxy delegates to an internal `createAuthClient(...)` instance that is re-created when the persisted URL changes (e.g., on settings update event). New IPC channel `auth:server-url-changed` or settings subscription drives the proxy's internal client swap. **API surface unchanged**: every existing call site (`authClient.signIn.email(...)`, `authClient.useSession()`, etc.) keeps working without edits.
   - Acceptance: A renderer-level integration test sets a persisted Server URL via the settings store, calls `authClient.signIn.email({ email, password })`, and verifies the outbound request `Origin` / target hits the new host (NOT `https://auth.openwhispr.com`). Test uses a local mock server or network-recording harness. Same test with no persisted URL verifies fallback to `AUTH_URL` build-time default — preserves default-build behavior.

3. **HOST-03: Inventory sweep — 3 hardcoded URLs moved to defaults.ts and wired.**
   - Current:
     - `src/lib/auth.ts:177` — `const DESKTOP_OAUTH_CALLBACK_URL = "https://openwhispr.com/auth/desktop-callback"` (defaults.ts already has `OPENWHISPR_OAUTH_DESKTOP_CALLBACK_URL` — not imported here).
     - `src/lib/auth.ts:232` — `redirectTo: "https://openwhispr.com/reset-password"` (defaults.ts already has `OPENWHISPR_OAUTH_RESET_PASSWORD_URL` — not imported here).
     - `src/components/notes/ShareNoteDialog.tsx:26` — `const SHARE_VIEWER_BASE_URL = "https://notes.openwhispr.com"` (no matching constant in defaults.ts; not in `docs/CONFIG_INVENTORY.md`).
   - Target:
     - `auth.ts:177` rewritten to `import { OPENWHISPR_OAUTH_DESKTOP_CALLBACK_URL } from "../config/defaults"` (literal removed; existing constant used).
     - `auth.ts:232` rewritten to `redirectTo: OPENWHISPR_OAUTH_RESET_PASSWORD_URL` (literal removed; existing constant used).
     - New constant `OPENWHISPR_SHARE_VIEWER_URL` added to `scripts/generate-build-config.js` SoT (default `"https://notes.openwhispr.com"`, `VITE_OPENWHISPR_SHARE_VIEWER_URL` override), re-exported from `defaults.ts`; `ShareNoteDialog.tsx:26` imports it; `docs/CONFIG_INVENTORY.md` gains a row for it.
   - Acceptance: `grep -rn "https://openwhispr.com/auth/desktop-callback\|https://openwhispr.com/reset-password\|https://notes.openwhispr.com" src/` returns matches ONLY inside `src/config/defaults.ts` (or its generated counterpart). `docs/CONFIG_INVENTORY.md` lists all three rows with file path, current value, env-var name.

## Boundaries

**In scope:**

- Rename / consolidate `OPENWHISPR_API_URL` → `OPENWHISPR_BACKEND_URL` across renderer + main + CI (HOST-01).
- Refactor `src/lib/auth.ts` `authClient` from module-singleton to mutable-proxy pattern preserving upstream API surface (HOST-02).
- Add `OPENWHISPR_SHARE_VIEWER_URL` to build-config generator + `defaults.ts` (HOST-03).
- Wire `auth.ts:177`, `auth.ts:232`, `ShareNoteDialog.tsx:26` to read from `defaults.ts` constants (HOST-03).
- Update `docs/CONFIG_INVENTORY.md` with the three new rows.
- Renderer-level integration test for HOST-02 (mutable proxy proves URL change works).
- Settings store subscription / event channel that triggers the proxy's internal client re-creation when persisted URL changes (HOST-02 plumbing — but NOT the UI that exposes the field; that's Phase 4).

**Out of scope:**

- Onboarding UI for entering the Server URL — Phase 4 (HOST-02 stops at the proxy + subscription; the *source* of the persisted URL is Phase 4's job).
- Build-time gate `OPENWHISPR_ALLOW_CUSTOM_HOST` — Phase 3 (HOST-02's proxy works regardless of the gate; the gate only controls whether the UI is visible).
- Policy ADR / `PROJECT.md` Constraints amendment — Phase 2 (already-ratified Pivot 2026-05-26 is enough authority for Phase 1 code work).
- Validation logic (https://, reachability probe, 8-second timeout) — Phase 4 UI concern.
- i18n keys — Phase 4 UI concern.
- E2E tests — Phase 5.
- Any change to upstream-origin file behavior other than the auth.ts proxy refactor (which preserves API surface byte-identical) — per `[upstream_parity]`.
- Touching `openwhispr-server` — server accepts whatever host the client sends, no server change needed (per `[client_immutable]`).
- Migration of already-signed-in users' sessions when host changes — Phase 4 + Phase 5 policy (no carry-over; force re-auth).

## Constraints

- **`[upstream_parity]`**: `src/lib/auth.ts` is upstream-origin (commit `56f4efb8`). The mutable-proxy refactor MUST keep the `authClient` export's API surface byte-identical to upstream so future `git merge upstream/main` resolves without conflict on consumer call sites. Internal implementation can change freely.
- **`[client_immutable]`**: server unchanged. The client adapts to its own SoT; the server accepts the host the client sends. No `SERVER-REQUIREMENTS.md` filing for Phase 1.
- **Default-build behavior unchanged**: ordinary Yambr users (no persisted Server URL, no env override) MUST continue hitting `openwhispr.yambr.com` (via the build-time `OPENWHISPR_BACKEND_URL` default in `build-config.generated.cjs`). HOST-01 consolidation must NOT change the actual URL — only the variable name.
- **No backwards-compat shim for `OPENWHISPR_API_URL`**: per the corporate-minimal pivot, breaking the dual-env convention is acceptable. Remove the variable entirely. CI release.yml gets simplified to one var. Anyone relying on `OPENWHISPR_API_URL` (third-party self-hosters) will see a clean build error pointing them at `OPENWHISPR_BACKEND_URL` (which has been documented in `docs/BUILD_CONFIG.md` since Phase 3).
- **Rolldown DCE safety**: any new constants in `defaults.ts` use the direct named re-export pattern (no `Generated.*` namespace alias) per `[[rolldown_tree_shake]]`.
- **i18n N/A**: no new user-facing strings in this phase (all UI strings live in Phase 4).

## Acceptance Criteria

- [ ] `grep -rn "OPENWHISPR_API_URL\b" src/ scripts/` returns zero matches.
- [ ] `grep -rn "VITE_OPENWHISPR_API_URL\b" src/ scripts/ .github/` returns zero matches.
- [ ] `grep -rn "https://openwhispr.com/auth/desktop-callback" src/` returns matches only inside `src/config/defaults.ts` or `build-config.generated.{ts,cjs}`.
- [ ] `grep -rn "https://openwhispr.com/reset-password" src/` returns matches only inside `src/config/defaults.ts` or `build-config.generated.{ts,cjs}`.
- [ ] `grep -rn "https://notes.openwhispr.com" src/` returns matches only inside `src/config/defaults.ts` or `build-config.generated.{ts,cjs}`.
- [ ] `docs/CONFIG_INVENTORY.md` has three new rows: `auth.ts:177` → `OPENWHISPR_OAUTH_DESKTOP_CALLBACK_URL`, `auth.ts:232` → `OPENWHISPR_OAUTH_RESET_PASSWORD_URL`, `ShareNoteDialog.tsx:26` → `OPENWHISPR_SHARE_VIEWER_URL`.
- [ ] `src/lib/auth.ts`'s `authClient` export has byte-identical API surface to upstream commit `56f4efb8` (every method, every property, every type signature). Verified by `git diff upstream/main -- src/lib/auth.ts` showing only internal-implementation diffs (no consumer-visible changes).
- [ ] Renderer-level integration test: sets persisted `serverUrl = "http://localhost:9999/mock-auth"`, calls `authClient.signIn.email({ email, password })`, mock server receives the request at `localhost:9999/mock-auth`. Same test without persisted URL hits `https://auth.openwhispr.com` (default). Both assertions pass.
- [ ] Default-build smoke (no env vars, `npm run pack`): launching the app and signing in against `openwhispr.yambr.com` succeeds — captured live, not just green tests, per `[[live_verification_over_green_tests]]`.
- [ ] CI `release.yml:114-117, 128-131` reduced to a single `OPENWHISPR_BACKEND_URL: ${{ vars.VITE_OPENWHISPR_API_URL }}` (or rename the GitHub Actions var too — coordinated with the release.yml change) — pre-release CI run still produces a working signed/notarized artifact.

## Ambiguity Report

| Dimension          | Score | Min  | Status | Notes                                                                            |
|--------------------|-------|------|--------|----------------------------------------------------------------------------------|
| Goal Clarity       | 0.92  | 0.75 | ✓      | ROADMAP + REQUIREMENTS + 3 named integration findings.                           |
| Boundary Clarity   | 0.90  | 0.70 | ✓      | Explicit out-of-scope list defers all UI/gate/policy work to later phases.       |
| Constraint Clarity | 0.85  | 0.65 | ✓      | `[upstream_parity]` resolved by blame check → mutable-proxy chosen.              |
| Acceptance Criteria| 0.88  | 0.70 | ✓      | 10 pass/fail criteria, all grep-able or test-runnable.                           |
| **Ambiguity**      | 0.10  | ≤0.20| ✓      | Initial assessment ≤ 0.20; Socratic interview skipped per workflow Step 3.       |

## Interview Log

| Round | Perspective | Question summary | Decision locked |
|-------|-------------|------------------|------------------|
| 0     | n/a         | Initial ambiguity ≤ 0.20 after scout — auto-mode | Interview skipped per workflow Step 3 |

Scout findings used in place of interview rounds:

- **Researcher (auto):** Confirmed `OPENWHISPR_API_URL` lives in `constants.ts:116`, used in 5 renderer files + 26 `getApiUrl()` call sites in `ipcHandlers.js`. Confirmed `OPENWHISPR_BACKEND_URL` lives in `defaults.ts:27`, used in generator + main.js webRequest + openaiRealtimeStreaming only. Two parallel channels, both functional, neither dominant.
- **Boundary Keeper (auto):** Phase 2 (policy), Phase 3 (gate), Phase 4 (UI), Phase 5 (verification) are explicitly out-of-scope per ROADMAP — locked in Boundaries.
- **Failure Analyst (auto):** Worst case = default-build users (`openwhispr.yambr.com`) see a regression because consolidation accidentally points them at a wrong host. Mitigation = live default-build smoke as the gate, captured per `[[live_verification_over_green_tests]]`.
- **Upstream-parity check (auto):** `git log -1 -L12,12:src/lib/auth.ts` → commit `56f4efb8` (upstream, Gabriel Stein). Decision: mutable-proxy refactor preserving `authClient` API surface, NOT lazy-factory rename. Documented in Constraints.

---

*Phase: 01-backend-url-sot-consolidation-dynamic-better-auth*
*Spec created: 2026-05-26*
*Next step: /gsd-discuss-phase 1 — implementation decisions (mutable-proxy mechanics, settings subscription channel, getApiUrl collapse strategy, test harness choice)*
