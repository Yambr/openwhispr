import path from "node:path";
import { defineConfig } from "@playwright/test";

// Dedicated Playwright config for the Electron-UI lockdown test.
//
// This is SEPARATE from tests/e2e/playwright.config.ts: that suite is
// server-contract (playwright-bdd, hits the API via cloudCall) and never
// drives the renderer. This config drives the REAL Electron app and asserts
// on what the user actually sees on screen.
//
// globalSetup rebuilds the renderer with OPENWHISPR_PROVIDER_LOCKDOWN=true
// (DCE happens at vite-build time, so a stale src/dist would test the wrong
// config). globalTeardown restores the default build-config + renderer.
const ROOT = path.resolve(__dirname, "../..");

export default defineConfig({
  testDir: __dirname,
  testMatch: /.*\.spec\.ts$/,
  globalSetup: path.join(__dirname, "global-setup.ts"),
  globalTeardown: path.join(__dirname, "global-teardown.ts"),
  fullyParallel: false,
  workers: 1, // Electron isn't reentrant
  retries: 0,
  reporter: [["list"]],
  // Renderer rebuild in globalSetup can take a couple of minutes; the test
  // itself drives several screens with generous settle waits.
  timeout: 180_000,
  expect: { timeout: 15_000 },
  use: {
    trace: "retain-on-failure",
  },
});
