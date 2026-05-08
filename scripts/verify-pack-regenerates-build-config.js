#!/usr/bin/env node
// CFG-08 regression test: assert that `npm run pack` regenerates
// `src/config/build-config.generated.{ts,cjs}` so build-time env-var overrides
// actually take effect.
//
// Strategy: read the literal `pack` script from package.json, split on `&&`,
// run every step EXCEPT `electron-builder` (we don't want to actually pack a
// binary in CI/dev — too slow and unrelated to what we're testing). With
// `OPENWHISPR_OAUTH_GOOGLE=false` set, the simulated pack pipeline must
// regenerate `build-config.generated.cjs` so that `OAUTH_GOOGLE_ENABLED` is
// `false`. If the `pack` script doesn't include the generator step, the
// assertion fails — that's the bug this test guards against.
//
// On exit, the test ALWAYS restores `build-config.generated.{ts,cjs}` to
// defaults (no env), to keep the dev tree clean.
//
// Exit 0 = PASS, exit 1 = FAIL.

"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const repoRoot = path.resolve(__dirname, "..");
const cjsPath = path.join(repoRoot, "src", "config", "build-config.generated.cjs");
const generatorPath = path.join(repoRoot, "scripts", "generate-build-config.js");

function log(level, msg) {
  const prefix = level === "FAIL" ? "FAIL:" : level === "PASS" ? "PASS:" : "INFO:";
  // eslint-disable-next-line no-console
  console.log(`${prefix} ${msg}`);
}

function readGoogleFlag() {
  // Force re-read; clear require cache in case node has it cached.
  delete require.cache[cjsPath];
  if (!fs.existsSync(cjsPath)) {
    throw new Error(`build-config.generated.cjs not found at ${cjsPath}`);
  }
  // Parse via regex (avoid require — we don't want to keep a frozen module across runs).
  const txt = fs.readFileSync(cjsPath, "utf8");
  const m = txt.match(/OAUTH_GOOGLE_ENABLED:\s*(true|false)/);
  if (!m) {
    throw new Error("OAUTH_GOOGLE_ENABLED not found in build-config.generated.cjs");
  }
  return m[1] === "true";
}

function regenerateDefaults() {
  // Run the generator with a sanitized env (no OPENWHISPR_*) to restore
  // defaults. Strip ALL OPENWHISPR_* env vars (not just OPENWHISPR_OAUTH_*) so
  // ambient developer-shell exports like OPENWHISPR_BILLING/REFERRALS/STREAMING
  // cannot leak into the regenerated default-state build config. Phase 04.1
  // WR-02: this generalises trivially as future flags are added.
  const cleanEnv = { ...process.env };
  for (const key of Object.keys(cleanEnv)) {
    if (key.startsWith("OPENWHISPR_")) {
      delete cleanEnv[key];
    }
  }
  const r = spawnSync("node", [generatorPath], {
    cwd: repoRoot,
    env: cleanEnv,
    stdio: "inherit",
  });
  if (r.status !== 0) {
    throw new Error(`generator exit ${r.status} during cleanup`);
  }
}

function runPackPipelineWithOverride() {
  const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
  const packScript = pkg.scripts && pkg.scripts.pack;
  if (!packScript) {
    throw new Error("scripts.pack not found in package.json");
  }
  const steps = packScript.split("&&").map((s) => s.trim()).filter(Boolean);

  const env = {
    ...process.env,
    OPENWHISPR_OAUTH_GOOGLE: "false",
    // Speed up: skip vite build inside build:renderer? We can't easily; let it run.
    // The whole point is to run real steps so we'd actually catch the regression.
  };

  for (const step of steps) {
    if (/electron-builder/.test(step)) {
      log("INFO", `skipping electron-builder step: ${step}`);
      continue;
    }
    log("INFO", `running step: ${step}`);
    const r = spawnSync(step, {
      cwd: repoRoot,
      env,
      shell: true,
      stdio: "inherit",
    });
    if (r.status !== 0) {
      throw new Error(`step failed (exit ${r.status}): ${step}`);
    }
  }
}

let failed = false;
try {
  // Pre-condition: regenerate with defaults, expect OAUTH_GOOGLE_ENABLED=true.
  regenerateDefaults();
  const before = readGoogleFlag();
  if (before !== true) {
    log("FAIL", `pre-condition: expected OAUTH_GOOGLE_ENABLED=true after default regen, got ${before}`);
    failed = true;
  } else {
    log("INFO", "pre-condition OK: defaults give OAUTH_GOOGLE_ENABLED=true");
  }

  // Simulate the pack pipeline (minus electron-builder) with override.
  runPackPipelineWithOverride();

  // Post-condition: cjs must reflect the override.
  const after = readGoogleFlag();
  if (after !== false) {
    log(
      "FAIL",
      "pack pipeline did not regenerate build-config — OAUTH_GOOGLE_ENABLED is still true after OPENWHISPR_OAUTH_GOOGLE=false simulated pack"
    );
    failed = true;
  } else {
    log("PASS", "pack pipeline regenerated build-config (OAUTH_GOOGLE_ENABLED=false)");
  }
} catch (err) {
  log("FAIL", `unexpected error: ${err && err.message ? err.message : err}`);
  failed = true;
} finally {
  // Cleanup: always restore defaults so the dev tree is clean.
  try {
    regenerateDefaults();
    log("INFO", "cleanup: build-config restored to defaults");
  } catch (err) {
    log("FAIL", `cleanup failed: ${err && err.message ? err.message : err}`);
    failed = true;
  }
}

process.exit(failed ? 1 : 0);
