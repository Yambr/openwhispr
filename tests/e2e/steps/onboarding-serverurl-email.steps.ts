// v1.7.13 — DOM-level regression coverage for the onboarding form.
//
// The bug being pinned: ServerUrlField's `onValidated` callback was only
// fired from inside `validate()` (the onBlur path), so when the component
// mounted with a pre-persisted serverUrl in useSettingsStore, state
// initialised to `{ kind: "valid" }` but the parent's `serverUrlValidated`
// stayed false → email input stayed permanently disabled.
//
// Driving this at the renderer DOM via Playwright (not just via the
// authClientBaseUrlForTest helper used by host-runtime-override.feature)
// is the only way to catch UX-level disabled-state regressions like this.
// Per [live_verification_over_green_tests] — vitest mocks could not
// catch this because they never rendered the AuthenticationStep.

import { createBdd } from "playwright-bdd";
import { test } from "../fixtures/electron-launch";

const { Given, When, Then } = createBdd(test);

Given(
  "the Server URL {string} is persisted in settings",
  async ({ page }, url: string) => {
    // Persist via the test hook that wraps useSettingsStore.setServerUrl,
    // exposed in src/lib/auth.ts:154. The HOST-02 Proxy subscribes to the
    // store and invalidates cachedInner; the ServerUrlField also reads
    // useSettingsStore.serverUrl as its initial state.
    await page.evaluate((u) => {
      const w = window as unknown as {
        __zustand_setServerUrl?: (u: string | null) => void;
        electronAPI?: { notifyServerUrlChanged?: (u: string | null) => void };
      };
      w.__zustand_setServerUrl?.(u);
      w.electronAPI?.notifyServerUrlChanged?.(u);
    }, url);
  }
);

Given("no Server URL is persisted in settings", async ({ page }) => {
  await page.evaluate(() => {
    const w = window as unknown as {
      __zustand_setServerUrl?: (u: string | null) => void;
      electronAPI?: { notifyServerUrlChanged?: (u: string | null) => void };
    };
    w.__zustand_setServerUrl?.(null);
    w.electronAPI?.notifyServerUrlChanged?.(null);
    try {
      localStorage.removeItem("serverUrl");
    } catch {
      /* ignore */
    }
  });
});

When("the onboarding authentication step is rendered", async ({ page }) => {
  // The packed Yambr build opens onboarding on first run when no session
  // exists. We do not navigate; we wait for the ServerUrlField to mount.
  // ALLOW_CUSTOM_HOST_ENABLED=true in the v1.7.11+ default build, so
  // the field is always in the DOM.
  await page.waitForSelector('[data-testid="server-url-field"]', {
    state: "attached",
    timeout: 15_000,
  });
  // Allow the validation effect to flush — initial mount with persisted
  // valid URL fires the useEffect on the next microtask.
  await page.waitForTimeout(150);
});

Then("the email input is enabled", async ({ page }) => {
  // The email input is `<input type="email" placeholder="you@example.com" />`
  // — it's the only type=email input on the AuthenticationStep form.
  const emailInput = page.locator('input[type="email"]').first();
  await emailInput.waitFor({ state: "visible", timeout: 5_000 });
  const isDisabled = await emailInput.isDisabled();
  if (isDisabled) {
    throw new Error(
      "REGRESSION: email input is disabled despite a valid Server URL being persisted. " +
        "This is the v1.7.13 bug — ServerUrlField never notified its parent that the " +
        "URL was valid on mount because onValidated() was only called from validate()."
    );
  }
});

Then("the email input is disabled", async ({ page }) => {
  const emailInput = page.locator('input[type="email"]').first();
  await emailInput.waitFor({ state: "visible", timeout: 5_000 });
  const isDisabled = await emailInput.isDisabled();
  if (!isDisabled) {
    throw new Error(
      "email input is enabled when Server URL is unset — would let the user submit " +
        "to nowhere. Expected disabled per AuthenticationStep.tsx:601-605 gating."
    );
  }
});

Then(
  'the "Continue with email" button has the expected enablement (driven by email content)',
  async ({ page }) => {
    // With Server URL valid but empty email, the button must still be disabled
    // (the `!email.trim()` clause at AuthenticationStep.tsx:611). After typing
    // an email it must enable. This pins both halves of the disabled expression
    // — without the v1.7.13 fix, the URL clause held it permanently disabled.
    const button = page.getByRole("button", { name: /continue with email/i });
    await button.waitFor({ state: "visible", timeout: 5_000 });

    if (!(await button.isDisabled())) {
      throw new Error("Button should be disabled with empty email even when Server URL is valid");
    }

    const emailInput = page.locator('input[type="email"]').first();
    await emailInput.fill("user@example.com");
    // Microtask flush — the disabled prop re-evaluates synchronously, but
    // give React one frame to commit.
    await page.waitForTimeout(50);

    if (await button.isDisabled()) {
      throw new Error(
        "REGRESSION: button stayed disabled after filling email. " +
          "This means the Server URL clause `ALLOW_CUSTOM_HOST_ENABLED && !serverUrlValidated` " +
          "is still true — i.e. the v1.7.13 fix is missing."
      );
    }
  }
);

Then('the "Continue with email" button is disabled', async ({ page }) => {
  const button = page.getByRole("button", { name: /continue with email/i });
  await button.waitFor({ state: "visible", timeout: 5_000 });
  if (!(await button.isDisabled())) {
    throw new Error("Button should be disabled when Server URL is unset");
  }
});
