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
const ws = new WebSocket(main.webSocketDebuggerUrl);
ws.on("open", () => {
  ws.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: {
    expression: `(() => {
      // Try localStorage keys
      const keys = Object.keys(localStorage);
      const settingsKeys = keys.filter(k => /setting|prefer|lang|store/i.test(k));
      const out = {};
      for (const k of settingsKeys) {
        try {
          const v = JSON.parse(localStorage.getItem(k));
          out[k] = v;
        } catch {
          out[k] = localStorage.getItem(k);
        }
      }
      return out;
    })()`,
    returnByValue: true,
  }}));
});
ws.on("message", (raw) => {
  const m = JSON.parse(raw.toString());
  if (m.result?.result?.value !== undefined) {
    console.log(JSON.stringify(m.result.result.value, null, 2).slice(0, 2000));
    process.exit(0);
  }
});
