#!/usr/bin/env node
// Phase 04.1 feature-gating verification gate (CFG-09).
//
// Mirrors scripts/verify-oauth-gating.js but for build-time feature flags whose
// default is `false` (corporate-minimal posture). Currently covers BILLING;
// PLAN-04 will extend with REFERRALS, PLAN-05 with STREAMING.
//
// For each scenario it: regenerates build-config -> runs `npm run build:renderer`
// -> bundle-greps src/dist/ + preload.js for the feature targets, and asserts
// that:
//   - `default` scenario: every BILLING target is ABSENT from dist + preload.
//   - `billing-enabled` scenario: at least one BILLING target is PRESENT
//     (positive control — proves the flag actually flips behavior).
//
// Runtime: ~1-2 minutes (2 sequential vite builds + restore).
//
// Usage:
//   node scripts/verify-feature-gating.js
//   SKIP_RESTORE=1 node scripts/verify-feature-gating.js
"use strict";

const { spawnSync, execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..");
const DIST_DIR = path.join(REPO_ROOT, "src", "dist");
const PRELOAD_TARGETS = [
  path.join(REPO_ROOT, "preload.js"),
  // The generated preload sub-modules are checked too — when BILLING_ENABLED=false
  // the preload-billing.generated.cjs file must not contain Stripe literals.
  path.join(REPO_ROOT, "preload-billing.generated.cjs"),
  // PLAN-04: when REFERRALS_ENABLED=false the preload-referrals.generated.cjs file
  // must not contain referral literals.
  path.join(REPO_ROOT, "preload-referrals.generated.cjs"),
  // PLAN-05: when STREAMING_ENABLED=false the preload-streaming.generated.cjs file
  // must not contain AssemblyAI/Deepgram WebSocket streaming literals.
  path.join(REPO_ROOT, "preload-streaming.generated.cjs"),
];

// CFG-09 BILLING absence/presence targets. These are IPC channel strings and
// renderer-side method names — both survive minification because they are
// string literals passed to `ipcRenderer.invoke()` / `ipcMain.handle()`.
const BILLING_TARGETS = [
  "cloud-checkout",
  "cloud-billing-portal",
  "cloud-switch-plan",
  "cloud-preview-switch",
  "/api/stripe/",
  "cloudCheckout",
  "cloudBillingPortal",
  "cloudSwitchPlan",
  "cloudPreviewSwitch",
];

// PLAN-04 REFERRALS targets. IPC channel strings + renderer-side method names
// + URL fragment. All three survive minification because they are string
// literals passed to ipcRenderer.invoke()/ipcMain.handle().
const REFERRALS_TARGETS = [
  "get-referral-stats",
  "send-referral-invite",
  "get-referral-invites",
  "/api/referrals/",
  "getReferralStats",
  "sendReferralInvite",
  "getReferralInvites",
];

// PLAN-05 STREAMING targets. AssemblyAI + Deepgram WebSocket realtime ASR IPC
// channel strings + renderer-side method names + URL fragments for the
// /api/streaming-token + /api/deepgram-streaming-token token-fetch endpoints.
// All survive minification because they are string literals.
const STREAMING_TARGETS = [
  "assemblyai-streaming-warmup",
  "assemblyai-streaming-start",
  "deepgram-streaming-warmup",
  "deepgram-streaming-start",
  "deepgram-streaming-stop",
  "deepgram-streaming-status",
  "/api/streaming-token",
  "/api/deepgram-streaming-token",
  "assemblyAiStreamingWarmup",
  "assemblyAiStreamingStart",
  "deepgramStreamingWarmup",
  "deepgramStreamingStart",
];

const FEATURES = {
  BILLING: BILLING_TARGETS,
  REFERRALS: REFERRALS_TARGETS,
  STREAMING: STREAMING_TARGETS,
};

function absentTargets(feature) {
  return FEATURES[feature];
}

function presentTargets(feature) {
  return FEATURES[feature];
}

const SCENARIOS = [
  {
    // Phase 05 B1 fix: a default `npm run build` with NO env vars (no
    // backend, no realtime URL) must auto-disable STREAMING so the binary
    // doesn't crash on first record. The auto-disable rule in
    // generate-build-config.js's buildResolved() handles this.
    name: "default-no-backend",
    env: {},
    expectPresent: [],
    expectAbsent: ["BILLING", "REFERRALS", "STREAMING"],
  },
  {
    // Phase 05 D-02: default flipped to true once a backend URL is present
    // (streaming routes through the corporate backend's WSS /v1/realtime).
    name: "default-with-backend",
    env: { OPENWHISPR_BACKEND_URL: "https://api.example.com" },
    expectPresent: ["STREAMING"],
    expectAbsent: ["BILLING", "REFERRALS"],
  },
  {
    name: "billing-enabled",
    env: {
      OPENWHISPR_BILLING: "true",
      OPENWHISPR_BACKEND_URL: "https://api.example.com",
    },
    expectPresent: ["BILLING", "STREAMING"],
    expectAbsent: ["REFERRALS"],
  },
  {
    name: "referrals-enabled",
    env: {
      OPENWHISPR_REFERRALS: "true",
      OPENWHISPR_BACKEND_URL: "https://api.example.com",
    },
    expectPresent: ["REFERRALS", "STREAMING"],
    expectAbsent: ["BILLING"],
  },
  {
    // Phase 05 D-02 escape hatch: maintainers whose backend hasn't yet
    // deployed the realtime relay can opt out explicitly. This scenario
    // replaces the pre-Phase-05 `streaming-enabled` scenario.
    name: "streaming-disabled",
    env: { OPENWHISPR_STREAMING: "false" },
    expectPresent: [],
    expectAbsent: ["BILLING", "REFERRALS", "STREAMING"],
  },
];

function shellEscape(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

function grepPaths(target, paths) {
  const existing = paths.filter((p) => fs.existsSync(p));
  if (existing.length === 0) return "";
  const pathArgs = existing.map(shellEscape).join(" ");
  try {
    const out = execSync(`grep -RF -- ${shellEscape(target)} ${pathArgs}`, {
      encoding: "utf8",
    });
    return out.trim();
  } catch (err) {
    if (err.status === 1) return "";
    throw err;
  }
}

function grepDist(target) {
  return grepPaths(target, [DIST_DIR]);
}

function grepPreload(target) {
  return grepPaths(target, PRELOAD_TARGETS);
}

function runBuild(scenarioName, scenarioEnv) {
  console.log(`[verify-feature-gating] Running scenario: ${scenarioName}`);
  if (fs.existsSync(DIST_DIR)) {
    fs.rmSync(DIST_DIR, { recursive: true, force: true });
  }
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
      `[verify-feature-gating] BUILD-CONFIG FAILED for scenario: ${scenarioName}`
    );
    process.exit(1);
  }
  const buildResult = spawnSync("npm", ["run", "build:renderer"], {
    cwd: REPO_ROOT,
    env: { ...process.env, ...scenarioEnv, NODE_ENV: "production" },
    stdio: ["ignore", "inherit", "inherit"],
  });
  if (buildResult.status !== 0) {
    console.error(`[verify-feature-gating] BUILD FAILED for scenario: ${scenarioName}`);
    process.exit(1);
  }
}

