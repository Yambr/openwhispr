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
//   default                   — exclude @skip and @requires-paid-keys
//   E2E_INCLUDE_PAID=1        — include @requires-paid-keys scenarios.
//                               These mint tokens against / call real
//                               upstream paid APIs (OpenAI, AssemblyAI,
//                               Deepgram, LiteLLM). They REQUIRE the
//                               operator to have provisioned real
//                               upstream keys on the server. Without
//                               keys they fail 400/503 — an operator
//                               concern, not a harness or server bug.
//                               Excluded by default so the core suite
//                               is a clean signal.
//   E2E_RUN_SKIP=1            — include @skip (e.g., to confirm a fix landed)
//
// Phase-8 server requirements R1-R18 are all closed (server Phase 59,
// verified live 2026-05-20). No @blocked-rN gates remain — R15/R16/R18
// scenarios were un-tagged once the server fixes were verified. The only
// standing gate is the operator-controlled @requires-paid-keys above.
const tagParts: string[] = [];
if (!process.env.E2E_RUN_SKIP) tagParts.push("not @skip");
if (!process.env.E2E_INCLUDE_PAID) tagParts.push("not @requires-paid-keys");
const tags = tagParts.length ? tagParts.join(" and ") : undefined;

const testDir = defineBddConfig({
  features: [path.join(ROOT, "tests/e2e/features/**/*.feature")],
  // v1.7.13: include the fixture file in `steps` so bddgen can pick up
  // the extended `test` export. Without this the generated specs use the
  // bare playwright-bdd `test` and Playwright rejects scenarios that
  // reference `electronApp` / `page` fixtures — pre-v1.7.13 the whole
  // e2e suite silently produced 0 runnable tests for exactly this reason.
  steps: [
    path.join(ROOT, "tests/e2e/steps/**/*.ts"),
    path.join(ROOT, "tests/e2e/fixtures/electron-launch.ts"),
  ],
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
