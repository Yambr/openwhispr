---
phase: 04-oauth-gating-build-docs-and-parity-gate
verified: 2026-05-08T13:10:28Z
status: gaps_found
score: 3/4 must-haves verified
overrides_applied: 0
gaps:
  - truth: "Setting OPENWHISPR_OAUTH_GOOGLE=false at build time produces a binary where Google is fully absent — not visible in UI, not present in IPC handlers, not in bundled assets"
    status: partial
    reason: "Onboarding AuthenticationStep gates Google correctly and gcal-* IPC handlers are gated, but the Settings → Integrations panel (src/components/IntegrationsView.tsx) renders the Google Calendar connect/manage card unconditionally. With OPENWHISPR_OAUTH_GOOGLE=false the card is still visible and clicking 'Connect' calls window.electronAPI.gcalStartOAuth, whose IPC handler is unregistered — surfacing a raw 'No handler registered' error. This violates SC #1 'not visible in UI'. WR-01 in 04-REVIEW.md flagged this; not addressed in any plan."
    artifacts:
      - path: "src/components/IntegrationsView.tsx"
        issue: "Google Calendar card and gcalStartOAuth call site rendered unconditionally; no import of OAUTH_GOOGLE_ENABLED; no gating wrapper around the section"
    missing:
      - "Import OAUTH_GOOGLE_ENABLED from src/config/defaults in IntegrationsView.tsx"
      - "Wrap the Google Calendar card JSX (and any related state/effects that fire gcal-* IPC calls) in a conditional on OAUTH_GOOGLE_ENABLED"
      - "Extend scripts/verify-oauth-gating.js Google grep targets to include 'gcalStartOAuth' / a Google-Calendar-specific i18n key so this regression is caught mechanically"
human_verification:
  - test: "Run signed default build and verify notarization + Info.plist + launched-app OAuth buttons per 04-HUMAN-UAT.md"
    expected: "npm run build (no env vars) completes signing+notarization; codesign --verify --deep --strict exits 0; CFBundleURLSchemes contains 'openwhispr'; launched app onboarding shows Google + Microsoft (and Apple on macOS)"
    why_human: "Requires Apple Developer ID cert in keychain, valid notarization credentials, macOS host, and visual inspection of the running app. Cannot be automated in this verification pass. SC #4 (signing flow continuity) is otherwise unproven — 04-HUMAN-UAT.md Sign-off section remains blank (Date/Operator/Result/Notes are all placeholders)."
---

# Phase 4: OAuth Gating, Build Docs, and Parity Gate — Verification Report

