#!/usr/bin/env node
// Phase 4 OAuth gating verification gate (CFG-03).
//
// Spawns 4 renderer builds (default + each of 3 providers individually disabled),
// bundle-greps dist/ for the D-04 per-provider targets, and asserts that:
//   - In each "<P> disabled" scenario, every <P>-target returns 0 matches.
//   - In each scenario, the OTHER two providers' targets return >= 1 match (positive control).
//   - Default build: all 3 provider target sets return >= 1 match each (parity baseline).
//
// Runtime: ~2-4 minutes (4 sequential vite builds). Run before release / when modifying
// OAuth gating code paths.
//
// Usage:
//   node scripts/verify-oauth-gating.js
//   SKIP_RESTORE=1 node scripts/verify-oauth-gating.js   # skip the trailing default-build
"use strict";

const { spawnSync, execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..");
const DIST_DIR = path.join(REPO_ROOT, "src", "dist");
// Phase 04.1 Plan 02 Task 3: also grep preload.js. Electron-builder ships it
// verbatim from repo root (see electron-builder.json `files`), so the grep
// target IS this source file. We do NOT include the generated cjs in this
// pass: that file's URL constants are scoped to the main process behind
// `BuildConfig.OAUTH_*_ENABLED` gates (see ipcHandlers.js), not exposed
// through the preload API surface. Trimming OAUTH_GOOGLE_* URLs from
// build-config when the flag is false is tracked separately.
const PRELOAD_TARGETS = [path.join(REPO_ROOT, "preload.js")];

// D-04 per-provider bundle-grep targets (verbatim from CONTEXT.md).
const GOOGLE_TARGETS = [
  "oauth2.googleapis.com",
  "accounts.google.com",
  "googleapis.com/calendar",
  'signInWithSocial("google")',
  "GoogleIcon",
  // Phase 4 review WR-01 + Phase 04.1 fix: IntegrationsView Google Calendar surface.
  "gcalStartOAuth",
  "gcalDisconnect",
  "onGcalConnectionChanged",
];

const APPLE_TARGETS = [
  'signInWithSocial("apple")',
  "AppleIcon",
  "auth.social.continueWithApple",
];

const MICROSOFT_TARGETS = [
  'signInWithSocial("microsoft")',
  "MicrosoftIcon",
  "auth.social.continueWithMicrosoft",
];

// Per Phase 4 Plan 3 SUMMARY: i18n translation keys are bundled wholesale via
// `src/locales/{lang}/translation.json` JSON imports. They survive in dist/ regardless of
// the build flag and are NOT a valid absence signal — the consuming JSX has been DCE'd, but
// the translation string blob remains. We therefore exclude i18n keys from the absence
// check while keeping them as positive-control "presence" signals.
const I18N_KEYS = new Set([
  "auth.social.continueWithApple",
  "auth.social.continueWithGoogle",
  "auth.social.continueWithMicrosoft",
]);

// Component identifiers like "GoogleIcon" / "AppleIcon" / "MicrosoftIcon" are minified to
// short symbols at module scope, so they don't survive as literals in dist/. Useful as
// presence-control signals only when they appear as object property keys (e.g.
// displayName) — not reliable. We keep them in the primary D-04 list per spec but
// exclude them from absence assertions to avoid relying on a non-deterministic signal.
const COMPONENT_IDENTIFIERS = new Set(["GoogleIcon", "AppleIcon", "MicrosoftIcon"]);

// Fallback targets per provider — i18n keys / domain literals that act as presence
// (positive-control) signals when the primary D-04 target has been minified away.
const FALLBACK_TARGETS = {
  GOOGLE: ["auth.social.continueWithGoogle", "oauth2.googleapis.com"],
  APPLE: ["auth.social.continueWithApple"],
  MICROSOFT: ["auth.social.continueWithMicrosoft"],
};

const TARGETS_BY_PROVIDER = {
  GOOGLE: GOOGLE_TARGETS,
  APPLE: APPLE_TARGETS,
  MICROSOFT: MICROSOFT_TARGETS,
};

function absentTargets(provider) {
  // Exclude i18n keys (always present in locale JSON) and minified component identifiers.
  return TARGETS_BY_PROVIDER[provider].filter(
    (t) => !I18N_KEYS.has(t) && !COMPONENT_IDENTIFIERS.has(t)
  );
}

function presentTargets(provider) {
  // Use primary D-04 list plus fallbacks; any one match suffices.
  return [...TARGETS_BY_PROVIDER[provider], ...(FALLBACK_TARGETS[provider] || [])];
}

const SCENARIOS = [
  {
    name: "default",
    env: {},
    expectPresent: ["GOOGLE", "APPLE", "MICROSOFT"],
    expectAbsent: [],
  },
  {
    name: "google-disabled",
    env: { OPENWHISPR_OAUTH_GOOGLE: "false" },
    expectPresent: ["APPLE", "MICROSOFT"],
    expectAbsent: ["GOOGLE"],
  },
  {
    name: "apple-disabled",
    env: { OPENWHISPR_OAUTH_APPLE: "false" },
    expectPresent: ["GOOGLE", "MICROSOFT"],
    expectAbsent: ["APPLE"],
  },
  {
    name: "microsoft-disabled",
    env: { OPENWHISPR_OAUTH_MICROSOFT: "false" },
    expectPresent: ["GOOGLE", "APPLE"],
    expectAbsent: ["MICROSOFT"],
  },
];

function runBuild(scenarioName, scenarioEnv) {
  console.log(`[verify-oauth-gating] Running scenario: ${scenarioName}`);
  // Wipe any stale dist/ so a stale match cannot create a false positive.
  if (fs.existsSync(DIST_DIR)) {
    fs.rmSync(DIST_DIR, { recursive: true, force: true });
  }
  // Regenerate build-config first so main.js + .cjs reflect the scenario env.
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
    console.error(
      `[verify-oauth-gating] BUILD-CONFIG FAILED for scenario: ${scenarioName}`
    );
    // CR-01: throw instead of process.exit(1) so the caller's `finally` runs
    // `runBuild("restore-default", {})` to leave the dev tree at default.
    throw new Error(`build-config generation failed for scenario: ${scenarioName}`);
  }
  const buildResult = spawnSync(
    "npm",
    ["run", "build:renderer"],
    {
      cwd: REPO_ROOT,
      env: { ...process.env, ...scenarioEnv, NODE_ENV: "production" },
      stdio: ["ignore", "inherit", "inherit"],
    }
  );
  if (buildResult.status !== 0) {
    console.error(
      `[verify-oauth-gating] BUILD FAILED for scenario: ${scenarioName}`
    );
    // CR-01: throw instead of process.exit(1) so the caller's `finally` runs
    // `runBuild("restore-default", {})` to leave the dev tree at default.
    throw new Error(`renderer build failed for scenario: ${scenarioName}`);
  }
}

