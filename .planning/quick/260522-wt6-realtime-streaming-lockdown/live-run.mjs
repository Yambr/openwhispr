// Live-run driver for quick task 260522-wt6 plan 03 MANDATORY LIVE RUN.
// Launches the REAL lockdown Electron app against the live localhost:4000
// server, drives the realtime warmup (connectDictationStreaming →
// fetchRealtimeToken → OpenAIRealtimeStreaming.connect), and reports the
// main-process realtime log lines so a human can confirm the connect targets
// our WSS proxy and not api.openai.com.
import { _electron as electron } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

let logBuffer = "";

const app = await electron.launch({
  args: [REPO_ROOT, "--no-sandbox"],
  cwd: REPO_ROOT,
  env: {
    ...process.env,
    OPENWHISPR_PROVIDER_LOCKDOWN: "true",
    OPENWHISPR_BACKEND_URL: "http://localhost:4000",
    OPENWHISPR_AUTH_URL: "http://localhost:4000",
    OPENWHISPR_LOG_LEVEL: "debug",
    ELECTRON_DISABLE_GPU: "1",
  },
  timeout: 60_000,
});

const proc = app.process();
proc.stdout?.on("data", (d) => { logBuffer += d.toString(); });
proc.stderr?.on("data", (d) => { logBuffer += d.toString(); });

await app.firstWindow({ timeout: 30_000 });
let main;
const deadline = Date.now() + 30_000;
while (Date.now() < deadline && !main) {
  for (const w of app.windows()) {
    if (w.url().includes("panel=true")) { main = w; break; }
  }
  if (!main) await new Promise((r) => setTimeout(r, 500));
}
if (!main) { console.error("FAIL: no panel window"); await app.close(); process.exit(1); }
await main.waitForLoadState("domcontentloaded");
await main.waitForTimeout(4000);

const before = logBuffer.length;
const result = await main.evaluate(async () => {
  try {
    return await window.electronAPI.dictationRealtimeWarmup({});
  } catch (e) {
    return { success: false, error: String(e) };
  }
});
await main.waitForTimeout(5000);
const session = logBuffer.slice(before);

console.log("=== warmup IPC result ===");
console.log(JSON.stringify(result));
console.log("=== realtime log lines ===");
for (const line of session.split("\n")) {
  if (/realtime|websocket|wss|openai|401|bearer|connect/i.test(line)) {
    console.log(line);
  }
}
console.log("=== assertions ===");
const hasConnect = session.includes("OpenAI Realtime connecting");
const hasOpenAiDirect = session.includes("api.openai.com");
const hasFallback = session.includes("falling back to OpenAI default");
const has401 = /\b401\b/.test(session) && /realtime/i.test(session);
const hasWsOpened = session.includes("OpenAI Realtime WebSocket opened");
console.log("connect attempt:", hasConnect);
console.log("ws OPENED (live server accepted):", hasWsOpened);
console.log("api.openai.com referenced:", hasOpenAiDirect, "(must be false)");
console.log("OpenAI-direct fallback:", hasFallback, "(must be false)");
console.log("realtime 401:", has401, "(must be false)");

await app.close().catch(() => {});
try { if (proc.exitCode === null) proc.kill("SIGKILL"); } catch {}

const pass = hasConnect && !hasOpenAiDirect && !hasFallback && !has401;
console.log(pass ? "LIVE-RUN PASS" : "LIVE-RUN FAIL");
process.exit(pass ? 0 : 1);
