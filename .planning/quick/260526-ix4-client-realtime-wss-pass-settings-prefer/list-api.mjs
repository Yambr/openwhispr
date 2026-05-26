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
    expression: `Object.keys(window.electronAPI || {}).sort()`,
    returnByValue: true,
  }}));
});
ws.on("message", (raw) => {
  const m = JSON.parse(raw.toString());
  if (m.result?.result?.value) {
    console.log(m.result.result.value.join("\n"));
    process.exit(0);
  }
});
