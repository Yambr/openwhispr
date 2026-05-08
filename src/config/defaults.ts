// RENDERER-ONLY single source of truth for build-configurable URL/scheme defaults.
// DO NOT import this file from main process or CommonJS helpers — main reads
// src/config/build-config.generated.cjs directly via require().
//
// Renderer call sites read import.meta.env.VITE_OPENWHISPR_* (substituted by Vite
// `define` at build time). Main-process call sites read the build-config.generated.cjs
// module (frozen at prebuild time). No production code path reads
// process.env.OPENWHISPR_* at runtime — see Plan 6 verify-defaults-parity grep gate.

import * as Generated from "./build-config.generated";

const env = (import.meta as any).env as Record<string, string | undefined>;

function pick(viteName: string, generatedValue: string): string {
  const v = env?.[viteName];
  return typeof v === "string" && v.length > 0 ? v : generatedValue;
}

// For values where empty string IS a valid intended default (BACKEND_URL,
// MISTRAL_BASE_URL when intentionally cleared), preserve the explicit empty.
function pickAllowEmpty(viteName: string, generatedValue: string): string {
  const v = env?.[viteName];
  return typeof v === "string" ? v : generatedValue;
}

export const OPENWHISPR_AUTH_URL = pick("VITE_OPENWHISPR_AUTH_URL", Generated.OPENWHISPR_AUTH_URL);
export const OPENWHISPR_BACKEND_URL = pickAllowEmpty(
  "VITE_OPENWHISPR_BACKEND_URL",
  Generated.OPENWHISPR_BACKEND_URL
);
export const OPENWHISPR_BACKEND_URL_PATTERN = pick(
  "VITE_OPENWHISPR_BACKEND_URL_PATTERN",
  Generated.OPENWHISPR_BACKEND_URL_PATTERN
);
export const OPENWHISPR_OAUTH_DESKTOP_CALLBACK_URL = pick(
  "VITE_OPENWHISPR_OAUTH_DESKTOP_CALLBACK_URL",
  Generated.OPENWHISPR_OAUTH_DESKTOP_CALLBACK_URL
);
export const OPENWHISPR_MCP_URL = pick("VITE_OPENWHISPR_MCP_URL", Generated.OPENWHISPR_MCP_URL);
export const OPENWHISPR_OAUTH_GOOGLE_AUTH_URL = Generated.OPENWHISPR_OAUTH_GOOGLE_AUTH_URL;
export const OPENWHISPR_OAUTH_GOOGLE_TOKEN_URL = Generated.OPENWHISPR_OAUTH_GOOGLE_TOKEN_URL;
export const OPENWHISPR_OAUTH_GOOGLE_REVOKE_URL = Generated.OPENWHISPR_OAUTH_GOOGLE_REVOKE_URL;
export const OPENWHISPR_OAUTH_GOOGLE_CALENDAR_API_URL =
  Generated.OPENWHISPR_OAUTH_GOOGLE_CALENDAR_API_URL;
export const OPENWHISPR_OAUTH_RESET_PASSWORD_URL = pick(
  "VITE_OPENWHISPR_OAUTH_RESET_PASSWORD_URL",
  Generated.OPENWHISPR_OAUTH_RESET_PASSWORD_URL
);
export const OPENWHISPR_OAUTH_PROTOCOL_SCHEME = Generated.OPENWHISPR_OAUTH_PROTOCOL_SCHEME;
export const OPENWHISPR_OPENAI_BASE_URL = pick(
  "VITE_OPENWHISPR_OPENAI_BASE_URL",
  Generated.OPENWHISPR_OPENAI_BASE_URL
);
export const OPENWHISPR_ANTHROPIC_URL = Generated.OPENWHISPR_ANTHROPIC_URL;
export const OPENWHISPR_GEMINI_BASE_URL = pick(
  "VITE_OPENWHISPR_GEMINI_BASE_URL",
  Generated.OPENWHISPR_GEMINI_BASE_URL
);
export const OPENWHISPR_GROQ_BASE_URL = pick(
  "VITE_OPENWHISPR_GROQ_BASE_URL",
  Generated.OPENWHISPR_GROQ_BASE_URL
);
export const OPENWHISPR_MISTRAL_BASE_URL = pickAllowEmpty(
  "VITE_OPENWHISPR_MISTRAL_BASE_URL",
  Generated.OPENWHISPR_MISTRAL_BASE_URL
);
