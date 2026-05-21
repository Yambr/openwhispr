/**
 * Electron-UI regression test for the realtime streaming path under the
 * corporate-minimal PROVIDER_LOCKDOWN build.
 *
 * WHY THIS EXISTS
 * ---------------
 * corporate-lockdown.spec.ts asserts the rendered provider-config screens are
 * leak-free, but never exercises the realtime DICTATION path — the code that
 * actually opens a WebSocket. The owner-reported regression was a silent
 * OpenAI-direct 401 fallback: under lockdown the realtime path must connect to
 * OUR server's /v1/realtime WSS proxy with the Better Auth session bearer
 * (Design B), and must NEVER touch api.openai.com.
 *
 * This spec launches the REAL Electron app (lockdown bundle from
 * global-setup.ts), drives the realtime connect path via the SAME IPC the
 * recorder uses (dictation-realtime-warmup → connectDictationStreaming →
 * fetchRealtimeToken → OpenAIRealtimeStreaming.connect), and asserts from the
 * captured main-process debug log that:
 *   - the connect target is our localhost:4000 WSS host, not api.openai.com
 *   - no "falling back to OpenAI default" / api.openai.com line appears
 *
 * The realtime WebSocket is opened in the MAIN process, so renderer network
 * interception cannot see it — we capture main-process stdout/stderr instead
 * (OPENWHISPR_LOG_LEVEL=debug makes debugLogger emit the connect lines).
 *
 * If localhost:4000 is unreachable the connect fails at the network layer —
 * acceptable here: this spec asserts the TARGET/routing, the plan's MANDATORY
 * LIVE RUN gate asserts a successful end-to-end transcription.
 */
import { test, expect, _electron as electron } from "@playwright/test";
import type { ElectronApplication, Page } from "@playwright/test";
import path from "node:path";
import { createRequire } from "node:module";

const REPO_ROOT = path.resolve(__dirname, "../..");
const requireFromRepo = createRequire(path.join(REPO_ROOT, "package.json"));

let app: ElectronApplication;
let main: Page;
/** Whole-session main-process stdout+stderr buffer. */
let logBuffer = "";

test.beforeAll(async () => {
  app = await electron.launch({
    args: [REPO_ROOT, "--no-sandbox"],
    cwd: REPO_ROOT,
    env: {
      ...(Object.fromEntries(
        Object.entries(process.env).filter(([, v]) => typeof v === "string"),
      ) as Record<string, string>),
      OPENWHISPR_PROVIDER_LOCKDOWN: "true",
      OPENWHISPR_BACKEND_URL: "http://localhost:4000",
      OPENWHISPR_AUTH_URL: "http://localhost:4000",
      OPENWHISPR_LOG_LEVEL: "debug",
      ELECTRON_DISABLE_GPU: "1",
    },
    timeout: 60_000,
  });

  // Capture the main process log stream for the whole session.
  const proc = app.process();
  proc.stdout?.on("data", (d) => {
    logBuffer += d.toString();
  });
  proc.stderr?.on("data", (d) => {
    logBuffer += d.toString();
  });

  await app.firstWindow({ timeout: 30_000 });
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

test("realtime WSS URL resolves to our server, not api.openai.com", async () => {
  // Read the SAME generated build-config the main process loads at runtime.
  // global-setup.ts regenerated it for the lockdown build before this run.
  const cfgPath = path.join(REPO_ROOT, "src/config/build-config.generated.cjs");
  delete requireFromRepo.cache[requireFromRepo.resolve(cfgPath)];
  const cfg = requireFromRepo(cfgPath);
  expect(cfg.PROVIDER_LOCKDOWN_ENABLED, "lockdown flag must be true").toBe(true);
  expect(cfg.STREAMING_ENABLED, "streaming must be enabled under lockdown").toBe(true);
  const wss: string = cfg.OPENWHISPR_REALTIME_WSS_URL || "";
  expect(wss, "OPENWHISPR_REALTIME_WSS_URL must be set under lockdown").not.toBe("");
  expect(wss, "WSS URL must NOT point at OpenAI").not.toContain("api.openai.com");
  expect(wss, "WSS URL must target our localhost:4000 server").toContain("localhost:4000");
});

test("realtime connect targets our WSS proxy — no api.openai.com, no OpenAI-direct fallback", async () => {
  const before = logBuffer.length;

  // Drive the SAME code path the recorder uses: warmup → connectDictationStreaming
  // → fetchRealtimeToken → OpenAIRealtimeStreaming.connect.
  const result = await main.evaluate(async () => {
    try {
      // @ts-expect-error electronAPI is injected by preload at runtime.
      return await window.electronAPI.dictationRealtimeWarmup({});
    } catch (e) {
      return { success: false, error: String(e) };
    }
  });
  expect(result, "warmup IPC returned nothing").toBeTruthy();

  // Give the main process a moment to flush its connect log lines.
  await main.waitForTimeout(3000);
  const session = logBuffer.slice(before);

  // A connect attempt must have been made via our realtime carrier.
  expect(
    session,
    `expected an "OpenAI Realtime connecting" line — log:\n${session}`,
  ).toContain("OpenAI Realtime connecting");

  // The connect MUST NOT target api.openai.com.
  expect(
    session,
    `lockdown realtime connect must not reference api.openai.com — log:\n${session}`,
  ).not.toContain("api.openai.com");

  // The OpenAI-direct fallback log line is the exact regression this fixes.
  expect(
    session,
    `OpenAI-direct fallback must never fire under lockdown — log:\n${session}`,
  ).not.toContain("falling back to OpenAI default");

  // A 401 from an OpenAI-direct attempt is the regression signature.
  const has401 = /\b401\b/.test(session) && /realtime/i.test(session);
  expect(has401, `realtime connect produced a 401 — log:\n${session}`).toBe(false);
});
