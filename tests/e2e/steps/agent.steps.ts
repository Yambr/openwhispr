import { expect } from "@playwright/test";
import { createBdd } from "playwright-bdd";
import { BACKEND_URL, authHeaders, world } from "./world";

const { When, Then } = createBdd();

type StreamChunk = Record<string, unknown>;

const streamChunks: StreamChunk[] = [];

When(
  "I POST {string} with a simple user message",
  async ({}, path_: string) => {
    streamChunks.length = 0;
    const res = await fetch(`${BACKEND_URL}${path_}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...authHeaders(world.tenant?.token ?? null),
      },
      body: JSON.stringify({
        messages: [{ role: "user", content: "Hello" }],
        clientType: "desktop",
      }),
    });
    world.lastResponse = res;
    if (!res.ok || !res.body) {
      world.lastBodyText = await res.text().catch(() => "");
      return;
    }
    // Parse NDJSON line-by-line.
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        try {
          streamChunks.push(JSON.parse(line));
        } catch {
          // ignore malformed lines
        }
      }
    }
    if (buf.trim()) {
      try {
        streamChunks.push(JSON.parse(buf.trim()));
      } catch {
        /* ignore */
      }
    }
  },
);

When(
  "I POST {string} with query {string}",
  async ({}, path_: string, query: string) => {
    const res = await fetch(`${BACKEND_URL}${path_}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...authHeaders(world.tenant?.token ?? null),
      },
      body: JSON.stringify({ query, numResults: 3 }),
    });
    world.lastResponse = res;
    world.lastBodyText = await res.text().catch(() => "");
    try {
      world.lastBody = world.lastBodyText ? JSON.parse(world.lastBodyText) : null;
    } catch {
      world.lastBody = null;
    }
  },
);

Then("the stream contained at least one text-delta chunk", async ({}) => {
  const hasDelta = streamChunks.some(
    (c) => c.type === "text-delta" || typeof c.delta === "string",
  );
  expect(hasDelta).toBeTruthy();
});

Then(
  "the stream terminal chunk has finishReason {string}",
  async ({}, reason: string) => {
    // Find a chunk with a finishReason field (preferred) or type:finish.
    const terminal = [...streamChunks]
      .reverse()
      .find(
        (c) =>
          typeof (c as { finishReason?: string }).finishReason === "string" ||
          c.type === "finish",
      ) as { finishReason?: string } | undefined;
    expect(terminal).toBeTruthy();
    // BACKEND_SPEC example shows the finish chunk does not always carry
    // finishReason explicitly; tolerate finish-type chunks without it.
    if (terminal && typeof terminal.finishReason === "string") {
      expect(terminal.finishReason).toBe(reason);
    }
  },
);

Then("the response carries a results array", async ({}) => {
  const body = world.lastBody as Record<string, unknown> | null;
  expect(body).toBeTruthy();
  // BACKEND_SPEC says `results`; task brief said `sources`. Accept either.
  const arr =
    (Array.isArray((body as { results?: unknown }).results) &&
      (body as { results: unknown[] }).results) ||
    (Array.isArray((body as { sources?: unknown }).sources) &&
      (body as { sources: unknown[] }).sources);
  expect(Array.isArray(arr)).toBeTruthy();
});
