---
phase: 03-build-time-env-refactor
verified: 2026-05-08T00:00:00Z
status: human_needed
score: 9/10 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: null
  previous_score: null
gaps: []
deferred:
  - truth: "Default build (no env) passes all smoke-checklist items"
    addressed_in: "Phase 4"
    evidence: "Phase 4 goal: 'the default build is verified to be behaviorally identical to the current Yambr fork' — Phase 4 explicitly takes ownership of the runtime smoke walk that Plan 6 deferred under workflow.auto_advance=true"
human_verification:
  - test: "Run npm run pack with all OPENWHISPR_* env vars unset, then exercise the 7 smoke-checklist flows (sign-in email, Google social, calendar OAuth, OpenAI transcription, Groq transcription, MCP UI, custom protocol) and observe expected URLs in the debug log"
    expected: "Each flow contacts the documented default URL; webRequest filter logged with https://api.openwhispr.com/* pattern; Info.plist registers openwhispr:// scheme"
    why_human: "Requires building the binary, running it interactively, and inspecting URLs at OAuth/transcription time. Plan 6's checkpoint:human-verify task was auto-approved by workflow.auto_advance=true and was never executed against a real build. The mechanical gate proves source-level parity but not runtime behavioral parity (ROADMAP success criterion #4)."
  - test: "Build with OPENWHISPR_OAUTH_PROTOCOL_SCHEME=examplecorp and OPENWHISPR_BACKEND_URL=https://api.example.com, then attempt the Google Calendar 'Connect' flow"
    expected: "Calendar OAuth completes; deep-link returns to examplecorp:// scheme; user sees calendar events in the app"
    why_human: "Code review (CR-01 in 03-REVIEW.md) identified that src/helpers/googleCalendarOAuth.js maintains its own PROTOCOL_BY_CHANNEL table that does NOT honour OPENWHISPR_OAUTH_PROTOCOL_SCHEME overrides. main.js registers the custom scheme but googleCalendarOAuth still hands off to the channel-default scheme. This is a defect; the parity gate did not catch it because Gate 1b only scans electron-builder.config.js + main.js for the bare 'openwhispr' literal. Confirming the failure mode (or its absence) requires an interactive custom-build walkthrough."
---

# Phase 3: Build-time Env Refactor Verification Report

**Phase Goal:** Every entry in CONFIG_INVENTORY is replaced with a build-time variable; no production code path reads the new variables at runtime.
**Verified:** 2026-05-08
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | scripts/verify-defaults-parity.js exists and exits 0 on a clean refactored tree | VERIFIED | `npm run verify:parity` → `OK — 15 URL values checked across 4 scan targets` (exit 0) |
| 2 | Running the script with any URL literal re-introduced into a non-defaults file exits 1 with a precise file:line list | VERIFIED | 03-06-SUMMARY.md documents three negative tests, all caught with file:line:reason output |
| 3 | npm run verify:parity is wired in package.json | VERIFIED | `"verify:parity": "node scripts/verify-defaults-parity.js"` in package.json |
| 4 | process.env.OPENWHISPR_* reads outside allowed files trigger the gate | VERIFIED | Gate 2 scoped to 16 Phase 3 keys; negative test 3 (process.env injection in src/lib/auth.ts) caught the regression |
| 5 | Gate allow-list includes OPENWHISPR_BACKEND_URL and OPENWHISPR_BACKEND_URL_PATTERN as separate keys (both must resolve to defaults at no-env build) | VERIFIED | build-config.generated.cjs has both: `OPENWHISPR_BACKEND_URL: ""`, `OPENWHISPR_BACKEND_URL_PATTERN: "https://api.openwhispr.com/*"`; both included in scripts/verify-defaults-parity.js PHASE3_CONFIG_KEYS |
| 6 | Gate allow-list includes OPENWHISPR_OAUTH_PROTOCOL_SCHEME_OVERRIDDEN derived boolean | VERIFIED | build-config.generated.cjs:23 emits `OPENWHISPR_OAUTH_PROTOCOL_SCHEME_OVERRIDDEN: false`; scripts/generate-build-config.js sets it to a derived boolean from process.env.OPENWHISPR_OAUTH_PROTOCOL_SCHEME presence; main.js consumes it (3 occurrences) |
| 7 | Gate allow-list includes generated artifacts: src/config/build-config.generated.ts AND src/config/build-config.generated.cjs | VERIFIED | Both files exist; both are explicitly listed in ALLOWED_LITERAL_FILES in scripts/verify-defaults-parity.js |
| 8 | Row 16 (protocol scheme) verified via TWO anchored greps (electron-builder.config.js protocols field + main.js setAsDefaultProtocolClient call), NOT via bare-substring exemption | VERIFIED | scripts/verify-defaults-parity.js Gate 1b: (a) `"openwhispr"` in electron-builder.config.js must be on a line with `OPENWHISPR_OAUTH_PROTOCOL_SCHEME` or `\|\|`; (b) zero `setAsDefaultProtocolClient(\"openwhispr\")` matches in main.js; (c) positive-control grep on scripts/generate-build-config.js |
| 9 | docs/SELF_HOSTING.md contains a Phase 3 smoke checklist mapping the 7 critical flows from RESEARCH.md to expected URLs | VERIFIED | docs/SELF_HOSTING.md:361 `## Phase 3 Smoke Checklist`; 7 rows in default-build flows table; webRequest pattern check; `### How to inspect URLs without instrumenting`; `### Custom-build smoke (optional)` subsection |
| 10 | Default build (no env) passes all smoke-checklist items | UNCERTAIN | The Plan 6 checkpoint:human-verify task was auto-approved by workflow.auto_advance=true and was NEVER executed against a real binary. The 7-flow runtime walk + webRequest pattern check requires interactive validation (see human_verification section). |

