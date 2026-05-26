import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_DEV_SERVER_PORT = 5183;

const parseDevServerPort = (rawPort) => {
  const normalizedPort = rawPort || String(DEFAULT_DEV_SERVER_PORT);
  const parsedPort = Number(normalizedPort);

  if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
    return DEFAULT_DEV_SERVER_PORT;
  }

  return parsedPort;
};

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const envDir = path.resolve(__dirname, "..");
  const env = loadEnv(mode, envDir, "");
  const rawPort = env.VITE_DEV_SERVER_PORT || env.OPENWHISPR_DEV_SERVER_PORT;
  const devServerPort = parseDevServerPort(rawPort);

  // Phase 3 build-time env: resolve every VITE_OPENWHISPR_* renderer key from
  // process.env / .env at build time. Defaults match docs/CONFIG_INVENTORY.md.
  // These values are inlined into the JS bundle as literals via Vite `define`.
  const buildTimeDefaults = {
    VITE_OPENWHISPR_BACKEND_URL: env.OPENWHISPR_BACKEND_URL ?? "",
    VITE_OPENWHISPR_BACKEND_URL_PATTERN:
      env.OPENWHISPR_BACKEND_URL_PATTERN || "https://api.openwhispr.com/*",
    VITE_OPENWHISPR_AUTH_URL_PATTERN:
      env.OPENWHISPR_AUTH_URL_PATTERN || "https://auth.openwhispr.com/*",
    VITE_OPENWHISPR_AUTH_URL:
      env.OPENWHISPR_AUTH_URL || env.VITE_AUTH_URL || "https://auth.openwhispr.com",
    VITE_OPENWHISPR_OAUTH_DESKTOP_CALLBACK_URL:
      env.OPENWHISPR_OAUTH_DESKTOP_CALLBACK_URL ||
      env.VITE_OPENWHISPR_OAUTH_CALLBACK_URL ||
      "https://openwhispr.com/auth/desktop-callback",
    VITE_OPENWHISPR_MCP_URL: env.OPENWHISPR_MCP_URL || "https://mcp.openwhispr.com/mcp",
    VITE_OPENWHISPR_OAUTH_RESET_PASSWORD_URL:
      env.OPENWHISPR_OAUTH_RESET_PASSWORD_URL || "https://openwhispr.com/reset-password",
    VITE_OPENWHISPR_OPENAI_BASE_URL:
      env.OPENWHISPR_OPENAI_BASE_URL || env.OPENAI_BASE_URL || "https://api.openai.com/v1",
    VITE_OPENWHISPR_GEMINI_BASE_URL:
      env.OPENWHISPR_GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta",
    VITE_OPENWHISPR_GROQ_BASE_URL:
      env.OPENWHISPR_GROQ_BASE_URL || "https://api.groq.com/openai/v1",
    VITE_OPENWHISPR_MISTRAL_BASE_URL:
      env.OPENWHISPR_MISTRAL_BASE_URL || "https://api.mistral.ai/v1",
    // Phase 4 OAuth gating flags are sourced from src/config/build-config.generated.cjs
    // (re-exported via src/config/defaults.ts as boolean literals — DCE-friendly).
    // No `define` substitution is required for the OAuth booleans. See review WR-02.
  };

  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: "write-runtime-env",
        writeBundle() {
          const runtimeEnv = {
            // Phase 1 HOST-01 (v1.8.0): VITE_OPENWHISPR_API_URL retired —
            // see src/config/defaults.ts OPENWHISPR_BACKEND_URL.
            VITE_AUTH_URL: env.VITE_AUTH_URL || "",
            ...buildTimeDefaults,
          };
          fs.writeFileSync(
            path.resolve(__dirname, "dist", "runtime-env.json"),
            JSON.stringify(runtimeEnv)
          );
        },
      },
    ],
    define: Object.fromEntries(
      Object.entries(buildTimeDefaults).map(([k, v]) => [
        `import.meta.env.${k}`,
        JSON.stringify(v),
      ])
    ),
    base: "./", // Use relative paths for file:// protocol in Electron
    envDir, // Load .env from project root
    resolve: {
      alias: (() => {
        const baseAlias = [{ find: "@", replacement: path.resolve(__dirname, ".") }];
        // Phase 04.1 PLAN-03 (CFG-09 BILLING_ENABLED): when the build flag is
        // false (corporate-minimal default), swap the resolved absolute path
        // of src/hooks/billingActions for the stub so that no `cloud*` Stripe
        // IPC literals are emitted into the renderer bundle. The flag is read
        // directly from the generated CJS build-config so it stays in sync
        // with the rest of the gate. We match by absolute path (with optional
        // .ts extension) so the alias only fires for our specific module and
        // can never accidentally remap a node_modules path.
        const buildConfigPath = path.resolve(__dirname, "config", "build-config.generated.cjs");
        let billingEnabled = true;
        if (fs.existsSync(buildConfigPath)) {
          // Bypass require cache so successive builds in the same process pick
          // up env-driven changes (verify-feature-gating runs sequential
          // generate→build cycles).
          delete require.cache[buildConfigPath];
          const buildConfig = require(buildConfigPath);
          billingEnabled = buildConfig.BILLING_ENABLED === true;
        }
        if (!billingEnabled) {
          const stubPath = path.resolve(__dirname, "hooks", "billingActions.stub.ts");
          baseAlias.push({
            find: /^.*\/hooks\/billingActions(\.ts)?$/,
            replacement: stubPath,
          });
          baseAlias.push({
            find: /^\.\/billingActions$/,
            replacement: stubPath,
          });
        }

        // Phase 04.1 PLAN-05 (CFG-09 STREAMING_ENABLED): when the streaming
        // build flag is false (corporate-minimal default), swap two leaf
        // modules for stubs so the renderer bundle never carries the
        // AssemblyAI / Deepgram realtime ASR preload method literals nor the
        // 141kB useChatStreaming agent hook.
        let streamingEnabled = false;
        let providerLockdown = false;
        if (fs.existsSync(buildConfigPath)) {
          // require.cache already busted above; safe to re-require.
          const buildConfig = require(buildConfigPath);
          streamingEnabled = buildConfig.STREAMING_ENABLED === true;
          providerLockdown = buildConfig.PROVIDER_LOCKDOWN_ENABLED === true;
        }
        if (!streamingEnabled) {
          const streamingProvidersStub = path.resolve(
            __dirname,
            "helpers",
            "streamingProviders.stub.js"
          );
          baseAlias.push({
            find: /^.*\/helpers\/streamingProviders(\.js)?$/,
            replacement: streamingProvidersStub,
          });
          baseAlias.push({
            find: /^\.\/streamingProviders$/,
            replacement: streamingProvidersStub,
          });
        } else if (providerLockdown) {
          // Streaming on + lockdown: keep realtime, but cut the deepgram /
          // assemblyai alternative-provider catalog entries by aliasing to the
          // single-entry lockdown catalog (NOT the stub — the stub disables
          // streaming entirely).
          const streamingProvidersLockdown = path.resolve(
            __dirname,
            "helpers",
            "streamingProviders.lockdown.js"
          );
          baseAlias.push({
            find: /^.*\/helpers\/streamingProviders(\.js)?$/,
            replacement: streamingProvidersLockdown,
          });
          baseAlias.push({
            find: /^\.\/streamingProviders$/,
            replacement: streamingProvidersLockdown,
          });
        }
        // useChatStreaming stub aliasing stays gated on !streamingEnabled only.
        if (!streamingEnabled) {
          const useChatStreamingStub = path.resolve(
            __dirname,
            "components",
            "chat",
            "useChatStreaming.stub.ts"
          );
          baseAlias.push({
            find: /^.*\/components\/chat\/useChatStreaming(\.ts)?$/,
            replacement: useChatStreamingStub,
          });
          baseAlias.push({
            find: /^\.\/useChatStreaming$/,
            replacement: useChatStreamingStub,
          });
        }
        return baseAlias;
      })(),
    },
    server: {
      port: devServerPort,
      strictPort: true,
      host: "127.0.0.1",
    },
    build: {
      outDir: "dist",
      assetsDir: "assets",
      rolldownOptions: {
        external: [
          "electron",
          "fs",
          "path",
          "child_process",
          "https",
          "http",
          "crypto",
          "os",
          "stream",
          "util",
          "zlib",
          "tar",
          "unzipper",
          "@aws-sdk/client-s3",
        ],
        output: {
          manualChunks(id) {
            if (
              id.includes("@radix-ui/react-dialog") ||
              id.includes("@radix-ui/react-dropdown-menu") ||
              id.includes("@radix-ui/react-select") ||
              id.includes("@radix-ui/react-tabs")
            ) {
              return "vendor-radix";
            }
            if (id.includes("lucide-react")) {
              return "vendor-icons";
            }
          },
        },
      },
    },
  };
});
