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

// Phase 05 D-01: realtime WebSocket URL derived from OPENWHISPR_BACKEND_URL
// (or set explicitly). Direct named re-export so the literal is preserved
// across the module boundary for Rolldown DCE — same canonical pattern as
// OAUTH_*_ENABLED / BILLING_ENABLED / REFERRALS_ENABLED / STREAMING_ENABLED.
// Consumers (e.g., src/helpers/openaiRealtimeStreaming.js in PLAN-02) read
// the .cjs flavor directly; this re-export covers any future renderer
// consumer that needs the literal at build time.
export { OPENWHISPR_REALTIME_WSS_URL } from "./build-config.generated";

// Phase 4 OAuth gating: direct named re-export from the generated module so
// Rolldown can trace the literal boolean across the module boundary and
// constant-fold gates like `{OAUTH_*_ENABLED && (...)}` and
// `if (!OAUTH_*_ENABLED)` to drop disabled-provider code paths from the
// renderer bundle entirely.
//
// IMPORTANT: do NOT route through the `Generated.*` namespace import alias
// (`export const X = Generated.X`) — Rolldown does not propagate literal
// constants through namespace member reads, so the consumer-side gate
// degrades to a runtime check and DCE no longer applies. The named
// `export { ... } from "..."` form preserves the literal.
//
// See scripts/verify-defaults-parity.js (Phase 3) +
//     scripts/verify-oauth-gating.js (Phase 4 + 4.1) for the bundle-grep gates.
export {
  OAUTH_GOOGLE_ENABLED,
  OAUTH_APPLE_ENABLED,
  OAUTH_MICROSOFT_ENABLED,
  // Phase 04.1 CFG-09 PLAN-03: BILLING_ENABLED gates Stripe checkout/portal/
  // switch-plan UI + IPC. Re-exported via the same direct named-re-export
  // mechanism so Rolldown propagates the literal across the module boundary.
  BILLING_ENABLED,
  // Phase 04.1 CFG-09 PLAN-04: REFERRALS_ENABLED gates referral stats/invite
  // UI + IPC. Same mechanism — direct named re-export for Rolldown DCE.
  REFERRALS_ENABLED,
  // Phase 04.1 CFG-09 PLAN-05: STREAMING_ENABLED gates AssemblyAI/Deepgram
  // WebSocket realtime ASR + the 141kB useChatStreaming chat hook. Same
  // mechanism — direct named re-export for Rolldown DCE.
  STREAMING_ENABLED,
  // Phase 10 PLD-01: PROVIDER_LOCKDOWN_ENABLED gates alternative cloud
  // providers (OpenAI/Groq/Mistral/Custom), enterprise providers
  // (Bedrock/Azure/Vertex), and all BYOK / API-key surfaces. Same mechanism —
  // direct named re-export so Rolldown propagates the literal across the
  // module boundary for DCE; the `Generated.*` alias form is forbidden.
  PROVIDER_LOCKDOWN_ENABLED,
} from "./build-config.generated";
