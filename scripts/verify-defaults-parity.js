#!/usr/bin/env node
// Phase 3 parity verification gate.
//
// Two-tier mechanical proof that the build-time env refactor is complete:
//   Gate 1  — Every URL literal listed in docs/CONFIG_INVENTORY.md occurs ONLY in the
//             allow-listed source files (defaults.ts, build-config.generated.{ts,cjs},
//             electron-builder.config.js, scripts/generate-build-config.js).
//   Gate 1b — Row 16 (the bare word `openwhispr` protocol scheme) is verified via TWO
//             anchored greps, NOT a fragile bare-substring exemption:
//               (a) electron-builder.config.js — the literal must be on the same line
//                   as `process.env.OPENWHISPR_OAUTH_PROTOCOL_SCHEME` OR `||`
//                   (i.e. ONLY the documented fallback expression is acceptable).
//               (b) main.js — `setAsDefaultProtocolClient("openwhispr")` direct-literal
//                   call must NOT exist (must route through build-config.generated.cjs).
//             Plus a positive control: confirm scripts/generate-build-config.js DOES
//             contain "openwhispr" (the canonical defaults table).
//   Gate 2  — No production source file outside the build-time injection layer
//             reads process.env.OPENWHISPR_*.
//
// Exit 0 on success, 1 on any violation (with a precise file:line:reason list).

"use strict";

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const REPO_ROOT = path.resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// Allow-lists
// ---------------------------------------------------------------------------

// Files where URL literals are allowed to appear (single source of truth).
// vite.config.mjs is included because it IS the renderer-side build-time injection
// layer — its `define` block uses literal fallbacks that get inlined into the bundle
// at build time, exactly equivalent to what the generator emits for the main process.
const ALLOWED_LITERAL_FILES = [
  "src/config/defaults.ts",
  "src/config/build-config.generated.ts",
  "src/config/build-config.generated.cjs",
  "electron-builder.config.js",
  "scripts/generate-build-config.js",
  "src/vite.config.mjs",
];

// Files where process.env.OPENWHISPR_<config-key> reads are allowed (build-time only).
const ALLOWED_ENV_READ_FILES = [
  "scripts/generate-build-config.js",
  "electron-builder.config.js",
  "src/vite.config.mjs",
  "scripts/verify-defaults-parity.js",
];

// The 16 Phase 3 config keys that Gate 2 protects. Operational env vars
// (OPENWHISPR_LOG_LEVEL, OPENWHISPR_CHANNEL, OPENWHISPR_DEV_SERVER_PORT, etc.)
// are NOT in this list — they are out of scope for the build-time refactor.
const PHASE3_CONFIG_KEYS = [
  "OPENWHISPR_AUTH_URL",
  "OPENWHISPR_BACKEND_URL",
  "OPENWHISPR_BACKEND_URL_PATTERN",
  "OPENWHISPR_OAUTH_DESKTOP_CALLBACK_URL",
  "OPENWHISPR_MCP_URL",
  "OPENWHISPR_OAUTH_GOOGLE_AUTH_URL",
  "OPENWHISPR_OAUTH_GOOGLE_TOKEN_URL",
  "OPENWHISPR_OAUTH_GOOGLE_REVOKE_URL",
  "OPENWHISPR_OAUTH_GOOGLE_CALENDAR_API_URL",
  "OPENWHISPR_OAUTH_RESET_PASSWORD_URL",
  "OPENWHISPR_OAUTH_PROTOCOL_SCHEME",
  "OPENWHISPR_OAUTH_PROTOCOL_SCHEME_OVERRIDDEN",
  "OPENWHISPR_OPENAI_BASE_URL",
  "OPENWHISPR_ANTHROPIC_URL",
  "OPENWHISPR_GEMINI_BASE_URL",
  "OPENWHISPR_GROQ_BASE_URL",
  "OPENWHISPR_MISTRAL_BASE_URL",
];

// Paths excluded from grep scans entirely.
const EXCLUDE_PATHS = [
  "node_modules",
  ".git",
  "src/dist",
  "src/locales",
  "docs",
  ".planning",
  "package-lock.json",
  "scripts/verify-defaults-parity.js", // self
  "test",
  "__tests__",
];

