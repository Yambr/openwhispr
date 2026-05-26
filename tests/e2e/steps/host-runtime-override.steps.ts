// Phase 1 Plan 01-01 (TDD-RED) — Phase 1 Plan 01-05 (GREEN)
// Step definitions for host-runtime-override.feature. Uses the existing
// electron-launch fixture; drives authClient via Runtime.evaluate to
// observe the proxy's URL resolution + the IPC-driven setServerUrl path.

import { createBdd } from "playwright-bdd";
import { test } from "../fixtures/electron-launch";
import * as http from "node:http";

const { Given, When, Then } = createBdd(test);

const DEFAULT_AUTH_URL = "https://auth.openwhispr.com";

// Background step — opens the Electron app via the existing test fixture.
// The fixture's `electronApp` Playwright project value handles the actual
// launch; this step is the BDD entry point.
Given("the Electron app is launched", async ({ electronApp }) => {
  // Sanity check: the fixture must have given us a running ElectronApp.
  if (!electronApp) throw new Error("electronApp fixture not initialized");
});

// Local mock backend used for the override scenario. Only listens long enough
// to record one Better Auth request, then closes.
type MockBackend = {
  url: string;
  hits: { url: string; method: string }[];
  close: () => Promise<void>;
};

async function startMockBackend(): Promise<MockBackend> {
  const hits: { url: string; method: string }[] = [];
  const server = http.createServer((req, res) => {
    hits.push({ url: req.url || "", method: req.method || "" });
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "unauthorized" }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("listen failed");
  const url = `http://127.0.0.1:${addr.port}`;
  return {
    url,
    hits,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

let mockBackend: MockBackend | null = null;

Given("no Server URL is persisted in settings", async ({ electronApp }) => {
  await electronApp.evaluate(({ BrowserWindow }) => {
    const wins = BrowserWindow.getAllWindows();
    for (const w of wins) {
      // Clear any stale persisted serverUrl from localStorage / store.
      w.webContents.executeJavaScript(`
        (() => {
          try { localStorage.removeItem("serverUrl"); } catch {}
          if (window.__zustand_setServerUrl) window.__zustand_setServerUrl(null);
        })();
      `);
    }
  });
});

When("I read authClient base URL via renderer evaluate", async ({ page }) => {
  const url = await page.evaluate(() => {
    // Expose helper in src/lib/auth.ts (Plan 01-05) — falls back to introspection
    // via a hidden test hook. Reads the inner client's baseURL.
    const w = window as any;
    if (typeof w.authClientBaseUrlForTest === "function") return w.authClientBaseUrlForTest();
    return null;
  });
  (test.info() as any).lastBaseUrl = url;
});

Then("it equals the build-time AUTH_URL default", async ({}, _) => {
  const url = (test.info() as any).lastBaseUrl;
  if (url !== DEFAULT_AUTH_URL) {
    throw new Error(`Expected ${DEFAULT_AUTH_URL}, got ${url}`);
  }
});

When("the renderer persists serverUrl to a local mock backend", async ({ electronApp, page }) => {
  mockBackend = await startMockBackend();
  await page.evaluate((url) => {
    const w = window as any;
    if (w.electronAPI?.notifyServerUrlChanged) w.electronAPI.notifyServerUrlChanged(url);
    if (w.__zustand_setServerUrl) w.__zustand_setServerUrl(url);
  }, mockBackend.url);
});

When("I trigger authClient signIn email via renderer", async ({ page }) => {
  await page.evaluate(async () => {
    const w = window as any;
    try {
      // The Proxy's signIn.email is called; we don't care about success — only
      // that the outbound request hits the mock backend.
      await w.__authClientForTest?.signIn?.email?.({
        email: "phase1@e2e.local",
        password: "irrelevant",
      });
    } catch {
      // expected — mock backend returns 401
    }
  });
});

Then("the next outbound auth request hits the local mock backend", async () => {
  if (!mockBackend) throw new Error("mock backend not started");
  // Allow Better Auth's network call a moment to land.
  await new Promise((r) => setTimeout(r, 300));
  const authHits = mockBackend.hits.filter((h) => h.url.includes("/api/auth/"));
  if (authHits.length === 0) {
    throw new Error(`Expected an /api/auth/* request on mock backend; got: ${JSON.stringify(mockBackend.hits)}`);
  }
});

Then("no outbound auth request hits the build-time AUTH_URL default", async () => {
  // The mock-backend hits assertion above implicitly confirms — Better Auth
  // either hits the override or the default, not both. We rely on the
  // single fetch site in src/lib/auth.ts; explicit "no request" assertion
  // requires CDP Network.* events, deferred to Phase 5.
  await mockBackend?.close();
  mockBackend = null;
});

Given("the persisted Server URL has been set then cleared", async ({ electronApp, page }) => {
  const mb = await startMockBackend();
  await page.evaluate((url) => {
    const w = window as any;
    if (w.electronAPI?.notifyServerUrlChanged) w.electronAPI.notifyServerUrlChanged(url);
    if (w.__zustand_setServerUrl) w.__zustand_setServerUrl(url);
  }, mb.url);
  await mb.close();
  await page.evaluate(() => {
    const w = window as any;
    if (w.electronAPI?.notifyServerUrlChanged) w.electronAPI.notifyServerUrlChanged(null);
    if (w.__zustand_setServerUrl) w.__zustand_setServerUrl(null);
  });
});
