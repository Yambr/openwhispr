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

Then("the response carries a non-empty providers array", async ({}) => {
  const body = world.lastBody as Record<string, unknown> | null;
  expect(body).toBeTruthy();
  // BACKEND_SPEC documents `availableProviders`; the task brief calls it
  // `providers`. Accept either.
  const arr =
    (Array.isArray((body as { providers?: unknown }).providers) &&
      (body as { providers: unknown[] }).providers) ||
    (Array.isArray((body as { availableProviders?: unknown }).availableProviders) &&
      (body as { availableProviders: unknown[] }).availableProviders);
  expect(Array.isArray(arr) && arr.length > 0).toBeTruthy();
});
