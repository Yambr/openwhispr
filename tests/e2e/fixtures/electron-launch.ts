/**
 * Wrapper around Playwright's _electron.launch tailored to OpenWhispr.
 *
 * Boots the client against the locally-running slim-core server. Injects
 * test-only env vars that:
 *   - point the client at OPENWHISPR_E2E_BACKEND_URL
 *   - pre-seed a bearer token into safeStorage via the test hook in
 *     main.js (gated on NODE_ENV === 'test' + OPENWHISPR_E2E_AUTH_TOKEN)
 *
 * Returns the ElectronApplication + the first BrowserWindow page.
 */

import {
  _electron as electron,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { test as bddBase } from "playwright-bdd";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type LaunchResult = {
  app: ElectronApplication;
  page: Page;
};

export type LaunchOptions = {
  /** Bearer token to seed into safeStorage. Skip auth UI when provided. */
  authToken?: string;
  /** Override the backend URL for this launch (else env or default). */
  backendUrl?: string;
  /** Extra env to merge in. */
  env?: Record<string, string>;
};

const REPO_ROOT = path.resolve(__dirname, "../../..");

export async function launchClient(opts: LaunchOptions = {}): Promise<LaunchResult> {
  const backendUrl =
    opts.backendUrl ?? process.env.OPENWHISPR_E2E_BACKEND_URL ?? "http://localhost:4000";

  // Build as a plain string map — Playwright's electron.launch expects
  // { [k: string]: string }, not NodeJS.ProcessEnv (which is partial).
  const baseEnv: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (typeof v === "string") baseEnv[k] = v;
  }
  const env: Record<string, string> = {
    ...baseEnv,
    NODE_ENV: "test",
    OPENWHISPR_E2E_BACKEND_URL: backendUrl,
    // Phase 1 HOST-01 (v1.8.0): single SoT — OPENWHISPR_BACKEND_URL feeds the
    // build-config generator (consumed by main via build-config.generated.cjs)
    // AND becomes the renderer's value via Vite define
    // (VITE_OPENWHISPR_BACKEND_URL substitution).
    OPENWHISPR_BACKEND_URL: backendUrl,
    VITE_OPENWHISPR_BACKEND_URL: backendUrl,
    // Disable GPU/hardware accel — keeps the test runner happy in CI:
    ELECTRON_DISABLE_GPU: "1",
    ...opts.env,
  };

  if (opts.authToken) {
    // Surfaced for any future test-only branch; the steps seed the token
    // through `window.electronAPI.authSetToken(token)` (an EXISTING IPC
    // channel — no client changes) immediately after first window load.
    env.OPENWHISPR_E2E_AUTH_TOKEN = opts.authToken;
  }

  // v1.7.13: isolate userData so e2e launches never inherit the dev
  // machine's safeStorage (a real bearer token would auto-skip the
  // onboarding flow). main.js channel-isolates userData under
  // OpenWhispr-<channel> when OPENWHISPR_CHANNEL is staging/development.
  // VALID_CHANNELS is a hardcoded set ("development","staging","production"),
  // so we can't invent a per-scenario channel — instead we pin "staging"
  // and wipe its directory before each launch. Staging is the right
  // bucket here: it isolates from production state but is still a
  // recognised channel string.
  env.OPENWHISPR_CHANNEL = "staging";
  const macAppData = path.join(os.homedir(), "Library/Application Support");
  const isolatedDir = path.join(macAppData, "OpenWhispr-staging");
  try {
    fs.rmSync(isolatedDir, { recursive: true, force: true });
  } catch {
    /* best-effort */
  }

  const app = await electron.launch({
    args: [REPO_ROOT, "--no-sandbox"],
    cwd: REPO_ROOT,
    env,
    timeout: 30_000,
  });

  (app as unknown as { _isolatedUserData?: string })._isolatedUserData = isolatedDir;

  const page = await app.firstWindow({ timeout: 30_000 });
  await page.waitForLoadState("domcontentloaded");

  return { app, page };
}

export async function closeClient(result: LaunchResult): Promise<void> {
  // Capture the underlying OS process so we can guarantee it is gone
  // before returning. Playwright's app.close() resolves when the IPC
  // pipe drops, which can race the actual process exit on macOS and
  // surface later as `kill EPERM` during worker teardown.
  const proc = result.app.process();
  const waitForExit = new Promise<void>((resolve) => {
    if (!proc || proc.exitCode !== null) {
      resolve();
      return;
    }
    proc.once("exit", () => resolve());
  });
  try {
    await result.app.close();
  } catch {
    // Already closing/closed — fall through to the exit wait.
  }
  // Bounded wait: don't let a stuck process hang worker teardown.
  await Promise.race([
    waitForExit,
    new Promise<void>((resolve) => setTimeout(resolve, 10_000)),
  ]);
  // Belt-and-braces: if it is still alive, SIGKILL it directly so the
  // next scenario's launch isn't blocked by a zombie.
  try {
    if (proc && proc.exitCode === null) proc.kill("SIGKILL");
  } catch {
    // Process already reaped — ignore.
  }

  // v1.7.13: clean the staging userData dir so the next launch starts
  // from zero state. The same path is wiped pre-launch too — this is the
  // post-launch belt to keep dev workstations tidy.
  const isolated = (result.app as unknown as { _isolatedUserData?: string })
    ._isolatedUserData;
  if (isolated && isolated.endsWith("OpenWhispr-staging")) {
    try {
      fs.rmSync(isolated, { recursive: true, force: true });
    } catch {
      /* best-effort */
    }
  }
}

/**
 * Playwright-BDD test fixture. Step definitions that need an Electron
 * window import this `test` (instead of the bare `@playwright/test`
 * symbol) to receive `electronApp` + `page` per scenario.
 *
 * The fixture launches one Electron app per scenario and tears it down
 * cleanly via `closeClient`. Workers are serialised in playwright.config
 * (`workers: 1`) because Electron's IPC pipe isn't reentrant.
 *
 * Pre-v1.7.13 this fixture exported only the bare helper functions —
 * `host-runtime-override.steps.ts` imported `test` from this module but
 * it was never exported. Bddgen generated specs that referenced
 * `electronApp` and `page` parameters Playwright didn't know about, so
 * EVERY scenario silently produced 0 runnable tests. v1.7.13 wires the
 * fixture so the e2e suite actually executes.
 */
export const test = bddBase.extend<{
  electronApp: ElectronApplication;
  page: Page;
}>({
  electronApp: async ({}, use) => {
    const result = await launchClient();
    try {
      await use(result.app);
    } finally {
      await closeClient(result);
    }
  },
  // Bind the test's `page` to the Electron window that came out of the
  // launch above. Playwright's default `page` fixture wires to a
  // browser context, which Electron doesn't have.
  page: async ({ electronApp }, use) => {
    const page = await electronApp.firstWindow({ timeout: 30_000 });
    await page.waitForLoadState("domcontentloaded");
    await use(page);
  },
});
