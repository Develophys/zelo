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

function fakeConfig(): ConfigService {
  return { getOrThrow: () => "fake-api-key", get: () => undefined } as unknown as ConfigService;
}

describe("GroqInsightAdapter", () => {
  beforeEach(() => {
    createMock.mockReset();
  });

  it("sends the system prompt, the summary, and a low temperature, and parses a valid JSON completion", async () => {
    createMock.mockResolvedValue({
      choices: [
        { message: { content: JSON.stringify({ interpretation: "texto", suggestedActions: ["ação 1", "ação 2"] }) } },
      ],
    });

    const { GroqInsightAdapter } = await import("./groq-insight.adapter.ts");
    const adapter = new GroqInsightAdapter(fakeConfig());

    const result = await adapter.generateInsight({ summary: "resumo dos dados", systemPrompt: "prompt do sistema" });

    expect(result).toEqual({ interpretation: "texto", suggestedActions: ["ação 1", "ação 2"] });
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        temperature: 0.3,
        messages: [
          { role: "system", content: "prompt do sistema" },
          { role: "user", content: "resumo dos dados" },
        ],
      }),
    );
  });

  it("throws InsightGenerationFailedError when the completion is not valid JSON", async () => {
    createMock.mockResolvedValue({ choices: [{ message: { content: "isso não é json" } }] });

    const { GroqInsightAdapter } = await import("./groq-insight.adapter.ts");
    const { InsightGenerationFailedError } = await import("../../application/ports/ai-insight.port.ts");
    const adapter = new GroqInsightAdapter(fakeConfig());

    await expect(adapter.generateInsight({ summary: "x", systemPrompt: "y" })).rejects.toBeInstanceOf(
      InsightGenerationFailedError,
    );
  });

  it("throws InsightGenerationFailedError when the JSON doesn't match the expected shape", async () => {
    createMock.mockResolvedValue({ choices: [{ message: { content: JSON.stringify({ wrong: "shape" }) } }] });

    const { GroqInsightAdapter } = await import("./groq-insight.adapter.ts");
    const { InsightGenerationFailedError } = await import("../../application/ports/ai-insight.port.ts");
    const adapter = new GroqInsightAdapter(fakeConfig());

    await expect(adapter.generateInsight({ summary: "x", systemPrompt: "y" })).rejects.toBeInstanceOf(
      InsightGenerationFailedError,
    );
  });

  it("throws InsightGenerationFailedError when the completion has no content", async () => {
    createMock.mockResolvedValue({ choices: [{ message: {} }] });

    const { GroqInsightAdapter } = await import("./groq-insight.adapter.ts");
    const { InsightGenerationFailedError } = await import("../../application/ports/ai-insight.port.ts");
    const adapter = new GroqInsightAdapter(fakeConfig());

    await expect(adapter.generateInsight({ summary: "x", systemPrompt: "y" })).rejects.toBeInstanceOf(
      InsightGenerationFailedError,
    );
  });

  it("throws InsightGenerationFailedError when the Groq API call itself fails (network/auth/rate-limit)", async () => {
    createMock.mockRejectedValue(new Error("network error"));

    const { GroqInsightAdapter } = await import("./groq-insight.adapter.ts");
    const { InsightGenerationFailedError } = await import("../../application/ports/ai-insight.port.ts");
    const adapter = new GroqInsightAdapter(fakeConfig());

    await expect(adapter.generateInsight({ summary: "x", systemPrompt: "y" })).rejects.toBeInstanceOf(
      InsightGenerationFailedError,
    );
  });
});
