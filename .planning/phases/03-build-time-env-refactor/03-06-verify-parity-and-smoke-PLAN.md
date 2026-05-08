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
    - "docs/SELF_HOSTING.md contains a Phase 3 smoke checklist mapping the 7 critical flows from RESEARCH.md to expected URLs"
    - "Default build (no env) passes all smoke-checklist items"
  artifacts:
    - path: "scripts/verify-defaults-parity.js"
      provides: "Two-tier grep gate: (1) every CONFIG_INVENTORY current value lives only in defaults.ts/electron-builder.config.js; (2) no production process.env.OPENWHISPR_* reads"
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
Wave 5 (terminal) — ship the verification gate that proves Phase 3 success criteria are mechanically met. Per D-06 (CONTEXT.md), this is two-tier validation:

1. `scripts/verify-defaults-parity.js`: greps every `current value` from CONFIG_INVENTORY, asserts each occurs exactly once in source, and that occurrence is in `src/config/defaults.ts` or `electron-builder.config.js` (or `src/config/build-config.generated.ts`). Also asserts no `process.env.OPENWHISPR_*` reads in production code paths outside allowed files.
2. Manual smoke checklist in `docs/SELF_HOSTING.md` covering 7 critical flows (sign-in email, sign-in Google, calendar OAuth, transcription OpenAI, transcription Groq, MCP UI, custom protocol).

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
  electron-builder.config.js
  scripts/generate-build-config.js
  scripts/verify-defaults-parity.js (the gate itself contains literals from CONFIG_INVENTORY for matching)
  docs/** (documentation may quote URLs)
  .planning/** (planning artifacts may quote URLs)
  node_modules/** (third-party — never gated)
  .git/** (excluded)
  src/dist/** (compiled output — excluded)
  src/locales/** (translation strings may contain URLs — excluded for now)
  test/**, **/*.test.{ts,js,tsx} (test fixtures — excluded; if any test contains a URL it is acceptable)

