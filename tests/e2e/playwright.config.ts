import path from "node:path";
import { defineConfig } from "@playwright/test";
import { defineBddConfig } from "playwright-bdd";

// Resolve paths relative to the repo root.
// Playwright loads this via tsc/CJS; __dirname is available.
const ROOT = path.resolve(__dirname, "../..");

// playwright-bdd generates Playwright tests from .feature files at this
// glob, using step defs from steps/**.
const testDir = defineBddConfig({
  features: [path.join(ROOT, "tests/e2e/features/**/*.feature")],
  steps: [path.join(ROOT, "tests/e2e/steps/**/*.ts")],
  outputDir: path.join(ROOT, "tests/e2e/.playwright-bdd"),
});

export default defineConfig({
  testDir,
  fullyParallel: false,        // shared electron app instance per worker
  workers: 1,                  // serial — Electron isn't reentrant
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ["list"],
    ["html", { outputFolder: path.join(ROOT, "tests/e2e/reports/html"), open: "never" }],
    ["json", { outputFile: path.join(ROOT, "tests/e2e/reports/cucumber.json") }],
  ],
  use: {
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  timeout: 60_000,
  expect: { timeout: 10_000 },
});