**Score:** 9/10 truths verified, 1 requires human runtime verification

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| scripts/verify-defaults-parity.js | Two-tier grep gate | VERIFIED | 380 lines; CONFIG_INVENTORY parser, Gate 1, Gate 1b, Gate 2; runs clean (exit 0) |
| package.json | verify:parity npm script | VERIFIED | Script entry present |
| docs/SELF_HOSTING.md | Phase 3 Smoke Checklist appended | VERIFIED | New section at line 361, 63 lines added, prior content untouched |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| scripts/verify-defaults-parity.js | docs/CONFIG_INVENTORY.md | parses table to extract current values | VERIFIED | Script reads inventory and yields 17 distinct values, of which 15 are URLs |
| package.json | scripts/verify-defaults-parity.js | npm script entry | VERIFIED | `"verify:parity": "node scripts/verify-defaults-parity.js"` |
| main.js | build-config.generated.cjs | require + setAsDefaultProtocolClient + webRequest filter | VERIFIED | main.js:36 destructures OPENWHISPR_BACKEND_URL_PATTERN; main.js:713-717 registers webRequest filter with pattern; getOAuthProtocol uses OPENWHISPR_OAUTH_PROTOCOL_SCHEME_OVERRIDDEN |
| src/lib/auth.ts | src/config/defaults.ts | imports OPENWHISPR_AUTH_URL via Vite-defined constants | VERIFIED | No process.env reads in src/lib/auth.ts (Gate 2 passed) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Parity gate exits 0 on clean tree | `npm run verify:parity` | `OK — 15 URL values checked across 4 scan targets` | PASS |
| build-config.generated.cjs is loadable and has expected defaults | `node -e` requiring the module | 17 keys; BACKEND_URL=""; BACKEND_URL_PATTERN="https://api.openwhispr.com/*"; OVERRIDDEN=false | PASS |
| No phase-3-key process.env reads in production | `grep -rn process.env.OPENWHISPR_(AUTH_URL\|BACKEND_URL\|...) src/ main.js preload.js` excluding allow-list | Zero matches | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| CFG-02 | 03-01..03-06 (all six plans) | Refactor hardcodes to build-time env via Vite define + process.env at build time; no runtime reads | SATISFIED | Gate 1 + Gate 2 mechanically prove the source-level claim. defaults.ts (renderer) + build-config.generated.cjs (main) provide build-time injection. Gate 2 negative test confirms runtime reads are blocked. |
| CFG-04 | 03-02 + 03-05 + 03-06 | OPENWHISPR_BACKEND_URL replaces hardcoded backend URL; empty/unset env → current default | SATISFIED | OPENWHISPR_BACKEND_URL (default "") and OPENWHISPR_BACKEND_URL_PATTERN (default "https://api.openwhispr.com/*") are split correctly; main.js webRequest filter uses pattern; smoke-checklist documents the verification. Behavioral parity awaits human smoke-walk. |

