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
//   E2E_INCLUDE_BLOCKED=1     — include @blocked-rN scenarios (to re-probe
//                               a server requirement once the team
//                               reports it fixed).
//
// Phase-8 server requirements R1-R13 are closed. The Phase 9 e2e run
// (2026-05-20) surfaced fresh server bugs filed as R14-R17:
//   @blocked-r15 — two auth.feature scenarios: /api/auth/verification-
//                  status and /api/auth/delete-account 401 every valid
//                  auth form.
//   @blocked-r16 — transcription.feature "Empty file returns 400": the
//                  server 502s (SSRF self-block) instead of validating.
//   @blocked-r18 — auth.feature "Sign-in with verified user": Better
//                  Auth 403s a null Origin (undici sends Origin: null).
// These tag groups are excluded by default; set E2E_INCLUDE_BLOCKED=1
// to re-probe once the server team reports a fix. The other standing
// gate is the operator-controlled @requires-paid-keys above.
const tagParts: string[] = [];
if (!process.env.E2E_RUN_SKIP) tagParts.push("not @skip");
if (!process.env.E2E_INCLUDE_PAID) tagParts.push("not @requires-paid-keys");
if (!process.env.E2E_INCLUDE_BLOCKED) {
  tagParts.push("not @blocked-r15");
  tagParts.push("not @blocked-r16");
  tagParts.push("not @blocked-r18");
}
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
