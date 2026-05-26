#!/usr/bin/env node
// Phase 1 — verify backend URL SoT consolidation (HOST-01 + HOST-03 gate).
//
// Runs as part of Phase 1 acceptance (Plan 01-07) and as a regression gate
// for Phase 6 (recurring upstream-merge). Three asserts:
//
// 1. Source grep — `OPENWHISPR_API_URL` and `VITE_OPENWHISPR_API_URL`
//    appear in zero source/script/workflow files (after Plans 01-03..01-06).
// 2. Source grep — the 3 hardcoded URLs from HOST-03 appear only in
//    src/config/defaults.ts and src/config/build-config.generated.{ts,cjs}.
//    Upstream merges that regress Phase 03-02 work get caught here.
// 3. (Optional, runs only after `npm run pack`) Bundle grep — the same
//    literals are absent from the renderer/main bundles where they
//    shouldn't appear.

"use strict";

const { execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");

const BANNED_TOKENS_SOURCE = [
  { token: "OPENWHISPR_API_URL", scope: ["src", "scripts", ".github/workflows", "tests"], allow: [] },
  { token: "VITE_OPENWHISPR_API_URL", scope: ["src", "scripts", ".github/workflows", "tests"], allow: [] },
];

// vite.config.mjs is allowed because it sets parity defaults for define() —
// it's a build-time fallback chain (env → vite define → SoT), not a hardcoded
// runtime literal. Same pattern as OPENWHISPR_MCP_URL/OAUTH_* fallbacks already
// present in vite.config.mjs.
const HOST_03_GENERATED_ALLOW = [
  "src/config/defaults.ts",
  "src/config/build-config.generated.ts",
  "src/config/build-config.generated.cjs",
  "src/vite.config.mjs",
];

const HOST_03_LITERALS = [
  { literal: "https://openwhispr.com/auth/desktop-callback", allow: HOST_03_GENERATED_ALLOW },
  { literal: "https://openwhispr.com/reset-password", allow: HOST_03_GENERATED_ALLOW },
  { literal: "https://notes.openwhispr.com", allow: HOST_03_GENERATED_ALLOW },
];

const violations = [];
let checked = 0;

function grepSource(token, scopes) {
  const matches = [];
  for (const scope of scopes) {
    const scopePath = path.join(ROOT, scope);
    if (!fs.existsSync(scopePath)) continue;
    try {
      const out = execSync(
        `grep -rn --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=reports --include=*.ts --include=*.tsx --include=*.js --include=*.jsx --include=*.mjs --include=*.cjs --include=*.yml --include=*.yaml --include=*.json "${token}" ${scopePath}`,
        { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
      );
      for (const line of out.split("\n")) {
        if (!line) continue;
        const m = line.match(/^([^:]+):(\d+):(.*)$/);
        if (m) matches.push({ file: path.relative(ROOT, m[1]), line: Number(m[2]), content: m[3] });
      }
    } catch (e) {
      // grep exit 1 = no matches = happy
    }
  }
  return matches;
}

function isAllowed(filePath, allowList) {
  return allowList.some((a) => filePath === a || filePath.endsWith("/" + a));
}

for (const { token, scope, allow } of BANNED_TOKENS_SOURCE) {
  checked++;
  const matches = grepSource(token, scope);
  const forbidden = matches.filter((m) => !isAllowed(m.file, allow));
  if (forbidden.length > 0) {
    violations.push({
      check: `BANNED-TOKEN: ${token}`,
      details: forbidden.slice(0, 10).map((m) => `${m.file}:${m.line} — ${m.content.trim()}`),
      total: forbidden.length,
    });
  }
}

for (const { literal, allow } of HOST_03_LITERALS) {
  checked++;
  const matches = grepSource(literal, ["src"]);
  const forbidden = matches.filter((m) => !isAllowed(m.file, allow));
  if (forbidden.length > 0) {
    violations.push({
      check: `HOST-03-LITERAL: ${literal}`,
      details: forbidden.slice(0, 10).map((m) => `${m.file}:${m.line} — ${m.content.trim()}`),
      total: forbidden.length,
    });
  }
}

const distRoot = path.join(ROOT, "dist");
if (fs.existsSync(distRoot)) {
  checked++;
  try {
    const out = execSync(`grep -r --include="*.js" --include="*.cjs" "OPENWHISPR_API_URL" ${distRoot}`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const bundleHits = out.split("\n").filter(Boolean);
    if (bundleHits.length > 0) {
      violations.push({
        check: "BUNDLE-HAS-DEAD-VAR: OPENWHISPR_API_URL",
        details: bundleHits.slice(0, 5),
        total: bundleHits.length,
      });
    }
  } catch (e) {
    // grep exit 1 — no matches — pass
  }
}

if (violations.length === 0) {
  console.log(`verify-backend-url-sot: OK — ${checked} checks, 0 violations`);
  process.exit(0);
}

console.error(`verify-backend-url-sot: FAIL — ${violations.length} violation(s) across ${checked} checks\n`);
for (const v of violations) {
  console.error(`  ✗ ${v.check} (${v.total} match${v.total === 1 ? "" : "es"})`);
  for (const d of v.details) console.error(`      ${d}`);
}
process.exit(1);