function grepPaths(target, paths) {
  // Build a single grep invocation across all paths so missing files don't
  // independently abort. Skip non-existent paths up front.
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
    // grep exits 1 when no match — treat as empty result.
    if (err.status === 1) return "";
    // grep exits 2 on usage / I/O error — surface that.
    throw err;
  }
}

function grepDist(target) {
  return grepPaths(target, [DIST_DIR]);
}

function grepPreload(target) {
  return grepPaths(target, PRELOAD_TARGETS);
}

function shellEscape(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

function checkProviderAbsent(scenarioName, provider) {
  const violations = [];
  for (const target of absentTargets(provider)) {
    // Renderer dist/ pass.
    const distOut = grepDist(target);
    if (distOut !== "") {
      const firstLine = distOut.split("\n")[0];
      violations.push(
        `${scenarioName}: target "${target}" expected absent, found: ${firstLine}`
      );
    }
    // Preload bundle pass (Phase 04.1 PLAN-02 Task 3).
    const preloadOut = grepPreload(target);
    if (preloadOut !== "") {
      const firstLine = preloadOut.split("\n")[0];
      violations.push(
        `${scenarioName}: target "${target}" expected absent in preload, found: ${firstLine}`
      );
    }
  }
  return violations;
}

function checkProviderPresent(scenarioName, provider) {
  let anyMatch = false;
  for (const target of presentTargets(provider)) {
    if (grepDist(target) !== "" || grepPreload(target) !== "") {
      anyMatch = true;
      break;
    }
  }
  if (!anyMatch) {
    return [
      `${scenarioName}: provider ${provider} expected present, but no targets matched in dist/ or preload`,
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
      for (const provider of scenario.expectAbsent) {
        const v = checkProviderAbsent(scenario.name, provider);
        violations.push(...v);
        totalGreps += absentTargets(provider).length;
      }
      for (const provider of scenario.expectPresent) {
        const v = checkProviderPresent(scenario.name, provider);
        violations.push(...v);
        totalGreps += presentTargets(provider).length;
      }
    }
  } catch (e) {
    // CR-01: capture the error so the `finally` cleanup still runs, then
    // re-surface a non-zero exit after restore-default completes.
    runError = e;
  } finally {
    if (process.env.SKIP_RESTORE !== "1") {
      // Leave the developer's tree in a sensible state — default build at end.
      try {
        runBuild("restore-default", {});
      } catch (e) {
        console.error(
          `[verify-oauth-gating] WARN: restore-default build failed: ${e?.message || e}`
        );
      }
    }
  }

  if (runError) {
    console.error(
      `[verify-oauth-gating] FAILED — ${runError?.message || runError}`
    );
    process.exit(1);
  }

  if (violations.length === 0) {
    console.log(
      `[verify-oauth-gating] OK — ${SCENARIOS.length} scenarios, ${totalGreps} greps, 0 violations.`
    );
    process.exit(0);
  } else {
    for (const v of violations) console.error(v);
    const scenariosWithViolations = new Set(
      violations.map((v) => v.split(":")[0])
    );
    console.error(
      `[verify-oauth-gating] FAILED — ${violations.length} violations across ${scenariosWithViolations.size} scenarios.`
    );
    process.exit(1);
  }
}

main();
