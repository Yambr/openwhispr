# Roadmap: Yambr OpenWhispr Fork

## Milestones

- ✅ **v1.7.2 — Documentation + Build-time Configurability + Corporate-Minimal Default** — Phases 1–10 (shipped 2026-05-26, tag `v1.7.9`)
- 🚧 **v1.8.0 — Custom Server URL Onboarding** — 5 phases planned

## Phases

<details>
<summary>✅ v1.7.2 (Phases 1–10) — SHIPPED 2026-05-26</summary>

- [x] Phase 1: Wire Contract Documentation (3/3 plans)
- [x] Phase 2: Architecture Doc + Hardcode Inventory (3/3 plans)
- [x] Phase 3: Build-time Env Refactor (6/6 plans)
- [x] Phase 4: OAuth Gating, Build Docs, and Parity Gate (5/5 plans) — CFG-03 partial (see audit)
- [x] Phase 04.1: Tree-shaking fix + BILLING/REFERRALS/STREAMING flags (6/6 plans) — INSERTED
- [x] Phase 5: Route Realtime ASR/Diarization through Corporate Backend (4/4 plans)
- [x] Phase 6: Merge upstream OpenWhispr v1.7.2 (recurring maintenance, mode=discuss-skipped)
- [x] Phase 7: Unit + Integration Tests for Phase 04/04.1/05 work (6/6 plans)
- [x] Phase 8: Client↔Server Compatibility Audit (1/1 plan)
- [x] Phase 9: Client E2E Tests (Playwright + Cucumber) (1/1 plan, 44/44 scenarios)
- [x] Phase 10: Corporate-Minimal Provider Lockdown (6/6 plans)

Archived: `.planning/milestones/v1.7.2-ROADMAP.md` · `.planning/milestones/v1.7.2-REQUIREMENTS.md` · `.planning/milestones/v1.7.2-MILESTONE-AUDIT.md` · phase dirs in `.planning/milestones/v1.7.2-phases/`

</details>

### 🚧 v1.8.0 — Custom Server URL Onboarding (Planned)

**Milestone Goal:** End-users (corporate self-hosters and third-party deployments) can point an installed binary at their own backend via a runtime "Server URL" field on the onboarding screen, without rebuilding. Field visibility is build-time gated (`OPENWHISPR_ALLOW_CUSTOM_HOST`); default Yambr build hides it and behaves identically to v1.7.x.

Phase numbering RESET to 1 (per `--reset-phase-numbers`). v1.7.2 phases archived.

- [x] **Phase 1: Backend URL SoT Consolidation + Dynamic Better Auth** — Collapse dual `OPENWHISPR_API_URL`/`OPENWHISPR_BACKEND_URL` to single SoT; refactor frozen module-singleton `authClient` to runtime-mutable; sweep 3 hardcoded URLs into `defaults.ts`.
- [x] **Phase 2: Policy ADR — Runtime Host Configurability Relaxation** — Codify in `PROJECT.md` the conscious relaxation of "build-time only configurability" for backend host only, with phishing threat model and enumerated mitigations.
- [x] **Phase 3: Build-time Gate Plumbing for `OPENWHISPR_ALLOW_CUSTOM_HOST`** — Add flag to `BOOL_DEFAULTS`; verify Rolldown DCE removes Server URL field literals from default-build bundle.
- [x] **Phase 4: Onboarding UI — Server URL Field** — Add empty Server URL field on onboarding screen with syntax + reachability validation, persist to settings, i18n in 9 locales.
- [x] **Phase 5: Verification — E2E + Signed-Build Smoke** — Playwright scenario for corporate-minimal path, default-build smoke verifying field hidden, signed/notarized build still works.

## Phase Details

### Phase 1: Backend URL SoT Consolidation + Dynamic Better Auth
**Goal**: Client can take a backend host URL from any source (settings, env, default) and use it for every backend HTTP and Better Auth call, with one single source of truth and a renderer-side auth client that respects runtime URL changes.
**Depends on**: Nothing (first phase of v1.8.0; v1.7.2 prerequisites covered by `cfg_09_build_gate_pattern: PASS` from milestone audit)
**Requirements**: HOST-01, HOST-02, HOST-03
**Success Criteria** (what must be TRUE):
  1. `grep -rn "OPENWHISPR_API_URL\b" src/` returns zero matches outside a clearly-marked deprecated-alias shim (or zero matches entirely); a developer changing `OPENWHISPR_BACKEND_URL` (the survivor) changes where the renderer actually sends requests.
  2. A renderer-level test changes the persisted Server URL setting and observes the next `signInWithEmail` request hit the new host — NOT the build-time default — proving `authClient` is no longer a frozen module-singleton.
  3. `grep` for the three known hardcoded URL literals (`auth.ts:177` `DESKTOP_OAUTH_CALLBACK_URL`, `auth.ts:227` reset-password redirect, `ShareNoteDialog.tsx:26` `SHARE_VIEWER_BASE_URL`) in `src/` returns matches only inside `src/config/defaults.ts`; `docs/CONFIG_INVENTORY.md` has rows for all three.
  4. Default-build smoke (no env vars set, `npm run build`) signs in successfully against `openwhispr.yambr.com` exactly as v1.7.x did — behaviorally identical for ordinary Yambr users, no regression.
