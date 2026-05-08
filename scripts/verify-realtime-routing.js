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

const { spawnSync } = require("child_process");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..");
const GEN = path.join(REPO_ROOT, "scripts", "generate-build-config.js");
const CJS = path.join(REPO_ROOT, "src", "config", "build-config.generated.cjs");

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
      `[verify-realtime-routing] OK — ${SCENARIOS.length} scenarios, 0 violations.`
    );
    process.exit(0);
  } else {
    console.error(
      `[verify-realtime-routing] FAIL — ${violations.length}/${SCENARIOS.length} scenarios regressed:`
    );
    for (const v of violations) console.error(`  - ${v}`);
    process.exit(1);
  }
}

main();
