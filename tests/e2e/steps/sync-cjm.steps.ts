/**
 * Shared step definitions for the sync CJM features (notes / folders /
 * conversations / transcriptions).
 *
 * The CJM scenarios exercise the REAL client wire path:
 *
 *   src/services/<Resource>Service.ts
 *     → src/services/cloudApi.ts (cloudGet/Post/Patch/Delete)
 *       → window.electronAPI.cloudApiRequest({ method, path, body? })
 *         → ipcMain.handle("cloud-api-request") in src/helpers/ipcHandlers.js
 *           → HTTPS to ${OPENWHISPR_API_URL}${path} with Bearer auth
 *
 * Tests reach this path via `page.evaluate(...)` calling the same
 * `window.electronAPI.cloudApiRequest` exposed by `preload.js` to the
 * renderer. NO raw `fetch(BACKEND_URL + path)` for sync endpoints — that
 * would bypass the wire path and defeat the purpose of the CJM scenarios.
 */
import { expect } from "@playwright/test";
import { createBdd } from "playwright-bdd";
import { closeClient, launchClient } from "../fixtures/electron-launch";
import { makeTenant, seedTenant, type TestTenant } from "../fixtures/seed";
import type { CloudApiEnvelope } from "./world";
import { world } from "./world";

const { Given, When, Then, AfterAll } = createBdd();

type RendererCloudApi = {
  cloudApiRequest: (opts: {
    method: string;
    path: string;
    body?: unknown;
  }) => Promise<CloudApiEnvelope>;
  authSetToken: (token: string) => Promise<unknown>;
};

declare global {
  interface Window {
    electronAPI?: RendererCloudApi;
  }
}

/**
 * Routes a cloud-api request through the Electron renderer's preload
 * bridge — the real client wire path. Returns the IPC envelope shape.
 */
export async function cloudCall<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
): Promise<CloudApiEnvelope<T>> {
  if (!world.electronPage) {
    throw new Error(
      "cloudCall invoked without an Electron page — make sure the " +
        "scenario starts with the 'test tenant is authenticated' step.",
    );
  }
  const envelope = (await world.electronPage.evaluate(
    async ({ method: m, path: p, body: b }) => {
      const api = window.electronAPI;
      if (!api?.cloudApiRequest) {
        throw new Error("window.electronAPI.cloudApiRequest is not exposed");
      }
      return api.cloudApiRequest({ method: m, path: p, body: b });
    },
    { method, path, body },
  )) as CloudApiEnvelope<T>;
  world.lastCloudEnvelope = envelope as CloudApiEnvelope;
  return envelope;
}

// --- Background steps ----------------------------------------------------

Given(
  "the test tenant is authenticated as {string}",
  async ({}, label: string) => {
    const tenant: TestTenant = makeTenant(label);
    const seed = await seedTenant(tenant);
    if (!seed.ok) {
      throw new Error(
        `seed-tenant failed (status ${seed.status}): ${seed.body.slice(0, 240)}`,
      );
    }
    world.tenant = seed.tenant;
    const launched = await launchClient({ authToken: seed.token });
    world.electronApp = launched.app;
    world.electronPage = launched.page;
    // The IPC handler reads the bearer from main-process tokenStore. The
    // renderer-facing `authSetToken` IPC writes to it. No main.js changes
    // needed — this channel already exists in preload.js / ipcHandlers.js.
    await launched.page.evaluate(async (token: string) => {
      const api = window.electronAPI;
      if (!api?.authSetToken) {
        throw new Error("window.electronAPI.authSetToken is not exposed");
      }
      await api.authSetToken(token);
    }, seed.token);
  },
);

AfterAll(async () => {
  if (world.electronApp) {
    await closeClient({ app: world.electronApp, page: world.electronPage! });
    world.electronApp = null;
    world.electronPage = null;
  }
});

// --- Shared assertions ---------------------------------------------------

Then("the cloud request succeeds", async ({}) => {
  expect(world.lastCloudEnvelope, "no cloud envelope captured").not.toBeNull();
  expect(
    world.lastCloudEnvelope?.success,
    `cloud envelope failure: ${JSON.stringify(world.lastCloudEnvelope)}`,
  ).toBe(true);
});

Then("the cloud request fails", async ({}) => {
  expect(world.lastCloudEnvelope?.success).toBe(false);
});

Then(
  "the cloud response body has key {string}",
  async ({}, key: string) => {
    const data = world.lastCloudEnvelope?.data as Record<string, unknown> | null;
    expect(data, "no data on cloud envelope").not.toBeNull();
    expect(data, `key ${key} missing`).toHaveProperty(key);
  },
);

Then(
  "the cloud response body key {string} is a non-empty array",
  async ({}, key: string) => {
    const data = world.lastCloudEnvelope?.data as Record<string, unknown> | null;
    const value = data?.[key];
    expect(Array.isArray(value), `${key} is not an array`).toBe(true);
    expect((value as unknown[]).length).toBeGreaterThan(0);
  },
);

Then(
  "the cloud response body key {string} is an array",
  async ({}, key: string) => {
    const data = world.lastCloudEnvelope?.data as Record<string, unknown> | null;
    const value = data?.[key];
    expect(Array.isArray(value), `${key} is not an array`).toBe(true);
  },
);
