import { ArrowDown } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { PhoneShell } from '@/presentation/layout/PhoneShell';
import { Button } from '@/presentation/ui/Button';
import { ErrorBoundary } from '@/presentation/ui/ErrorBoundary';
import { useChatConversation } from '@/presentation/hooks/useChatConversation';
import { useOnline } from '@/presentation/hooks/useOnline';
import { useStickToBottom } from '@/presentation/hooks/useStickToBottom';
import { ChatTranscriptFallback } from './ChatTranscriptFallback';
import { AssistantTypingIndicator } from './AssistantTypingIndicator';
import { ChatActionTray } from './ChatActionTray';
import { ChatAlerts } from './ChatAlerts';
import { ChatComposer } from './ChatComposer';
import { ChatDisclaimerBanner } from './ChatDisclaimerBanner';
import { ChatEmptyState } from './ChatEmptyState';
import { ChatMessageBubble } from './ChatMessageBubble';
import { CHAT_COLUMN } from './chat-column';

const CONVERSATION_ID = '00000000-0000-4000-8000-000000000001';

export function ChatPage() {
  const {
    messages,
    isStreaming,
    crisisFallback,
    streamError,
    sendMessage,
    retryLastMessage,
    cancelStream,
  } = useChatConversation(CONVERSATION_ID);
  const { scrollerRef, handleScroll, hasUnseenContent, jumpToBottom, resumeFollowing } =
    useStickToBottom(messages);
  const isOnline = useOnline();

  const lastMessage = messages[messages.length - 1];
  const isAwaitingReply =
    isStreaming && lastMessage?.role === 'assistant' && lastMessage.content.length === 0;
  const settledReply =
    !isStreaming && lastMessage?.role === 'assistant'
      ? `${lastMessage.interrupted ? 'Resposta interrompida' : 'Resposta'}: ${lastMessage.content}`
      : '';
  const isEmpty = messages.length === 0;
  const visibleMessages = messages.filter((message) => message.content.length > 0);

  const [trayCollapsed, setTrayCollapsed] = useState(false);
  const composerFieldRef = useRef<HTMLTextAreaElement>(null);
  const awaitingRetryFocusRef = useRef(false);

  const handleSend = useCallback(
    (text: string) => {
      resumeFollowing();
      setTrayCollapsed(true);
      sendMessage(text, false);
    },
    [resumeFollowing, sendMessage],
  );

  const handleRetry = useCallback(() => {
    awaitingRetryFocusRef.current = true;
    retryLastMessage();
  }, [retryLastMessage]);

  const showsRetryButton = streamError !== null && !crisisFallback;
  useEffect(() => {
    if (showsRetryButton || !awaitingRetryFocusRef.current) return;
    awaitingRetryFocusRef.current = false;
    composerFieldRef.current?.focus();
  }, [showsRetryButton]);

  const transcriptRetriedRef = useRef(false);

  const handleTranscriptRetry = useCallback((retry: () => void) => {
    transcriptRetriedRef.current = true;
    retry();
  }, []);

  const handleTranscriptRecovered = useCallback(() => {
    transcriptRetriedRef.current = false;
    scrollerRef.current?.focus();
  }, [scrollerRef]);

  const toggleTray = useCallback(() => setTrayCollapsed((previous) => !previous), []);

  return (
    <PhoneShell nav bleed fill bg="canvas" headerColumn={CHAT_COLUMN}>
      <div className="flex min-h-0 flex-1 flex-col">
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
            <ErrorBoundary
              onRecover={handleTranscriptRecovered}
              fallback={(retry) => (
                <div className={`${CHAT_COLUMN} flex min-h-full flex-col`}>
                  <ChatTranscriptFallback
                    onRetry={() => handleTranscriptRetry(retry)}
                    focusRetry={transcriptRetriedRef.current}
                  />
                </div>
              )}
            >
              <div
                className={`${CHAT_COLUMN} flex flex-col gap-2 short:gap-1.5 ${
                  isEmpty ? 'min-h-full justify-center' : ''
                }`}
              >
                {isEmpty && <ChatEmptyState />}

                {visibleMessages.map((message, index) => (
                  <ChatMessageBubble
                    key={message.id}
                    role={message.role}
                    content={message.content}
                    interrupted={message.interrupted}
                    startsExchange={
                      index > 0 &&
                      message.role === 'user' &&
                      visibleMessages[index - 1]?.role === 'assistant'
                    }
                  />
                ))}

                {isAwaitingReply && <AssistantTypingIndicator />}

                <ChatAlerts
                  streamError={streamError}
                  crisisFallback={crisisFallback}
                  isOnline={isOnline}
                  onRetry={handleRetry}
                />
              </div>
            </ErrorBoundary>
          </div>

          {hasUnseenContent && (
            <Button
              type="button"
              variant="unstyled"
              size="sm"
              full={false}
              onClick={jumpToBottom}
              className="animate-rise-in absolute inset-x-0 bottom-3 mx-auto w-fit border border-surface-brand bg-surface text-brand shadow-card-lg focus-visible:ring-offset-2"
            >
              <ArrowDown size={16} className="shrink-0" />
              Ver novas mensagens
            </Button>
          )}
        </div>

        <div className="flex flex-none flex-col border-t border-surface-brand bg-surface">
          <ChatActionTray collapsed={trayCollapsed} onToggle={toggleTray} />

          {/* hasActiveRiskSignal is hardcoded false: real risk-signal detection is a separate,
              not-yet-built feature. Feeding crisisFallback back in here would be circular — that
              state only ever becomes true as a RESULT of hasActiveRiskSignal already being true. */}
          <ChatComposer
            isStreaming={isStreaming}
            onSend={handleSend}
            onStop={cancelStream}
            fieldRef={composerFieldRef}
          />
        </div>
      </div>
    </PhoneShell>
  );
}
