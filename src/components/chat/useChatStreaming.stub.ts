// Phase 04.1 PLAN-05 (CFG-09 STREAMING_ENABLED): no-op stub used when
// STREAMING_ENABLED=false at build time. Vite aliases ./useChatStreaming to
// this file so the 141kB hook (which transitively pulls in ReasoningService +
// the tools registry + agent stream chunk types) is dropped from the renderer
// bundle.
//
// The shape mirrors the real ChatStreaming type so the 3 consumers
// (ChatView.tsx, AgentOverlay.tsx, useEmbeddedChat.ts) keep their public API
// without any consumer-side branching. sendToAI rejects so consumers can show
// a "streaming disabled" error if a user somehow triggers the agent code path
// in a corporate-minimal build.

import type { Message, AgentState, ToolCallInfo } from "./types";

interface UseChatStreamingOptions {
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  noteContext?: string;
  onStreamComplete?: (assistantId: string, content: string, toolCalls?: ToolCallInfo[]) => void;
}

export interface ChatStreaming {
  agentState: AgentState;
  toolStatus: string;
  activeToolName: string;
  sendToAI: (userText: string, allMessages: Message[]) => Promise<void>;
  cancelStream: () => void;
}

export function useChatStreaming(_opts: UseChatStreamingOptions): ChatStreaming {
  return {
    agentState: "idle" as AgentState,
    toolStatus: "",
    activeToolName: "",
    sendToAI: async () => {
      // Streaming disabled: this build is corporate-minimal. The chat UI is
      // kept renderable so the rest of the app (notes, dictation, settings)
      // works, but the agent path is unreachable.
      return Promise.reject(new Error("Chat agent streaming disabled in this build"));
    },
    cancelStream: () => {},
  };
}
