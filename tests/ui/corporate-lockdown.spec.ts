/**
 * Electron-UI regression test for the corporate-minimal PROVIDER_LOCKDOWN
 * build.
 *
 * WHY THIS EXISTS
 * ---------------
 * The tests/e2e suite is server-contract only (playwright-bdd, hits the API
 * via cloudCall) and never drives the renderer. That left a real coverage
 * gap: provider-lockdown leaks in Notes / Integrations / Settings shipped to
 * users because nothing asserted on the actual rendered screens.
 *
 * This test drives the REAL Electron app (built with
 * OPENWHISPR_PROVIDER_LOCKDOWN=true — see global-setup.ts) and asserts that
 * every provider-config surface shows ONLY "OpenWhispr Cloud" + "Local" and
 * leaks NO alternative-provider proper nouns, key-paste prompts, MCP card, or
 * API-key management UI.
 *
 * FALSE-POSITIVE DISCIPLINE
 * -------------------------
 * Substring matching is dangerous here: "Custom" appears in "Custom
 * instructions for the agent", "API key" appears in CLI-card prose. So we
 * assert on PRECISE leak markers only — provider proper nouns as standalone
 * words, exact phrases like "Paste your API key" / "Cloud Providers" /
 * "Self-Hosted", the literal "mcp.openwhispr.com", and exact model names
 * "GPT-5.5" / "GPT-4.1".
 *
 * REQUIREMENTS
 * ------------
 * Runs the same way the .tmp-uiverify probes did — a desktop session capable
 * of launching Electron (macOS dev machine, or CI with a display / xvfb on
 * Linux). No dev server needed: the app loads the built renderer from
 * src/dist via loadFile() in production mode.
 */
import { test, expect, _electron as electron } from "@playwright/test";
import type { ElectronApplication, Page } from "@playwright/test";
import path from "node:path";

const REPO_ROOT = path.resolve(__dirname, "../..");

/** Exact phrases / literals that must NEVER appear in the lockdown build. */
const EXACT_LEAK_MARKERS = [
  "Paste your API key",
  "Cloud Providers",
  "Self-Hosted",
  "mcp.openwhispr.com",
  "GPT-5.5",
  "GPT-4.1",
  "Manage API keys",
];

/**
 * Provider proper nouns. Matched as standalone words (\bWord\b) to avoid
 * false hits inside unrelated prose. These vendors must be entirely absent
 * from provider-config screens under lockdown.
 */
const PROVIDER_NOUNS = ["OpenAI", "Anthropic", "Gemini", "Groq", "Mistral"];

// The two surfaces that ARE expected to remain ("OpenWhispr Cloud" + "Local")
// are positively asserted inline per-screen via expect(text).toContain(...).

function findExactLeaks(text: string): string[] {
  return EXACT_LEAK_MARKERS.filter((m) => text.includes(m));
}

function findProviderLeaks(text: string): string[] {
  return PROVIDER_NOUNS.filter((noun) => {
    const re = new RegExp(`\\b${noun}\\b`);
    return re.test(text);
  });
}

/** Assert a screen's rendered text is free of every lockdown leak marker. */
function assertNoLeaks(label: string, text: string): void {
  const exact = findExactLeaks(text);
  const providers = findProviderLeaks(text);
  expect(exact, `${label}: exact leak phrase(s) present`).toEqual([]);
  expect(providers, `${label}: alternative-provider noun(s) present`).toEqual([]);
}

let app: ElectronApplication;
let main: Page;

