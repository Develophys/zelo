import type { AnonymizedMessage } from "@zelo/domain";
import type { ChatGatewayPort, ChatStreamEvent } from "@/ports/chat-gateway.port";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

function parseStreamEvent(line: string): ChatStreamEvent | null {
  const trimmed = line.trim();
  if (trimmed.length === 0) return null;
  try {
    return JSON.parse(trimmed) as ChatStreamEvent;
  } catch {
    return null;
  }
}

export class HttpChatGatewayAdapter implements ChatGatewayPort {
  async *streamReply(params: {
    conversationId: string;
    anonymizedMessages: AnonymizedMessage[];
    hasActiveRiskSignal: boolean;
  }): AsyncGenerator<ChatStreamEvent> {
    let response: Response;

    try {
      response = await fetch(`${API_BASE_URL}/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });
    } catch {
      yield { error: "ai_unavailable" };
      return;
    }

    if (!response.ok || !response.body) {
      yield { error: "ai_unavailable" };
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const event = parseStreamEvent(line);
          if (event) yield event;
        }
      }

      const tail = parseStreamEvent(buffer);
      if (tail) yield tail;
    } catch {
      yield { error: "ai_unavailable" };
    } finally {
      await reader.cancel().catch(() => undefined);
    }
  }
}
