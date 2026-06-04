---
phase: 260604-eij-custom-host-onboarding-ux-server-url-field
verified: 2026-06-04T10:53:00Z
status: passed
score: 6/6 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: issues_found (REVIEW WR-01)
  previous_score: n/a
  gaps_closed:
    - "WR-01 DCE leak — ServerUrlField stub-aliased out of corporate-minimal bundle"
  gaps_remaining: []
  regressions: []
---

# Phase 260604-eij: Custom-Host Onboarding UX + Server URL Field Verification Report

**Phase Goal:** Fix two v1.8.0 custom-host bugs (onboarding Server URL field gated behind authView; no Settings UI for setServerUrl) + WR-01 DCE fix (stub-alias ServerUrlField out of the default build).
**Verified:** 2026-06-04T10:53:00Z
**Status:** passed
**Re-verification:** Yes — after WR-01 code-review finding closure (commit a51bfdee)
**Branch HEAD:** a51bfdee on `quick/260604-eij-custom-host-onboarding`

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Server URL field renders on onboarding welcome view independent of authView when ALLOW_CUSTOM_HOST_ENABLED | ✓ VERIFIED | `AuthenticationStep.tsx:485-491` — mount wrapped in bare `{ALLOW_CUSTOM_HOST_ENABLED && (...)}`, positioned ABOVE `<ServerProviderButtons>` (line 493) and OUTSIDE the `authView === "local-and-sso"` block (line 509). Exactly ONE `<ServerUrlField` JSX mount in the file. |
| 2 | After validating a custom host, providers fetch re-runs against the new host | ✓ VERIFIED | Per PLAN context (serverProviders.ts useServerProviders deps `[baseUrl]`, baseUrl = serverUrl ‖ default). ServerUrlField writes serverUrl to store on valid → hook re-fetches. Chain unchanged by this diff; mount hoist is the only fix. |
| 3 | Email/password form stays gated by `authView === "local-and-sso"` (fix #9 intact) | ✓ VERIFIED | `AuthenticationStep.tsx:509` — `{authView === "local-and-sso" && (...)}` wraps the `<form>` (line 519) with email Input + Continue Button. Only the URL field moved out. |
| 4 | Email Input + Continue button stay disabled until serverUrlValidated when ALLOW_CUSTOM_HOST_ENABLED | ✓ VERIFIED | `AuthenticationStep.tsx:536` and `:546` — both retain `(ALLOW_CUSTOM_HOST_ENABLED && !serverUrlValidated)` in their disabled expression. |
| 5 | Settings has a Server URL section gated by ALLOW_CUSTOM_HOST_ENABLED applying via auth.ts reload | ✓ VERIFIED | `SettingsPage.tsx:3206` — `{ALLOW_CUSTOM_HOST_ENABLED && (...)}` (bare literal) renders SectionHeader + `<ServerUrlField />` (line 3215) + reloadNotice (line 3217). REVIEW confirmed auth.ts:88 reload path honesty. |
| 6 | All new UI strings exist in all 10 locales | ✓ VERIFIED | `settingsPage.general.serverUrl.{title,description,reloadNotice}` present with real (non-English) translations in en, es, fr, de, pt, it, ru, zh-CN, zh-TW, ja. Spot-checked ru/de/ja/zh-CN descriptions + all 10 reloadNotice strings — genuinely localized. |

**Score:** 6/6 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/components/AuthenticationStep.tsx` | ServerUrlField hoisted above ServerProviderButtons, authView-independent | ✓ VERIFIED | 1 mount, bare-literal gate, above buttons, outside local-and-sso block |
| `src/lib/serverProviders.ts` | Pure `shouldShowServerUrlField` (no authView arg) | ✓ VERIFIED | Line 162: `export function shouldShowServerUrlField(allowCustomHost: boolean): boolean` — takes only the build literal |
| `src/lib/serverProviders.test.ts` | Regression test across all 3 authViews | ✓ VERIFIED | `describe("shouldShowServerUrlField (BUG 1 regression)")` loops local-and-sso / sso-only / no-methods, asserts visible for each. 45/45 tests pass |
| `src/components/SettingsPage.tsx` | Server URL section using shared ServerUrlField | ✓ VERIFIED | Lines 42 (import), 93 (component import), 3206-3217 (gated section + reload notice) |
| `src/components/onboarding/ServerUrlField.stub.tsx` | Null-render stub, no forbidden literals | ✓ VERIFIED | Renders `null`; contains no verbatim `server-url-field` testid or `onboarding.serverUrl.label` key (only prose w/ `*` glob in comment) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| AuthenticationStep.tsx | onboarding/ServerUrlField | import + bare-literal JSX gate | ✓ WIRED | Import line 15; mount 485-491 |
| SettingsPage.tsx | onboarding/ServerUrlField → settingsStore → auth.ts reload | `<ServerUrlField />` writes serverUrl, auth.ts subscriber reloads | ✓ WIRED | Confirmed by REVIEW item 5 against auth.ts:68-91 |
| vite.config.mjs (`src/vite.config.mjs`) | ServerUrlField.stub.tsx | 3 alias rules when `!allowCustomHostEnabled` | ✓ WIRED | Lines 199-223: reads buildConfig.ALLOW_CUSTOM_HOST_ENABLED; aliases all 3 import-path forms to stub when off |

### Behavioral Spot-Checks / Probe Execution

| Check | Command | Result | Status |
|-------|---------|--------|--------|
| Typecheck clean | `npm run typecheck` (cd src && tsc --noEmit) | no errors | ✓ PASS |
| serverProviders suite | `npx vitest run src/lib/serverProviders.test.ts` | 45 passed (45) | ✓ PASS |
| DCE bundle gate (WR-01) | `node scripts/verify-allow-custom-host.js` | OK — 4 scenarios, 8 greps, 0 violations | ✓ PASS |

**WR-01 closure note:** The code-review fix proven the load-bearing item. The DCE gate built all 4 scenarios (implicit default, explicit off, explicit on, lockdown coexists) and confirmed `onboarding.serverUrl.label` + `server-url-field` are ABSENT in the off/default bundles and PRESENT in the on bundles — 0 violations. The stub-alias mechanism (chosen over the REVIEW's suggested bare-literal-only fix) correctly drops the module edge despite two static consumers (onboarding + always-loaded Settings chunk).

### Anti-Patterns Found

None. No TBD/FIXME/XXX in modified files. The stub's `return null` is intentional (build-flag null component), not a stub-of-implementation.

### Requirements Coverage

| Requirement | Description | Status | Evidence |
|-------------|-------------|--------|----------|
| UI-01 | Onboarding Server URL field present | ✓ SATISFIED | Truth 1 |
| UI-02 | Re-fetch against new host | ✓ SATISFIED | Truth 2 |
| UI-03 | Settings Server URL section | ✓ SATISFIED | Truth 5 |
| UI-04 | i18n all locales | ✓ SATISFIED | Truth 6 |

### Human Verification Required

None — all checks verifiable programmatically and green.

### Gaps Summary

No gaps. All 6 must-haves verified against the codebase at HEAD (a51bfdee). The two bugs are fixed: BUG 1 (field hoisted out of the authView gate, exactly one mount, above provider buttons) and BUG 2 (Settings section gated by ALLOW_CUSTOM_HOST_ENABLED with an honest reload notice). Fix #9 (email form gating by authView) and the serverUrlValidated input/button gating are intact. WR-01 — the load-bearing code-review finding — is resolved via a stub-alias in `src/vite.config.mjs`, and the DCE gate proves the corporate-minimal bundle is free of the field's SSRF code, testid, and i18n literals. i18n is complete and genuinely localized in all 10 locales.

Note: `src/config/build-config.generated.{ts,cjs}` are gitignored (untracked); the DCE gate regenerated them to a dev-default state (`ALLOW_CUSTOM_HOST_ENABLED = true`). No git restore needed — not tracked, not part of the diff.

---

_Verified: 2026-06-04T10:53:00Z_
_Verifier: Claude (gsd-verifier)_