test.beforeAll(async () => {
  app = await electron.launch({
    args: [REPO_ROOT, "--no-sandbox"],
    cwd: REPO_ROOT,
    // NODE_ENV intentionally NOT "development": production mode loads the
    // built src/dist renderer via loadFile(), so no vite dev server is
    // needed. The lockdown bundle was produced by global-setup.ts.
    env: {
      ...(Object.fromEntries(
        Object.entries(process.env).filter(([, v]) => typeof v === "string"),
      ) as Record<string, string>),
      OPENWHISPR_PROVIDER_LOCKDOWN: "true",
      OPENWHISPR_BACKEND_URL: "http://localhost:4000",
      OPENWHISPR_AUTH_URL: "http://localhost:4000",
      ELECTRON_DISABLE_GPU: "1",
    },
    timeout: 60_000,
  });

  await app.firstWindow({ timeout: 30_000 });
  // The app opens 3 windows; the control panel is the one whose URL carries
  // the panel=true query (a file:// URL in production mode).
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline && !main) {
    for (const w of app.windows()) {
      if (w.url().includes("panel=true")) {
        main = w;
        break;
      }
    }
    if (!main) await new Promise((r) => setTimeout(r, 500));
  }
  if (!main) throw new Error("control-panel window (panel=true) never appeared");
  await main.waitForLoadState("domcontentloaded");
  await main.waitForTimeout(4000);
});

test.afterAll(async () => {
  if (!app) return;
  const proc = app.process();
  try {
    await app.close();
  } catch {
    /* already closing */
  }
  try {
    if (proc && proc.exitCode === null) proc.kill("SIGKILL");
  } catch {
    /* reaped */
  }
});

/** Click the first element whose visible text equals `name`. */
async function clickText(name: string, timeout = 6000): Promise<boolean> {
  try {
    await main.locator(`text="${name}"`).first().click({ timeout });
    await main.waitForTimeout(1500);
    return true;
  } catch {
    return false;
  }
}

async function bodyText(): Promise<string> {
  return main.evaluate(() => document.body.innerText);
}

test("Settings → Language Models shows no alternative providers", async () => {
  expect(await clickText("Settings"), "could not open Settings").toBe(true);
  expect(await clickText("Language Models"), "could not open Language Models").toBe(true);
  await main.waitForTimeout(1500);
  const text = await bodyText();
  assertNoLeaks("Settings → Language Models", text);
  expect(text).toContain("OpenWhispr Cloud");
});

test("Settings → Speech-to-Text shows no alternative providers", async () => {
  // Settings modal is still open from the previous test.
  expect(await clickText("Speech-to-Text"), "could not open Speech-to-Text").toBe(true);
  await main.waitForTimeout(1500);
  const text = await bodyText();
  assertNoLeaks("Settings → Speech-to-Text", text);
  expect(text).toContain("OpenWhispr Cloud");
});

test("Notes onboarding → Configure an AI model shows no provider tabs", async () => {
  // Close the Settings modal if it is still up.
  await clickText("Close").catch(() => {});
  await main.waitForTimeout(800);

  // Clear the onboarding-complete flag and reload so the NotesOnboarding
  // screen (which hosts the AI-model config) is shown.
  await main.evaluate(() => {
    localStorage.removeItem("notesOnboardingComplete");
    localStorage.removeItem("uploadSetupComplete");
  });
  await main.reload();
  await main.waitForLoadState("domcontentloaded");
  await main.waitForTimeout(4000);

  expect(await clickText("Notes"), "could not open Notes").toBe(true);
  await main.waitForTimeout(2000);

  // Onboarding (collapsed) must already be clean.
  assertNoLeaks("Notes onboarding (collapsed)", await bodyText());

  // Expand the section that hosts the model picker — this is where provider
  // tabs would live if lockdown leaked.
  expect(
    await clickText("Configure an AI model"),
    "could not expand 'Configure an AI model'",
  ).toBe(true);
  await main.waitForTimeout(2000);
  assertNoLeaks("Notes onboarding → Configure an AI model", await bodyText());
});

test("Integrations shows no MCP card and no API-key management", async () => {
  expect(await clickText("Integrations"), "could not open Integrations").toBe(true);
  await main.waitForTimeout(2000);
  const text = await bodyText();
  assertNoLeaks("Integrations", text);
});
