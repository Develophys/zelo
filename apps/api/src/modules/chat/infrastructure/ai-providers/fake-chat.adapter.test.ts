import { describe, expect, it } from "vitest";
import { FakeChatAdapter } from "./fake-chat.adapter.ts";

describe("FakeChatAdapter", () => {
  it("streams a canned reply word-by-word and ends with a done token", async () => {
    const adapter = new FakeChatAdapter();

    const tokens = [];
    for await (const token of adapter.streamReply({
      conversationId: "c1",
      anonymizedMessages: [{ role: "user", content: "Oi" }],
      systemPrompt: "system prompt",
    })) {
      tokens.push(token);
    }

    expect(tokens.length).toBeGreaterThan(1);
    expect(tokens.every((token) => token.conversationId === "c1")).toBe(true);
    expect(tokens.slice(0, -1).every((token) => token.done === false)).toBe(true);
    expect(tokens.at(-1)).toEqual({ conversationId: "c1", delta: "", done: true });
    expect(tokens.map((token) => token.delta).join("")).not.toHaveLength(0);
  });

  it("never calls out to a real AI provider (no network/SDK dependency)", async () => {
    const adapter = new FakeChatAdapter();
    const tokens = [];
    for await (const token of adapter.streamReply({
      conversationId: "c2",
      anonymizedMessages: [],
      systemPrompt: "system prompt",
    })) {
      tokens.push(token);
    }
    expect(tokens.at(-1)?.done).toBe(true);
  });
});

describe("FakeChatAdapter canned replies", () => {
  async function replyFor(messageCount: number): Promise<string> {
    const adapter = new FakeChatAdapter();
    const messages = Array.from({ length: messageCount }, () => ({
      role: "user" as const,
      content: "oi",
    }));
    let text = "";
    for await (const token of adapter.streamReply({
      conversationId: "b3f1c2b0-1234-4a5b-9c6d-000000000001",
      anonymizedMessages: messages,
      systemPrompt: "",
    })) {
      text += token.delta;
    }
    return text;
  }

  it("does not open any canned reply with a banned stock phrase", async () => {
    for (let i = 0; i < 3; i += 1) {
      const reply = await replyFor(i);
      expect(reply).not.toMatch(/^(entendo|entendi|sinto muito|obrigad[oa] por|é importante)/i);
    }
  });

  it("does not end every canned reply with a question", async () => {
    const replies = await Promise.all([replyFor(0), replyFor(1), replyFor(2)]);
    const endingInQuestion = replies.filter((reply) => reply.trim().endsWith("?"));

    expect(endingInQuestion.length).toBeLessThan(replies.length);
  });

  it("uses no markdown or list formatting", async () => {
    for (let i = 0; i < 3; i += 1) {
      const reply = await replyFor(i);
      expect(reply).not.toMatch(/[*_#]|^\s*[-•\d]\.\s/m);
    }
  });
});
