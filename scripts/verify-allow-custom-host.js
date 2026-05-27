#!/usr/bin/env node
// Phase 3 BG-02 (v1.7.11) — bundle-grep gate for OPENWHISPR_ALLOW_CUSTOM_HOST.
//
// Builds the app across FOUR scenarios so the no-env default and the
// lockdown+custom-host coexistence are both grep-pinned. v1.7.10 shipped a
// release-breaking regression precisely because the prior two-scenario
// matrix never exercised the implicit-default or lockdown combinations.
//
//   1. Implicit default (no env vars)        → expect PRESENT  (v1.7.11 flip).
//   2. Explicit off  (ALLOW_CUSTOM_HOST=false) → expect ABSENT  (tree-shake).
//   3. Explicit on   (ALLOW_CUSTOM_HOST=true)  → expect PRESENT (positive).
//   4. Lockdown      (PROVIDER_LOCKDOWN=true)  → expect PRESENT (orthogonal
//                                                 axes — locks in v1.7.11
//                                                 WARN-03 cascade removal).
//
// Targets (Phase 4 UI-01..04 deliverables):
//   - The i18n key `onboarding.serverUrl.label` (added in UI-04 across 9 locales).
//   - The `server-url-field` data-testid attribute (Phase 4 UI-01).
//
// Structurally aligned with verify-provider-lockdown.js / verify-oauth-gating.js.

"use strict";

const { execSync, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");

// Targets — strings that MUST appear in the bundle when the flag is ON, and
// MUST NOT appear when the flag is OFF.
// Stable bundle literals that survive Rolldown minification — i18n keys are
// string literals preserved verbatim, and the data-testid attribute is also
// a literal. Component class names get mangled, so we don't grep on those.
const TARGETS = [
  "onboarding.serverUrl.label", // i18n key (Phase 4 UI-04)
  "server-url-field", // data-testid on the field (Phase 4 UI-01)
];

const SCENARIOS = [
  // (1) The actual no-env default. v1.7.10 missed its regression because no
  // scenario tested this combination — both scenarios were explicit.
  { name: "implicit default (no env)", env: {}, expectPresent: true },
  // (2) Explicit opt-out → field tree-shaken.
  { name: "explicit off (OPENWHISPR_ALLOW_CUSTOM_HOST=false)", env: { OPENWHISPR_ALLOW_CUSTOM_HOST: "false" }, expectPresent: false },
  // (3) Explicit on → field present (positive control).
  { name: "explicit on (OPENWHISPR_ALLOW_CUSTOM_HOST=true)", env: { OPENWHISPR_ALLOW_CUSTOM_HOST: "true" }, expectPresent: true },
  // (4) Lockdown + custom-host coexistence. v1.7.10 WARN-03 cascade pinned
  // ALLOW_CUSTOM_HOST=false under lockdown, breaking every Yambr release.
  // v1.7.11 removed the cascade; this scenario locks that decision in.
  { name: "lockdown (PROVIDER_LOCKDOWN=true) — custom-host coexists", env: { OPENWHISPR_PROVIDER_LOCKDOWN: "true" }, expectPresent: true },
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

  // Grep IMMEDIATELY after this scenario's build, before the next scenario
  // overwrites src/dist/assets/.
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
