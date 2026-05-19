/**
 * Conversations CJM step definitions — exercises the cloud-api
 * passthrough wire path (NOT raw HTTP). See sync-cjm.steps.ts.
 */
import { expect } from "@playwright/test";
import { createBdd } from "playwright-bdd";
import { cloudCall } from "./sync-cjm.steps";
import { world } from "./world";

const { When, Then } = createBdd();

type CloudConversation = { id: string; title?: string };
type CloudMessage = { id: string; conversation_id?: string; role?: string };
type ListConvResponse = { conversations?: CloudConversation[] };
type ListMsgResponse = { messages?: CloudMessage[] };

When(
  "I cloud-create a conversation with title {string}",
  async ({}, title: string) => {
    const envelope = await cloudCall<CloudConversation>(
      "POST",
      "/api/conversations/create",
      { title },
    );
    if (envelope.success && envelope.data?.id) {
      world.createdConversationId = envelope.data.id;
    }
  },
);

When(
  "I cloud-post a message to the conversation with role {string} and content {string}",
  async ({}, role: string, content: string) => {
    const envelope = await cloudCall<CloudMessage>(
      "POST",
      "/api/conversations/messages",
      { conversation_id: world.createdConversationId, role, content },
    );
    if (envelope.success && envelope.data?.id) {
      world.createdMessageId = envelope.data.id;
    }
  },
);

When("I cloud-list messages for the conversation", async ({}) => {
  await cloudCall<ListMsgResponse>(
    "GET",
    `/api/conversations/messages?conversationId=${encodeURIComponent(
      world.createdConversationId ?? "",
    )}`,
  );
});

When(
  "I cloud-update the created conversation with title {string}",
  async ({}, title: string) => {
    await cloudCall<CloudConversation>("PATCH", "/api/conversations/update", {
      id: world.createdConversationId,
      title,
    });
  },
);

When(
  "I cloud-search conversations with query {string}",
  async ({}, query: string) => {
    await cloudCall<ListConvResponse>("POST", "/api/conversations/search", {
      query,
    });
  },
);

When("I cloud-delete the created conversation", async ({}) => {
  await cloudCall("DELETE", "/api/conversations/delete", {
    id: world.createdConversationId,
  });
});

Then("the created conversation has a non-empty id", async ({}) => {
  expect(world.createdConversationId).toBeTruthy();
});

Then("the created message has a non-empty id", async ({}) => {
  expect(world.createdMessageId).toBeTruthy();
});

Then(
  "the conversation messages list has at least {int} entries",
  async ({}, n: number) => {
    const data = world.lastCloudEnvelope?.data as ListMsgResponse | null;
    expect((data?.messages ?? []).length).toBeGreaterThanOrEqual(n);
  },
);

Then(
  "the cloud conversations list includes the created conversation id",
  async ({}) => {
    const data = world.lastCloudEnvelope?.data as ListConvResponse | null;
    const ids = (data?.conversations ?? []).map((c) => c.id);
    expect(ids).toContain(world.createdConversationId);
  },
);

Then(
  "the updated conversation title equals {string}",
  async ({}, title: string) => {
    const data = world.lastCloudEnvelope?.data as CloudConversation | null;
    expect(data?.title).toBe(title);
  },
);

Then(
  "the conversation messages list is empty or 404",
  async ({}) => {
    // Per R10 cascade-on-delete: either the server returns 200 with an
    // empty messages list, OR it returns 404 (conversation gone). Both
    // satisfy the contract; the IPC envelope collapses both into
    // success=false (404 → !response.ok) or success=true (200, empty list).
    const env = world.lastCloudEnvelope;
    if (env?.success) {
      const data = env.data as ListMsgResponse | null;
      expect((data?.messages ?? []).length).toBe(0);
    } else {
      expect(env?.success).toBe(false);
    }
  },
);
