// CDP WSS watcher — attaches to MAIN renderer and dumps every websocket frame
// during a dictation session. Asserts that the URL upgrade includes the
// expected ?language= query param.
//
// Usage: node cdp-wss-watch.mjs [expectedLanguage]
//   e.g. node cdp-wss-watch.mjs ru
//        node cdp-wss-watch.mjs           # no language expected (auto path)

import { WebSocket } from "ws";
import http from "node:http";

const EXPECTED_LANG = process.argv[2] || null;
const CDP_HOST = "127.0.0.1";
const CDP_PORT = 9223;

const targets = await new Promise((resolve, reject) => {
  http.get(`http://${CDP_HOST}:${CDP_PORT}/json`, (res) => {
    const chunks = [];
    res.on("data", (c) => chunks.push(c));
    res.on("end", () => resolve(JSON.parse(Buffer.concat(chunks).toString())));
    res.on("error", reject);
  });
});

// Attach to all 3 renderer pages (MAIN/PANEL/AGENT) so we don't miss anything
const pages = targets.filter((t) => t.type === "page" && t.webSocketDebuggerUrl);
if (pages.length === 0) {
  console.error("no CDP page targets — Electron not running?");
  process.exit(2);
}

console.log(`[cdp] attaching to ${pages.length} renderer pages`);
console.log(`[cdp] expected language: ${EXPECTED_LANG || "(none / auto)"}`);

let nextId = 1;
const wsToUrl = new Map(); // CDP requestId → URL

for (const page of pages) {
  const label = page.url.includes("?panel=")
    ? "PANEL"
    : page.url.includes("?agent=")
    ? "AGENT"
    : "MAIN ";
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  ws.on("open", () => {
    ws.send(JSON.stringify({ id: nextId++, method: "Network.enable" }));
  });
  ws.on("message", (data) => {
    const msg = JSON.parse(data.toString());
    if (!msg.method) return; // command response

    // Watch WebSocket lifecycle
    if (msg.method === "Network.webSocketCreated") {
      const { requestId, url } = msg.params;
      wsToUrl.set(requestId, url);
      const hasLang = /[&?]language=/.test(url);
      const langMatch = url.match(/[&?]language=([^&]+)/);
      const flag = EXPECTED_LANG && langMatch?.[1] === EXPECTED_LANG ? "✓" : (EXPECTED_LANG ? "✗" : "·");
      console.log(`\n[${label}] [+] WebSocket created`);
      console.log(`[${label}]     url: ${url}`);
      console.log(`[${label}]     has ?language= : ${hasLang}${langMatch ? ` (value=${langMatch[1]})` : ""} ${flag}`);
    }

    if (msg.method === "Network.webSocketWillSendHandshakeRequest") {
      // Optional: dump handshake headers
    }

    if (msg.method === "Network.webSocketFrameSent") {
      const { requestId, response } = msg.params;
      const payload = response.payloadData;
      if (typeof payload === "string" && payload.startsWith("{")) {
        try {
          const f = JSON.parse(payload);
          console.log(`[${label}] [>] ${f.type || "(no-type)"}`);
        } catch {
          console.log(`[${label}] [>] (non-JSON, ${payload.length} bytes)`);
        }
      } else {
        console.log(`[${label}] [>] (binary or non-JSON, opcode=${response.opcode})`);
      }
    }

    if (msg.method === "Network.webSocketFrameReceived") {
      const { requestId, response } = msg.params;
      const payload = response.payloadData;
      if (typeof payload === "string" && payload.startsWith("{")) {
        try {
          const f = JSON.parse(payload);
          const t = f.type || "(no-type)";
          let suffix = "";
          // For session.created / session.updated, surface the language
          if (t.includes("session.")) {
            const lang =
              f.session?.audio?.input?.transcription?.language ??
              f.session?.input_audio_transcription?.language ??
              null;
            suffix = ` lang=${JSON.stringify(lang)}`;
            if (f.session?.audio?.input?.transcription !== undefined) {
              suffix += ` transcription=${JSON.stringify(f.session.audio.input.transcription)}`;
            }
          }
          // For conversation.item.input_audio_transcription.delta, dump the text
          if (t.includes("transcription.delta") || t.includes("transcription.completed")) {
            suffix = ` text=${JSON.stringify(f.delta ?? f.transcript ?? "")}`;
          }
          // For errors
          if (t === "error") {
            suffix = ` err=${JSON.stringify(f.error)}`;
          }
          console.log(`[${label}] [<] ${t}${suffix}`);
        } catch {
          console.log(`[${label}] [<] (parse-fail, ${payload.length} bytes)`);
        }
      } else {
        console.log(`[${label}] [<] (binary or non-JSON, opcode=${response.opcode})`);
      }
    }

    if (msg.method === "Network.webSocketClosed") {
      console.log(`[${label}] [x] WebSocket closed: ${wsToUrl.get(msg.params.requestId) || "?"}`);
    }
  });
  ws.on("error", (e) => console.error(`[${label}] CDP error: ${e.message}`));
}

console.log("\n=== CDP watcher running. Press hotkey + dictate. Ctrl-C to stop. ===\n");
