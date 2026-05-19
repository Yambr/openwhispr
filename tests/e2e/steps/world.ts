/**
 * Shared mutable state for step definitions.
 *
 * Phase 9 runs with `workers: 1` and `fullyParallel: false` (see
 * playwright.config.ts), so a module-level singleton is the simplest
 * way to thread state across Given/When/Then steps in a feature. If
 * we ever go parallel we replace this with a playwright-bdd `Fixture`.
 */
import type { ElectronApplication, Page } from "@playwright/test";
import type { TestTenant } from "../fixtures/seed";

/**
 * Envelope returned by the `cloud-api-request` IPC handler. This is the
 * REAL client wire path (src/helpers/ipcHandlers.js:6001):
 *
 *   { success: true,  data:  <response body parsed as JSON> }
 *   { success: false, error: "<message>", code?: "<code>" }
 *
 * The IPC layer collapses HTTP 2xx into `{success:true}` and any non-2xx
 * (including 401 → AUTH_EXPIRED and 503 → SERVER_ERROR) into
 * `{success:false}`. Step defs that need to distinguish 201 vs 204 vs 200
 * must assert on `data` shape, not literal HTTP status — the wire path
 * does not expose the underlying status.
 */
export type CloudApiEnvelope<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
};

export type World = {
  tenant: TestTenant | null;
  // Last HTTP response captured by a When step so Then steps can assert
  // (used for raw-fetch flows: health, realtime-token, auth, etc.).
  lastResponse: Response | null;
  lastBody: unknown;
  lastBodyText: string | null;
  // Last cloud-api-request envelope captured by a When step (used by the
  // sync CJM features that exercise the real client wire path).
  lastCloudEnvelope: CloudApiEnvelope | null;
  // Notes-feature scratch space (now shared across all CJM resources).
  createdNoteId: string | null;
  createdFolderId: string | null;
  createdConversationId: string | null;
  createdMessageId: string | null;
  createdTranscriptionId: string | null;
  // Batch scratch space (e.g., batch-create returns [{client_note_id, id}, ...]).
  batchCreatedIds: string[];
  // Electron application + first page, populated when a step boots the app.
  electronApp: ElectronApplication | null;
  electronPage: Page | null;
  // Realtime gating.
  flags: Record<string, boolean>;
};

export const world: World = {
  tenant: null,
  lastResponse: null,
  lastBody: undefined,
  lastBodyText: null,
  lastCloudEnvelope: null,
  createdNoteId: null,
  createdFolderId: null,
  createdConversationId: null,
  createdMessageId: null,
  createdTranscriptionId: null,
  batchCreatedIds: [],
  electronApp: null,
  electronPage: null,
  flags: {},
};

export function resetWorld(): void {
  world.tenant = null;
  world.lastResponse = null;
  world.lastBody = undefined;
  world.lastBodyText = null;
  world.lastCloudEnvelope = null;
  world.createdNoteId = null;
  world.createdFolderId = null;
  world.createdConversationId = null;
  world.createdMessageId = null;
  world.createdTranscriptionId = null;
  world.batchCreatedIds = [];
  world.electronApp = null;
  world.electronPage = null;
  world.flags = {};
}

export const BACKEND_URL: string =
  process.env.OPENWHISPR_E2E_BACKEND_URL ?? "http://localhost:4000";

export function authHeaders(token: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}
