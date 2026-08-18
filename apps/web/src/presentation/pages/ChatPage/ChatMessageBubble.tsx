import { memo } from 'react';
import { ASSISTANT_BUBBLE, BUBBLE_BODY, USER_BUBBLE } from './chat-bubble';

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
  const rhythm = startsExchange ? 'mt-3 short:mt-1.5' : '';

  return role === 'user' ? (
    <div data-testid="chat-bubble-user" className={`${BUBBLE_BODY} ${rhythm} ${USER_BUBBLE}`}>
      {content}
    </div>
  ) : (
    <div
      data-testid="chat-bubble-assistant"
      className={`${BUBBLE_BODY} ${rhythm} ${ASSISTANT_BUBBLE} text-ink`}
    >
      {content}
      {interrupted && (
        <span
          data-testid="chat-reply-interrupted"
          className="mt-2.5 block border-t border-line pt-2 text-caption text-muted"
        >
          Resposta interrompida antes do fim.
        </span>
      )}
    </div>
  );
});
