import { expect } from "@playwright/test";
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
  "I POST {string} with a simple {string} user message",
  async ({}, path_: string, msg: string) => {
    const res = await fetch(`${BACKEND_URL}${path_}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...authHeaders(world.tenant?.token ?? null),
      },
      body: JSON.stringify({
        messages: [{ role: "user", content: msg }],
        clientType: "desktop",
      }),
    });
    await captureResponse(res);
  },
);

When("I POST {string} without auth", async ({}, path_: string) => {
  const res = await fetch(`${BACKEND_URL}${path_}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content: "ping" }] }),
  });
  await captureResponse(res);
});

Then("the reason response has a non-empty content", async ({}) => {
  const body = world.lastBody as Record<string, unknown> | null;
  expect(body).toBeTruthy();
  // BACKEND_SPEC says the client reads `text`, but the task description
  // calls it `content`. Accept either to bridge the spec ambiguity.
  const v =
    (typeof body!.content === "string" && body!.content) ||
    (typeof body!.text === "string" && (body!.text as string));
  expect(typeof v === "string" && (v as string).length > 0).toBeTruthy();
});