function checkFeatureAbsent(scenarioName, feature) {
  const violations = [];
  for (const target of absentTargets(feature)) {
    const distOut = grepDist(target);
    if (distOut !== "") {
      const firstLine = distOut.split("\n")[0];
      violations.push(
        `${scenarioName}: target "${target}" expected absent in dist, found: ${firstLine}`
      );
    }
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

function checkFeaturePresent(scenarioName, feature) {
  let anyMatch = false;
  for (const target of presentTargets(feature)) {
    if (grepDist(target) !== "" || grepPreload(target) !== "") {
      anyMatch = true;
      break;
    }
  }
  if (!anyMatch) {
    return [
      `${scenarioName}: feature ${feature} expected present, but no targets matched in dist/ or preload`,
    ];
  }
  return [];
}

function main() {
  const violations = [];
  let totalGreps = 0;

  try {
    for (const scenario of SCENARIOS) {
      runBuild(scenario.name, scenario.env);
      for (const feature of scenario.expectAbsent) {
        const v = checkFeatureAbsent(scenario.name, feature);
        violations.push(...v);
        totalGreps += absentTargets(feature).length;
      }
      for (const feature of scenario.expectPresent) {
        const v = checkFeaturePresent(scenario.name, feature);
        violations.push(...v);
        totalGreps += presentTargets(feature).length;
      }
    }
  } finally {
    if (process.env.SKIP_RESTORE !== "1") {
      try {
        runBuild("restore-default", {});
      } catch (e) {
        console.error(
          `[verify-feature-gating] WARN: restore-default build failed: ${e?.message || e}`
        );
      }
    }
  }

  if (violations.length === 0) {
    console.log(
      `[verify-feature-gating] OK — ${SCENARIOS.length} scenarios, ${totalGreps} greps, 0 violations.`
    );
    process.exit(0);
  } else {
    for (const v of violations) console.error(v);
    const scenariosWithViolations = new Set(violations.map((v) => v.split(":")[0]));
    console.error(
      `[verify-feature-gating] FAILED — ${violations.length} violations across ${scenariosWithViolations.size} scenarios.`
    );
    process.exit(1);
  }
}

main();
