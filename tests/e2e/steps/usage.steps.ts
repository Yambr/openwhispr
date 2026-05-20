import { expect } from "@playwright/test";
import { createBdd } from "playwright-bdd";
import { BACKEND_URL, authHeaders, world } from "./world";

const { When, Then } = createBdd();

When("I GET {string} with auth", async ({}, path_: string) => {
  const res = await fetch(`${BACKEND_URL}${path_}`, {
    method: "GET",
    headers: { ...authHeaders(world.tenant?.token ?? null) },
  });
  world.lastResponse = res;
  world.lastBodyText = await res.text().catch(() => "");
  try {
    world.lastBody = world.lastBodyText ? JSON.parse(world.lastBodyText) : null;
  } catch {
    world.lastBody = null;
  }
});

When("I GET {string} without auth", async ({}, path_: string) => {
  const res = await fetch(`${BACKEND_URL}${path_}`, { method: "GET" });
  world.lastResponse = res;
  world.lastBodyText = await res.text().catch(() => "");
  try {
    world.lastBody = world.lastBodyText ? JSON.parse(world.lastBodyText) : null;
  } catch {
    world.lastBody = null;
  }
});

When(
  "I POST {string} with auth and a streaming-usage report body",
  async ({}, path_: string) => {
    // Body matches BACKEND_SPEC § POST /api/streaming-usage — the
    // post-streaming-session usage report. All listed fields are
    // required by the server's input schema.
    const res = await fetch(`${BACKEND_URL}${path_}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...authHeaders(world.tenant?.token ?? null),
      },
      body: JSON.stringify({
        text: "final transcript for e2e streaming-usage report",
        audioDurationSeconds: 12.5,
        sessionId: "11111111-1111-1111-1111-111111111111",
        clientType: "desktop",
        appVersion: "1.0.0",
        clientVersion: "1.0.0",
        sttProvider: "openai",
        sttModel: "whisper-1",
        sttProcessingMs: 412,
        sttLanguage: "en",
        audioSizeBytes: 90123,
      }),
    });
    world.lastResponse = res;
    world.lastBodyText = await res.text().catch(() => "");
    try {
      world.lastBody = world.lastBodyText
        ? JSON.parse(world.lastBodyText)
        : null;
    } catch {
      world.lastBody = null;
    }
  },
);

Then(
  "the usage response carries at least one of {string}",
  async ({}, csv: string) => {
    const body = world.lastBody as Record<string, unknown> | null;
    expect(body).toBeTruthy();
    const expected = csv.split(",").map((s) => s.trim());
    const hit = expected.some((k) => k in (body as object));
    expect(hit).toBeTruthy();
  },
);

Then("the response carries a providers array", async ({}) => {
  const body = world.lastBody as Record<string, unknown> | null;
  expect(body).toBeTruthy();
  // BACKEND_SPEC documents `availableProviders`; accept `providers` too.
  // The array MAY be empty: /api/stt-config reflects which STT provider
  // keys the operator configured on the server. An empty list is a
  // valid, well-formed response — asserting non-empty would couple the
  // test to operator key provisioning, not to the contract.
  const raw =
    (body as { providers?: unknown }).providers ??
    (body as { availableProviders?: unknown }).availableProviders;
  expect(Array.isArray(raw)).toBeTruthy();
});
