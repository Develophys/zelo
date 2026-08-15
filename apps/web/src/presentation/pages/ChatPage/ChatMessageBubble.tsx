import { memo } from 'react';

const BUBBLE =
  'max-w-[min(80%,65ch)] rounded-[20px] p-[13px_15px] text-[14.5px] leading-normal whitespace-pre-wrap break-words';

export const ChatMessageBubble = memo(function ChatMessageBubble({
  role,
  content,
}: {
  role: 'user' | 'assistant';
  content: string;
}) {
  return role === 'user' ? (
    <div
      data-testid="chat-bubble-user"
      className={`${BUBBLE} self-end rounded-br-md bg-brand text-white`}
    >
      {content}
    </div>
  ) : (
    <div
      data-testid="chat-bubble-assistant"
      className={`${BUBBLE} self-start rounded-bl-md bg-surface text-ink shadow-card`}
    >
      {content}
    </div>
  );
});
