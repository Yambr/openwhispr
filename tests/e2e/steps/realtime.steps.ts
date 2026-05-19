import { expect, test } from "@playwright/test";
import { createBdd } from "playwright-bdd";
import { BACKEND_URL, authHeaders, world } from "./world";

const { When, Then } = createBdd();

async function captureResponse(res: Response): Promise<void> {
  world.lastResponse = res;
  world.lastBodyText = await res.text().catch(() => "");
  try {
    world.lastBody = world.lastBodyText ? JSON.parse(world.lastBodyText) : null;
  } catch {
    world.lastBody = null;
  }
}

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
    await captureResponse(res);
  },
);

When(
  "I POST {string} with auth and body model {string} language {string} streams {int}",
  async ({}, path_: string, model: string, language: string, streams: number) => {
    const res = await fetch(`${BACKEND_URL}${path_}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...authHeaders(world.tenant?.token ?? null),
      },
      body: JSON.stringify({ model, language, streams }),
    });
    await captureResponse(res);
  },
);

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

Then(
  "the response JSON field {string} is non-empty",
  async ({}, field: string) => {
    const body = world.lastBody as Record<string, unknown> | null;
    expect(body, "no body").toBeTruthy();
    const value = body![field];
    expect(typeof value === "string" && value.length > 0, `${field} not non-empty string`).toBe(
      true,
    );
  },
);

Then(
  "the response carries clientSecrets array of length {int}",
  async ({}, n: number) => {
    const body = world.lastBody as { clientSecrets?: unknown } | null;
    expect(Array.isArray(body?.clientSecrets), "clientSecrets not an array").toBe(true);
    const arr = body!.clientSecrets as unknown[];
    expect(arr.length).toBe(n);
    for (const cs of arr) {
      expect(typeof cs === "string" && (cs as string).length > 0).toBe(true);
    }
  },
);
