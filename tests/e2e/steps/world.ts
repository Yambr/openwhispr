/**
 * Shared mutable state for step definitions.
 *
 * Phase 9 runs with `workers: 1` and `fullyParallel: false` (see
 * playwright.config.ts), so a module-level singleton is the simplest
 * way to thread state across Given/When/Then steps in a feature. If
 * we ever go parallel we replace this with a playwright-bdd `Fixture`.
 */
import type { TestTenant } from "../fixtures/seed";

export type World = {
  tenant: TestTenant | null;
  // Last HTTP response captured by a When step so Then steps can assert.
  lastResponse: Response | null;
  lastBody: unknown;
  lastBodyText: string | null;
  // Notes-feature scratch space.
  createdNoteId: string | null;
  // Realtime gating.
  flags: Record<string, boolean>;
};

export const world: World = {
  tenant: null,
  lastResponse: null,
  lastBody: undefined,
  lastBodyText: null,
  createdNoteId: null,
  flags: {},
};

export function resetWorld(): void {
  world.tenant = null;
  world.lastResponse = null;
  world.lastBody = undefined;
  world.lastBodyText = null;
  world.createdNoteId = null;
  world.flags = {};
}

export const BACKEND_URL: string =
  process.env.OPENWHISPR_E2E_BACKEND_URL ?? "http://localhost:4000";

export function authHeaders(token: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}