**Plans**: TBD
**UI hint**: yes

### Phase 2: Policy ADR — Runtime Host Configurability Relaxation
**Goal**: The "Build-time only configurability" rule from `PROJECT.md` Constraints is formally amended in writing — narrowly, for backend host only — with a threat model and enumerated mitigations, so Phase 3's `OPENWHISPR_ALLOW_CUSTOM_HOST` flag is grounded in ratified policy rather than implicit drift.
**Depends on**: Nothing structural (pure docs); should LAND before Phase 3 starts so the build-time gate is implementing a documented decision, not introducing it.
**Requirements**: none mapped — policy work, not a v1.8.0 acceptance requirement (the policy is enacted by HOST-03 / BG-01 in later phases; this phase produces only the ADR text)
**Success Criteria** (what must be TRUE):
  1. `PROJECT.md` Constraints section explicitly states that backend host is the ONE configurability axis moved from build-time to runtime in v1.8.0+, and that all other configurability (OAuth providers, model registry, feature flags) remains build-time only.
  2. `PROJECT.md` Key Decisions table contains a 2026-05-XX entry naming this as a conscious pivot, with a threat model enumerating: phishing via malicious host → BYOK API key exfiltration, Better Auth session token theft.
  3. The same Key Decisions row enumerates the mitigations: explicit user entry only (no auto-discovery, no deeplinks, no MDM), `https://` enforced, reachability probe before persist, no data carry-over between hosts (re-auth required on every host change), field hidden by default via `OPENWHISPR_ALLOW_CUSTOM_HOST`.
  4. The ADR is committed atomically to `main` before any Phase 3 code lands, so a reviewer reading the `OPENWHISPR_ALLOW_CUSTOM_HOST` commit can trace it back to a ratified policy decision in the same branch's git history.
**Plans**: TBD

### Phase 3: Build-time Gate Plumbing for `OPENWHISPR_ALLOW_CUSTOM_HOST`
**Goal**: A new build-time boolean flag exists that toggles Server URL field visibility; default-build bundle (flag unset → false) physically does not contain the field's component code or i18n keys; corporate-minimal build (flag explicitly true) contains them.
**Depends on**: Phase 1 (the survivor SoT must exist before this gate is meaningful — gating a non-functional field would ship dead code), Phase 2 (policy must be ratified before the gate enacts it).
**Requirements**: BG-01, BG-02
**Success Criteria** (what must be TRUE):
  1. `node scripts/generate-build-config.js` with `OPENWHISPR_ALLOW_CUSTOM_HOST` unset emits `ALLOW_CUSTOM_HOST_ENABLED = false`; with `OPENWHISPR_ALLOW_CUSTOM_HOST=true` it emits `true`. `src/config/defaults.ts` re-exports the flag via the established DCE-safe direct named re-export (no `Generated.*` namespace routing, per `[[rolldown_tree_shake]]`).
  2. `docs/BUILD_CONFIG.md` has a section documenting `OPENWHISPR_ALLOW_CUSTOM_HOST` with a worked example and the default value (`false`).
  3. A bundle-grep gate (extension of `verify-provider-lockdown.js` or a sibling `verify-allow-custom-host.js`) runs at least two scenarios (flag off, flag on) and asserts the Server URL field's component name + i18n keys are absent from the default-build bundle and present in the corporate-minimal build bundle. Gate exits 0 across all scenarios.
  4. A developer running `npm run pack` without the flag set produces a binary whose renderer bundle, when grep'd for the Server URL field's component identifier, yields zero hits — the field is physically gone, not just runtime-hidden.
**Plans**: TBD
**UI hint**: yes

