import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: [
      "test/**/*.test.{js,ts,mjs,cjs}",
      "scripts/**/*.test.{js,ts,mjs,cjs}",
      "src/**/*.test.{js,ts,mjs,cjs}",
    ],
    // Phase 07 D-02: scope coverage to ONLY phase-04/04.1/05 additions.
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: [
        "scripts/generate-build-config.js",
        "src/helpers/openaiRealtimeStreaming.js",
      ],
      // shouldUseStreaming lives in audioManager.js — added in Plan 07-05
      // if extraction is feasible.
    },
    // Per-test env reset is the responsibility of each test file
    // (process.env snapshot/restore). Don't globally clear here.
    testTimeout: 10_000,
  },
});
