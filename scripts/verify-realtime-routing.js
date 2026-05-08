#!/usr/bin/env node
// Phase 05 PLAN-01 realtime-routing verification gate (CFG-04 + D-01).
//
// Asserts the OPENWHISPR_REALTIME_WSS_URL build-time variable is honored by
// scripts/generate-build-config.js with the documented derivation rules:
//
//   - When OPENWHISPR_BACKEND_URL is unset and OPENWHISPR_REALTIME_WSS_URL is
//     unset, the resolved value is the empty string (offline-safe default —
//     STREAMING_ENABLED guard handles the unavailable case).
//   - When OPENWHISPR_BACKEND_URL is set and OPENWHISPR_REALTIME_WSS_URL is
//     unset, the resolved value derives as `<ws_or_wss>://<host><path>/v1/realtime`:
//       * https:// → wss://, http:// → ws:// (preserve TLS-vs-plaintext).
//       * Path prefix on backend URL is preserved (sub-path-mounted backends
//         e.g. https://api.example.com/v1 → wss://api.example.com/v1/v1/realtime).
//       * Trailing slash on backend path is stripped before /v1/realtime is
//         appended.
//   - When OPENWHISPR_REALTIME_WSS_URL is explicitly set, that value wins
//     regardless of OPENWHISPR_BACKEND_URL.
//
// Each scenario shells out to `node scripts/generate-build-config.js` with
// scoped env, then re-requires the freshly written build-config.generated.cjs
// (with cache busting) and reads OPENWHISPR_REALTIME_WSS_URL.
//
// Exit 0 on all pass; exit 1 with first-failure details otherwise.
// Restores default-state cjs at end (re-runs with no scenario env) unless
// SKIP_RESTORE=1.
"use strict";

const { spawnSync, execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const REPO_ROOT = path.resolve(__dirname, "..");
const GEN = path.join(REPO_ROOT, "scripts", "generate-build-config.js");
const CJS = path.join(REPO_ROOT, "src", "config", "build-config.generated.cjs");

// Phase 05 PLAN-02: source + bundle no-leak gate.
// openaiRealtimeStreaming.js (main process) is the canonical streaming code path
// for the corporate backend (Speaches+LiteLLM is OpenAI-Realtime-compatible per
// 05-CONTEXT D-04). It must read its WSS URL from build-config.generated.cjs at
// module load time, NOT hardcode `wss://api.openai.com/v1/realtime`.
const SOURCE_NO_LEAK_FILES = [
  path.join(REPO_ROOT, "src", "helpers", "openaiRealtimeStreaming.js"),
];
const LEGACY_LITERAL = "api.openai.com/v1/realtime";

function checkSourceNoLeak() {
  const violations = [];
  for (const f of SOURCE_NO_LEAK_FILES) {
    if (!fs.existsSync(f)) continue;
    const txt = fs.readFileSync(f, "utf8");
    if (txt.includes(LEGACY_LITERAL)) {
      violations.push(
        `source-no-leak: ${path
          .relative(REPO_ROOT, f)
          .split(path.sep)
          .join("/")} contains literal "${LEGACY_LITERAL}"`
      );
    }
  }
  return violations;
}

function checkBundleNoLeakWithBackend() {
  const violations = [];
  const baseEnv = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !k.startsWith("OPENWHISPR_"))
  );
  const env = {
    ...baseEnv,
    OPENWHISPR_BACKEND_URL: "https://api.example.com",
    NODE_ENV: "production",
  };
  const dist = path.join(REPO_ROOT, "src", "dist");
  if (fs.existsSync(dist)) fs.rmSync(dist, { recursive: true, force: true });
  const g = spawnSync(process.execPath, [GEN], {
    cwd: REPO_ROOT,
    env,
    stdio: ["ignore", "inherit", "inherit"],
  });
  if (g.status !== 0) return [`bundle-no-leak-with-backend: generator exited ${g.status}`];
  const b = spawnSync("npm", ["run", "build:renderer"], {
    cwd: REPO_ROOT,
    env,
    stdio: ["ignore", "inherit", "inherit"],
  });
  if (b.status !== 0) return [`bundle-no-leak-with-backend: build:renderer exited ${b.status}`];
  if (!fs.existsSync(dist)) {
    return [`bundle-no-leak-with-backend: dist/ not produced after build:renderer`];
  }
  try {
    const out = execSync(
      `grep -RF -- ${JSON.stringify(LEGACY_LITERAL)} ${JSON.stringify(dist)}`,
      { encoding: "utf8" }
    );
    if (out.trim()) {
      violations.push(
        `bundle-no-leak-with-backend: literal "${LEGACY_LITERAL}" found in dist:\n    ${out
          .trim()
          .split("\n")[0]}`
      );
    }
  } catch (e) {
    // grep exit 1 = no matches = good
    if (e.status !== 1) {
      return [`bundle-no-leak-with-backend: grep failed (status ${e.status}): ${e.message}`];
    }
  }
  return violations;
}

