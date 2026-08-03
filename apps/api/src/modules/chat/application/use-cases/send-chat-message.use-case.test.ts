import { describe, expect, it } from "vitest";
import {
  SendChatMessageUseCase,
  AiProviderUnavailableError,
  CrisisFallbackRequiredError,
} from "./send-chat-message.use-case.ts";
import type { AiChatPort } from "../ports/ai-chat.port.ts";
import type { ChatToken } from "@zelo/domain";

class FakeWorkingAiChatPort implements AiChatPort {
  async *streamReply(): AsyncGenerator<ChatToken> {
    yield { conversationId: "c1", delta: "Oi, ", done: false };
    yield { conversationId: "c1", delta: "estou aqui.", done: false };
    yield { conversationId: "c1", delta: "", done: true };
  }
}

class FakeFailingAiChatPort implements AiChatPort {
  async *streamReply(): AsyncGenerator<ChatToken> {
    throw new Error("provider unreachable");
  }
}

async function collect<T>(iterable: AsyncGenerator<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of iterable) {
    items.push(item);
  }
  return items;
}

describe("SendChatMessageUseCase", () => {
  it("streams tokens through unchanged on success", async () => {
    const useCase = new SendChatMessageUseCase(new FakeWorkingAiChatPort());

    const tokens = await collect(
      useCase.execute({ conversationId: "c1", anonymizedMessages: [], hasActiveRiskSignal: false }),
    );

    expect(tokens).toEqual([
      { conversationId: "c1", delta: "Oi, ", done: false },
      { conversationId: "c1", delta: "estou aqui.", done: false },
      { conversationId: "c1", delta: "", done: true },
    ]);
  });

  it("throws AiProviderUnavailableError on failure with no active risk signal", async () => {
    const useCase = new SendChatMessageUseCase(new FakeFailingAiChatPort());

    await expect(
      collect(useCase.execute({ conversationId: "c1", anonymizedMessages: [], hasActiveRiskSignal: false })),
    ).rejects.toBeInstanceOf(AiProviderUnavailableError);
  });

  it("throws CrisisFallbackRequiredError on failure WITH an active risk signal", async () => {
    const useCase = new SendChatMessageUseCase(new FakeFailingAiChatPort());

    await expect(
      collect(useCase.execute({ conversationId: "c1", anonymizedMessages: [], hasActiveRiskSignal: true })),
    ).rejects.toBeInstanceOf(CrisisFallbackRequiredError);
  });
});
