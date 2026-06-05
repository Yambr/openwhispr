// Live-verify for v1.7.20 cloud-embeddings (260604-tsa) against a REAL
// in-perimeter prod server. Run the LOCKDOWN-built, signed desktop app under
// CDP (--remote-debugging-port=9223), signed-in via OIDC to the corp server,
// THEN run this. It drives the renderer to:
//   1. create a note (so there's content to index),
//   2. trigger semantic search (db-semantic-search-notes IPC),
//   3. trigger a full reindex (db-semantic-reindex-all IPC),
// and reports the IPC results. The actual POST /api/embeddings happens in the
// MAIN process (Electron net.fetch) — renderer-CDP CANNOT see it. So the
// authoritative proof is BOTH:
//   (a) this script's IPC results (search returns hits / reindex success), AND
//   (b) the app's own debug log line "embeddings: routing to cloud provider
//       (lockdown + capabilities)" — grep the debug log (see runbook).
//
// Usage:
//   node scripts/cdp-embeddings-verify.mjs
// Requires: the app launched with --remote-debugging-port=9223 on a machine
// with network access to the corp prod server, already OIDC-signed-in.
import WebSocket from "ws";

const CDP = "http://127.0.0.1:9223";

const pages = (await (await fetch(`${CDP}/json`)).json()).filter(
  (p) => p.type === "page" && p.webSocketDebuggerUrl
);
if (!pages.length) {
  console.error("No CDP page targets. Is the app running with --remote-debugging-port=9223?");
  process.exit(1);
}
// Prefer the main control-panel window (not the dictation overlay).
const page =
  pages.find((p) => !(p.url || "").includes("panel=true")) || pages[0];
console.log(`[verify] attached to: ${page.url}`);

const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 1;
const pending = new Map();
function send(method, params) {
  return new Promise((resolve) => {
    const mid = id++;
    pending.set(mid, resolve);
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
}
ws.on("message", (data) => {
  const m = JSON.parse(data.toString());
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m.result);
    pending.delete(m.id);
  }
});

function evaluate(expression) {
  return send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
}

ws.on("open", async () => {
  await send("Runtime.enable", {});

  // 0. Confirm we're a lockdown build and signed in (auth token present).
  const ctx = await evaluate(`(async () => {
    const api = window.electronAPI;
    let token = null;
    try { token = await api.authGetToken?.(); } catch {}
    let serverUrl = null;
    try { serverUrl = localStorage.getItem("serverUrl"); } catch {}
    return {
      hasApi: !!api,
      hasToken: !!token,
      tokenLen: token ? token.length : 0,
      serverUrl,
    };
  })()`);
  console.log("[verify] context:", JSON.stringify(ctx?.result?.value));
  const c = ctx?.result?.value || {};
  if (!c.hasToken) {
    console.error("[verify] FAIL: no auth token — sign in to the corp server via OIDC first.");
    ws.close();
    process.exit(2);
  }
  if (!c.serverUrl) {
    console.warn("[verify] WARN: no serverUrl persisted — make sure the custom corp host is set.");
  }

  // 1. Create a recognizable note to index.
  const marker = "qverify-financial-forecast-marker";
  const create = await evaluate(`(async () => {
    try {
      const r = await window.electronAPI.saveNote?.(
        "Quarterly revenue projections",
        "FY planning numbers and budget targets for the next quarter. ${marker}",
        "note", null, null, null
      );
      return { ok: true, id: r?.id ?? r?.lastInsertRowid ?? r, raw: r };
    } catch (e) { return { ok: false, error: String(e) }; }
  })()`);
  console.log("[verify] create note:", JSON.stringify(create?.result?.value));

  // Give the async embed-on-write a moment (cloud round-trip).
  await new Promise((r) => setTimeout(r, 2500));

  // 2. Full reindex — this is the path that surfaces the honest probe.
  //    Under cloud (caps-true) → success. Under stub (caps-false) →
  //    { success:false, error:"notes.embeddings.cloudUnavailable" }.
  const reindex = await evaluate(`(async () => {
    try {
      const r = await window.electronAPI.semanticReindexAll?.();
      return { ok: true, result: r };
    } catch (e) { return { ok: false, error: String(e) }; }
  })()`);
  console.log("[verify] reindex-all:", JSON.stringify(reindex?.result?.value));

  await new Promise((r) => setTimeout(r, 2000));

  // 3. Semantic search with a SYNONYM query (not a keyword match) — proves the
  //    vector path works, not just FTS5. "financial forecast" should match
  //    "Quarterly revenue projections" only via embeddings similarity.
  const search = await evaluate(`(async () => {
    try {
      const r = await window.electronAPI.semanticSearchNotes?.("financial forecast outlook", 5);
      return { ok: true, count: Array.isArray(r) ? r.length : null,
               titles: Array.isArray(r) ? r.map(n => n && n.title) : r };
    } catch (e) { return { ok: false, error: String(e) }; }
  })()`);
  console.log("[verify] semantic-search:", JSON.stringify(search?.result?.value));

  // Verdict (renderer-visible portion — combine with the debug-log grep).
  const s = search?.result?.value || {};
  const rx = reindex?.result?.value?.result || {};
  console.log("\n=== RENDERER-SIDE VERDICT (combine with debug-log grep) ===");
  console.log(`reindex success:     ${rx.success === true ? "YES" : "NO (" + JSON.stringify(rx) + ")"}`);
  console.log(`semantic hits:       ${s.count ?? "n/a"} (titles: ${JSON.stringify(s.titles)})`);
  console.log(`embeddings reachable: ${rx.success === true || (s.count > 0) ? "LIKELY YES" : "NO — check debug log"}`);
  console.log("\nNOW grep the debug log for the MAIN-process proof (see runbook):");
  console.log("  embeddings: routing to cloud provider (lockdown + capabilities)   <-- caps-true, cloud selected");
  console.log("  (must NOT see) embeddings: semantic indexing unavailable          <-- would mean caps-false");

  setTimeout(() => { try { ws.close(); } catch {} process.exit(0); }, 1500);
});
ws.on("error", (e) => {
  console.error("ws error", e.message);
  process.exit(1);
});
