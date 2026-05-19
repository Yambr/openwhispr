import { expect } from "@playwright/test";
import { createBdd } from "playwright-bdd";
import { world } from "./world";

const { Then } = createBdd();

// GET steps live in usage.steps.ts ("I GET {string} without auth").

Then(
  "the response header {string} equals {string}",
  async ({}, name: string, value: string) => {
    const got = world.lastResponse?.headers.get(name) ?? "";
    expect(got).toBe(value);
  },
);

Then(
  "the response header {string} contains {string}",
  async ({}, name: string, fragment: string) => {
    const got = world.lastResponse?.headers.get(name) ?? "";
    expect(got).toContain(fragment);
  },
);

Then(
  "the response header {string} is absent",
  async ({}, name: string) => {
    // Per R4 closure: /api/health no longer carries deprecation / link
    // headers. Assert the header is missing entirely (null), not merely
    // empty — a fetch header API returns null when the header is unset.
    const got = world.lastResponse?.headers.get(name);
    expect(got, `expected header '${name}' to be absent, got '${got}'`).toBeNull();
  },
);
