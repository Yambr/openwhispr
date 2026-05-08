---
phase: 03-build-time-env-refactor
plan: 6
type: execute
wave: 5
depends_on: [2, 3, 4, 5]
files_modified:
  - scripts/verify-defaults-parity.js
  - package.json
  - docs/SELF_HOSTING.md
autonomous: false
requirements: [CFG-02, CFG-04]

must_haves:
  truths:
    - "scripts/verify-defaults-parity.js exists and exits 0 on a clean refactored tree"
    - "Running the script with any URL literal re-introduced into a non-defaults file exits 1 with a precise file:line list"
    - "npm run verify:parity is wired in package.json"
    - "process.env.OPENWHISPR_* reads outside allowed files trigger the gate"
    - "Gate allow-list includes OPENWHISPR_BACKEND_URL and OPENWHISPR_BACKEND_URL_PATTERN as separate keys (both must resolve to defaults at no-env build)"
    - "Gate allow-list includes OPENWHISPR_OAUTH_PROTOCOL_SCHEME_OVERRIDDEN derived boolean"
    - "Gate allow-list includes generated artifacts: src/config/build-config.generated.ts AND src/config/build-config.generated.cjs"
    - "Row 16 (protocol scheme) is verified via TWO anchored greps (electron-builder.config.js protocols field + main.js setAsDefaultProtocolClient call), NOT via bare-substring exemption"
    - "docs/SELF_HOSTING.md contains a Phase 3 smoke checklist mapping the 7 critical flows from RESEARCH.md to expected URLs"
    - "Default build (no env) passes all smoke-checklist items"
  artifacts:
    - path: "scripts/verify-defaults-parity.js"
      provides: "Two-tier grep gate: (1) every CONFIG_INVENTORY current value lives only in allowed files; (2) no production process.env.OPENWHISPR_* reads"
      contains: "CONFIG_INVENTORY"
    - path: "package.json"
      provides: "verify:parity npm script"
      contains: "verify:parity"
    - path: "docs/SELF_HOSTING.md"
      provides: "Phase 3 smoke checklist appended; default-build parity flows enumerated"
      contains: "Phase 3 Smoke Checklist"
  key_links:
    - from: "scripts/verify-defaults-parity.js"
      to: "docs/CONFIG_INVENTORY.md"
      via: "parses table to extract current values"
      pattern: "CONFIG_INVENTORY"
    - from: "package.json"
      to: "scripts/verify-defaults-parity.js"
      via: "npm script entry"
      pattern: "verify:parity"
---

<objective>
Wave 5 (terminal) — ship the verification gate that proves Phase 3 success criteria are mechanically met. Per D-06 (CONTEXT.md), two-tier validation:

1. `scripts/verify-defaults-parity.js`: greps every `current value` from CONFIG_INVENTORY, asserts each occurs only in allowed files (`src/config/defaults.ts`, `src/config/build-config.generated.ts`, `src/config/build-config.generated.cjs`, `electron-builder.config.js`, `scripts/generate-build-config.js`). Asserts no `process.env.OPENWHISPR_*` reads in production code paths outside whitelisted files.
2. Manual smoke checklist in `docs/SELF_HOSTING.md` covering 7 critical flows.

**Revision note (iteration 1):**
- Allow-list now includes BOTH `*.generated.ts` and `*.generated.cjs` (Blocker 2 split).
- Allow-list separately tracks `OPENWHISPR_BACKEND_URL` (default `""`) and `OPENWHISPR_BACKEND_URL_PATTERN` (default `"https://api.openwhispr.com/*"`) per Blocker 1.
- Allow-list adds `OPENWHISPR_OAUTH_PROTOCOL_SCHEME_OVERRIDDEN` derived boolean per Blocker 3.
- Per Warning 6, row 16 (the bare word `openwhispr`) is no longer exempted via substring skip. It is verified via TWO anchored greps targeting the specific contexts where the literal would indicate a regression.
- Must-haves re-derived to reflect the BACKEND_URL + BACKEND_URL_PATTERN split (both must exist, both must default correctly).

Includes a human-verify checkpoint to execute the smoke checklist.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/03-build-time-env-refactor/03-CONTEXT.md
@.planning/phases/03-build-time-env-refactor/03-RESEARCH.md
@docs/CONFIG_INVENTORY.md
@docs/SELF_HOSTING.md

