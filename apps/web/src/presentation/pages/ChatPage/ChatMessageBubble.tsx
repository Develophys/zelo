import { memo } from 'react';
import { MessageBubble } from '@/presentation/ui/MessageBubble';

/**
 * The AI transcript's bubble: shared presentation from MessageBubble, plus the
 * one thing only this surface has — a note when a streamed reply was cut off.
 */
export const ChatMessageBubble = memo(function ChatMessageBubble({
  role,
  content,
  startsExchange = false,
  interrupted = false,
}: {
  role: 'user' | 'assistant';
  content: string;
  startsExchange?: boolean;
  interrupted?: boolean;
}) {
  return (
    <MessageBubble
      side={role === 'user' ? 'own' : 'other'}
      content={content}
      testId={role === 'user' ? 'chat-bubble-user' : 'chat-bubble-assistant'}
      startsExchange={startsExchange}
    >
      {role === 'assistant' && interrupted && (
        <span
          data-testid="chat-reply-interrupted"
          className="mt-2.5 block border-t border-line pt-2 text-caption text-muted"
        >
          Resposta interrompida antes do fim.
        </span>
      )}
    </MessageBubble>
  );
});