const SCENARIOS = [
  { name: "no-backend", env: {}, expect: "" },
  {
    name: "backend-derives-realtime",
    env: { OPENWHISPR_BACKEND_URL: "https://api.example.com" },
    expect: "wss://api.example.com/v1/realtime",
  },
  {
    name: "explicit-realtime-wins",
    env: {
      OPENWHISPR_BACKEND_URL: "https://api.example.com",
      OPENWHISPR_REALTIME_WSS_URL: "wss://realtime.other.example/ws",
    },
    expect: "wss://realtime.other.example/ws",
  },
  {
    name: "backend-with-path",
    env: { OPENWHISPR_BACKEND_URL: "https://api.example.com/v1" },
    expect: "wss://api.example.com/v1/v1/realtime",
  },
  {
    name: "http-backend-yields-ws",
    env: { OPENWHISPR_BACKEND_URL: "http://localhost:8080" },
    expect: "ws://localhost:8080/v1/realtime",
  },
];

function runScenario(s) {
  // Strip pre-existing OPENWHISPR_* from process.env so prior scenarios do not
  // leak into the generator subprocess.
  const baseEnv = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !k.startsWith("OPENWHISPR_"))
  );
  const r = spawnSync(process.execPath, [GEN], {
    cwd: REPO_ROOT,
    env: { ...baseEnv, ...s.env },
    stdio: ["ignore", "inherit", "inherit"],
  });
  if (r.status !== 0) {
    return { ok: false, reason: `generator exited ${r.status}` };
  }
  delete require.cache[CJS];
  const cfg = require(CJS);
  const got = cfg.OPENWHISPR_REALTIME_WSS_URL;
  if (got !== s.expect) {
    return {
      ok: false,
      reason: `expected ${JSON.stringify(s.expect)}, got ${JSON.stringify(got)}`,
    };
  }
  return { ok: true };
}

function main() {
  const violations = [];
  try {
    for (const s of SCENARIOS) {
      const r = runScenario(s);
      if (!r.ok) {
        violations.push(`${s.name}: ${r.reason}`);
      }
    }
    violations.push(...checkSourceNoLeak());
    violations.push(...checkBundleNoLeakWithBackend());
  } finally {
    if (process.env.SKIP_RESTORE !== "1") {
      const baseEnv = Object.fromEntries(
        Object.entries(process.env).filter(([k]) => !k.startsWith("OPENWHISPR_"))
      );
      spawnSync(process.execPath, [GEN], {
        cwd: REPO_ROOT,
        env: baseEnv,
        stdio: "ignore",
      });
    }
  }
  if (violations.length === 0) {
    console.log(
      `[verify-realtime-routing] OK — ${SCENARIOS.length} derivation scenarios + source-no-leak + bundle-no-leak, 0 violations.`
    );
    process.exit(0);
  } else {
    console.error(
      `[verify-realtime-routing] FAIL — ${violations.length} violation(s):`
    );
    for (const v of violations) console.error(`  - ${v}`);
    process.exit(1);
  }
}

main();
