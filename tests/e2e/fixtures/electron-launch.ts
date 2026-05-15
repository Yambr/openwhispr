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

import { _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
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

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: "test",
    OPENWHISPR_E2E_BACKEND_URL: backendUrl,
    // Vite define mirror so the renderer also sees the override:
    OPENWHISPR_BACKEND_URL: backendUrl,
    // Disable GPU/hardware accel — keeps the test runner happy in CI:
    ELECTRON_DISABLE_GPU: "1",
    ...opts.env,
  };

  if (opts.authToken) {
    env.OPENWHISPR_E2E_AUTH_TOKEN = opts.authToken;
  }

  const app = await electron.launch({
    args: [REPO_ROOT, "--no-sandbox"],
    cwd: REPO_ROOT,
    env,
    timeout: 30_000,
  });

  const page = await app.firstWindow({ timeout: 30_000 });
  await page.waitForLoadState("domcontentloaded");

  return { app, page };
}

export async function closeClient(result: LaunchResult): Promise<void> {
  try {
    await result.app.close();
  } catch {
    // Already closed — ignore.
  }
}
