// Quick CDP eval — read window.electronAPI to fetch settings.preferredLanguage
import { WebSocket } from "ws";
import http from "node:http";

const targets = await new Promise((r) =>
  http.get("http://127.0.0.1:9223/json", (res) => {
    const c = [];
    res.on("data", (b) => c.push(b));
    res.on("end", () => r(JSON.parse(Buffer.concat(c).toString())));
  })
);

const main = targets.find((t) => t.url.endsWith("index.html"));
if (!main) { console.error("no MAIN target"); process.exit(2); }

const ws = new WebSocket(main.webSocketDebuggerUrl);
let id = 1;
ws.on("open", () => {
  ws.send(JSON.stringify({
    id: id++,
    method: "Runtime.evaluate",
    params: {
      expression: `(async () => {
        const api = window.electronAPI;
        if (!api?.getSettings) return { err: "no getSettings", keys: Object.keys(api || {}).slice(0, 5) };
        try {
          const s = await api.getSettings();
          return {
            preferredLanguage: s.preferredLanguage,
            cloudRouting: s.cloudRouting,
            transcriptionProvider: s.transcriptionProvider,
            streamingMode: s.streamingMode,
            transcriptionModel: s.transcriptionModel,
            useRealtimeStreaming: s.useRealtimeStreaming,
          };
        } catch (e) { return { err: e.message }; }
      })()`,
      awaitPromise: true,
      returnByValue: true,
    },
  }));
});
ws.on("message", (raw) => {
  const m = JSON.parse(raw.toString());
  if (m.result?.result?.value) {
    console.log(JSON.stringify(m.result.result.value, null, 2));
    process.exit(0);
  } else if (m.result?.exceptionDetails) {
    console.error("EXC:", m.result.exceptionDetails.text);
    process.exit(1);
  }
});
ws.on("error", (e) => { console.error(e.message); process.exit(3); });
