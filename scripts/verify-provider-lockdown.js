#!/usr/bin/env node
// Phase 10 provider-lockdown verification gate (PLD-06).
//
// Spawns 2 renderer builds and bundle-greps `src/dist/` (plus the repo-root
// preload bundles) for the literal strings that the OPENWHISPR_PROVIDER_LOCKDOWN
// build-time gate is supposed to dead-code-eliminate:
//
//   - `default`  (env {}):                          all literals PRESENT  (upstream parity)
//   - `lockdown` (OPENWHISPR_PROVIDER_LOCKDOWN=true): all literals ABSENT  (lockdown DCE)
//
// Modeled on scripts/verify-oauth-gating.js. Six target groups:
//   OAUTH_TARGETS         — OAuth desktop-sign-in surface (welcome screen).
//   ALT_CLOUD_TARGETS     — alternative cloud provider key-console URL literals.
//   BYOK_TARGETS          — BYOK / enterprise IPC channel literals (preload-byok).
//   ENTERPRISE_TARGETS    — enterprise provider config surface literals.
//   TRANSCRIPTION_TARGETS — custom transcription provider code-path literals.
//   SURFACE_TARGETS       — unreviewed renderer surface: the MCP integration
//                           card's component-local docs-URL literal.
//
// Exclusions (same rationale as verify-oauth-gating.js):
//   - i18n translation keys: `src/locales/{lang}/translation.json` is bundled
//     wholesale, so i18n keys survive in dist/ regardless of the build flag and
//     are NOT a valid absence signal.
//   - Bundled JSON data blobs (`src/models/modelRegistryData.json`) likewise
//     survive wholesale — provider *names* ("Groq"/"Mistral") are excluded; only
//     code-path literals (URLs, IPC channels) that get DCE'd are used.
//   - Minified component identifiers do not survive as literals.
//
// Runtime: ~1-2 minutes (2 sequential vite builds + 1 restore build).
//
// Usage:
//   node scripts/verify-provider-lockdown.js
//   SKIP_RESTORE=1 node scripts/verify-provider-lockdown.js   # skip trailing default build
"use strict";

