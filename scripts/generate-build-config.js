#!/usr/bin/env node
// Phase 3 build-time config generator.
//
// Reads process.env.OPENWHISPR_* at build/dev time and emits TWO frozen modules:
//   - src/config/build-config.generated.ts  (renderer/TS consumers; imported by src/config/defaults.ts)
//   - src/config/build-config.generated.cjs (main-process CommonJS consumers; required directly)
//
// Both files are .gitignored. The default-build (no env vars) values match the pre-refactor
// hardcoded literals — see docs/CONFIG_INVENTORY.md for the source-of-truth mapping.

"use strict";

const fs = require("fs");
const path = require("path");

// 16 logical string env-var keys with their parity defaults.
// Empty string ("") is a valid intended default for OPENWHISPR_BACKEND_URL — DO NOT coerce.
const DEFAULTS = Object.freeze({
  OPENWHISPR_AUTH_URL: "https://auth.openwhispr.com",
  OPENWHISPR_BACKEND_URL: "",
  OPENWHISPR_BACKEND_URL_PATTERN: "https://api.openwhispr.com/*",
  OPENWHISPR_OAUTH_DESKTOP_CALLBACK_URL: "https://openwhispr.com/auth/desktop-callback",
  OPENWHISPR_MCP_URL: "https://mcp.openwhispr.com/mcp",
  OPENWHISPR_OAUTH_GOOGLE_AUTH_URL: "https://accounts.google.com/o/oauth2/v2/auth",
  OPENWHISPR_OAUTH_GOOGLE_TOKEN_URL: "https://oauth2.googleapis.com/token",
  OPENWHISPR_OAUTH_GOOGLE_REVOKE_URL: "https://oauth2.googleapis.com/revoke",
  OPENWHISPR_OAUTH_GOOGLE_CALENDAR_API_URL: "https://www.googleapis.com/calendar/v3",
  OPENWHISPR_OAUTH_RESET_PASSWORD_URL: "https://openwhispr.com/reset-password",
  OPENWHISPR_OAUTH_PROTOCOL_SCHEME: "openwhispr",
  OPENWHISPR_OPENAI_BASE_URL: "https://api.openai.com/v1",
  OPENWHISPR_ANTHROPIC_URL: "https://api.anthropic.com/v1/messages",
  OPENWHISPR_GEMINI_BASE_URL: "https://generativelanguage.googleapis.com/v1beta",
  OPENWHISPR_GROQ_BASE_URL: "https://api.groq.com/openai/v1",
  OPENWHISPR_MISTRAL_BASE_URL: "https://api.mistral.ai/v1",
});

const KEYS = Object.keys(DEFAULTS);

function resolveValue(key) {
  // Use hasOwnProperty so an explicit empty string still counts as "set" — important
  // for OPENWHISPR_BACKEND_URL where empty is the documented default and any explicit
  // override (including "") must be honored.
  if (Object.prototype.hasOwnProperty.call(process.env, key)) {
    return process.env[key];
  }
  return DEFAULTS[key];
}

function buildResolved() {
  const resolved = {};
  for (const key of KEYS) {
    resolved[key] = resolveValue(key);
  }
  resolved.OPENWHISPR_OAUTH_PROTOCOL_SCHEME_OVERRIDDEN = Object.prototype.hasOwnProperty.call(
    process.env,
    "OPENWHISPR_OAUTH_PROTOCOL_SCHEME"
  );
  return resolved;
}

function emitTs(resolved, outPath) {
  const lines = [
    "// AUTO-GENERATED — do not edit. Produced by scripts/generate-build-config.js at build time.",
    "// Renderer/TS consumers should NOT import this file directly — import src/config/defaults.ts instead.",
    "",
  ];
  for (const key of KEYS) {
    lines.push(`export const ${key} = ${JSON.stringify(resolved[key])};`);
  }
  lines.push(
    `export const OPENWHISPR_OAUTH_PROTOCOL_SCHEME_OVERRIDDEN = ${JSON.stringify(resolved.OPENWHISPR_OAUTH_PROTOCOL_SCHEME_OVERRIDDEN)};`
  );
  lines.push("");
  fs.writeFileSync(outPath, lines.join("\n"), "utf8");
}

function emitCjs(resolved, outPath) {
  const entries = [];
  for (const key of KEYS) {
    entries.push(`  ${key}: ${JSON.stringify(resolved[key])}`);
  }
  entries.push(
    `  OPENWHISPR_OAUTH_PROTOCOL_SCHEME_OVERRIDDEN: ${JSON.stringify(resolved.OPENWHISPR_OAUTH_PROTOCOL_SCHEME_OVERRIDDEN)}`
  );
  const body = [
    "// AUTO-GENERATED — do not edit. Produced by scripts/generate-build-config.js at build time.",
    "// Main-process / CommonJS consumers require this module directly — DO NOT require defaults.ts.",
    "",
    '"use strict";',
    "",
    "module.exports = Object.freeze({",
    entries.join(",\n"),
    "});",
    "",
  ].join("\n");
  fs.writeFileSync(outPath, body, "utf8");
}

function main() {
  const repoRoot = path.resolve(__dirname, "..");
  const tsOut = path.join(repoRoot, "src", "config", "build-config.generated.ts");
  const cjsOut = path.join(repoRoot, "src", "config", "build-config.generated.cjs");

  const outDir = path.dirname(tsOut);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const resolved = buildResolved();
  emitTs(resolved, tsOut);
  emitCjs(resolved, cjsOut);

  // eslint-disable-next-line no-console
  console.log("[build-config] wrote src/config/build-config.generated.{ts,cjs} (16 string keys + 1 boolean)");
}

main();
