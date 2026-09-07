import { Inject, Injectable, Logger } from "@nestjs/common";
import type { AnonymizedMessage, ChatToken } from "@zelo/domain";
import { AI_CHAT_PORT, type AiChatPort } from "../ports/ai-chat.port.ts";
import {
  CHAT_SYSTEM_PROMPT,
  noTrailingQuestionNudge,
  openingNudge,
} from "../prompts/chat-system-prompt.ts";
import { shouldAllowTrailingQuestion } from "../tone/cadence.ts";
import { guardTone } from "../tone/guard-tone.ts";

export class AiProviderUnavailableError extends Error {
  constructor() {
    super("AI chat provider is currently unavailable");
    this.name = "AiProviderUnavailableError";
  }
}

/**
 * Thrown instead of AiProviderUnavailableError when a risk signal is already
 * active for this session — the caller (controller/frontend) must route to
 * the crisis fallback path (external line) rather than a generic error,
 * per the PRD's documented edge case for LLM outages during an active risk.
 */
export class CrisisFallbackRequiredError extends Error {
  constructor() {
    super("AI provider unavailable during an active risk signal — crisis fallback required");
    this.name = "CrisisFallbackRequiredError";
  }
}

export interface SendChatMessageParams {
  conversationId: string;
  anonymizedMessages: AnonymizedMessage[];
  hasActiveRiskSignal: boolean;
}

class EmptyReplyError extends Error {
  constructor() {
    super("AI reply produced no visible content");
    this.name = "EmptyReplyError";
  }
}

async function* rejectEmptyReply(source: AsyncGenerator<ChatToken>): AsyncGenerator<ChatToken> {
  const held: ChatToken[] = [];
  let content = "";
  let flushed = false;

  for await (const token of source) {
    if (flushed) {
      yield token;
      continue;
    }

    held.push(token);
    content += token.delta;

    if (content.trim().length > 0) {
      yield* held;
      held.length = 0;
      flushed = true;
      continue;
    }

    if (token.done) {
      throw new EmptyReplyError();
    }
  }
}

@Injectable()
export class SendChatMessageUseCase {
  private readonly logger = new Logger(SendChatMessageUseCase.name);

  constructor(@Inject(AI_CHAT_PORT) private readonly aiChat: AiChatPort) {}

  async *execute(params: SendChatMessageParams): AsyncGenerator<ChatToken> {
    const priorAssistantReplies = params.anonymizedMessages
      .filter((message) => message.role === "assistant")
      .map((message) => message.content);

    const cadenceNudge =
      params.hasActiveRiskSignal || shouldAllowTrailingQuestion(priorAssistantReplies)
        ? ""
        : noTrailingQuestionNudge();

    const requestReply = (nudge?: string): AsyncGenerator<ChatToken> =>
      this.aiChat.streamReply({
        conversationId: params.conversationId,
        anonymizedMessages: params.anonymizedMessages,
        systemPrompt: CHAT_SYSTEM_PROMPT + (nudge ?? "") + cadenceNudge,
      });

    try {
      yield* rejectEmptyReply(
        guardTone(requestReply, {
          conversationId: params.conversationId,
          hasActiveRiskSignal: params.hasActiveRiskSignal,
          priorAssistantReplies,
          buildNudge: openingNudge,
          onTell: (rule) => this.logger.log(`tone_guard rule=${rule}`),
        }),
      );
    } catch (error) {
      this.logger.error(`chat_stream_failed error=${error instanceof Error ? error.name : "unknown"}`);
      if (params.hasActiveRiskSignal) {
        throw new CrisisFallbackRequiredError();
      }
      throw new AiProviderUnavailableError();
    }
  }
}
