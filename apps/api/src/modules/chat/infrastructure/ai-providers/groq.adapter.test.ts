import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ConfigService } from "@nestjs/config";

const createMock = vi.fn();

vi.mock("groq-sdk", () => {
  return {
    default: vi.fn(() => ({
      chat: { completions: { create: createMock } },
    })),
  };
});

describe("GroqAdapter", () => {
  beforeEach(() => {
    createMock.mockReset();
  });

  it("maps Groq chat-completion stream chunks into ChatToken shape and emits a final done token", async () => {
    async function* fakeGroqStream() {
      yield { choices: [{ delta: { content: "Oi, " } }] };
      yield { choices: [{ delta: { content: "tudo bem?" } }] };
      yield { choices: [{ delta: {} }] };
    }
    createMock.mockResolvedValue(fakeGroqStream());

    const { GroqAdapter } = await import("./groq.adapter.ts");
    const fakeConfig = {
      getOrThrow: () => "fake-api-key",
      get: () => undefined,
    } as unknown as ConfigService;

    const adapter = new GroqAdapter(fakeConfig);
    const tokens = [];
    for await (const token of adapter.streamReply({
      conversationId: "c1",
      anonymizedMessages: [{ role: "user", content: "Oi" }],
      systemPrompt: "system prompt",
    })) {
      tokens.push(token);
    }

    expect(tokens).toEqual([
      { conversationId: "c1", delta: "Oi, ", done: false },
      { conversationId: "c1", delta: "tudo bem?", done: false },
      { conversationId: "c1", delta: "", done: true },
    ]);
  });

  it("sends the system prompt as a system message and passes AnonymizedMessage roles through unchanged", async () => {
    async function* emptyStream() {}
    createMock.mockResolvedValue(emptyStream());

    const { GroqAdapter } = await import("./groq.adapter.ts");
    const fakeConfig = {
      getOrThrow: () => "fake-api-key",
      get: () => undefined,
    } as unknown as ConfigService;

    const adapter = new GroqAdapter(fakeConfig);
    const tokens = [];
    for await (const token of adapter.streamReply({
      conversationId: "c1",
      anonymizedMessages: [
        { role: "assistant", content: "Oi, como você está?" },
        { role: "user", content: "cansada" },
      ],
      systemPrompt: "system prompt",
    })) {
      tokens.push(token);
    }

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          { role: "system", content: "system prompt" },
          { role: "assistant", content: "Oi, como você está?" },
          { role: "user", content: "cansada" },
        ],
        stream: true,
      }),
    );
  });
});
