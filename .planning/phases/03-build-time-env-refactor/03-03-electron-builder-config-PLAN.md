---
phase: 03-build-time-env-refactor
plan: 3
type: execute
wave: 3
depends_on: [1]
files_modified:
  - electron-builder.json
  - electron-builder.config.js
  - main.js
  - package.json
autonomous: false
requirements: [CFG-02]

must_haves:
  truths:
    - "electron-builder.json no longer exists; electron-builder.config.js is the sole packaging config"
    - "OPENWHISPR_OAUTH_PROTOCOL_SCHEME=foo at build time produces a packaged binary with foo:// URL scheme registered"
    - "Default build (no env) produces an Info.plist registering openwhispr:// (parity with pre-refactor)"
    - "main.js DEFAULT_OAUTH_PROTOCOL_BY_CHANNEL still resolves to openwhispr when env unset; OPENWHISPR_OAUTH_PROTOCOL_SCHEME overrides when set"
  artifacts:
    - path: "electron-builder.config.js"
      provides: "JS-format electron-builder config that reads process.env.OPENWHISPR_OAUTH_PROTOCOL_SCHEME at build time"
      contains: "OPENWHISPR_OAUTH_PROTOCOL_SCHEME"
    - path: "main.js"
      provides: "DEFAULT_OAUTH_PROTOCOL_BY_CHANNEL using OPENWHISPR_OAUTH_PROTOCOL_SCHEME from defaults.ts (env-wins-when-set)"
  key_links:
    - from: "electron-builder.config.js"
      to: "process.env.OPENWHISPR_OAUTH_PROTOCOL_SCHEME"
      via: "top-level env read at build time"
      pattern: "OPENWHISPR_OAUTH_PROTOCOL_SCHEME"
    - from: "main.js DEFAULT_OAUTH_PROTOCOL_BY_CHANNEL"
      to: "src/config/defaults.ts OPENWHISPR_OAUTH_PROTOCOL_SCHEME"
      via: "named import"
      pattern: "OPENWHISPR_OAUTH_PROTOCOL_SCHEME"
---

<objective>
Wave 3 — convert `electron-builder.json` to `electron-builder.config.js` (CommonJS module) so the protocol scheme literal (CONFIG_INVENTORY row 16) becomes build-time configurable via `process.env.OPENWHISPR_OAUTH_PROTOCOL_SCHEME`. Update the runtime mirror in `main.js:50-52` (`DEFAULT_OAUTH_PROTOCOL_BY_CHANNEL`) so it reads the same logical value via the defaults.ts import — env-var wins when set, channel map applies when unset.

Per D-04: electron-builder natively supports `.js` configs; no scripted JSON generation needed.

Includes a human-verify checkpoint because packaging affects Info.plist registration; verification requires inspecting a packaged build.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/03-build-time-env-refactor/03-CONTEXT.md
@.planning/phases/03-build-time-env-refactor/03-RESEARCH.md
@docs/CONFIG_INVENTORY.md
@electron-builder.json

<interfaces>
After Plan 1, src/config/defaults.ts exports:
  OPENWHISPR_OAUTH_PROTOCOL_SCHEME: string  (default "openwhispr")

CONFIG_INVENTORY row 16: electron-builder.json:7  "openwhispr"  → OPENWHISPR_OAUTH_PROTOCOL_SCHEME

main.js:50-52 currently has:
  const DEFAULT_OAUTH_PROTOCOL_BY_CHANNEL = { production: "openwhispr", staging: "openwhispr-staging", ... };

