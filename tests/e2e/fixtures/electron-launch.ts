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
    // Main-process API URL: src/helpers/ipcHandlers.js getApiUrl() reads
    // OPENWHISPR_API_URL first, falling back to VITE_OPENWHISPR_API_URL and
    // the runtime-env.json. Set both forms so cloud-api-request resolves
    // the backend correctly under test.
    OPENWHISPR_API_URL: backendUrl,
    VITE_OPENWHISPR_API_URL: backendUrl,
    // Vite define mirror so the renderer also sees the override:
    OPENWHISPR_BACKEND_URL: backendUrl,
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
}