const { spawnSync, execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..");
const DIST_DIR = path.join(REPO_ROOT, "src", "dist");

// Electron-builder ships preload.js + the generated preload submodules verbatim
// from repo root. The BYOK/enterprise IPC method exposures are code-generated
// into preload-byok.generated.cjs (plan 10-05): when PROVIDER_LOCKDOWN_ENABLED
// is true that factory returns {} and the channel literals are physically
// absent. We grep that file too.
const PRELOAD_TARGETS = [
  path.join(REPO_ROOT, "preload.js"),
  path.join(REPO_ROOT, "preload-billing.generated.cjs"),
  path.join(REPO_ROOT, "preload-referrals.generated.cjs"),
  path.join(REPO_ROOT, "preload-streaming.generated.cjs"),
  path.join(REPO_ROOT, "preload-gcal.generated.cjs"),
  path.join(REPO_ROOT, "preload-byok.generated.cjs"),
];

// --- Target groups ----------------------------------------------------------
// Each target is a fixed string literal that appears in renderer source inside
// a `!PROVIDER_LOCKDOWN_ENABLED` (or build-config-forced-off OAuth) branch, or
// inside the gated preload-byok factory. Under lockdown, Rolldown DCE removes
// the branch and the literal disappears from the bundle.

// OAuth desktop sign-in surface. PROVIDER_LOCKDOWN forces the three
// OPENWHISPR_OAUTH_* flags off at build-config generation (plan 10-02), so the
// social-sign-in code path DCEs. `desktop-signin` is the deep-link path literal
// in src/lib/auth.ts that plan 10-02 confirmed absent under lockdown.
const OAUTH_TARGETS = [
  "desktop-signin",
  'handleSocialSignIn("apple")',
  'handleSocialSignIn("google")',
  'handleSocialSignIn("microsoft")',
];

// Alternative cloud provider BYOK key-console URLs. These live in the gated
// provider panels of TranscriptionModelPicker.tsx / ReasoningModelSelector.tsx.
const ALT_CLOUD_TARGETS = [
  "console.groq.com/keys",
  "console.anthropic.com",
  "aistudio.google.com",
  "console.mistral.ai/api-keys",
];

// BYOK + enterprise key-management IPC channel literals. These are emitted into
// preload-byok.generated.cjs; under lockdown the factory body is `return {}`.
const BYOK_TARGETS = [
  "get-openai-key",
  "save-anthropic-key",
  "get-gemini-key",
  "save-groq-key",
  "get-mistral-key",
  "save-custom-transcription-key",
];

// Enterprise provider config IPC channels + key-management literals. Emitted
// into preload-byok.generated.cjs and rendered by the EnterpriseSection /
// EnterpriseProviderConfig subtree, which is mounted only by the lockdown-gated
// InferenceConfigEditor.tsx.
const ENTERPRISE_TARGETS = [
  "test-enterprise-connection",
  "get-azure-api-key",
  "save-azure-api-key",
  "get-vertex-api-key",
  "save-vertex-api-key",
  "save-bedrock-access-key-id",
];

// Custom transcription provider code-path literals. The "custom" transcription
// provider tab + its BYOK custom-endpoint panel live in TranscriptionModelPicker.tsx
// behind `!PROVIDER_LOCKDOWN_ENABLED && selectedCloudProvider === "custom"`. The
// SelfHosted transcription panel is mounted by SettingsPage.tsx / MeetingSettings.tsx
// only when the lockdown-gated `self-hosted` mode entry exists. Under lockdown
// Rolldown DCE removes these branches and their string literals.
//   - `https://your-api.example.com/v1` — custom-endpoint Input placeholder, lives
//     ONLY inside the `selectedCloudProvider === "custom"` JSX branch.
// i18n keys (`transcription.customProvider`, `settingsPage.transcription.modes.*`)
// are intentionally NOT used here — translation JSON is bundled wholesale.
const TRANSCRIPTION_TARGETS = [
  "https://your-api.example.com/v1",
];

// Unreviewed renderer surface literals cut from the corporate build:
//   - "docs.openwhispr.com/integrations/mcp" — the McpIntegrationCard MCP_DOCS_URL.
//     This is a component-LOCAL literal: it is declared and referenced only inside
//     McpIntegrationCard.tsx. The card mount in IntegrationsView.tsx is gated
//     behind `!PROVIDER_LOCKDOWN_ENABLED`, so the whole component (and this
//     literal) DCEs out under lockdown — a valid absence signal.
//
// NOTE — targets resolved out by the Task 5 verify run (wholesale-bundling
// limitation, same as i18n translation JSON):
//   - "mcp.openwhispr.com" was DROPPED. OPENWHISPR_MCP_URL's value is emitted into
//     the generated runtime-env.json / build-config module, which is bundled
//     wholesale; the literal survives under lockdown regardless of the gate, so it
//     is NOT a valid absence signal. The MCP card itself IS gated (Task 3) —
//     verified via the docs-URL literal above and live.
//   - Raw cloud model names ("GPT-5.5" etc.) were DROPPED. They originate in
//     modelRegistryData.json, which ModelRegistry.ts imports wholesale; the labels
//     survive as a bundled data module regardless of the gate. The cloud
//     model-list leak is closed at the RENDER layer (Task 1 gate) and was verified
//     LIVE; the bundle-grep cannot assert their absence. The only model-list
//     code-path literal is the i18n key `reasoning.selectModel`, also wholesale-
//     bundled — no valid grep target exists. See the plan Findings section.
const SURFACE_TARGETS = [
  "docs.openwhispr.com/integrations/mcp",
];

const GROUPS = {
  OAUTH: OAUTH_TARGETS,
  ALT_CLOUD: ALT_CLOUD_TARGETS,
  BYOK: BYOK_TARGETS,
  ENTERPRISE: ENTERPRISE_TARGETS,
  TRANSCRIPTION: TRANSCRIPTION_TARGETS,
  SURFACE: SURFACE_TARGETS,
};

const ALL_GROUPS = Object.keys(GROUPS);

const SCENARIOS = [
  {
    // Positive control / upstream-parity baseline: nothing gated, every literal
    // must be present.
    name: "default",
    env: {},
    expectPresent: ALL_GROUPS,
    expectAbsent: [],
  },
  {
    // Corporate-minimal lockdown: every provider/BYOK/OAuth/enterprise literal
    // must be physically absent from the bundle.
    name: "lockdown",
    env: { OPENWHISPR_PROVIDER_LOCKDOWN: "true" },
    expectPresent: [],
    expectAbsent: ALL_GROUPS,
  },
];

function shellEscape(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

function runBuild(scenarioName, scenarioEnv) {
  console.log(`[verify-provider-lockdown] Running scenario: ${scenarioName}`);
  // Wipe stale dist/ so a stale match cannot create a false positive.
  if (fs.existsSync(DIST_DIR)) {
    fs.rmSync(DIST_DIR, { recursive: true, force: true });
  }
  // Regenerate build-config first so the .ts/.cjs constants + generated preload
  // submodules reflect the scenario env.
  const genResult = spawnSync(
    process.execPath,
    [path.join(REPO_ROOT, "scripts", "generate-build-config.js")],
    {
      cwd: REPO_ROOT,
      env: { ...process.env, ...scenarioEnv },
      stdio: ["ignore", "inherit", "inherit"],
    }
  );
  if (genResult.status !== 0) {
    // Throw (not process.exit) so the caller's `finally` restore-default runs.
    throw new Error(`build-config generation failed for scenario: ${scenarioName}`);
  }
  const buildResult = spawnSync("npm", ["run", "build:renderer"], {
    cwd: REPO_ROOT,
    env: { ...process.env, ...scenarioEnv, NODE_ENV: "production" },
    stdio: ["ignore", "inherit", "inherit"],
  });
  if (buildResult.status !== 0) {
    throw new Error(`renderer build failed for scenario: ${scenarioName}`);
  }
}

function grepPaths(target, paths) {
  const existing = paths.filter((p) => fs.existsSync(p));
  if (existing.length === 0) return "";
  const pathArgs = existing.map(shellEscape).join(" ");
  try {
    // -R recursive (harmless on files), -F fixed-string, -- end of options.
    const out = execSync(`grep -RF -- ${shellEscape(target)} ${pathArgs}`, {
      encoding: "utf8",
    });
    return out.trim();
  } catch (err) {
    if (err.status === 1) return ""; // grep exit 1 = no match
    throw err; // exit 2 = usage / I/O error
  }
}

function grepDist(target) {
  return grepPaths(target, [DIST_DIR]);
}

function grepPreload(target) {
  return grepPaths(target, PRELOAD_TARGETS);
}

function checkGroupAbsent(scenarioName, group) {
  const violations = [];
  for (const target of GROUPS[group]) {
    const distOut = grepDist(target);
    if (distOut !== "") {
      violations.push(
        `${scenarioName}: target "${target}" expected absent in dist/, found: ${distOut.split("\n")[0]}`
      );
    }
    const preloadOut = grepPreload(target);
    if (preloadOut !== "") {
      violations.push(
        `${scenarioName}: target "${target}" expected absent in preload, found: ${preloadOut.split("\n")[0]}`
      );
    }
  }
  return violations;
}

function checkGroupPresent(scenarioName, group) {
  let anyMatch = false;
  for (const target of GROUPS[group]) {
    if (grepDist(target) !== "" || grepPreload(target) !== "") {
      anyMatch = true;
      break;
    }
  }
  if (!anyMatch) {
    return [
      `${scenarioName}: group ${group} expected present, but no targets matched in dist/ or preload`,
    ];
  }
  return [];
}

function main() {
  const violations = [];
  let totalGreps = 0;
  let runError = null;

  try {
    for (const scenario of SCENARIOS) {
      runBuild(scenario.name, scenario.env);
      for (const group of scenario.expectAbsent) {
        violations.push(...checkGroupAbsent(scenario.name, group));
        totalGreps += GROUPS[group].length;
      }
      for (const group of scenario.expectPresent) {
        violations.push(...checkGroupPresent(scenario.name, group));
        totalGreps += GROUPS[group].length;
      }
    }
  } catch (e) {
    runError = e;
  } finally {
    if (process.env.SKIP_RESTORE !== "1") {
      try {
        runBuild("restore-default", {});
      } catch (e) {
        console.error(
          `[verify-provider-lockdown] WARN: restore-default build failed: ${e?.message || e}`
        );
      }
    }
  }

  if (runError) {
    console.error(
      `[verify-provider-lockdown] FAILED — ${runError?.message || runError}`
    );
    process.exit(1);
  }

  if (violations.length === 0) {
    console.log(
      `[verify-provider-lockdown] OK — ${SCENARIOS.length} scenarios, ${totalGreps} greps, 0 violations.`
    );
    process.exit(0);
  } else {
    for (const v of violations) console.error(v);
    const scenariosWithViolations = new Set(violations.map((v) => v.split(":")[0]));
    console.error(
      `[verify-provider-lockdown] FAILED — ${violations.length} violations across ${scenariosWithViolations.size} scenarios.`
    );
    process.exit(1);
  }
}

main();
