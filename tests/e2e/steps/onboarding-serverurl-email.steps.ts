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
  async ({ electronApp }, url: string) => {
    // To reproduce the v1.7.13 bug we need ServerUrlField to MOUNT with a
    // hydrated-valid initial state — not a runtime store-update after the
    // component has already rendered. The bug ONLY fires on initial mount
    // (onValidated was wired into validate() / onBlur; initial-mount with
    // hydrated-valid state skipped it).
    //
    // Strategy: locate the control-panel window first (firstWindow is the
    // main recording window), push the URL into useSettingsStore so Zustand
    // persist writes it to localStorage, then reload ONLY that window. Re-
    // hydration on the reload pulls the URL into store state before the
    // ServerUrlField's first useState() runs.
    let panelPage = electronApp
      .windows()
      .find((p) => p.url().includes("panel=true"));
    if (!panelPage) {
      panelPage = await electronApp.waitForEvent("window", {
        predicate: (p) => p.url().includes("panel=true"),
        timeout: 25_000,
      });
    }
    await panelPage.waitForLoadState("domcontentloaded");

    await panelPage.evaluate((u) => {
      const w = window as unknown as {
        __zustand_setServerUrl?: (u: string | null) => void;
        electronAPI?: { notifyServerUrlChanged?: (u: string | null) => void };
      };
      w.__zustand_setServerUrl?.(u);
      w.electronAPI?.notifyServerUrlChanged?.(u);
    }, url);

    // Let Zustand persist flush to localStorage (async by design).
    await panelPage.waitForTimeout(300);
    await panelPage.reload({ waitUntil: "domcontentloaded" });
    // Stash for the When-step so it can re-use the same page.
    (lastPanelPageRef as { current: typeof panelPage }).current = panelPage;
  }
);

// "no Server URL is persisted in settings" is defined in
// tests/e2e/steps/host-runtime-override.steps.ts and reused here.

When(
  "the onboarding authentication step is rendered",
  async ({ electronApp }, _) => {
    // The Yambr build opens the main dictation window first; the onboarding
    // flow lives in a SEPARATE control-panel window opened with ?panel=true
    // on first run. firstWindow() returns the dictation window, not the
    // onboarding one — locate the panel window by URL. The Given-step
    // above may already have stashed it after a reload.
    let panelPage = lastPanelPageRef.current;
    if (!panelPage || panelPage.isClosed()) {
      panelPage = electronApp
        .windows()
        .find((p) => p.url().includes("panel=true"));
      if (!panelPage) {
        panelPage = await electronApp.waitForEvent("window", {
          predicate: (p) => p.url().includes("panel=true"),
          timeout: 25_000,
        });
      }
    }
    await panelPage.waitForLoadState("domcontentloaded");
    // Reset per-scenario so a prior SSO-only scenario can't leak into this one.
    (localLoginDisabledRef as { current: boolean }).current = false;

    const consoleMessages: string[] = [];
    panelPage.on("console", (msg) =>
      consoleMessages.push(`[${msg.type()}] ${msg.text()}`)
    );
    panelPage.on("pageerror", (err) =>
      consoleMessages.push(`[pageerror] ${err.message}`)
    );

    // Stash the page on the test info for downstream steps.
    (lastPanelPageRef as { current: typeof panelPage }).current = panelPage;

    try {
      await panelPage.waitForSelector('[data-testid="server-url-field"]', {
        state: "attached",
        timeout: 25_000,
      });
    } catch (e) {
      // Finding #9 (260603-qhw): when the resolved server reports
      // localLogin.enabled === false, AuthenticationStep renders the SSO-only
      // view — the whole email/password form (including ServerUrlField) is
      // intentionally absent. That is NOT the v1.7.13 mount bug; it's the
      // correct local-login-disabled gate. Detect it and stash a flag so the
      // Then-steps assert the right thing (no email input = strictly safer than
      // a disabled one) instead of failing on "did not mount".
      const ssoOnly = await panelPage.evaluate(() => {
        const hasEmail = !!document.querySelector('input[type="email"]');
        const hasField = !!document.querySelector('[data-testid="server-url-field"]');
        // SSO-only = the auth screen rendered (offline/legal present) but no
        // local-login form. Use the offline button as the "screen is up" anchor.
        const btns = Array.from(document.querySelectorAll("button,a")).map(
          (b) => (b.textContent || "").toLowerCase()
        );
        const screenUp = btns.some((t) => t.includes("without account"));
        return screenUp && !hasEmail && !hasField;
      });
      if (ssoOnly) {
        (localLoginDisabledRef as { current: boolean }).current = true;
        await panelPage.waitForTimeout(250);
        return;
      }
      const url = panelPage.url();
      const bodyText = await panelPage.evaluate(() =>
        document.body.innerText.slice(0, 1500)
      );
      const htmlSnippet = await panelPage.evaluate(() =>
        document.body.innerHTML.slice(0, 1500)
      );
      throw new Error(
        `Onboarding ServerUrlField did not mount.\n` +
          `URL: ${url}\n` +
          `Body innerText (truncated):\n${bodyText || "(empty)"}\n\n` +
          `Body innerHTML (truncated):\n${htmlSnippet || "(empty)"}\n\n` +
          `Console messages (last 20):\n${
            consoleMessages.slice(-20).join("\n") || "(none)"
          }\n\n` +
          `Original error: ${(e as Error).message}`
      );
    }
    await panelPage.waitForTimeout(250);
  }
);

