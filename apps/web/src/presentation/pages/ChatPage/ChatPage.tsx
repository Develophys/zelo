import { ArrowDown } from 'lucide-react';
import { useCallback, useState } from 'react';
import { PhoneShell } from '@/presentation/layout/PhoneShell';
import { useChatConversation } from '@/presentation/hooks/useChatConversation';
import { useStickToBottom } from '@/presentation/hooks/useStickToBottom';
import { AssistantTypingIndicator } from './AssistantTypingIndicator';
import { ChatActionTray } from './ChatActionTray';
import { ChatAlerts } from './ChatAlerts';
import { ChatComposer } from './ChatComposer';
import { ChatDisclaimerBanner } from './ChatDisclaimerBanner';
import { ChatEmptyState } from './ChatEmptyState';
import { ChatHeader } from './ChatHeader';
import { ChatMessageBubble } from './ChatMessageBubble';
import { CHAT_COLUMN } from './chat-column';

const CONVERSATION_ID = '00000000-0000-4000-8000-000000000001';

export function ChatPage() {
  const { messages, isStreaming, crisisFallback, providerError, sendMessage, retryLastMessage } =
    useChatConversation(CONVERSATION_ID);
  const { scrollerRef, handleScroll, hasUnseenContent, jumpToBottom, resumeFollowing } =
    useStickToBottom(messages);

  const lastMessage = messages[messages.length - 1];
  const isAwaitingReply =
    isStreaming && lastMessage?.role === 'assistant' && lastMessage.content.length === 0;
  const settledReply =
    !isStreaming && lastMessage?.role === 'assistant' ? `Resposta: ${lastMessage.content}` : '';
  const isEmpty = messages.length === 0;

  const [trayCollapsed, setTrayCollapsed] = useState(false);

  const handleSend = useCallback(
    (text: string) => {
      resumeFollowing();
      setTrayCollapsed(true);
      sendMessage(text, false);
    },
    [resumeFollowing, sendMessage],
  );

  const toggleTray = useCallback(() => setTrayCollapsed((previous) => !previous), []);

  return (
    <PhoneShell nav bleed fill bg="canvas">
      <div className="flex min-h-0 flex-1 flex-col">
        <ChatHeader />
        <ChatDisclaimerBanner />

        <div className="relative flex min-h-0 flex-1 flex-col">
          <p role="status" aria-live="polite" className="sr-only">
            {isStreaming ? 'Escrevendo…' : settledReply}
          </p>

          <div
            ref={scrollerRef}
            onScroll={handleScroll}
            role="region"
            aria-label="Conversa"
            aria-busy={isStreaming}
            tabIndex={0}
            className="no-scrollbar flex-1 overflow-y-auto p-[18px_16px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset short:p-[12px_16px]"
          >
            <div
              className={`${CHAT_COLUMN} flex flex-col gap-3 short:gap-2 ${
                isEmpty ? 'min-h-full justify-center' : ''
              }`}
            >
              {isEmpty && <ChatEmptyState />}

              {messages.map((message, index) =>
                message.content.length === 0 ? null : (
                  <ChatMessageBubble key={index} role={message.role} content={message.content} />
                ),
              )}

              {isAwaitingReply && <AssistantTypingIndicator />}

              <ChatAlerts
                providerError={providerError}
                crisisFallback={crisisFallback}
                onRetry={retryLastMessage}
              />
            </div>
          </div>

          {hasUnseenContent && (
            <button
              type="button"
              onClick={jumpToBottom}
              className="animate-rise-in absolute inset-x-0 bottom-3 mx-auto flex h-11 w-fit cursor-pointer items-center gap-1.5 rounded-pill border border-surface-brand bg-surface px-4 text-label font-semibold text-brand shadow-card-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
            >
              <ArrowDown size={16} className="shrink-0" />
              Ver novas mensagens
            </button>
          )}
        </div>

        <div className="flex flex-none flex-col border-t border-surface-brand bg-surface pt-3 short:pt-2">
          <ChatActionTray collapsed={trayCollapsed} onToggle={toggleTray} />

          {/* hasActiveRiskSignal is hardcoded false: real risk-signal detection is a separate,
              not-yet-built feature. Feeding crisisFallback back in here would be circular — that
              state only ever becomes true as a RESULT of hasActiveRiskSignal already being true. */}
          <ChatComposer isStreaming={isStreaming} onSend={handleSend} />
        </div>
      </div>
    </PhoneShell>
  );
}