Decision: env-var-wins-when-set, channel-map-when-unset.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Convert electron-builder.json to electron-builder.config.js</name>
  <files>electron-builder.config.js, electron-builder.json, package.json</files>
  <read_first>
    - electron-builder.json (entire file)
    - package.json (any references to electron-builder.json or --config flags)
    - .planning/phases/03-build-time-env-refactor/03-RESEARCH.md (Refactor partitioning row 16)
  </read_first>
  <action>
    1. Create `electron-builder.config.js` (CommonJS) with `module.exports = { ... }`. Copy every field from `electron-builder.json` verbatim into the JS object.
    2. At the top of the JS file, add: `const PROTOCOL_SCHEME = process.env.OPENWHISPR_OAUTH_PROTOCOL_SCHEME || "openwhispr";`
    3. In the converted config, replace the literal `"openwhispr"` inside the `protocols`/`schemes` array (`electron-builder.json:7`) with `PROTOCOL_SCHEME`. Keep the rest of the protocols block identical.
    4. DO NOT change any other field — files, mac, win, linux, asarUnpack, fileAssociations, etc. must be byte-for-byte identical.
    5. Delete `electron-builder.json` via `git rm electron-builder.json`.
    6. If `package.json` has any `--config electron-builder.json` flag, replace with `--config electron-builder.config.js` or remove (electron-builder auto-discovers `.config.js`).
  </action>
  <verify>
    <automated>test ! -f electron-builder.json && test -f electron-builder.config.js && node --check electron-builder.config.js && node -e "const c=require('./electron-builder.config.js'); if(typeof c!=='object' || !c.appId) process.exit(1)" && OPENWHISPR_OAUTH_PROTOCOL_SCHEME=testscheme node -e "const c=require('./electron-builder.config.js'); if(!JSON.stringify(c).includes('testscheme')) process.exit(1)"</automated>
  </verify>
  <acceptance_criteria>
    - `electron-builder.json` does not exist.
    - `electron-builder.config.js` exists, `node --check` passes, `require()` returns an object with `.appId`.
    - With `OPENWHISPR_OAUTH_PROTOCOL_SCHEME=testscheme`, `JSON.stringify(require(...))` contains `"testscheme"`.
    - With env unset, `JSON.stringify(require(...))` contains `"openwhispr"` and the count of `"openwhispr"` substring matches the pre-refactor JSON's count.
    - Every top-level key from the pre-refactor `electron-builder.json` is present in the JS module's export.
  </acceptance_criteria>
  <done>JS config module supersedes JSON; env var override verified mechanically.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Update main.js DEFAULT_OAUTH_PROTOCOL_BY_CHANNEL to honor env override</name>
  <files>main.js</files>
  <read_first>
    - main.js (lines 48-150 — protocol scheme handling, getOAuthProtocol)
    - src/config/defaults.ts (confirm OPENWHISPR_OAUTH_PROTOCOL_SCHEME export)
    - .planning/phases/03-build-time-env-refactor/03-RESEARCH.md (Row 16 mirror tricky-item)
  </read_first>
  <action>
    1. main.js already imports from `config/defaults` per Plan 2 Task 2. Extend the destructure to include `OPENWHISPR_OAUTH_PROTOCOL_SCHEME`.
    2. Detect whether the env override is "set" by checking the GENERATED module: `const Generated = require("./src/dist/config/build-config.generated"); const protocolOverridden = Generated.OPENWHISPR_OAUTH_PROTOCOL_SCHEME !== "openwhispr";` (the generated value differs from default ONLY when the maintainer set the env at build time).
    3. Modify `getOAuthProtocol(channel)` (around line 136-143) so:
       - If `protocolOverridden` is true → return `OPENWHISPR_OAUTH_PROTOCOL_SCHEME` regardless of channel.
       - Else → fall through to existing channel-map lookup (`DEFAULT_OAUTH_PROTOCOL_BY_CHANNEL[channel] || DEFAULT_OAUTH_PROTOCOL_BY_CHANNEL.production`).
    4. Remove any inline literal `"openwhispr"` strings that were used as final fallbacks in this function — they now route through `OPENWHISPR_OAUTH_PROTOCOL_SCHEME`. Note the `DEFAULT_OAUTH_PROTOCOL_BY_CHANNEL` map itself MAY retain the `"openwhispr"` / `"openwhispr-staging"` literals because those are channel labels, not the configurable scheme. Add a comment above the map: `// Channel-specific defaults; OPENWHISPR_OAUTH_PROTOCOL_SCHEME (CONFIG_INVENTORY row 16) overrides all of these when set.`
    5. Verify: `grep -nF "process.env.VITE_OPENWHISPR_PROTOCOL" main.js` and `grep -nF "process.env.OPENWHISPR_PROTOCOL" main.js` — these old runtime fallbacks may still exist (per CONFIG_INVENTORY row 16 note: "Already partially env-driven at runtime via VITE_OPENWHISPR_PROTOCOL / OPENWHISPR_PROTOCOL"). Replace them with the import-based check above. Their grep counts must be 0 after this task.
  </action>
  <verify>
    <automated>node --check main.js && test "$(grep -cE 'process\.env\.(VITE_)?OPENWHISPR_PROTOCOL' main.js)" = "0" && grep -q "OPENWHISPR_OAUTH_PROTOCOL_SCHEME" main.js && grep -q "Channel-specific defaults" main.js</automated>
  </verify>
  <acceptance_criteria>
    - `node --check main.js` exits 0.
    - `grep -cE "process\.env\.(VITE_)?OPENWHISPR_PROTOCOL" main.js` outputs `0`.
    - main.js destructure imports `OPENWHISPR_OAUTH_PROTOCOL_SCHEME` from `config/defaults`.
    - main.js contains the channel-map override comment from step 4.
    - `getOAuthProtocol` returns the env override value when set, else falls through to channel map.
  </acceptance_criteria>
  <done>Runtime protocol resolution mirrors build-time scheme; env override beats channel map.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: Human verifies packaged binary registers correct protocol</name>
  <what-built>Custom-protocol-scheme override via OPENWHISPR_OAUTH_PROTOCOL_SCHEME at build time. Default build still registers openwhispr://; setting the env var registers a custom scheme.</what-built>
  <action>Human verification only — execute the steps in &lt;how-to-verify&gt; below; no Claude-side action.</action>
  <how-to-verify>
    Run two builds and inspect the produced Info.plist (macOS) or registry hint (Windows/Linux):

    1. **Default build:**
       ```
       OPENWHISPR_OAUTH_PROTOCOL_SCHEME= CSC_IDENTITY_AUTO_DISCOVERY=false npm run pack
       ```
       Then inspect: `defaults read "$(find dist -name '*.app' | head -1)/Contents/Info.plist" CFBundleURLTypes 2>/dev/null | grep -A1 CFBundleURLSchemes`
       Expected: scheme = `openwhispr`.

    2. **Custom build:**
       ```
       OPENWHISPR_OAUTH_PROTOCOL_SCHEME=mycorp CSC_IDENTITY_AUTO_DISCOVERY=false npm run pack
       ```
       Then inspect the new Info.plist same way.
       Expected: scheme = `mycorp`.

    3. Confirm both `npm run pack` commands completed without errors.
    4. Confirm the dist app launches (`open dist/mac-arm64/*.app` or platform equivalent) and dictation overlay appears.

    On Linux/Windows, the equivalent check: unzip the AppImage or NSIS installer and grep for the scheme name in the embedded resources.
  </how-to-verify>
  <resume-signal>Type "approved" once both builds register the expected scheme. Report any discrepancy with build output and Info.plist excerpt.</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Build env → packaged Info.plist | `OPENWHISPR_OAUTH_PROTOCOL_SCHEME` is baked into platform-native protocol registration metadata at packaging time. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-03-08 | Spoofing | Custom protocol scheme registration | mitigate | Scheme value is a build-time decision by the maintainer; documented in CONFIG_INVENTORY. Default `"openwhispr"` preserved when env unset. |
| T-03-09 | Tampering | electron-builder.config.js reading process.env at top level | accept | This is a build-time read in a build-tool config file; allowed by Phase 3 grep gate (Plan 5) which whitelists `electron-builder.config.js`. |
| T-03-10 | Information Disclosure | JS config file structure | accept | All values previously in JSON; no new secrets introduced. The conversion is pure mechanical translation. |
</threat_model>

<verification>
- electron-builder.json deleted.
- electron-builder.config.js parses, exports object, env override mechanically verified.
- main.js retains channel-aware behavior when env unset; env override wins when set.
- Human verification of Info.plist confirms platform-level registration.
</verification>

<success_criteria>
All `must_haves.truths` observable; both packaged binaries (default + custom scheme) register the correct protocol per Info.plist inspection.
</success_criteria>

<output>
After completion, create `.planning/phases/03-build-time-env-refactor/03-03-SUMMARY.md` documenting Info.plist verification output for both builds.
</output>
