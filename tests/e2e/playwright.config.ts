import path from "node:path";
import { defineConfig } from "@playwright/test";
import { defineBddConfig } from "playwright-bdd";

// Resolve paths relative to the repo root.
// Playwright loads this via tsc/CJS; __dirname is available.
const ROOT = path.resolve(__dirname, "../..");

// playwright-bdd generates Playwright tests from .feature files at this
// glob, using step defs from steps/**.
//
// Tag filtering at GENERATE time (Cucumber tag expressions):
//   default                   — exclude @skip and @blocked-s5
//   E2E_INCLUDE_BLOCKED=1     — include @blocked-s5 (still exclude @skip)
//   E2E_INCLUDE_PAID=1        — include @requires-paid-keys (already implicit)
//   E2E_RUN_SKIP=1            — include @skip (e.g., to confirm a fix landed)
//
// Phase 8 finding S5 keeps most DB-backed scenarios under @blocked-s5
// until the server team ships the pgbouncer overlay. Once S5 closes,
// strip the tag from the .feature files (not from this config).
const tagParts: string[] = [];
if (!process.env.E2E_RUN_SKIP) tagParts.push("not @skip");
if (!process.env.E2E_INCLUDE_BLOCKED) tagParts.push("not @blocked-s5");
const tags = tagParts.length ? tagParts.join(" and ") : undefined;

const testDir = defineBddConfig({
  features: [path.join(ROOT, "tests/e2e/features/**/*.feature")],
  steps: [path.join(ROOT, "tests/e2e/steps/**/*.ts")],
  outputDir: path.join(ROOT, "tests/e2e/.playwright-bdd"),
  tags,
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
