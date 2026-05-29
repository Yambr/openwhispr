import { expect } from "@playwright/test";
import { createBdd } from "playwright-bdd";
import { BACKEND_URL, world } from "./world";

const { When, Then } = createBdd();

// Pre-auth wire-contract steps for GET /api/auth/providers (Phase 06).
// Mirrors the raw-fetch flow used by auth.steps.ts / usage.steps.ts —
// real endpoint, no mocks, no route interceptor. The bare (no-auth) GET
// is intentionally distinct from usage.steps.ts's "I GET {string} with
// auth" / "I GET {string} without auth": /api/auth/providers is public,
// like /api/check-user, and the client fetches it before sign-in.

When("I GET {string}", async ({}, path: string) => {
  const res = await fetch(`${BACKEND_URL}${path}`, { method: "GET" });
  world.lastResponse = res;
  world.lastBodyText = await res.text().catch(() => "");
  try {
    world.lastBody = world.lastBodyText ? JSON.parse(world.lastBodyText) : null;
  } catch {
    world.lastBody = null;
  }
});

Then(
  "the response JSON has an array field {string}",
  async ({}, field: string) => {
    const body = world.lastBody as Record<string, unknown> | null;
    expect(body, "response had no JSON body").toBeTruthy();
    expect(
      Array.isArray(body![field]),
      `expected JSON field '${field}' to be an array, got ${JSON.stringify(body![field])}`,
    ).toBeTruthy();
  },
);

Then(
  'every provider entry has string "id", string "name", and boolean "enabled"',
  async ({}) => {
    const body = world.lastBody as { providers?: unknown[] } | null;
    expect(body).toBeTruthy();
    const providers = body!.providers;
    expect(Array.isArray(providers)).toBeTruthy();
    for (const entry of providers as Array<Record<string, unknown>>) {
      expect(typeof entry.id, `id not a string: ${JSON.stringify(entry)}`).toBe(
        "string",
      );
      expect(
        typeof entry.name,
        `name not a string: ${JSON.stringify(entry)}`,
      ).toBe("string");
      expect(
        typeof entry.enabled,
        `enabled not a boolean: ${JSON.stringify(entry)}`,
      ).toBe("boolean");
    }
  },
);

Then('every provider "id" is one of {string}', async ({}, csv: string) => {
  const body = world.lastBody as { providers?: unknown[] } | null;
  expect(body).toBeTruthy();
  const providers = body!.providers;
  expect(Array.isArray(providers)).toBeTruthy();
  const allowed = new Set(csv.split(",").map((s) => s.trim()));
  for (const entry of providers as Array<Record<string, unknown>>) {
    expect(
      allowed.has(entry.id as string),
      `provider id '${String(entry.id)}' not in canonical set {${[...allowed].join(", ")}}`,
    ).toBeTruthy();
  }
});
