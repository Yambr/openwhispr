#!/usr/bin/env node
// Phase 3 BG-02 (v1.8.0) — bundle-grep gate for OPENWHISPR_ALLOW_CUSTOM_HOST.
//
// Builds the app TWICE:
//   1. Default scenario (no env) → ALLOW_CUSTOM_HOST_ENABLED = false → asserts
//      the Server URL field's literals are ABSENT from the renderer bundle
//      (Rolldown DCE'd the field out).
//   2. Enabled scenario (OPENWHISPR_ALLOW_CUSTOM_HOST=true) → asserts the same
//      literals are PRESENT in the renderer bundle.
//
// Targets (Phase 4 UI-01..04 deliverables):
//   - The ServerUrlField component identifier (a class/function name we can
//     grep on in the minified bundle).
//   - The i18n key `onboarding.serverUrl.label` (added in UI-04 across 9 locales).
//
// This script is structurally identical to verify-provider-lockdown.js /
// verify-oauth-gating.js — same scenario-based build-and-grep approach.

"use strict";

const { execSync, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");

// Targets — strings that MUST appear in the bundle when the flag is ON, and
// MUST NOT appear when the flag is OFF.
const TARGETS = [
  "ServerUrlField", // component name (Phase 4 UI-01)
  "onboarding.serverUrl.label", // i18n key (Phase 4 UI-04)
];

const SCENARIOS = [
  { name: "default (flag off)", env: { OPENWHISPR_ALLOW_CUSTOM_HOST: "false" }, expectPresent: false },
  { name: "enabled (flag on)", env: { OPENWHISPR_ALLOW_CUSTOM_HOST: "true" }, expectPresent: true },
];

const DIST_RENDERER = path.join(ROOT, "src", "dist", "assets");

function buildScenario(env) {
  const merged = { ...process.env, ...env };
  const r = spawnSync("npm", ["run", "build:renderer"], {
    cwd: ROOT,
    env: merged,
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
  });
  if (r.status !== 0) {
    console.error(`[verify-allow-custom-host] build failed`);
    console.error(r.stderr || r.stdout);
    process.exit(2);
  }
}

function grepBundle(target) {
  if (!fs.existsSync(DIST_RENDERER)) return [];
  try {
    const out = execSync(`grep -rl "${target}" ${DIST_RENDERER}`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return out.split("\n").filter(Boolean);
  } catch (e) {
    return [];
  }
}

const violations = [];
let totalGreps = 0;

for (const scenario of SCENARIOS) {
  console.log(`[verify-allow-custom-host] building scenario: ${scenario.name}`);
  // Regenerate build-config with the scenario's env.
  const genResult = spawnSync("node", ["scripts/generate-build-config.js"], {
    cwd: ROOT,
    env: { ...process.env, ...scenario.env },
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
  });
  if (genResult.status !== 0) {
    console.error(`[verify-allow-custom-host] generator failed for ${scenario.name}`);
    console.error(genResult.stderr || genResult.stdout);
    process.exit(2);
  }
  buildScenario(scenario.env);

  for (const target of TARGETS) {
    totalGreps++;
    const matches = grepBundle(target);
    const present = matches.length > 0;
    if (present !== scenario.expectPresent) {
      violations.push({
        scenario: scenario.name,
        target,
        expected: scenario.expectPresent ? "PRESENT" : "ABSENT",
        actual: present ? "PRESENT" : "ABSENT",
        files: matches.slice(0, 3),
      });
    }
  }
}

// Restore default build for the next CI step.
spawnSync("node", ["scripts/generate-build-config.js"], {
  cwd: ROOT,
  env: process.env,
  stdio: "ignore",
});
buildScenario({});

if (violations.length === 0) {
  console.log(`[verify-allow-custom-host] OK — ${SCENARIOS.length} scenarios, ${totalGreps} greps, 0 violations`);
  process.exit(0);
}

console.error(
  `[verify-allow-custom-host] FAIL — ${violations.length} violation(s) across ${SCENARIOS.length} scenarios / ${totalGreps} greps\n`
);
for (const v of violations) {
  console.error(
    `  ✗ [${v.scenario}] target "${v.target}" — expected ${v.expected}, got ${v.actual}`
  );
  for (const f of v.files) console.error(`      hit: ${path.relative(ROOT, f)}`);
}
process.exit(1);