<interfaces>
Allowed source locations for URL literals (whitelist):
  src/config/defaults.ts
  src/config/build-config.generated.ts
  src/config/build-config.generated.cjs       <-- ADDED (Blocker 2 fix: main-process artifact)
  electron-builder.config.js
  scripts/generate-build-config.js
  scripts/verify-defaults-parity.js
  docs/**
  .planning/**
  node_modules/**
  .git/**
  src/dist/**
  src/locales/**
  test/**, **/*.test.{ts,js,tsx}

Allowed locations for `process.env.OPENWHISPR_*` reads:
  scripts/generate-build-config.js
  electron-builder.config.js
  src/vite.config.mjs
  scripts/verify-defaults-parity.js
  docs/**, .planning/**

Phase 3 expanded env-var roster (gate must recognize all):
  OPENWHISPR_AUTH_URL
  OPENWHISPR_BACKEND_URL                              (default "")
  OPENWHISPR_BACKEND_URL_PATTERN                      (default "https://api.openwhispr.com/*")  <-- NEW (Blocker 1 fix)
  OPENWHISPR_OAUTH_DESKTOP_CALLBACK_URL
  OPENWHISPR_MCP_URL
  OPENWHISPR_OAUTH_GOOGLE_AUTH_URL
  OPENWHISPR_OAUTH_GOOGLE_TOKEN_URL
  OPENWHISPR_OAUTH_GOOGLE_REVOKE_URL
  OPENWHISPR_OAUTH_GOOGLE_CALENDAR_API_URL
  OPENWHISPR_OAUTH_RESET_PASSWORD_URL
  OPENWHISPR_OAUTH_PROTOCOL_SCHEME
  OPENWHISPR_OAUTH_PROTOCOL_SCHEME_OVERRIDDEN          (derived boolean — emitted by generator)  <-- NEW (Blocker 3 fix)
  OPENWHISPR_OPENAI_BASE_URL
  OPENWHISPR_ANTHROPIC_URL
  OPENWHISPR_GEMINI_BASE_URL
  OPENWHISPR_GROQ_BASE_URL
  OPENWHISPR_MISTRAL_BASE_URL

NO documented inline-literal exceptions — Plan 2 was revised to use OPENWHISPR_BACKEND_URL_PATTERN, eliminating the row 5 carve-out.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Create scripts/verify-defaults-parity.js (two-tier grep gate, anchored row 16 verification)</name>
  <files>scripts/verify-defaults-parity.js, package.json</files>
  <read_first>
    - docs/CONFIG_INVENTORY.md (full table)
    - .planning/phases/03-build-time-env-refactor/03-RESEARCH.md (§Verification & guardrails)
    - All five completed plans (post-revision)
    - package.json scripts section
  </read_first>
  <action>
    Create `scripts/verify-defaults-parity.js` (CommonJS Node script). It MUST:

    1. **Parse CONFIG_INVENTORY.md**: Read `docs/CONFIG_INVENTORY.md`, find the inventory table (markdown table starting with `| file:line | current value |`), extract every `current value` (column 2, stripped of backticks). Skip rows where current value is `_No entries_` or `""` (empty string can't be grep target).

    2. **Define exclude paths**: `["node_modules", ".git", "src/dist", "src/locales", "docs", ".planning", "scripts/verify-defaults-parity.js", "package-lock.json"]`.

    3. **Define allow-list for URL literal occurrences:**
       ```js
       const ALLOWED_LITERAL_FILES = [
         "src/config/defaults.ts",
         "src/config/build-config.generated.ts",
         "src/config/build-config.generated.cjs",        // Blocker 2 fix
         "electron-builder.config.js",
         "scripts/generate-build-config.js",
       ];
       ```

    4. **Gate 1 — URL parity (URL literals only):** For each extracted value that LOOKS like a URL (starts with `http://` or `https://`):
       - Run `grep -rnF -- "<value>" src/ main.js preload.js electron-builder.config.js` (with exclude filtering).
       - For each match: if file is in allow-list → OK; else → record violation.

    5. **Gate 1b — Row 16 protocol scheme (the bare word `openwhispr`)** — replaces the previous "skip word-boundary" exemption (Warning 6 fix):

       Do NOT do a bare substring grep — too many false positives. Instead, run TWO anchored greps targeting the EXACT contexts where the literal would indicate a regression:

       a. **electron-builder.config.js protocol field check:**
          ```bash
          grep -nE '"openwhispr"' electron-builder.config.js
          ```
          - If any match falls inside a `protocols:` or `schemes:` array literal context → violation. (Practically: this means the line has the literal NOT inside a `|| "openwhispr"` fallback expression — the only acceptable occurrence is `process.env.OPENWHISPR_OAUTH_PROTOCOL_SCHEME || "openwhispr"`.)
          - Test heuristic: grep for `"openwhispr"` and require every match to be on the same line as `process.env.OPENWHISPR_OAUTH_PROTOCOL_SCHEME` OR `||`. Other matches → violation.

       b. **main.js setAsDefaultProtocolClient direct-literal check:**
          ```bash
          grep -nE 'setAsDefaultProtocolClient\(\s*["'\'']openwhispr["'\'']\s*\)' main.js
          ```
          - Must return ZERO matches. Any match indicates the runtime is registering the bare literal instead of going through the build-config.generated.cjs constant.

       c. **Positive control:** confirm `"openwhispr"` DOES appear in `scripts/generate-build-config.js` (the generator's DEFAULTS table) — this is the canonical source. If the generator's grep returns 0, the gate itself is broken (false-pass risk) → exit 1 with diagnostic.

    6. **Gate 2 — runtime env-read prohibition:** Run `grep -rnE "process\\.env\\.OPENWHISPR_[A-Z_]+" src/ main.js preload.js` excluding allow-list paths (`scripts/generate-build-config.js`, `electron-builder.config.js`, `src/vite.config.mjs`, `scripts/verify-defaults-parity.js`). Any match outside allow-list → violation.

    7. **Output**: On success log `[verify-defaults-parity] OK — N values checked, M paths scanned` and exit 0. On failure print each violation as `<file>:<line>: <reason>`, exit 1.

    8. Add `verify:parity` to `package.json` `scripts`: `"verify:parity": "node scripts/verify-defaults-parity.js"`.

    9. Run `npm run verify:parity` once — must exit 0.

    10. **Negative tests (run during plan execution and document in SUMMARY):**
        - Inject `const x = "https://auth.openwhispr.com";` into `src/main.jsx`, re-run gate → must exit 1. Revert.
        - Inject `app.setAsDefaultProtocolClient("openwhispr");` somewhere in `main.js`, re-run gate → must exit 1. Revert.
        - Inject `const z = process.env.OPENWHISPR_AUTH_URL;` into `src/lib/auth.ts`, re-run gate → must exit 1. Revert.
  </action>
  <verify>
    <automated>node scripts/verify-defaults-parity.js && node -e "const p=require('./package.json'); if(!p.scripts['verify:parity']) process.exit(1)"</automated>
  </verify>
  <acceptance_criteria>
    - `scripts/verify-defaults-parity.js` exists; `node --check` passes.
    - `npm run verify:parity` exits 0 on the clean refactored tree.
    - Allow-list constant in script includes literally: `src/config/defaults.ts`, `src/config/build-config.generated.ts`, `src/config/build-config.generated.cjs`, `electron-builder.config.js`, `scripts/generate-build-config.js`.
    - Gate 1b (row 16) implements the TWO anchored greps above; no bare-substring exemption code path.
    - Three negative tests (auth URL injection, setAsDefaultProtocolClient injection, process.env injection) all caught by gate.
    - `package.json` `scripts.verify:parity` exists.
    - Gate parses ≥ 20 distinct values from CONFIG_INVENTORY.
  </acceptance_criteria>
  <done>Parity gate ships with anchored row 16 verification and updated allow-list; passes on clean tree; three negative tests confirm regression catching.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Add Phase 3 smoke checklist to docs/SELF_HOSTING.md</name>
  <files>docs/SELF_HOSTING.md</files>
  <read_first>
    - docs/SELF_HOSTING.md (full file — find appropriate section to append)
    - .planning/phases/03-build-time-env-refactor/03-RESEARCH.md (§Default-equivalence proof strategy)
    - docs/CONFIG_INVENTORY.md (row references)
  </read_first>
  <action>
    Append `## Phase 3 Smoke Checklist` to `docs/SELF_HOSTING.md`. The section MUST contain:

    1. Short paragraph: this checklist verifies a default `npm run build` (no `OPENWHISPR_*` env vars) produces a binary whose network behavior matches pre-refactor Yambr.

    2. Markdown table: `| Flow | Action | Expected outcome | CONFIG_INVENTORY rows |` with the 7 rows from RESEARCH.md §Default-equivalence proof strategy:
       - Sign-in (email)
       - Sign-in (Google social)
       - Calendar OAuth
       - Transcription (cloud OpenAI)
       - Transcription (Groq)
       - MCP UI
       - Custom protocol

    3. Subsection `### How to inspect URLs without instrumenting`:
       - Enable `OPENWHISPR_LOG_LEVEL=debug` in `.env`.
       - macOS protocol scheme: `defaults read "$(find dist -name '*.app' | head -1)/Contents/Info.plist" CFBundleURLTypes`.
       - Network-level: Charles Proxy / mitmproxy.

    4. Subsection `### Custom-build smoke (optional)`: same checklist with custom env example (`OPENWHISPR_AUTH_URL=https://auth.example.com OPENWHISPR_BACKEND_URL=https://api.example.com OPENWHISPR_BACKEND_URL_PATTERN="https://api.example.com/*" npm run build`) — expected: every "auth.openwhispr.com" mention becomes "auth.example.com", and the webRequest pattern in main.js logs the new pattern.

    DO NOT touch any other section — the existing Phase 1 walkthrough must be intact.
  </action>
  <verify>
    <automated>grep -q "Phase 3 Smoke Checklist" docs/SELF_HOSTING.md && grep -q "Sign-in (email)" docs/SELF_HOSTING.md && grep -q "Custom protocol" docs/SELF_HOSTING.md && grep -q "Custom-build smoke" docs/SELF_HOSTING.md && grep -c "CONFIG_INVENTORY" docs/SELF_HOSTING.md | awk '{ if($1<2) exit 1 }'</automated>
  </verify>
  <acceptance_criteria>
    - `docs/SELF_HOSTING.md` contains literal heading `## Phase 3 Smoke Checklist`.
    - New table contains all 7 flows.
    - `### How to inspect URLs without instrumenting` and `### Custom-build smoke (optional)` subsections present.
    - Custom-build example references `OPENWHISPR_BACKEND_URL_PATTERN`.
    - Pre-existing Phase 1 content unchanged (`git diff --stat docs/SELF_HOSTING.md` shows only additions).
  </acceptance_criteria>
  <done>Smoke checklist documented; references the BACKEND_URL_PATTERN split.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: Human executes Phase 3 smoke checklist on default build</name>
  <what-built>The full Phase 3 refactor (Plans 1-5, post-revision) plus the parity gate (Task 1) and smoke checklist (Task 2). This checkpoint executes the smoke checklist against a default `npm run build` to validate ROADMAP success criterion #4.</what-built>
  <action>Human verification only — execute the steps in &lt;how-to-verify&gt; below; no Claude-side action.</action>
  <how-to-verify>
    1. **Build with no env vars:**
       ```
       unset OPENWHISPR_AUTH_URL OPENWHISPR_BACKEND_URL OPENWHISPR_BACKEND_URL_PATTERN OPENWHISPR_OAUTH_PROTOCOL_SCHEME OPENWHISPR_OPENAI_BASE_URL OPENWHISPR_GROQ_BASE_URL OPENWHISPR_MISTRAL_BASE_URL OPENWHISPR_MCP_URL OPENWHISPR_OAUTH_DESKTOP_CALLBACK_URL OPENWHISPR_OAUTH_RESET_PASSWORD_URL OPENWHISPR_OAUTH_GOOGLE_AUTH_URL OPENWHISPR_OAUTH_GOOGLE_TOKEN_URL OPENWHISPR_OAUTH_GOOGLE_REVOKE_URL OPENWHISPR_OAUTH_GOOGLE_CALENDAR_API_URL OPENWHISPR_ANTHROPIC_URL OPENWHISPR_GEMINI_BASE_URL
       OPENWHISPR_LOG_LEVEL=debug CSC_IDENTITY_AUTO_DISCOVERY=false npm run pack
       ```
       Expected: build completes; `dist/` contains a packaged app.

    2. **Run parity gate:**
       ```
       npm run verify:parity
       ```
       Expected: exit 0.

    3. **Execute smoke checklist** from `docs/SELF_HOSTING.md`. For each of the 7 flows, perform the action and confirm the expected URL appears in the debug log:
       - Sign-in (email) → `https://auth.openwhispr.com/api/auth/...`
       - Sign-in (Google social) → `accounts.google.com/o/oauth2/v2/auth` + `openwhispr.com/auth/desktop-callback`
       - Calendar OAuth → `oauth2.googleapis.com/token` + `googleapis.com/calendar/v3`
       - Transcription (OpenAI) → `api.openai.com/v1/audio/transcriptions`
       - Transcription (Groq) → `api.groq.com/openai/v1/audio/transcriptions`
       - MCP UI → `https://mcp.openwhispr.com/mcp`
       - Custom protocol → Info.plist registers `openwhispr://`

    4. **Webrequest pattern check (new since revision):** Confirm debug log shows the webRequest filter registered with `https://api.openwhispr.com/*` (from `OPENWHISPR_BACKEND_URL_PATTERN` default) — proves Blocker 1 fix is byte-identical to pre-refactor.

    5. Report pass/fail outcome of each flow in the Plan 6 SUMMARY.
  </how-to-verify>
  <resume-signal>Type "approved" once all 7 flows pass with expected URLs AND the webRequest pattern check confirms `api.openwhispr.com/*` registration. Report any discrepancy.</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Source tree → CI/local verification | Parity gate is mechanical proof of CFG-02 success criterion #1. |
| Default build → end-user behavior | Smoke checklist proves CFG-02/CFG-04 success criterion #4. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-03-17 | Tampering | Future regressions reintroducing literals | mitigate | `npm run verify:parity` runs the gate; Phase 4 wires into CI. |
| T-03-18 | Information Disclosure | Smoke checklist URLs in docs | accept | Already documented in BACKEND_SPEC/OAUTH_SPEC; no new disclosure. |
| T-03-19 | Elevation of Privilege | Allow-list bypass | mitigate | Allow-list paths explicitly enumerated; adding new entry requires reviewable diff. |
| T-03-23 | Tampering | Row 16 bare-word ambiguity | mitigate | Anchored greps (electron-builder.config.js context + main.js setAsDefaultProtocolClient) replace fragile substring exemption. |
</threat_model>

<verification>
- `scripts/verify-defaults-parity.js` exists, parses CONFIG_INVENTORY (≥20 values), passes on clean tree.
- Three negative tests demonstrate gate catches regressions.
- Allow-list includes both `.generated.ts` AND `.generated.cjs`.
- Row 16 verified via two anchored greps, not bare substring.
- `npm run verify:parity` wired in package.json.
- `docs/SELF_HOSTING.md` has Phase 3 Smoke Checklist section.
- Human-verify smoke checklist passes all 7 flows + webRequest pattern check.
</verification>

<success_criteria>
All `must_haves.truths` observable. ROADMAP Phase 3 success criteria all met:
- #1 (zero hardcoded values outside allow-list including BOTH backend URL keys): proved by Gate 1 + Gate 1b.
- #2 (`OPENWHISPR_BACKEND_URL` controls backend at build time, `OPENWHISPR_BACKEND_URL_PATTERN` controls webRequest filter): proved by Plan 2 + Plan 5.
- #3 (no runtime reads of new env vars in production): proved by Gate 2.
- #4 (default-build parity, including pattern registration): proved by Task 3 human verification.
</success_criteria>

<output>
After completion, create `.planning/phases/03-build-time-env-refactor/03-06-SUMMARY.md` containing:
- Output of `npm run verify:parity` on the final tree.
- Three negative-test results (literal injection, setAsDefaultProtocolClient injection, process.env injection — all caught).
- Pass/fail outcome of each of the 7 smoke-checklist flows + webRequest pattern check.
This SUMMARY is the source-level + behavioral proof that Phase 3 succeeded.
</output>
