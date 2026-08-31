import { memo, type ReactNode } from 'react';
import { BUBBLE_BODY, OTHER_BUBBLE, OWN_BUBBLE } from './message-bubble';

interface MessageBubbleProps {
  // "own" is whoever is holding the phone; "other" is the AI or the peer. Kept
  // neutral so the same bubble serves both transcripts.
  side: 'own' | 'other';
  content: string;
  testId: string;
  // Extra breathing room where a new exchange starts.
  startsExchange?: boolean;
  children?: ReactNode;
}

export const MessageBubble = memo(function MessageBubble({
  side,
  content,
  testId,
  startsExchange = false,
  children,
}: MessageBubbleProps) {
  const rhythm = startsExchange ? 'mt-3 short:mt-1.5' : '';
  const tone = side === 'own' ? OWN_BUBBLE : `${OTHER_BUBBLE} text-ink`;

  return (
    <div data-testid={testId} className={`${BUBBLE_BODY} ${rhythm} ${tone}`}>
      {content}
      {children}
    </div>
  );
});
