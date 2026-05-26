---
phase: 04-oauth-gating-build-docs-and-parity-gate
fixed_at: 2026-05-08T00:00:00Z
review_path: .planning/phases/04-oauth-gating-build-docs-and-parity-gate/04-REVIEW.md
iteration: 1
findings_in_scope: 3
fixed: 3
skipped: 0
status: all_fixed
---

# Phase 4: Code Review Fix Report

**Fixed at:** 2026-05-08
**Source review:** .planning/phases/04-oauth-gating-build-docs-and-parity-gate/04-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 3 (3 Warnings; 0 Critical; 4 Info findings deferred — out of scope for `critical_warning` fix run)
- Fixed: 3
- Skipped: 0

## Fixed Issues

### WR-01: IntegrationsView Google Calendar card is not gated by `OAUTH_GOOGLE_ENABLED`

**Files modified:** `src/components/IntegrationsView.tsx`, `scripts/verify-oauth-gating.js`
**Commit:** 40c8d0e
**Applied fix:** Added `import { OAUTH_GOOGLE_ENABLED } from "../config/defaults"` and wrapped the entire Calendar `<div>...<SettingsPanel>...</SettingsPanel></div>` block in `{OAUTH_GOOGLE_ENABLED && ( ... )}`. When `OPENWHISPR_OAUTH_GOOGLE=false`, the Google Calendar connect/manage card no longer renders in Settings → Integrations, so users cannot trigger the unregistered `gcal-start-oauth` IPC. Also added `gcalStartOAuth` to `GOOGLE_TARGETS` in `verify-oauth-gating.js` so future regressions in the Settings panel are caught by the bundle-grep gate (note: with full DCE, this literal is removed when the gate flag is `false`, providing a mechanical absence signal).

### WR-02: `pickBool` and `define`-injected booleans in vite.config are functionally inert

**Files modified:** `src/config/defaults.ts`, `src/vite.config.mjs`
**Commit:** 763b1c1
**Applied fix:** Adopted Option (a) from the review. Removed `pickBool()` from `defaults.ts` entirely and changed `OAUTH_{GOOGLE,APPLE,MICROSOFT}_ENABLED` to direct re-exports of `Generated.OAUTH_*_ENABLED`. Removed the three `VITE_OPENWHISPR_OAUTH_*_ENABLED` entries from `buildTimeDefaults` in `src/vite.config.mjs`, because they were used only by the now-deleted `define` substitutions and the now-deleted `pickBool` lookups (the `runtime-env.json` writer is OK without them — it's a dev-time debug artifact and the truthful values live in `build-config.generated.cjs`). Behavior unchanged: gating still flows through `Generated.*` boolean literals which are real DCE-friendly module-scope constants. Added an explanatory comment cross-referencing review WR-02. Note: this fix touches gating-relevant code; verifier should confirm `npm run verify:oauth-gating` still passes — added to verification recommendation below.

### WR-03: `MeetingDetectionEngine` receives null `googleCalendarManager` — implicit contract

**Files modified:** `src/helpers/meetingDetectionEngine.js`
**Commit:** 32195d8
**Applied fix:** Added `this.googleCalendarManager = googleCalendarManager || null` (was bare assignment) plus a multi-line comment at the constructor boundary documenting that the parameter is nullable when `OAUTH_GOOGLE_ENABLED=false`, and that all call sites within the class MUST use optional chaining. Did not change the constructor signature itself (the file is plain JS, not TypeScript) — the comment is the contract documentation. The unit/integration check suggested in the review (build with `OPENWHISPR_OAUTH_GOOGLE=false` and exercise meeting-detection startup) is left as a follow-up — out of scope for a documentation-and-defensive-assertion fix.

## Verification Recommendations (for verifier phase)

1. Build renderer with `OPENWHISPR_OAUTH_GOOGLE=false npm run build:renderer`, open Control Panel → Integrations, confirm the Google Calendar card is absent. (WR-01)
2. Run `node scripts/verify-oauth-gating.js` end-to-end and confirm all 4 scenarios still pass. The newly-added `gcalStartOAuth` target should now appear in dist/ for the default / apple-disabled / microsoft-disabled scenarios and be absent in the google-disabled scenario. (WR-01 + WR-02)
3. Launch app with `OPENWHISPR_OAUTH_GOOGLE=false npm start`, confirm meeting detection starts cleanly with no `Cannot read properties of null` crash from `MeetingDetectionEngine`. (WR-03)

## Skipped Issues

None.

---

_Fixed: 2026-05-08_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