// Shared reference so the Then-steps below can act on the panel window
// the When-step located. (BDD's playwright fixture gives one `page` per
// scenario but we need the SECOND window — the control panel.)
const lastPanelPageRef: { current: import("@playwright/test").Page | null } = {
  current: null,
};
// Finding #9 (260603-qhw): set when the When-step detected the SSO-only view
// (server localLogin.enabled === false → no local-login form). The "email
// input is disabled" Then-step treats "no email input at all" as a strictly
// stronger pass than "input present but disabled".
const localLoginDisabledRef: { current: boolean } = { current: false };
function getPanelPage(): import("@playwright/test").Page {
  if (!lastPanelPageRef.current) {
    throw new Error(
      "Panel page not set — call the When-step 'the onboarding authentication step is rendered' first."
    );
  }
  return lastPanelPageRef.current;
}

Then("the email input is enabled", async () => {
  const page = getPanelPage();
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

// Finding #9 (260603-qhw): detect the SSO-only view at ASSERTION time (the
// providers fetch resolves async — localLogin defaults true while loading, so a
// When-step snapshot races the gate; the Then-step is the correct moment). The
// screen is "up" when the offline button is present; SSO-only = up AND no email
// input. In that state the email/password form is intentionally absent, which
// strictly satisfies "the user can't submit to nowhere".
async function isSsoOnly(page: import("@playwright/test").Page): Promise<boolean> {
  for (let i = 0; i < 20; i++) {
    const r = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button,a")).map((b) =>
        (b.textContent || "").toLowerCase()
      );
      const screenUp = btns.some((t) => t.includes("without account"));
      const hasEmail = !!document.querySelector('input[type="email"]');
      return { screenUp, hasEmail };
    });
    if (r.screenUp) return !r.hasEmail;
    await page.waitForTimeout(250);
  }
  return false;
}

Then("the email input is disabled", async () => {
  const page = getPanelPage();
  // If the server disabled local login, the email input doesn't exist at all
  // (SSO-only view) — strictly safer than a disabled input. Pass.
  if (localLoginDisabledRef.current || (await isSsoOnly(page))) return;
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
  "the {string} button has the expected enablement \\(driven by email content)",
  async ({}, _label: string) => {
    const page = getPanelPage();
    const button = page.getByRole("button", { name: /continue with email/i });
    await button.waitFor({ state: "visible", timeout: 5_000 });

    if (!(await button.isDisabled())) {
      throw new Error("Button should be disabled with empty email even when Server URL is valid");
    }

    const emailInput = page.locator('input[type="email"]').first();
    await emailInput.fill("user@example.com");
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

Then('the "Continue with email" button is disabled', async () => {
  const page = getPanelPage();
  // Finding #9 (260603-qhw): SSO-only view → no "Continue with email" button at
  // all, which strictly satisfies "user can't submit to nowhere".
  if (localLoginDisabledRef.current || (await isSsoOnly(page))) return;
  const button = page.getByRole("button", { name: /continue with email/i });
  await button.waitFor({ state: "visible", timeout: 5_000 });
  if (!(await button.isDisabled())) {
    throw new Error("Button should be disabled when Server URL is unset");
  }
});