Allowed locations for `process.env.OPENWHISPR_*` reads:
  scripts/generate-build-config.js
  electron-builder.config.js
  src/vite.config.mjs
  scripts/verify-defaults-parity.js (the gate may grep for these)
  docs/**, .planning/** (documentation/planning)

Documented exception (Plan 2 row 5 parity): `main.js` may contain ONE inline `https://api.openwhispr.com` literal IF accompanied by the comment `// CONFIG_INVENTORY row 5 parity literal`.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Create scripts/verify-defaults-parity.js (two-tier grep gate)</name>
  <files>scripts/verify-defaults-parity.js, package.json</files>
  <read_first>
    - docs/CONFIG_INVENTORY.md (full table)
    - .planning/phases/03-build-time-env-refactor/03-RESEARCH.md (§Verification & guardrails)
    - All five completed plans: 03-01-defaults-source-of-truth-PLAN.md, 03-02-auth-cluster-PLAN.md, 03-03-electron-builder-config-PLAN.md, 03-04-google-oauth-cluster-PLAN.md, 03-05-model-registry-litellm-PLAN.md
    - package.json scripts section
  </read_first>
  <action>
    Create `scripts/verify-defaults-parity.js` (CommonJS Node script). It MUST:

    1. **Parse CONFIG_INVENTORY.md**: Read `docs/CONFIG_INVENTORY.md`, find the inventory table (markdown table starting with `| file:line | current value |`), extract every `current value` (column 2, stripped of backticks). Skip rows where current value is `_No entries_` or `""` (empty default — empty string isn't a grep target).

    2. **Define exclude paths**: `["node_modules", ".git", "src/dist", "src/locales", "docs", ".planning", "scripts/verify-defaults-parity.js", "package-lock.json"]`.

    3. **Define allow-list for URL literal occurrences**: `["src/config/defaults.ts", "src/config/build-config.generated.ts", "electron-builder.config.js", "scripts/generate-build-config.js"]`.

    4. **Define documented-exception map**: `{ "https://api.openwhispr.com": { file: "main.js", maxCount: 1, requiredComment: "CONFIG_INVENTORY row 5 parity literal" } }`.

    5. **Gate 1 — URL parity**: For each extracted value:
       - Run `grep -rnF -- "<value>" src/ main.js preload.js electron-builder.config.js` (excluding the configured paths — implement via per-result filtering).
       - For each match: if file is in allow-list → OK; else if file matches a documented exception and count + comment-on-line check pass → OK; else → record as violation.
       - For values that are very common substrings (e.g., the bare word `openwhispr` for the protocol scheme), skip word-boundary grep and instead require the value to appear inside a JSON-array context — the simplest approach is to special-case row 16 by ONLY allowing `openwhispr` in `electron-builder.config.js` AND `src/config/build-config.generated.ts` AND `src/config/defaults.ts` AND `main.js` (channel map labels), and otherwise not gate the bare word. Document this special case at the top of the script.

    6. **Gate 2 — runtime env-read prohibition**: Run `grep -rnE "process\\.env\\.OPENWHISPR_[A-Z_]+" src/ main.js preload.js` excluding the gate's allow-list paths (`scripts/generate-build-config.js`, `electron-builder.config.js`, `src/vite.config.mjs`, `scripts/verify-defaults-parity.js`). Any match outside allow-list → violation.

    7. **Output**: On success, log `[verify-defaults-parity] OK — N values checked, M paths scanned` and exit 0. On failure, print each violation as `<file>:<line>: <reason>`, then exit 1.

    8. Add `verify:parity` to `package.json` `scripts`: `"verify:parity": "node scripts/verify-defaults-parity.js"`.

    9. Run `npm run verify:parity` once — must exit 0 (proving the gate passes on the clean refactored tree).
  </action>
  <verify>
    <automated>node scripts/verify-defaults-parity.js && node -e "const p=require('./package.json'); if(!p.scripts['verify:parity']) process.exit(1)"</automated>
  </verify>
  <acceptance_criteria>
    - `scripts/verify-defaults-parity.js` exists and is valid Node JS (`node --check` passes).
    - `npm run verify:parity` exits 0 on the clean refactored tree.
    - Negative test: temporarily inject `const x = "https://auth.openwhispr.com";` into `src/main.jsx`, re-run gate — must exit 1 with `src/main.jsx:` in the output. Revert the injection. Document this negative-test result in the SUMMARY.
    - `package.json` `scripts.verify:parity` exists.
    - Gate parses ≥ 20 distinct values from CONFIG_INVENTORY (proving table parsing works).
  </acceptance_criteria>
  <done>Parity gate ships and passes on clean tree; negative test confirms it catches regressions.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Add Phase 3 smoke checklist to docs/SELF_HOSTING.md</name>
  <files>docs/SELF_HOSTING.md</files>
  <read_first>
    - docs/SELF_HOSTING.md (full file — find appropriate section to append)
    - .planning/phases/03-build-time-env-refactor/03-RESEARCH.md (§Default-equivalence proof strategy — the 7-row smoke table)
    - docs/CONFIG_INVENTORY.md (row references in the smoke table)
  </read_first>
  <action>
    Append a new section `## Phase 3 Smoke Checklist` to `docs/SELF_HOSTING.md`. The section MUST contain:

    1. A short paragraph explaining: this checklist verifies that a default `npm run build` (with no `OPENWHISPR_*` env vars set) produces a binary whose network behavior is identical to the pre-refactor Yambr fork. Inventory rows in the right column cross-reference `CONFIG_INVENTORY.md`.

    2. A markdown table with exactly these columns: `| Flow | Action | Expected outcome | CONFIG_INVENTORY rows |` and the 7 rows from RESEARCH.md §Default-equivalence proof strategy:
       - Sign-in (email)
       - Sign-in (Google social)
       - Calendar OAuth
       - Transcription (cloud OpenAI)
       - Transcription (Groq)
       - MCP UI
       - Custom protocol

       Each row's content per RESEARCH.md (verbatim or near-verbatim).

    3. A short subsection `### How to inspect URLs without instrumenting` listing:
       - Enable `OPENWHISPR_LOG_LEVEL=debug` in `.env`.
       - For protocol scheme: macOS `defaults read "$(find dist -name '*.app' | head -1)/Contents/Info.plist" CFBundleURLTypes`.
       - Network-level fallback: Charles Proxy / mitmproxy.

    4. A short subsection `### Custom-build smoke (optional)`: same checklist but with a custom env example (e.g., `OPENWHISPR_AUTH_URL=https://auth.example.com OPENWHISPR_BACKEND_URL=https://api.example.com npm run build`) — expected outcome: every "auth.openwhispr.com" mention in the default checklist becomes "auth.example.com" etc.

    DO NOT touch any other section of `SELF_HOSTING.md` (the existing Phase 1 walkthrough must be intact).
  </action>
  <verify>
    <automated>grep -q "Phase 3 Smoke Checklist" docs/SELF_HOSTING.md && grep -q "Sign-in (email)" docs/SELF_HOSTING.md && grep -q "Custom protocol" docs/SELF_HOSTING.md && grep -q "Custom-build smoke" docs/SELF_HOSTING.md && grep -c "CONFIG_INVENTORY" docs/SELF_HOSTING.md | awk '{ if($1<2) exit 1 }'</automated>
  </verify>
  <acceptance_criteria>
    - `docs/SELF_HOSTING.md` contains the literal heading `## Phase 3 Smoke Checklist`.
    - The new table contains all 7 flows listed above.
    - `### How to inspect URLs without instrumenting` subsection present.
    - `### Custom-build smoke (optional)` subsection present.
    - Pre-existing Phase 1 content is unchanged (verifiable by `git diff --stat docs/SELF_HOSTING.md` showing only additions).
  </acceptance_criteria>
  <done>Smoke checklist documented; Phase 4 can build on this for CFG-05 (BUILD_CONFIG.md).</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: Human executes Phase 3 smoke checklist on default build</name>
  <what-built>The full Phase 3 refactor (Plans 1-5) plus the parity gate (Task 1) and the smoke checklist (Task 2). This checkpoint executes the smoke checklist against a default `npm run build` to validate ROADMAP success criterion #4: "Default build (no env vars set) produces a binary whose network behavior is identical to pre-refactor."</what-built>
  <action>Human verification only — execute the steps in &lt;how-to-verify&gt; below; no Claude-side action.</action>
  <how-to-verify>
    1. **Build with no env vars:**
       ```
       unset OPENWHISPR_AUTH_URL OPENWHISPR_BACKEND_URL OPENWHISPR_OAUTH_PROTOCOL_SCHEME OPENWHISPR_OPENAI_BASE_URL OPENWHISPR_GROQ_BASE_URL OPENWHISPR_MISTRAL_BASE_URL OPENWHISPR_MCP_URL OPENWHISPR_OAUTH_DESKTOP_CALLBACK_URL OPENWHISPR_OAUTH_RESET_PASSWORD_URL OPENWHISPR_OAUTH_GOOGLE_AUTH_URL OPENWHISPR_OAUTH_GOOGLE_TOKEN_URL OPENWHISPR_OAUTH_GOOGLE_REVOKE_URL OPENWHISPR_OAUTH_GOOGLE_CALENDAR_API_URL OPENWHISPR_ANTHROPIC_URL OPENWHISPR_GEMINI_BASE_URL
       OPENWHISPR_LOG_LEVEL=debug CSC_IDENTITY_AUTO_DISCOVERY=false npm run pack
       ```
       Expected: build completes; `dist/` contains a packaged app.

    2. **Run parity gate:**
       ```
       npm run verify:parity
       ```
       Expected: exit 0, message `[verify-defaults-parity] OK`.

    3. **Execute smoke checklist** from `docs/SELF_HOSTING.md` §Phase 3 Smoke Checklist. For each of the 7 flows, perform the action and confirm the expected URL appears in the debug log. The 7 flows:
       - Sign-in (email) → log shows request to `https://auth.openwhispr.com/api/auth/...`
       - Sign-in (Google social) → log shows redirect through `accounts.google.com/o/oauth2/v2/auth` and callback at `openwhispr.com/auth/desktop-callback`
       - Calendar OAuth → token exchange to `oauth2.googleapis.com/token`; calendar list from `googleapis.com/calendar/v3`
       - Transcription (OpenAI) — set OpenAI key, transcribe → request hits `api.openai.com/v1/audio/transcriptions`
       - Transcription (Groq) — switch to Groq, transcribe → request hits `api.groq.com/openai/v1/audio/transcriptions`
       - MCP UI → Integrations card displays `https://mcp.openwhispr.com/mcp`
       - Custom protocol → Info.plist registers `openwhispr://` scheme

    4. **Report any flow that fails or shows an unexpected URL.** Include the relevant debug log excerpt.

    Document the pass/fail outcome of each flow in the Plan 6 SUMMARY.
  </how-to-verify>
  <resume-signal>Type "approved" once all 7 flows pass with the expected URLs. Report any discrepancy with debug log excerpt and CONFIG_INVENTORY row reference.</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Source tree → CI/local verification | The parity gate is the mechanical proof of CFG-02 success criterion #1. |
| Default build → end-user behavior | Smoke checklist proves CFG-02/CFG-04 success criterion #4 (default-build parity). |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-03-17 | Tampering | Future regressions reintroducing literals | mitigate | `scripts/verify-defaults-parity.js` runs on every `npm run verify:parity`. Phase 4 wires this into CI per RESEARCH.md deferred items. |
| T-03-18 | Information Disclosure | Smoke checklist URLs in docs | accept | URLs are already documented in BACKEND_SPEC.md / OAUTH_SPEC.md from Phase 1; no new disclosure. |
| T-03-19 | Elevation of Privilege | Allow-list bypass | mitigate | Allow-list paths are explicitly enumerated in the gate; adding a new file to the allow-list requires a code change reviewable in the diff. |
</threat_model>

<verification>
- `scripts/verify-defaults-parity.js` exists, parses CONFIG_INVENTORY (≥20 values), passes on clean tree.
- Negative test (temporarily injecting a literal) demonstrates the gate catches regressions.
- `npm run verify:parity` wired in package.json.
- `docs/SELF_HOSTING.md` has the Phase 3 Smoke Checklist section + How-to-inspect + Custom-build subsections.
- Human-verify smoke checklist passes all 7 flows on a default build.
</verification>

<success_criteria>
All `must_haves.truths` observable. ROADMAP Phase 3 success criteria all met:
- #1 (zero hardcoded values outside defaults.ts): proved by Gate 1.
- #2 (`OPENWHISPR_BACKEND_URL` controls backend at build time): proved by Plan 2 Task 2 + Plan 5 Task 1.
- #3 (no runtime reads of new env vars in production): proved by Gate 2.
- #4 (default-build parity): proved by Task 3 human verification.
</success_criteria>

<output>
After completion, create `.planning/phases/03-build-time-env-refactor/03-06-SUMMARY.md` containing:
- Output of `npm run verify:parity` on the final tree.
- Negative-test result (literal injection caught by gate).
- Pass/fail outcome of each of the 7 smoke-checklist flows from Task 3.
This SUMMARY is the source-level + behavioral proof that Phase 3 succeeded.
</output>