No orphaned requirements (REQUIREMENTS.md maps only CFG-02 + CFG-04 to Phase 3; both are claimed by phase plans).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| src/helpers/googleCalendarOAuth.js | 18-44 | Hardcoded PROTOCOL_BY_CHANNEL table that ignores OPENWHISPR_OAUTH_PROTOCOL_SCHEME override | Warning | Custom-protocol-scheme builds will silently fail Google Calendar OAuth (CR-01 from 03-REVIEW.md). Parity gate doesn't catch it because Gate 1b scope is electron-builder.config.js + main.js only. Not a goal-blocker for default builds (criterion #4 unaffected) but undermines criterion #2's promise that "any per-service overrides from CFG-01" work end-to-end on customised builds. |
| src/lib/auth.ts | 187 | `(await window.electronAPI?.getOAuthProtocol?.()) \|\| "openwhispr"` — bare-literal fallback | Warning | WR-02 from 03-REVIEW.md. If the IPC call fails, the renderer sends ?protocol=openwhispr instead of the build-config scheme. Not caught by Gate 1b. Same caveat as above: doesn't break default builds but is a customised-build hazard. |
| src/helpers/ipcHandlers.js | 69 | `MISTRAL_TRANSCRIPTION_URL = ${OPENWHISPR_MISTRAL_BASE_URL}/audio/transcriptions` evaluated at module load | Info | WR-03 from 03-REVIEW.md — empty MISTRAL base URL would yield a relative URL. Not a parity issue, but a customised-build foot-gun. |

### Human Verification Required

#### 1. Run the Phase 3 default-build smoke checklist

**Test:** Run `npm run pack` with all `OPENWHISPR_*` env vars unset, then launch the binary and walk through each of the 7 flows in `docs/SELF_HOSTING.md ## Phase 3 Smoke Checklist`. With `OPENWHISPR_LOG_LEVEL=debug`, observe the URL each flow contacts.
**Expected:**
- Sign-in (email) → `https://auth.openwhispr.com/api/auth/...`
- Sign-in (Google social) → `accounts.google.com/o/oauth2/v2/auth` + `openwhispr.com/auth/desktop-callback`
- Calendar OAuth → `oauth2.googleapis.com/token` + `googleapis.com/calendar/v3`
- Transcription (OpenAI) → `api.openai.com/v1/audio/transcriptions`
- Transcription (Groq) → `api.groq.com/openai/v1/audio/transcriptions`
- MCP UI → `https://mcp.openwhispr.com/mcp`
- Custom protocol → Info.plist registers `openwhispr://`
- webRequest filter logged with `https://api.openwhispr.com/*` pattern
**Why human:** Plan 6's checkpoint:human-verify was auto-approved (workflow.auto_advance=true) and never executed against a real build. ROADMAP success criterion #4 (default-build behavioral parity) is the runtime second tier of proof; the source-level gate alone cannot confirm it.

#### 2. Custom-protocol Google Calendar smoke

**Test:** Build with `OPENWHISPR_OAUTH_PROTOCOL_SCHEME=examplecorp` and `OPENWHISPR_BACKEND_URL=https://api.example.com`. Attempt the Google Calendar "Connect" flow.
**Expected:** OAuth round-trip completes; deep-link returns to `examplecorp://`; calendar events become visible.
**Why human:** CR-01 (03-REVIEW.md): `src/helpers/googleCalendarOAuth.js` PROTOCOL_BY_CHANNEL bypasses the build-time scheme override. Confirming whether the failure manifests as documented requires an interactive customised build. (If the failure reproduces, this is a Phase 3 defect that should block phase closure even though the parity gate passes.)

### Gaps Summary

The mechanical parity gate is in place and passes; all source-level claims of Phase 3 are programmatically verified. **However**:

1. **Truth #10 (default-build smoke walk) is uncertain.** The 7-flow runtime walk required by ROADMAP criterion #4 was never performed — Plan 6's human-verify checkpoint was auto-approved. The maintainer must execute it against a real build before Phase 3 can be definitively closed.

2. **Two scope gaps in the parity gate (CR-01 + WR-02 from 03-REVIEW.md)** allow customised-build defects to slip past:
   - `src/helpers/googleCalendarOAuth.js` ignores `OPENWHISPR_OAUTH_PROTOCOL_SCHEME` overrides — calendar OAuth will fail on custom-scheme builds.
   - `src/lib/auth.ts:187` falls back to the bare literal `"openwhispr"` — same failure mode if the IPC call fails on a custom-scheme build.

   These do NOT affect the *default* build (where `OPENWHISPR_OAUTH_PROTOCOL_SCHEME_OVERRIDDEN=false` and the bare literal happens to be the correct scheme) and therefore do not block ROADMAP criterion #4. They DO undermine criterion #2's promise that "any per-service overrides from CFG-01" work end-to-end on customised builds. Both should be tracked as Phase 4 closure work or as a Phase 3 defect-fix iteration.

The deferred item (default-build runtime parity) maps cleanly onto Phase 4's stated goal "the default build is verified to be behaviorally identical to the current Yambr fork", so leaving it for Phase 4 is plausible — but the human checkpoint requested above should still be executed before Phase 3 is checked off in the roadmap.

---

_Verified: 2026-05-08_
_Verifier: Claude (gsd-verifier)_
