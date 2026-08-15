import { Injectable } from '@nestjs/common';
import type { AiChatPort } from '../../application/ports/ai-chat.port.ts';
import type { AnonymizedMessage, ChatToken } from '@zelo/domain';

const CANNED_REPLIES = [
  'Oi, tudo bem por aí? Entendi o que você compartilhou — quer me contar um pouco mais sobre como isso tem te afetado no dia a dia?',
  'Faz sentido você estar se sentindo assim. Esses últimos plantões têm sido bem pesados. O que costuma te ajudar a recarregar, mesmo que um pouco?',
  'Obrigado por confiar isso a mim. Antes de seguirmos, como está seu sono nos últimos dias?',
];

function pickReply(anonymizedMessages: AnonymizedMessage[]): string {
  const index = anonymizedMessages.length % CANNED_REPLIES.length;
  return CANNED_REPLIES[index]!;
}

/**
 * AI_CHAT_PORT implementation for local/dev testing without spending real
 * Groq tokens — see AI_PROVIDER=mock in chat.module.ts. Streams a canned
 * reply word-by-word with a short delay to mimic real token pacing.
 */
@Injectable()
export class FakeChatAdapter implements AiChatPort {
  async *streamReply(params: {
    conversationId: string;
    anonymizedMessages: AnonymizedMessage[];
    systemPrompt: string;
  }): AsyncGenerator<ChatToken> {
    const words = pickReply(params.anonymizedMessages).split(' ');

    for (const [i, word] of words.entries()) {
      await new Promise((resolve) => setTimeout(resolve, 30));
      const delta = i === 0 ? word : ` ${word}`;
      yield { conversationId: params.conversationId, delta, done: false };
    }

    yield { conversationId: params.conversationId, delta: '', done: true };
  }
}
