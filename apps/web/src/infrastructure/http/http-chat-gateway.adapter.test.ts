import { describe, expect, it, vi, afterEach } from "vitest";
import { HttpChatGatewayAdapter } from "./http-chat-gateway.adapter";
import type { ChatStreamEvent } from "@/ports/chat-gateway.port";

const PARAMS = {
  conversationId: "00000000-0000-4000-8000-000000000001",
  anonymizedMessages: [{ role: "user" as const, content: "oi" }],
  hasActiveRiskSignal: false,
};

function bodyFromChunks(chunks: string[]): Response {
  const encoder = new TextEncoder();
  let index = 0;
  return {
    ok: true,
    status: 200,
    body: {
      getReader: () => ({
        read: async () =>
          index < chunks.length
            ? { value: encoder.encode(chunks[index++]), done: false }
            : { value: undefined, done: true },
        cancel: async () => undefined,
      }),
    },
  } as unknown as Response;
}

async function collect(adapter: HttpChatGatewayAdapter): Promise<ChatStreamEvent[]> {
  const events: ChatStreamEvent[] = [];
  for await (const event of adapter.streamReply(PARAMS)) {
    events.push(event);
  }
  return events;
}

describe("HttpChatGatewayAdapter", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("yields ai_unavailable instead of throwing when the device is offline — a rejected fetch must never escape the generator and strand the caller mid-stream", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(collect(new HttpChatGatewayAdapter())).resolves.toEqual([
      { error: "ai_unavailable" },
    ]);
  });

  it("treats a non-2xx response as ai_unavailable rather than parsing the error body as stream events", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 500,
      body: {} as ReadableStream,
    } as Response);

    await expect(collect(new HttpChatGatewayAdapter())).resolves.toEqual([
      { error: "ai_unavailable" },
    ]);
  });

  it("skips a malformed line instead of throwing, so one bad chunk does not kill the rest of the reply", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      bodyFromChunks([
        '{"conversationId":"c","delta":"Oi","done":false}\n',
        "{not json}\n",
        '{"conversationId":"c","delta":" tudo bem?","done":true}\n',
      ]),
    );

    await expect(collect(new HttpChatGatewayAdapter())).resolves.toEqual([
      { conversationId: "c", delta: "Oi", done: false },
      { conversationId: "c", delta: " tudo bem?", done: true },
    ]);
  });

  it("flushes a final line that arrives without a trailing newline, so the last token is not silently dropped", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      bodyFromChunks(['{"conversationId":"c","delta":"fim","done":true}']),
    );

    await expect(collect(new HttpChatGatewayAdapter())).resolves.toEqual([
      { conversationId: "c", delta: "fim", done: true },
    ]);
  });

  it("yields ai_unavailable when the stream breaks mid-read", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      body: {
        getReader: () => ({
          read: async () => {
            throw new TypeError("network error");
          },
          cancel: async () => undefined,
        }),
      },
    } as unknown as Response);

    await expect(collect(new HttpChatGatewayAdapter())).resolves.toEqual([
      { error: "ai_unavailable" },
    ]);
  });
});
