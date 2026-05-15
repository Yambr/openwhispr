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