// Sources scanned for both gates (production-source surface).
const SCAN_TARGETS = [
  "src",
  "main.js",
  "preload.js",
  "electron-builder.config.js",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const violations = [];

function recordViolation(file, line, reason) {
  violations.push({ file, line, reason });
}

function buildExcludeArgs(extra = []) {
  const args = [];
  for (const p of EXCLUDE_PATHS.concat(extra)) {
    args.push("--exclude-dir=" + p);
    args.push("--exclude=" + p);
  }
  return args;
}

function grepFixed(literal, targets) {
  // grep -rnF — recursive, line-numbered, fixed-string match.
  const args = [
    "-rnF",
    "--binary-files=without-match",
    ...buildExcludeArgs(),
    "--",
    literal,
    ...targets.filter((t) => fs.existsSync(path.join(REPO_ROOT, t))),
  ];
  try {
    const out = execSync(`grep ${args.map(shellEscape).join(" ")}`, {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return parseGrepOutput(out);
  } catch (err) {
    // grep exits 1 when no matches found — treat as empty result, not error.
    if (err.status === 1) return [];
    throw err;
  }
}

function grepRegex(pattern, targets) {
  const args = [
    "-rnE",
    "--binary-files=without-match",
    ...buildExcludeArgs(),
    "--",
    pattern,
    ...targets.filter((t) => fs.existsSync(path.join(REPO_ROOT, t))),
  ];
  try {
    const out = execSync(`grep ${args.map(shellEscape).join(" ")}`, {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return parseGrepOutput(out);
  } catch (err) {
    if (err.status === 1) return [];
    throw err;
  }
}

function shellEscape(s) {
  if (s === "") return "''";
  if (/^[A-Za-z0-9_./=:@%+,-]+$/.test(s)) return s;
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

function parseGrepOutput(out) {
  const results = [];
  for (const raw of out.split("\n")) {
    if (!raw) continue;
    const m = raw.match(/^([^:]+):(\d+):(.*)$/);
    if (!m) continue;
    const file = m[1].replace(/^\.\//, "");
    results.push({ file, line: parseInt(m[2], 10), text: m[3] });
  }
  return results;
}

function isAllowedLiteralFile(file) {
  const normalized = file.replace(/\\/g, "/");
  return ALLOWED_LITERAL_FILES.some((allowed) => normalized === allowed);
}

function isAllowedEnvReadFile(file) {
  const normalized = file.replace(/\\/g, "/");
  return ALLOWED_ENV_READ_FILES.some((allowed) => normalized === allowed);
}

// ---------------------------------------------------------------------------
// Step 1 — parse CONFIG_INVENTORY.md and extract every "current value"
// ---------------------------------------------------------------------------

function extractInventoryValues() {
  const inventoryPath = path.join(REPO_ROOT, "docs", "CONFIG_INVENTORY.md");
  if (!fs.existsSync(inventoryPath)) {
    console.error("[verify-defaults-parity] CONFIG_INVENTORY.md not found at " + inventoryPath);
    process.exit(2);
  }
  const text = fs.readFileSync(inventoryPath, "utf8");
  const values = [];
  const seen = new Set();
  // Find table rows of the form: | file:line | `value` | env-var | category | notes |
  // Skip header / separator / category-only rows.
  const tableRowRe = /^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|/gm;
  let m;
  while ((m = tableRowRe.exec(text))) {
    const fileLine = m[1].trim();
    if (
      fileLine === "file:line" ||
      fileLine.startsWith("---") ||
      fileLine.startsWith("Category") ||
      fileLine.startsWith("**Total**") ||
      fileLine === "_No entries_" ||
      !fileLine.includes(":")
    ) {
      continue;
    }
    let val = m[2].trim();
    // Strip surrounding backticks.
    val = val.replace(/^`+/, "").replace(/`+$/, "");
    // Skip the "" empty-default sentinel — can't grep for empty string.
    if (val === "" || val === '""' || val.toLowerCase().startsWith("_no entries_")) continue;
    // Strip trailing inline annotations like ` (empty — cloud URL is opt-in)`.
    val = val.split(/\s+\(/)[0].trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    if (!val) continue;
    if (seen.has(val)) continue;
    seen.add(val);
    values.push(val);
  }
  return values;
}

// ---------------------------------------------------------------------------
// Gate 1 — URL literals must live only in allow-listed files
// ---------------------------------------------------------------------------

function gate1_urlParity(values) {
  let urlCount = 0;
  for (const value of values) {
    // Only check values that look like URLs (Gate 1b handles bare-word "openwhispr").
    if (!/^https?:\/\//i.test(value)) continue;
    urlCount++;
    const matches = grepFixed(value, SCAN_TARGETS);
    for (const hit of matches) {
      if (isAllowedLiteralFile(hit.file)) continue;
      recordViolation(
        hit.file,
        hit.line,
        `URL literal "${value}" must live only in allow-listed files (defaults.ts / build-config.generated.{ts,cjs} / electron-builder.config.js / scripts/generate-build-config.js)`
      );
    }
  }
  return urlCount;
}

// ---------------------------------------------------------------------------
// Gate 1b — row 16 protocol scheme via TWO anchored greps + positive control
// ---------------------------------------------------------------------------

function gate1b_protocolScheme() {
  // (a) electron-builder.config.js: every "openwhispr" must be on a line that ALSO
  //     contains either `OPENWHISPR_OAUTH_PROTOCOL_SCHEME` or `||` (the documented
  //     fallback expression). Any other occurrence indicates a regression.
  //     Excludes unambiguous non-protocol contexts: `CFBundleIconName` (icon name)
  //     and `repo:` (GitHub repo). These are not protocol scheme registrations and
  //     a regression at these sites would manifest as a different bug class.
  const ebPath = path.join(REPO_ROOT, "electron-builder.config.js");
  if (fs.existsSync(ebPath)) {
    const ebMatches = grepRegex('"openwhispr"', ["electron-builder.config.js"]);
    for (const hit of ebMatches) {
      // Skip unambiguous non-protocol contexts.
      if (/CFBundleIconName/.test(hit.text)) continue;
      if (/^\s*repo:/.test(hit.text)) continue;
      if (
        !/OPENWHISPR_OAUTH_PROTOCOL_SCHEME/.test(hit.text) &&
        !/\|\|/.test(hit.text)
      ) {
        recordViolation(
          hit.file,
          hit.line,
          `Bare "openwhispr" literal in electron-builder.config.js must only appear inside a fallback like \`process.env.OPENWHISPR_OAUTH_PROTOCOL_SCHEME || "openwhispr"\``
        );
      }
    }
  }

  // (b) main.js: setAsDefaultProtocolClient("openwhispr") direct-literal calls
  //     must not exist — registration must route through build-config.generated.cjs.
  const mainPath = path.join(REPO_ROOT, "main.js");
  if (fs.existsSync(mainPath)) {
    const directRegistration = grepRegex(
      'setAsDefaultProtocolClient\\(\\s*["\']openwhispr["\']\\s*\\)',
      ["main.js"]
    );
    for (const hit of directRegistration) {
      recordViolation(
        hit.file,
        hit.line,
        `setAsDefaultProtocolClient("openwhispr") must use the build-config.generated.cjs constant, not a bare literal`
      );
    }
  }

  // (c) Positive control: the generator MUST contain the literal — it is the
  //     canonical defaults table. If not, the gate itself is broken.
  const generatorMatches = grepFixed("openwhispr", [
    "scripts/generate-build-config.js",
  ]);
  if (generatorMatches.length === 0) {
    recordViolation(
      "scripts/generate-build-config.js",
      0,
      "Positive control failed: scripts/generate-build-config.js must contain the literal 'openwhispr' (canonical defaults table). Gate-self-check broken — false-pass risk."
    );
  }
}

// ---------------------------------------------------------------------------
// Gate 2 — no runtime process.env.OPENWHISPR_* reads in production
// ---------------------------------------------------------------------------

function gate2_envReads() {
  // Scope: ONLY the 16 Phase 3 config keys. Operational env vars
  // (OPENWHISPR_LOG_LEVEL, OPENWHISPR_CHANNEL, OPENWHISPR_DEV_SERVER_PORT,
  //  OPENWHISPR_AUTH_BRIDGE_PORT, OPENWHISPR_ONNX_WORKER_LOG, etc.) are out of
  //  scope — those are runtime-tunable controls, not the URL/scheme defaults
  //  that Phase 3 froze into build-config.generated.{ts,cjs}.
  const keyAlternation = PHASE3_CONFIG_KEYS.join("|");
  const matches = grepRegex(`process\\.env\\.(${keyAlternation})\\b`, SCAN_TARGETS);
  for (const hit of matches) {
    if (isAllowedEnvReadFile(hit.file)) continue;
    recordViolation(
      hit.file,
      hit.line,
      `process.env.<phase-3-key> reads are forbidden in production source — only the build-time injection layer (vite.config.mjs / electron-builder.config.js / scripts/generate-build-config.js) may read these.`
    );
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const values = extractInventoryValues();
  // CONFIG_INVENTORY has 23 rows, but many share the same URL (e.g. auth.openwhispr.com
  // appears 3x); de-duped distinct values total ~17. A floor of 15 protects against
  // a regressed parser silently passing while still tolerating future row consolidation.
  if (values.length < 15) {
    console.error(
      `[verify-defaults-parity] FATAL: only ${values.length} CONFIG_INVENTORY values parsed; expected >=15. Gate is likely broken.`
    );
    process.exit(2);
  }

  const urlCount = gate1_urlParity(values);
  gate1b_protocolScheme();
  gate2_envReads();

  if (violations.length > 0) {
    console.error("[verify-defaults-parity] FAIL — violations:");
    for (const v of violations) {
      console.error(`  ${v.file}:${v.line}: ${v.reason}`);
    }
    process.exit(1);
  }

  console.log(
    `[verify-defaults-parity] OK — ${urlCount} URL values checked across ${SCAN_TARGETS.length} scan targets`
  );
}

main();
