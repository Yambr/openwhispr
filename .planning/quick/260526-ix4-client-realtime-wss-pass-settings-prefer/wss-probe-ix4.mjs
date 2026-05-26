// ix4 Task 3 — WSS probe Node ws
// Usage: node wss-probe-ix4.mjs <language>   (omit lang for negative case)
//
// Asserts:
//  1. WSS handshake completes (HTTPRoute /v1/realtime alive)
//  2. session.created frame arrives (Beta-shape post-translate, v1.0.8+ passthrough)
//  3. payload.audio.input.transcription.language matches expected (or omitted)

import { WebSocket } from "ws";
import { setTimeout as delay } from "node:timers/promises";

const HOST = "wss://openwhispr.yambr.com";
const PATH = "/v1/realtime";
const TOKEN = process.env.WSS_BEARER || "";
if (!TOKEN) {
  console.error("ERR: set WSS_BEARER env var to a valid Better Auth session token");
  process.exit(2);
}

const lang = process.argv[2] || "";
const url =
  `${HOST}${PATH}?intent=transcription` +
  (lang ? `&language=${encodeURIComponent(lang)}` : "");

console.log(`[probe] URL: ${url}`);
console.log(`[probe] expected language injection: ${lang || "(none — server default or omitted)"}`);

const t0 = Date.now();
const ws = new WebSocket(url, {
  headers: {
    Authorization: `Bearer ${TOKEN}`,
    Origin: "https://openwhispr.yambr.com",
    "User-Agent": "OpenWhispr-ix4-probe/1.0.0",
  },
});

let frameCount = 0;
let sessionCreatedSeen = false;
let langInPayload = null;

const timeout = setTimeout(() => {
  console.error(`[probe] TIMEOUT 15s — frames=${frameCount} sessionCreated=${sessionCreatedSeen}`);
  ws.close(1001, "probe timeout");
  process.exit(3);
}, 15000);

ws.on("open", () => {
  console.log(`[+${Date.now() - t0}ms] WSS open`);
});

ws.on("unexpected-response", (req, res) => {
  console.error(`[probe] HTTP ${res.statusCode} on upgrade — body:`);
  let body = "";
  res.on("data", (c) => (body += c.toString()));
  res.on("end", () => {
    console.error(body.slice(0, 500));
    process.exit(4);
  });
});

ws.on("message", (data) => {
  frameCount++;
  const text = data.toString();
  let frame;
  try {
    frame = JSON.parse(text);
  } catch {
    console.log(`[+${Date.now() - t0}ms] FRAME#${frameCount} (non-JSON, ${text.length} bytes)`);
    return;
  }
  const t = frame.type || "(no-type)";
  console.log(`[+${Date.now() - t0}ms] FRAME#${frameCount} type=${t}`);

  // Inspect both session.created (initial upstream state) and session.updated
  // (post-injection state). Server's buildRelaySessionUpdateFrame fires AFTER
  // upstream emits session.created — so language only appears in either:
  //   (a) a 2nd session.created/transcription_session.created emitted after
  //       server's auto-session.update
  //   (b) a session.updated frame
  if (
    t === "session.created" ||
    t === "transcription_session.created" ||
    t === "session.updated" ||
    t === "transcription_session.updated"
  ) {
    sessionCreatedSeen = true;
    const lang1 = frame.session?.audio?.input?.transcription?.language;
    const lang2 = frame.session?.input_audio_transcription?.language;
    const candidate = lang1 ?? lang2 ?? null;
    if (candidate !== null) langInPayload = candidate; // latch latest non-null
    console.log(`[+${Date.now() - t0}ms]   audio.input.transcription.language = ${JSON.stringify(lang1)}`);
    console.log(`[+${Date.now() - t0}ms]   input_audio_transcription.language = ${JSON.stringify(lang2)}`);
    console.log(`[+${Date.now() - t0}ms]   audio.input.transcription = ${JSON.stringify(frame.session?.audio?.input?.transcription)}`);
  }
});

ws.on("close", (code, reason) => {
  console.log(`[+${Date.now() - t0}ms] CLOSE code=${code} reason=${reason?.toString() || "(empty)"}`);

  // Verdict
  const verdict = {
    handshake: sessionCreatedSeen ? "PASS" : "FAIL",
    sessionCreated: sessionCreatedSeen,
    langInPayload,
    expectedLang: lang || null,
  };
  console.log(`\n=== VERDICT ===`);
  console.log(JSON.stringify(verdict, null, 2));

  if (lang) {
    // Positive case: expect language in payload
    if (langInPayload === lang) {
      console.log(`✓ language=${lang} correctly injected by server`);
      process.exit(0);
    } else {
      console.log(`✗ expected language=${lang}, got ${JSON.stringify(langInPayload)}`);
      process.exit(5);
    }
  } else {
    // Negative case: expect no language (or auto)
    if (langInPayload === null || langInPayload === "" || langInPayload === "auto") {
      console.log(`✓ no language injected (got ${JSON.stringify(langInPayload)}) — preserves server default`);
      process.exit(0);
    } else {
      console.log(`✗ unexpected language=${JSON.stringify(langInPayload)} when client omitted query param`);
      process.exit(6);
    }
  }
});

ws.on("error", (err) => {
  console.error(`[+${Date.now() - t0}ms] ERROR: ${err.message}`);
});