**Phase Goal:** Each OAuth provider can be individually disabled at build time, every build-time variable is documented with examples, and the default build is verified to be behaviorally identical to the current Yambr fork
**Verified:** 2026-05-08T13:10:28Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (Roadmap Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Setting OPENWHISPR_OAUTH_GOOGLE=false (or equivalent per-provider flag) at build time produces a binary where that provider is fully absent — not visible in UI, not present in IPC handlers, not in bundled assets | ✗ FAILED | Authentication onboarding + gcal-* IPC handlers correctly gated. **However:** `src/components/IntegrationsView.tsx` renders the Google Calendar connect/manage card with no `OAUTH_GOOGLE_ENABLED` gating (verified: zero matches for `OAUTH_*_ENABLED` in that file). Clicking "Connect" invokes the unregistered `gcal-start-oauth` IPC, leaking a runtime error. SC #1 explicitly says "not visible in UI" — the card IS visible. WR-01 in 04-REVIEW.md called this out and it has not been remediated. `npm run verify:oauth-gating` reports OK because its grep targets do not include the Integrations-card surface. |
| 2 | docs/BUILD_CONFIG.md exists and documents every build-time variable | ✓ VERIFIED | File present (142 lines). Contains 4 H2 sections in mandated order: Overview, Variable Reference, Worked Examples, Verifying parity. All 24 inventoried variables present (Backend, OAuth Endpoints, OAuth Provider gating, LLM Providers). Worked Example 3 includes the full per-provider bundle-grep verification snippet. |
| 3 | Smoke checklist exists and passes for default build | ✓ VERIFIED | `docs/SELF_HOSTING.md` contains both `## Phase 3 Smoke Checklist` (line 8 area) and `## Phase 4 OAuth Gating Smoke Checklist` (line 361). The Phase 4 section adds a 3-flow per-provider table plus the subset-build flow. `npm run verify:oauth-gating` is the automated counterpart and per orchestrator notes ran locally with "OK — 4 scenarios, 51 greps, 0 violations". Default build with no env vars: `node scripts/generate-build-config.js` produces all 3 OAUTH_*_ENABLED = true, preserving parity. |
| 4 | Existing Developer ID signing flow continues working with env-driven config — signed build passes notarization | ? UNCERTAIN (human verification needed) | `04-HUMAN-UAT.md` codifies the manual UAT (Pass criteria checklist + Sign-off). Sign-off section is blank — placeholders intact. Per orchestrator note, signed-build smoke is partial / deferred. Cannot verify without macOS host + Developer ID cert + notarization creds. |

**Score:** 2/4 truths fully verified; 1 failed (SC #1 partial — onboarding+IPC gated, but Integrations UI surface missed); 1 needs human verification (SC #4).

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `scripts/generate-build-config.js` | Emits OAUTH_GOOGLE/APPLE/MICROSOFT_ENABLED booleans in .ts + .cjs outputs | ✓ VERIFIED | `BOOL_DEFAULTS` map (lines 45-47) defines all three; `resolveBool()` parses env (only "false" disables); both emit functions write the booleans. Tested: default → all three `true`; `OPENWHISPR_OAUTH_GOOGLE=false` → Google flips to `false`, others remain `true`. |
| `src/config/defaults.ts` | Re-exports OAUTH_*_ENABLED via pickBool | ✓ EXISTS, WIRED | Three exports at lines 78–88 with `pickBool` indirection. **Note (WR-02 from review):** the `import.meta.env[viteName]` lookup is functionally inert — Vite `define` only substitutes static `import.meta.env.X` references, not computed-property lookups. Gating works exclusively via the `Generated.OAUTH_*_ENABLED` fallback (which IS a literal const and IS DCE-friendly). Behavior is correct; the indirection is misleading code. |
| `src/vite.config.mjs` | buildTimeDefaults entries for VITE_OPENWHISPR_OAUTH_*_ENABLED | ✓ EXISTS | Lines 56–58 add the three entries with `env.OPENWHISPR_OAUTH_X !== "false"` parse rule. (Per WR-02, these are functionally inert — the values flow into the runtime-env JSON but the renderer never reads them; harmless but dead.) |
| `docs/BUILD_CONFIG.md` | Single canonical reference, ≥120 lines, 4 mandated H2 sections | ✓ VERIFIED | 142 lines, 4 H2 sections in mandated order, 7 H3 subsections (4 variable buckets + 3 worked examples). |
| `src/components/AuthenticationStep.tsx` | Three buttons gated; Apple uses `OAUTH_APPLE_ENABLED && isMacOS` | ✓ VERIFIED, WIRED | Lines 13–16 import the three flags; line 486 `{OAUTH_APPLE_ENABLED && isMacOS && (`; line 511 `{OAUTH_GOOGLE_ENABLED && (`; line 536 `{OAUTH_MICROSOFT_ENABLED && (`. Build-flag-first ordering preserved for DCE. |
| `src/lib/auth.ts` | signInWithSocial defensive guards | ✓ VERIFIED, WIRED | Lines 4–7 import the three flags; lines 182, 185, 188 implement the three `provider === "X" && !OAUTH_X_ENABLED` guards returning `new Error("Provider not enabled in this build")` (3 occurrences of the literal). SocialProvider type unchanged. |
| `src/helpers/ipcHandlers.js` | All 8 gcal-* handlers + 2 lifecycle calls gated by BuildConfig.OAUTH_GOOGLE_ENABLED | ✓ VERIFIED, WIRED | Line 7007 `if (BuildConfig.OAUTH_GOOGLE_ENABLED) { ... }` wraps all 8 gcal-* handler registrations; lines 1950 and 1959 gate the two lifecycle calls. `join-calendar-meeting` remains ungated as required. |
| `scripts/verify-oauth-gating.js` | 4-scenario build+grep gate, ≥80 lines | ✓ VERIFIED | 254 lines; defines GOOGLE_TARGETS / APPLE_TARGETS / MICROSOFT_TARGETS; 4 SCENARIOS array (default + 3 single-disabled); spawnSync('npm run build') per scenario; grepDist via execSync. Script reports 0 violations on current tree per orchestrator note. |
| `package.json` | verify:oauth-gating npm script | ✓ VERIFIED | `"verify:oauth-gating"` entry present in scripts. |
| `docs/SELF_HOSTING.md` | "Phase 4 OAuth Gating Smoke Checklist" appended after Phase 3 section | ✓ VERIFIED | Phase 3 Smoke Checklist preserved (line 8); Phase 4 section appended at line 361 with per-provider table + subset-build flow + cross-link to verify:oauth-gating. |
| `04-HUMAN-UAT.md` | Signed-build manual UAT codified | ✓ EXISTS | All required sections (Pre-flight, Steps 1–4, Pass criteria checklist, Failure handling, Sign-off). References `afterSign`, `codesign --verify`, both verify scripts, `CFBundleURLSchemes`. **Sign-off section is blank — UAT not yet executed.** |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| scripts/generate-build-config.js | src/config/build-config.generated.cjs | emit OAUTH_*_ENABLED booleans | ✓ WIRED | Confirmed: regenerated and grepped — all 3 booleans present in .cjs output. |
| src/vite.config.mjs | renderer (via define) | VITE_OPENWHISPR_OAUTH_*_ENABLED literal substitution | ⚠️ PARTIAL | The define block is in place but renderer pickBool lookup is computed-property — Vite does not substitute it. Behavior is correct via the Generated.OAUTH_*_ENABLED fallback path. (WR-02 — non-blocking, but the wiring as designed in Plan 1 is not effective; the const-import path is what works.) |
| src/components/AuthenticationStep.tsx | src/config/defaults.ts | named imports of OAUTH_*_ENABLED | ✓ WIRED | Imports + JSX gates in place. |
| src/lib/auth.ts | src/config/defaults.ts | named imports + guards | ✓ WIRED | 3 guard branches each with build-flag-AND-provider-string check. |
| src/helpers/ipcHandlers.js | src/config/build-config.generated.cjs | require() + BuildConfig.OAUTH_GOOGLE_ENABLED | ✓ WIRED | Require present; 3 distinct gate sites (handler block + 2 lifecycle calls). |
| src/components/IntegrationsView.tsx | src/config/defaults.ts | OAUTH_GOOGLE_ENABLED gate | ✗ NOT_WIRED | **No import of OAUTH_GOOGLE_ENABLED; no gating around the Google Calendar card.** This is the source of the SC #1 gap. |
| docs/BUILD_CONFIG.md | docs/SELF_HOSTING.md | Verifying parity cross-link | ✓ WIRED | Cross-link present. |
| docs/SELF_HOSTING.md | scripts/verify-oauth-gating.js | smoke checklist instructs running script | ✓ WIRED | Section references `npm run verify:oauth-gating`. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Generator emits 3 OAuth booleans on default build | `node scripts/generate-build-config.js && grep "OAUTH_GOOGLE_ENABLED:" src/config/build-config.generated.cjs` | `OAUTH_GOOGLE_ENABLED: true` | ✓ PASS |
| Generator flips Google flag on env override | `OPENWHISPR_OAUTH_GOOGLE=false node scripts/generate-build-config.js && grep "OAUTH_GOOGLE_ENABLED:" src/config/build-config.generated.cjs` | `OAUTH_GOOGLE_ENABLED: false` (Apple/Microsoft remain true) | ✓ PASS |
| verify:oauth-gating script syntax check | `node --check scripts/verify-oauth-gating.js` | exit 0 | ✓ PASS |
| Full verify:oauth-gating run | `npm run verify:oauth-gating` (per orchestrator note — not re-run here) | "OK — 4 scenarios, 51 greps, 0 violations" | ✓ PASS (reported) |
| BUILD_CONFIG.md structure | `grep -c "^## " docs/BUILD_CONFIG.md` | 4 | ✓ PASS |
| Signed build + notarization | `npm run build` + codesign verify (per 04-HUMAN-UAT.md) | not executed (no Developer ID env) | ? SKIP (human) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| CFG-03 | 04-01-PLAN, 04-03-PLAN, 04-04-PLAN, 04-05-PLAN | Per-provider OAuth gating — when build flag is false, provider fully absent (UI, IPC, bundled assets) | ✗ BLOCKED | Onboarding UI + gcal-* IPC handlers correctly gated. Bundle-grep gate (verify-oauth-gating.js) passes 4 scenarios. **However:** `IntegrationsView.tsx` Google Calendar card is NOT gated, contradicting "not visible in UI" clause. WR-01 unaddressed. Apple/Microsoft sides verified. |
| CFG-05 | 04-02-PLAN | Build-config documentation — every variable documented with examples | ✓ SATISFIED | `docs/BUILD_CONFIG.md` exists with all 24 variables, 3 worked examples, parity cross-links. |
| CFG-06 | 04-05-PLAN | Default-build parity — no-env build behaviorally identical to current Yambr fork | ✓ SATISFIED (mechanically) | Generator default → all flags true; pre-existing Phase 3 parity smoke + Phase 4 OAuth-gating smoke checklists in SELF_HOSTING.md; verify-oauth-gating reports default scenario all targets present. End-to-end behavioral parity (signed binary launch) is the SC #4 human-UAT item — NOT executed. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| src/config/defaults.ts | 29-32, 78-89 | Dead/misleading code: pickBool reads computed-property `import.meta.env[viteName]` which Vite `define` does not populate; comment claims DCE-friendliness via Vite literal substitution but DCE actually relies entirely on Generated.* fallback | ⚠️ Warning | Behavior is correct (fallback works); contradicts in-file comment. WR-02 from review. Future refactor risk. |
| src/vite.config.mjs | 56-58 | Functionally inert define injections of VITE_OPENWHISPR_OAUTH_*_ENABLED — never read by working renderer code path | ℹ️ Info | Tied to WR-02. Removing would simplify config without behavior change. |
| src/lib/auth.ts | 182-190 | Hardcoded English string `"Provider not enabled in this build"` (no i18n) | ℹ️ Info | IN-03 from review. Defensive-only path; CLAUDE.md mandates i18n for user-facing strings. Unlikely to be reached in normal use. |
| scripts/generate-build-config.js | ~145 | Log claims "16 string keys + 4 booleans" but BOOL_DEFAULTS only has 3 user-facing booleans (4th is the protocol-scheme-overridden sentinel) | ℹ️ Info | IN-02 from review. Slightly misleading log line. |
| docs/BUILD_CONFIG.md | ~87 | "All 17 endpoint variables resolve to defaults" — off-by-one (16 endpoints + 3 OAuth flags) | ℹ️ Info | IN-01 from review. Doc accuracy. |
| src/config/defaults.ts | 7-8 | Stale comment references only Phase 3 verify-defaults-parity, doesn't mention Phase 4 verify-oauth-gating | ℹ️ Info | IN-04 from review. |
| main.js + ipcHandlers.js | n/a | googleCalendarManager passed as null when OAUTH_GOOGLE_ENABLED=false; constructor signature does not encode optionality | ⚠️ Warning | WR-03 from review. Implicit-contract footgun for future contributors. Current code paths use `?.` and are safe. |

### Human Verification Required

#### 1. Signed-build notarization smoke (SC #4)

**Test:** Execute `04-HUMAN-UAT.md` Steps 1–4 on a macOS host with Developer ID cert + notarization creds.
**Expected:**
- `npm run verify:oauth-gating` exits 0.
- `npm run build` (no env vars) completes signing + notarization with no errors; `[afterSign]` log lines present.
- `codesign --verify --deep --strict --verbose=2 dist/mac-arm64/OpenWhispr.app` exits 0.
- `defaults read .../Info.plist CFBundleURLTypes` contains `CFBundleURLSchemes = ("openwhispr")`.
- Launched app onboarding shows Google + Microsoft (+ Apple on macOS) sign-in buttons.
- Sign-off section in 04-HUMAN-UAT.md filled in with Date / Operator / Result=PASS.

**Why human:** Requires Apple Developer ID certificate, notarization credentials, macOS host, GUI inspection. Cannot be run from this verification context.

### Gaps Summary

The phase delivered the bulk of CFG-03 + CFG-05 + CFG-06 cleanly:

- The build-config plumbing layer (Plan 1) is fully wired through generator → renderer → main process.
- Onboarding `AuthenticationStep` provider buttons are correctly gated (Plan 3).
- `signInWithSocial` defensive guards are in place (Plan 3).
- All 8 `gcal-*` IPC handlers + 2 lifecycle calls are conditionally registered (Plan 4).
- `BUILD_CONFIG.md` documents every build-time variable with worked examples (Plan 2).
- `SELF_HOSTING.md` has the Phase 4 OAuth-gating smoke checklist appended without disturbing Phase 3 (Plan 5).
- The mechanical `verify-oauth-gating.js` 4-scenario gate passes per orchestrator-reported run.

**One material gap** blocks full SC #1 closure: `src/components/IntegrationsView.tsx` renders the Google Calendar connect/manage card with NO build-flag gating. With `OPENWHISPR_OAUTH_GOOGLE=false`:

1. The card is still visible in Settings → Integrations (violates "not visible in UI").
2. Clicking *Connect* invokes the now-unregistered `gcal-start-oauth` IPC handler, surfacing `Error: No handler registered for 'gcal-start-oauth'`.
3. The bundle-grep gate did not catch this because its targets focus on the onboarding surface (icons, social-button literals) rather than the integrations-card surface.

This was identified as WR-01 in the code review (`04-REVIEW.md`) but not remediated. To close the gap:

- Add `import { OAUTH_GOOGLE_ENABLED } from "../config/defaults"` to `IntegrationsView.tsx`.
- Wrap the Google Calendar card JSX (and related effects calling `gcal*` IPC) in `{OAUTH_GOOGLE_ENABLED && (...)}`.
- Extend `verify-oauth-gating.js` GOOGLE_TARGETS with a Google-Calendar-card-specific literal (e.g., `gcalStartOAuth` or a stable i18n key) so the regression is caught mechanically going forward.

**One uncertain item** is SC #4 (signing flow continuity): the human UAT is documented but Sign-off blank. Per orchestrator decision this was deferred and is tracked in `04-HUMAN-UAT.md` (status: partial). It must be exercised on a Developer-ID-equipped macOS host before the phase can be considered behaviorally complete for release.

---

_Verified: 2026-05-08T13:10:28Z_
_Verifier: Claude (gsd-verifier)_
