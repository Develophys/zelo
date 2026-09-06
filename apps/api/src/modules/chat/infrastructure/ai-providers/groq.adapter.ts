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
    this.model = config.get<string>("GROQ_MODEL") ?? "llama-3.3-70b-versatile";
  }

  async *streamReply(params: {
    conversationId: string;
    anonymizedMessages: AnonymizedMessage[];
    systemPrompt: string;
  }): AsyncGenerator<ChatToken> {
    const stream = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: 512,
      // Llama-family models on Groq default to low-variance completions that
      // loop the same handful of stock phrasings turn after turn — a direct
      // contributor to the "feels like a robot" tell this project's user
      // research flagged (ENT-01, persona.md). 0.8 keeps replies coherent
      // while giving enough sampling variety that responses don't read as
      // scripted. Paired with chat-system-prompt.ts's tone rules — this alone
      // doesn't fix stock openers, the prompt does that.
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
