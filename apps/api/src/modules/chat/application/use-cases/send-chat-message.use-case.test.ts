import { describe, expect, it } from "vitest";
import {
  SendChatMessageUseCase,
  AiProviderUnavailableError,
  CrisisFallbackRequiredError,
} from "./send-chat-message.use-case.ts";
import type { AiChatPort } from "../ports/ai-chat.port.ts";
import type { AnonymizedMessage, ChatToken } from "@zelo/domain";

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

    expect(tokens.map((token) => token.delta).join("")).toBe("Oi, estou aqui.");
    expect(tokens.at(-1)).toEqual({ conversationId: "c1", delta: "", done: true });
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

class RecordingAiChatPort implements AiChatPort {
  readonly prompts: string[] = [];
  private call = 0;

  constructor(private readonly replies: string[]) {}

  async *streamReply(params: {
    conversationId: string;
    anonymizedMessages: AnonymizedMessage[];
    systemPrompt: string;
  }): AsyncGenerator<ChatToken> {
    this.prompts.push(params.systemPrompt);
    const reply = this.replies[this.call] ?? this.replies.at(-1) ?? "";
    this.call += 1;
    for (const word of reply.split(" ")) {
      yield { conversationId: params.conversationId, delta: `${word} `, done: false };
    }
    yield { conversationId: params.conversationId, delta: "", done: true };
  }
}

describe("SendChatMessageUseCase tone guard wiring", () => {
  const CONVERSATION_ID = "b3f1c2b0-1234-4a5b-9c6d-000000000001";

  async function textFrom(
    port: AiChatPort,
    anonymizedMessages: AnonymizedMessage[],
    hasActiveRiskSignal = false,
  ): Promise<string> {
    const tokens = await collect(
      new SendChatMessageUseCase(port).execute({
        conversationId: CONVERSATION_ID,
        anonymizedMessages,
        hasActiveRiskSignal,
      }),
    );
    return tokens.map((token) => token.delta).join("");
  }

  it("regenerates with a nudge appended to the system prompt on a clichéd opening", async () => {
    const port = new RecordingAiChatPort([
      "Entendo que isso pesa. Deve ser difícil.",
      "Isso pesa mesmo. Faz tempo.",
    ]);

    const text = await textFrom(port, [{ role: "user", content: "tô exausto" }]);

    expect(port.prompts).toHaveLength(2);
    expect(port.prompts[0]).not.toMatch(/ATENÇÃO/);
    expect(port.prompts[1]).toMatch(/ATENÇÃO/);
    expect(port.prompts[1]).toContain("«Entendo que isso pesa.»");
    expect(text.trim()).toBe("Isso pesa mesmo. Faz tempo.");
  });

  it("derives the cadence from prior assistant turns in anonymizedMessages", async () => {
    const port = new RecordingAiChatPort(["Isso pesa mesmo. Faz quanto tempo?"]);

    const text = await textFrom(port, [
      { role: "user", content: "tô exausto" },
      { role: "assistant", content: "Como tá o sono?" },
      { role: "user", content: "ruim" },
    ]);

    expect(text.trim()).toBe("Isso pesa mesmo.");
  });

  it("leaves the stream untouched under an active risk signal", async () => {
    const port = new RecordingAiChatPort([
      "Entendo que isso assusta. Quer falar com uma pessoa de verdade?",
    ]);

    const text = await textFrom(
      port,
      [
        { role: "user", content: "não sei se aguento" },
        { role: "assistant", content: "Como tá o sono?" },
      ],
      true,
    );

    expect(port.prompts).toHaveLength(1);
    expect(text.trim()).toBe("Entendo que isso assusta. Quer falar com uma pessoa de verdade?");
  });

  it("maps a failed regeneration onto the existing provider-error path", async () => {
    class FailsOnRegenerationPort implements AiChatPort {
      private call = 0;

      async *streamReply(params: {
        conversationId: string;
        anonymizedMessages: AnonymizedMessage[];
        systemPrompt: string;
      }): AsyncGenerator<ChatToken> {
        this.call += 1;
        if (this.call === 2) {
          throw new Error("provider unreachable");
        }
        for (const word of "Entendo que isso pesa. Deve ser difícil.".split(" ")) {
          yield { conversationId: params.conversationId, delta: `${word} `, done: false };
        }
        yield { conversationId: params.conversationId, delta: "", done: true };
      }
    }

    await expect(
      textFrom(new FailsOnRegenerationPort(), [{ role: "user", content: "tô exausto" }]),
    ).rejects.toBeInstanceOf(AiProviderUnavailableError);
  });
});
