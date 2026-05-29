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
// Modeled on scripts/verify-oauth-gating.js. Target groups (Phase 06 (D3):
// the former OAUTH_TARGETS group — desktop-sign-in / handleSocialSignIn
// literals — was removed because social sign-in is server-driven and no
// longer stripped under lockdown):
//   ALT_CLOUD_TARGETS     — alternative cloud provider key-console URL literals.
//   BYOK_TARGETS          — BYOK / enterprise IPC channel literals (preload-byok).
//   ENTERPRISE_TARGETS    — enterprise provider config surface literals.
//   GCAL_TARGETS          — Google Calendar IPC channel literals (preload-gcal).
//                           HIGH-01: gated by GCAL_ENABLED (lockdown forces off),
//                           decoupled from social sign-in (server-driven, NOT
//                           asserted). Restored after Phase 06 D3 dropped it.
//   TRANSCRIPTION_TARGETS — custom transcription provider code-path literals.
//   SURFACE_TARGETS       — unreviewed renderer surface: the MCP integration
//                           card's component-local docs-URL literal.
//   REALTIME_TARGETS      — realtime streaming targets that must be unreachable
//                           from the lockdown RENDERER bundle: api.openai.com
//                           realtime literals + the /api/openai-realtime-token
//                           route. Under lockdown the realtime path routes
//                           through our /v1/realtime WSS proxy with the session
//                           bearer (Design B, quick task 260522-wt6 plan 01),
//                           so neither literal may survive in src/dist/. This
//                           group is checked dist-only: api.openai.com and the
//                           route may legitimately appear in MAIN-process
//                           source behind a PROVIDER_LOCKDOWN_ENABLED guard
//                           (Design A default build), so a preload/main grep
//                           is not a valid absence signal.
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
//
// Phase 06 (D3): social sign-in is NO LONGER stripped under lockdown — its
// visibility is server-driven at runtime (GET /api/auth/providers). This
// verifier therefore no longer asserts absence of `desktop-signin` or
// handleSocialSignIn(...) literals. It continues to assert lockdown strips
// BYOK / enterprise / alternative-cloud / billing / referrals.
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

// HIGH-01 fix: Google Calendar preload IPC channel literals. These are emitted
// into preload-gcal.generated.cjs by emitPreloadGcal; under lockdown the factory
// body is `return {}` (GCAL_ENABLED forced false), so the gcal-* invoke/listener
// channel names are physically absent. Phase 06 D3 deleted the former OAUTH_TARGETS
// group when it made social sign-in server-driven, which also dropped this gcal
// absence assertion and let the gcal IPC surface silently re-appear in lockdown
// bundles (the regression this group guards against). NOTE: these are gcal-only
// (Calendar integration) literals — NOT social-sign-in literals. Social
// (`desktop-signin` / `handleSocialSignIn`) is correctly NOT asserted here, since
// it is server-driven and intentionally NOT stripped under lockdown.
//
// preload-byok/billing/etc. greps run against PRELOAD_TARGETS, which already
// includes preload-gcal.generated.cjs, so a non-empty gcal factory under lockdown
// (the regression) is caught here as a preload violation.
const GCAL_TARGETS = [
  "gcal-start-oauth",
  "gcal-disconnect",
  "gcal-get-connection-status",
  "gcal-get-calendars",
  "gcal-set-calendar-selection",
  "gcal-sync-events",
  "gcal-connection-changed",
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

// Realtime streaming targets that must NOT be reachable from the lockdown
// renderer bundle. Under PROVIDER_LOCKDOWN the realtime path connects to our
// server's /v1/realtime WSS proxy (Design B) — the renderer never references
// api.openai.com nor the ephemeral-token route. Checked dist-only (see header
// note): both literals legitimately exist in main-process source behind a
// PROVIDER_LOCKDOWN_ENABLED guard for the Design-A default build.
const REALTIME_TARGETS = [
  "wss://api.openai.com",
  "api.openai.com/v1/realtime",
  "/api/openai-realtime-token",
];

// v1.7.11 WR-02 (REVIEW.md): the ServerUrlField onboarding surface (Phase 4
// UI-01..04) is orthogonal to provider lockdown — both axes coexist. Lock
// that contract here so a future regression cannot tree-shake the field
// under lockdown again (v1.7.10's release-breaking shape). Default build
// also keeps the field, since v1.7.11 flipped ALLOW_CUSTOM_HOST_ENABLED
// default to true.
const CUSTOM_HOST_TARGETS = [
  "onboarding.serverUrl.label", // i18n key (Phase 4 UI-04)
  "server-url-field", // data-testid (Phase 4 UI-01)
];

const GROUPS = {
  ALT_CLOUD: ALT_CLOUD_TARGETS,
  BYOK: BYOK_TARGETS,
  ENTERPRISE: ENTERPRISE_TARGETS,
  GCAL: GCAL_TARGETS,
  TRANSCRIPTION: TRANSCRIPTION_TARGETS,
  SURFACE: SURFACE_TARGETS,
  REALTIME: REALTIME_TARGETS,
  CUSTOM_HOST: CUSTOM_HOST_TARGETS,
};

// Groups whose absence is asserted ONLY against the renderer dist bundle
// (not preload/main): the literals may legitimately survive in main-process
// source behind a build-config guard.
const DIST_ONLY_GROUPS = new Set(["REALTIME"]);

const ALL_GROUPS = Object.keys(GROUPS);

// REALTIME is an absence-only group: under lockdown the literals must be gone
// from the renderer dist, but the default build does NOT guarantee their
// presence there (the realtime WebSocket lives in the MAIN process, so the
// renderer dist may legitimately not carry these literals). So REALTIME is
// excluded from the default scenario's expectPresent positive control.
const DEFAULT_PRESENT_GROUPS = ALL_GROUPS.filter((g) => g !== "REALTIME");

// v1.7.11 WR-02: CUSTOM_HOST must be PRESENT under BOTH default AND lockdown.
// Lockdown is about provider-list scope, not host scope — they're orthogonal.
// Pinning this in the bundle-grep gate prevents the v1.7.10 WARN-03 cascade
// (which tree-shook ServerUrlField under lockdown) from being re-introduced.
const LOCKDOWN_ABSENT_GROUPS = ALL_GROUPS.filter((g) => g !== "CUSTOM_HOST");
const LOCKDOWN_PRESENT_GROUPS = ["CUSTOM_HOST"];

const SCENARIOS = [
  {
    // Positive control / upstream-parity baseline: nothing gated, every literal
    // must be present.
    name: "default",
    env: {},
    expectPresent: DEFAULT_PRESENT_GROUPS,
    expectAbsent: [],
  },
  {
    // Corporate-minimal lockdown: every provider/BYOK/OAuth/enterprise literal
    // must be physically absent — EXCEPT the ServerUrlField surface, which is
    // an orthogonal axis (v1.7.11). Self-hosters need both lockdown=true AND
    // a Server URL field to point the binary at their corporate backend.
    name: "lockdown",
    env: { OPENWHISPR_PROVIDER_LOCKDOWN: "true" },
    expectPresent: LOCKDOWN_PRESENT_GROUPS,
    expectAbsent: LOCKDOWN_ABSENT_GROUPS,
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
    if (!DIST_ONLY_GROUPS.has(group)) {
      const preloadOut = grepPreload(target);
      if (preloadOut !== "") {
        violations.push(
          `${scenarioName}: target "${target}" expected absent in preload, found: ${preloadOut.split("\n")[0]}`
        );
      }
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
