// Ambient type augmentation for Vite's import.meta.env, declaring all
// VITE_OPENWHISPR_* keys injected via the `define` block in src/vite.config.mjs
// at build time (Phase 3 build-time-env refactor).
//
// All keys are optional (readonly + `?`) because:
//   - Default builds may not set them explicitly (they get the parity literal via Vite define).
//   - This file documents the contract; runtime fallback is handled in src/config/defaults.ts.

interface ImportMetaEnv {
  // Existing pre-Phase-3 keys — preserved for backward compatibility until call
  // sites migrate in waves 2-5.
  readonly VITE_AUTH_URL?: string;
  readonly VITE_OPENWHISPR_API_URL?: string;

  // Phase 3 renderer-exposed build-time keys.
  readonly VITE_OPENWHISPR_AUTH_URL?: string;
  readonly VITE_OPENWHISPR_BACKEND_URL?: string;
  readonly VITE_OPENWHISPR_BACKEND_URL_PATTERN?: string;
  readonly VITE_OPENWHISPR_AUTH_URL_PATTERN?: string;
  readonly VITE_OPENWHISPR_OAUTH_DESKTOP_CALLBACK_URL?: string;
  readonly VITE_OPENWHISPR_MCP_URL?: string;
  readonly VITE_OPENWHISPR_OAUTH_RESET_PASSWORD_URL?: string;
  readonly VITE_OPENWHISPR_OPENAI_BASE_URL?: string;
  readonly VITE_OPENWHISPR_GEMINI_BASE_URL?: string;
  readonly VITE_OPENWHISPR_GROQ_BASE_URL?: string;
  readonly VITE_OPENWHISPR_MISTRAL_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
