import { expect, test } from "@playwright/test";
import { createBdd } from "playwright-bdd";
import fs from "node:fs";
import path from "node:path";
import { BACKEND_URL, authHeaders, world } from "./world";

const { When, Then } = createBdd();

const AUDIO_FIXTURE = path.resolve(
  __dirname,
  "../fixtures/audio/hello-world-3s.wav",
);

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
  "I POST a multipart {string} with the hello-world WAV",
  async ({}, path_: string) => {
    if (!fs.existsSync(AUDIO_FIXTURE)) {
      test.skip(true, `audio fixture pending: ${AUDIO_FIXTURE} not on disk`);
      return;
    }
    const buf = fs.readFileSync(AUDIO_FIXTURE);
    const form = new FormData();
    form.append(
      "file",
      new Blob([buf], { type: "audio/wav" }),
      "hello-world-3s.wav",
    );
    form.append("clientType", "desktop");
    const res = await fetch(`${BACKEND_URL}${path_}`, {
      method: "POST",
      headers: { ...authHeaders(world.tenant?.token ?? null) },
      body: form,
    });
    await captureResponse(res);
  },
);

When(
  "I POST a multipart {string} with an empty file",
  async ({}, path_: string) => {
    const form = new FormData();
    form.append("file", new Blob([], { type: "audio/wav" }), "empty.wav");
    const res = await fetch(`${BACKEND_URL}${path_}`, {
      method: "POST",
      headers: { ...authHeaders(world.tenant?.token ?? null) },
      body: form,
    });
    await captureResponse(res);
  },
);

When(
  "I POST a multipart {string} with an empty file and no auth",
  async ({}, path_: string) => {
    const form = new FormData();
    form.append("file", new Blob([], { type: "audio/wav" }), "empty.wav");
    const res = await fetch(`${BACKEND_URL}${path_}`, {
      method: "POST",
      body: form,
    });
    await captureResponse(res);
  },
);

Then("the response JSON field {string} is non-empty", async ({}, field: string) => {
  const body = world.lastBody as Record<string, unknown> | null;
  expect(body).toBeTruthy();
  const v = body![field];
  expect(typeof v === "string" && v.length > 0).toBeTruthy();
});
