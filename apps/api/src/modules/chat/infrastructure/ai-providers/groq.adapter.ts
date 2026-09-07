import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Groq from "groq-sdk";
import type { AiChatPort } from "@/modules/chat/application/ports/ai-chat.port.js";
import type { AnonymizedMessage, ChatToken } from "@zelo/domain";

/**
 * Sole AI_CHAT_PORT implementation — free-tier, chosen for hackathon
 * development cost reasons. Groq's chat-completions API is OpenAI-compatible,
 * so AnonymizedMessage's "user"/"assistant" roles map through unchanged.
 */
@Injectable()
export class GroqAdapter implements AiChatPort {
  private readonly client: Groq;
  private readonly model: string;

  constructor(@Inject(ConfigService) config: ConfigService) {
    this.client = new Groq({ apiKey: config.getOrThrow<string>("GROQ_API_KEY") });
    this.model = config.get<string>("GROQ_MODEL") ?? "openai/gpt-oss-120b";
  }

  async *streamReply(params: {
    conversationId: string;
    anonymizedMessages: AnonymizedMessage[];
    systemPrompt: string;
  }): AsyncGenerator<ChatToken> {
    const stream = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: 512,
      // 0.8 was chosen to break the low-variance phrase looping that feeds the
      // "feels like a robot" tell this project's user research flagged (ENT-01,
      // persona.md). It was calibrated against Llama-family models, which Groq
      // has since discontinued; the 2026-09-07 tell inventory re-measured the
      // three replacement candidates at this same temperature and found stock
      // openers at 1/14 but replies ending in a question at 79-100%. Temperature
      // does not fix the latter — see application/tone/ for the guard that does.
      temperature: 0.8,
      stream: true,
      messages: [
        { role: "system", content: params.systemPrompt },
        ...params.anonymizedMessages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
      ],
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        yield { conversationId: params.conversationId, delta, done: false };
      }
    }

    yield { conversationId: params.conversationId, delta: "", done: true };
  }
}
