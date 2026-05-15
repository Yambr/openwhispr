import { expect, test } from "@playwright/test";
import { createBdd } from "playwright-bdd";
import { BACKEND_URL, authHeaders, world } from "./world";

const { When, Then } = createBdd();

When(
  "I POST {string} with auth",
  async ({}, path_: string) => {
    // Gate AssemblyAI / Deepgram on operator-provided env flags so CI
    // without keys can still enumerate without spurious "missing key" 503s.
    if (
      path_.includes("streaming-token") &&
      !path_.includes("deepgram") &&
      process.env.OPENWHISPR_E2E_ASSEMBLYAI_AVAILABLE !== "1"
    ) {
      test.skip(true, "OPENWHISPR_E2E_ASSEMBLYAI_AVAILABLE not set");
      return;
    }
    if (
      path_.includes("deepgram-streaming-token") &&
      process.env.OPENWHISPR_E2E_DEEPGRAM_AVAILABLE !== "1"
    ) {
      test.skip(true, "OPENWHISPR_E2E_DEEPGRAM_AVAILABLE not set");
      return;
    }
    const res = await fetch(`${BACKEND_URL}${path_}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...authHeaders(world.tenant?.token ?? null),
      },
      body: "{}",
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

// Note: the @skip openai-realtime scenario re-uses the above step, so
// no additional step def is needed for it.

Then(
  "the response carries a non-empty token",
  async ({}) => {
    const body = world.lastBody as Record<string, unknown> | null;
    expect(body).toBeTruthy();
    expect(
      typeof body!.token === "string" && (body!.token as string).length > 0,
    ).toBeTruthy();
  },
);