### Phase 4: Onboarding UI — Server URL Field
**Goal**: On a corporate-minimal build (`OPENWHISPR_ALLOW_CUSTOM_HOST=true`), the onboarding screen presents a third field "Server URL" that is empty with no placeholder hint; the user types their organization's backend URL; the client validates syntax and reachability; on success the URL is persisted in settings and used for all subsequent backend calls; all strings are translated in 9 locales.
**Depends on**: Phase 3 (the gate flag must exist before the conditional field can be wired), and transitively Phase 1 (the persisted URL must drive the dynamic `authClient` and the single SoT to actually take effect).
**Requirements**: UI-01, UI-02, UI-03, UI-04
**Success Criteria** (what must be TRUE):
  1. On a corporate-minimal build, the user sees the Server URL field on first-run onboarding; the field is initially empty (no value, no placeholder text suggesting `openwhispr.yambr.com`); the user cannot proceed without typing a value.
  2. The user types a syntactically invalid URL (e.g. `acme.com` without scheme, or `http://acme.com`) and on submit/blur sees a localized validation error; they cannot proceed. They type a valid `https://acme.com` URL pointing at a server that returns 5xx/timeout on `GET /api/auth/get-session` and see a localized reachability error; they cannot proceed. They type a valid URL pointing at a live server that returns 401 (Better Auth's "host alive, no session") and the field is accepted.
  3. After successful validation, all subsequent Better Auth and `/api/*` IPC handlers hit the typed host (verifiable via network trace or mock-server log) — NOT the build-time default. After logout or settings wipe, re-onboarding re-shows the empty Server URL field (no leftover value).
  4. Every new user-facing string (field label, validation messages, reachability error, retry prompt) has a key present in all 9 translation files: `src/locales/{en,es,fr,de,pt,it,ru,zh-CN,zh-TW}/translation.json`. `grep -L "<new-i18n-key>" src/locales/*/translation.json` returns empty.
**Plans**: TBD
**UI hint**: yes

### Phase 5: Verification — E2E + Signed-Build Smoke
**Goal**: The full v1.8.0 feature is verified end-to-end against a real server in both build modes (corporate-minimal with the flag on, default Yambr with the flag off), and a signed+notarized build of the corporate-minimal variant is shippable.
**Depends on**: Phase 4 (UI must exist to test), Phase 3 (gate must exist to test both modes), Phase 1 (dynamic auth must work for the runtime override to actually take effect).
**Requirements**: VER-01, VER-02, VER-03
**Success Criteria** (what must be TRUE):
  1. A Playwright E2E scenario in `tests/e2e/` (corporate-minimal build) launches the app, sees the Server URL field, types a valid corp URL, sees reachability succeed, completes email/password sign-in, and the first `/api/*` call after sign-in is observed (via mock server or network trace) hitting the typed host. A negative scenario for the same test plan: invalid URL → error shown → user blocked. Both scenarios pass in CI.
  2. The default Yambr build (launched with `OPENWHISPR_ALLOW_CUSTOM_HOST` unset, which is the default) shows only email/password on onboarding — NO Server URL field anywhere — and sign-in hits the compiled-in `OPENWHISPR_BACKEND_URL` exactly as in v1.7.x. Verified by manual smoke or automated diff against a v1.7.x bundle.
  3. A signed + notarized build of the corporate-minimal variant (`OPENWHISPR_ALLOW_CUSTOM_HOST=true npm run build`) completes successfully; `codesign --verify --deep --strict` exits 0; UAT walkthrough captured in `XX-HUMAN-UAT.md` for this phase with sign-off.
  4. Live verification: the user (per `[[live_verification_over_green_tests]]`) drives the real Electron app against a real backend, signs up + verifies + signs in via the runtime-entered Server URL, and the result is captured in the phase SUMMARY. Green tests alone are insufficient — R19-R23 lesson applies.
**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5.

| Phase | Milestone | Plans Complete | Status   | Completed  |
|-------|-----------|----------------|----------|------------|
| 1     | v1.7.2    | 3/3            | Complete | 2026-04-30 |
| 2     | v1.7.2    | 3/3            | Complete | 2026-05-08 |
| 3     | v1.7.2    | 6/6            | Complete | 2026-05-08 |
| 4     | v1.7.2    | 5/5            | Complete | 2026-05-08 |
| 04.1  | v1.7.2    | 6/6            | Complete | 2026-05-09 |
| 5     | v1.7.2    | 4/4            | Complete | 2026-05-09 |
| 6     | v1.7.2    | n/a (recurring)| Complete | 2026-05-22 |
| 7     | v1.7.2    | 6/6            | Complete | 2026-05-15 |
| 8     | v1.7.2    | 1/1            | Complete | 2026-05-18 |
| 9     | v1.7.2    | 1/1            | Complete | 2026-05-20 |
| 10    | v1.7.2    | 6/6            | Complete | 2026-05-21 |
| 1     | v1.8.0    | 0/TBD          | Not started | -       |
| 2     | v1.8.0    | 0/TBD          | Not started | -       |
| 3     | v1.8.0    | 0/TBD          | Not started | -       |
| 4     | v1.8.0    | 0/TBD          | Not started | -       |
| 5     | v1.8.0    | 0/TBD          | Not started | -       |
