import { useCallback, useEffect, useRef, useState } from 'react';
import type { AnonymizedMessage } from '@zelo/domain';
import { sendChatMessageUseCase } from '@/app/container';
import { isChatErrorEvent } from '@/ports/chat-gateway.port';

export interface ChatUiMessage {
  role: 'user' | 'assistant';
  content: string;
}

const MAX_MESSAGE_LENGTH = 2000;

/**
 * Uses plain React state instead of TanStack Query: TanStack Query models a
 * single request → response cycle, but this hook consumes an incremental
 * token stream and must re-render on every chunk. The spec's "TanStack Query
 * lives in presentation/hooks" rule is honored in spirit — this is still the
 * hooks layer, just using the primitive that actually fits a streaming case.
 */
export function useChatConversation(conversationId: string) {
  const [messages, setMessages] = useState<ChatUiMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [crisisFallback, setCrisisFallback] = useState(false);
  const [providerError, setProviderError] = useState(false);
  const isStreamingRef = useRef(false);

  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const runStream = useCallback(
    async (history: ChatUiMessage[], rawUserText: string, hasActiveRiskSignal: boolean) => {
      const anonymizableHistory: AnonymizedMessage[] = history.map((message) => ({
        role: message.role,
        content: message.content,
      }));

      isStreamingRef.current = true;
      setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);
      setIsStreaming(true);
      setProviderError(false);
      setCrisisFallback(false);

      let assistantContent = '';
      let providerResponded = false;

      try {
        for await (const event of sendChatMessageUseCase.execute({
          conversationId,
          history: anonymizableHistory,
          rawUserText,
          hasActiveRiskSignal,
        })) {
          providerResponded = true;

          if (isChatErrorEvent(event)) {
            if (event.error === 'crisis_fallback_required') {
              setCrisisFallback(true);
            } else {
              setProviderError(true);
            }
            continue;
          }

          assistantContent += event.delta;
          setMessages((prev) => {
            const next = [...prev];
            next[next.length - 1] = { role: 'assistant', content: assistantContent };
            return next;
          });
        }

        if (!providerResponded) setProviderError(true);
      } catch {
        setProviderError(true);
      } finally {
        if (assistantContent.length === 0) {
          setMessages((prev) => prev.slice(0, -1));
        }
        isStreamingRef.current = false;
        setIsStreaming(false);
      }
    },
    [conversationId],
  );

  const sendMessage = useCallback(
    async (rawUserText: string, hasActiveRiskSignal: boolean) => {
      const text = rawUserText.trim().slice(0, MAX_MESSAGE_LENGTH);
      if (text.length === 0 || isStreamingRef.current) return;

      const history = messagesRef.current;
      setMessages((prev) => [...prev, { role: 'user', content: text }]);
      await runStream(history, text, hasActiveRiskSignal);
    },
    [runStream],
  );

  const retryLastMessage = useCallback(async () => {
    if (isStreamingRef.current) return;

    const history = messagesRef.current;
    const lastMessage = history[history.length - 1];
    if (lastMessage?.role !== 'user') return;

    await runStream(history.slice(0, -1), lastMessage.content, false);
  }, [runStream]);

  return {
    messages,
    isStreaming,
    crisisFallback,
    providerError,
    sendMessage,
    retryLastMessage,
  };
}
