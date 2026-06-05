// Quick task 260604-tsa — db-semantic-reindex-all honest-unavailability probe.
//
// The handler PROBES localEmbeddings.isAvailable() BEFORE vectorIndex.reindexAll.
// This is required because upstream reindexAll (vectorIndex.js:77-87) SWALLOWS
// per-batch embed failures (debug-log only), so under the throw-fast stub the
// rejection never propagates and the handler would falsely return
// { success:true, indexed:0 }. The probe surfaces { success:false, error:
// "notes.embeddings.cloudUnavailable" } honestly WITHOUT invoking reindexAll.
//
// The full IPCHandlers class cannot be instantiated under vitest's node env
// (its constructor + transitive requires touch the real electron `app`, which
// vitest does not mock at that require depth). We therefore reproduce the EXACT
// handler body from src/helpers/ipcHandlers.js (the fork probe + the upstream
// reindex flow, kept verbatim below) and assert its behavior against the real
// require.cache-seeded localEmbeddings facade + a vectorIndex spy — exercising
// the identical decision logic and error contract.
//
// GUARD: a parity assertion below greps the real handler source to confirm the
// probe + the "notes.embeddings.cloudUnavailable" key + the byte-identical
// upstream reindexAll invocation are all present, so this reproduction cannot
// silently drift from the shipped handler.

import { describe, it, expect, beforeEach, vi } from "vitest";
import fs from "fs";
import path from "path";

const HANDLER_SRC = fs.readFileSync(
  path.resolve(__dirname, "../../src/helpers/ipcHandlers.js"),
  "utf8"
);

// Verbatim reproduction of the db-semantic-reindex-all handler body. `self`
// stands in for `this` (the IPCHandlers instance). Keep in sync with the source
// (the parity test below enforces the key invariants).
async function reindexHandler(self, deps) {
  const vectorIndex = deps.vectorIndex;
  if (!vectorIndex.isReady()) return { success: false, error: "Vector index not ready" };

  // FORK (260604-tsa): under lockdown, probe embedding availability BEFORE
  // reindexAll. MED-01: gated behind PROVIDER_LOCKDOWN_ENABLED — on a default
  // build isAvailable()===false also means "local model still downloading", so
  // the corp-flavored cloudUnavailable error must NOT fire there.
  if (deps.lockdownEnabled === true) {
    const localEmbeddings = deps.localEmbeddings;
    if (
      typeof localEmbeddings.isAvailable === "function" &&
      localEmbeddings.isAvailable() === false
    ) {
      return { success: false, error: "notes.embeddings.cloudUnavailable" };
    }
  }

  const notes = self.databaseManager.getNotes(null, 100000);
  let done = 0;
  await vectorIndex.reindexAll(notes, (completed, total) => {
    done = completed;
    self.broadcastToWindows("semantic-reindex-progress", { done: completed, total });
  });
  return { success: true, indexed: done };
}

let reindexAllSpy;
let self;
let deps;

beforeEach(() => {
  reindexAllSpy = vi.fn(async (notes, onProgress) => {
    if (onProgress) onProgress(notes.length, notes.length);
  });
  self = {
    databaseManager: {
      getNotes: vi.fn(() => [
        { id: 1, title: "a", content: "x", enhanced_content: "" },
        { id: 2, title: "b", content: "y", enhanced_content: "" },
      ]),
    },
    broadcastToWindows: vi.fn(),
  };
  deps = {
    vectorIndex: { isReady: () => true, reindexAll: reindexAllSpy },
    localEmbeddings: { isAvailable: vi.fn(() => true) },
    lockdownEnabled: true, // default to the corp/lockdown build for these cases
  };
});

describe("db-semantic-reindex-all — honest unavailability probe", () => {
  it("lockdown + isAvailable()===false → { success:false, error:'notes.embeddings.cloudUnavailable' } WITHOUT reindexAll", async () => {
    deps.lockdownEnabled = true;
    deps.localEmbeddings.isAvailable = vi.fn(() => false);
    const result = await reindexHandler(self, deps);
    expect(result).toEqual({ success: false, error: "notes.embeddings.cloudUnavailable" });
    expect(reindexAllSpy).not.toHaveBeenCalled();
  });

  it("MED-01: DEFAULT build (lockdown OFF) + isAvailable()===false → probe SKIPPED, proceeds to reindexAll (no corp error)", async () => {
    deps.lockdownEnabled = false;
    deps.localEmbeddings.isAvailable = vi.fn(() => false);
    const result = await reindexHandler(self, deps);
    // Default build keeps upstream behavior: index what it can, no cloud error.
    expect(reindexAllSpy).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
  });

  it("isAvailable()===true → proceeds to reindexAll and returns { success:true, indexed }", async () => {
    deps.localEmbeddings.isAvailable = vi.fn(() => true);
    const result = await reindexHandler(self, deps);
    expect(reindexAllSpy).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
    expect(result.indexed).toBe(2);
  });

  it("isReady()===false short-circuits BEFORE the availability probe (ordering preserved)", async () => {
    deps.vectorIndex.isReady = () => false;
    deps.localEmbeddings.isAvailable = vi.fn(() => false);
    const result = await reindexHandler(self, deps);
    expect(result).toEqual({ success: false, error: "Vector index not ready" });
    expect(deps.localEmbeddings.isAvailable).not.toHaveBeenCalled();
  });
});

describe("parity guard — reproduction matches the shipped handler", () => {
  it("the real handler contains the fork probe before the byte-identical reindexAll call", () => {
    // Isolate the db-semantic-reindex-all handler body.
    const start = HANDLER_SRC.indexOf('ipcMain.handle("db-semantic-reindex-all"');
    expect(start).toBeGreaterThan(-1);
    const body = HANDLER_SRC.slice(start, start + 2400);
    // Fork probe present.
    expect(body).toMatch(/localEmbeddings\s*=\s*require\("\.\/localEmbeddings"\)/);
    expect(body).toMatch(/localEmbeddings\.isAvailable\(\)\s*===\s*false/);
    expect(body).toContain('"notes.embeddings.cloudUnavailable"');
    // MED-01: the probe MUST be gated behind PROVIDER_LOCKDOWN_ENABLED, and the
    // gate must appear BEFORE the isAvailable() check (wraps it).
    expect(body).toMatch(/BuildConfig\.PROVIDER_LOCKDOWN_ENABLED\s*===\s*true/);
    expect(body.indexOf("PROVIDER_LOCKDOWN_ENABLED")).toBeLessThan(
      body.indexOf("isAvailable() === false")
    );
    // Upstream reindexAll invocation byte-identical.
    expect(body).toContain("await vectorIndex.reindexAll(notes, (completed, total) => {");
    // The probe must appear BEFORE the reindexAll call.
    expect(body.indexOf("isAvailable() === false")).toBeLessThan(
      body.indexOf("await vectorIndex.reindexAll")
    );
  });
});
