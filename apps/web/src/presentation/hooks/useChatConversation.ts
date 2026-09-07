import { useCallback, useEffect, useRef, useState } from 'react';
import type { AnonymizedMessage } from '@zelo/domain';
import { anonymizeTextUseCase, sendChatMessageUseCase } from '@/app/container';
import { isChatErrorEvent } from '@/ports/chat-gateway.port';
import { MAX_MESSAGE_LENGTH } from '@/presentation/lib/chat-limits';
import {
  nextMessageId,
  useChatConversationStore,
  type ChatUiMessage,
} from '@/stores/chat-conversation.store';

export type { ChatUiMessage };

export type ChatStreamError = 'offline' | 'provider';

const STREAM_STALL_MS = 45000;
const STREAM_DEADLINE_MS = 180000;

type StalledStep = { stalled: true };
type CancelledStep = { cancelled: true };

function timerSignal<T>(ms: number, value: T) {
  let timer: ReturnType<typeof setTimeout>;
  const promise = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(value), ms);
  });
  return { promise, clear: () => clearTimeout(timer) };
}

function manualSignal<T>(value: T) {
  let fire!: () => void;
  const promise = new Promise<T>((resolve) => {
    fire = () => resolve(value);
  });
  return { promise, fire };
}

function closeStream(stream: { return?: (value: never) => unknown }) {
  void Promise.resolve(stream.return?.(undefined as never)).catch(() => undefined);
}

function classifyStreamError(): ChatStreamError {
  return typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'provider';
}

/**
 * Uses plain React state instead of TanStack Query: TanStack Query models a
 * single request → response cycle, but this hook consumes an incremental
 * token stream and must re-render on every chunk. The spec's "TanStack Query
 * lives in presentation/hooks" rule is honored in spirit — this is still the
 * hooks layer, just using the primitive that actually fits a streaming case.
 */
export function useChatConversation(conversationId: string) {
  const messages = useChatConversationStore((state) => state.messages);
  const setMessages = useChatConversationStore((state) => state.setMessages);
  const [isStreaming, setIsStreaming] = useState(false);
  const [crisisFallback, setCrisisFallback] = useState(false);
  const [streamError, setStreamError] = useState<ChatStreamError | null>(null);
  const isStreamingRef = useRef(false);
  const abortedRef = useRef(false);
  const cancelRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    abortedRef.current = false;
    return () => {
      abortedRef.current = true;
      cancelRef.current?.();
    };
  }, []);

  const readMessages = useCallback(() => useChatConversationStore.getState().messages, []);

  const runStream = useCallback(
    async (history: ChatUiMessage[], rawUserText: string, hasActiveRiskSignal: boolean) => {
      if (classifyStreamError() === 'offline') {
        setCrisisFallback(false);
        setStreamError('offline');
        return;
      }

      const anonymizableHistory: AnonymizedMessage[] = history.map((message) => ({
        role: message.role,
        content: message.content,
      }));

      const replyId = nextMessageId();
      isStreamingRef.current = true;
      setMessages((prev) => [...prev, { id: replyId, role: 'assistant', content: '' }]);
      setIsStreaming(true);
      setStreamError(null);
      setCrisisFallback(false);

      const cancellation = manualSignal<CancelledStep>({ cancelled: true });
      cancelRef.current = cancellation.fire;
      const deadline = timerSignal<StalledStep>(STREAM_DEADLINE_MS, { stalled: true });

      let assistantContent = '';
      let providerResponded = false;
      let cancelled = false;
      let completed = false;
      let errored = false;

      const stream = sendChatMessageUseCase.execute({
        conversationId,
        history: anonymizableHistory,
        rawUserText,
        hasActiveRiskSignal,
      });

      try {
        while (true) {
          const stall = timerSignal<StalledStep>(STREAM_STALL_MS, { stalled: true });
          const step = await Promise.race([
            stream.next(),
            stall.promise,
            deadline.promise,
            cancellation.promise,
          ]);
          stall.clear();

          if ('cancelled' in step) {
            cancelled = true;
            closeStream(stream);
            break;
          }
          if ('stalled' in step) {
            closeStream(stream);
            setStreamError(classifyStreamError());
            break;
          }
          if (step.done) {
            completed = true;
            break;
          }
          if (abortedRef.current) {
            closeStream(stream);
            return;
          }

          const event = step.value;
          providerResponded = true;

          if (isChatErrorEvent(event)) {
            errored = true;
            if (event.error === 'crisis_fallback_required') {
              setCrisisFallback(true);
            } else {
              setStreamError(classifyStreamError());
            }
            continue;
          }

          assistantContent += event.delta;
          setMessages((prev) =>
            prev.map((message) =>
              message.id === replyId ? { ...message, content: assistantContent } : message,
            ),
          );
        }

        if (!cancelled && !providerResponded) setStreamError(classifyStreamError());
      } catch {
        setStreamError(classifyStreamError());
      } finally {
        deadline.clear();
        cancelRef.current = null;
        if (assistantContent.length === 0) {
          setMessages((prev) => prev.filter((message) => message.id !== replyId));
        } else if (!completed || errored) {
          setMessages((prev) =>
            prev.map((message) =>
              message.id === replyId ? { ...message, interrupted: true } : message,
            ),
          );
        }
        isStreamingRef.current = false;
        setIsStreaming(false);
      }
    },
    [conversationId, setMessages],
  );

  const sendMessage = useCallback(
    async (rawUserText: string, hasActiveRiskSignal: boolean) => {
      const text = rawUserText.trim().slice(0, MAX_MESSAGE_LENGTH);
      if (text.length === 0 || isStreamingRef.current) return;

      // Redacted before it ever reaches the transcript, not just before the
      // network call — otherwise the médico's own sent bubble is the one
      // place the anonymization claim has no visible evidence.
      const anonymized = anonymizeTextUseCase.execute(text);
      const history = readMessages();
      setMessages((prev) => [...prev, { id: nextMessageId(), role: 'user', content: anonymized }]);
      await runStream(history, anonymized, hasActiveRiskSignal);
    },
    [readMessages, runStream, setMessages],
  );

  const retryLastMessage = useCallback(async () => {
    if (isStreamingRef.current) return;

    const stored = readMessages();
    let lastUserIndex = -1;
    for (let index = stored.length - 1; index >= 0; index -= 1) {
      if (stored[index]?.role === 'user') {
        lastUserIndex = index;
        break;
      }
    }
    if (lastUserIndex === -1) return;

    const retried = stored[lastUserIndex] as ChatUiMessage;
    setMessages(() => stored.slice(0, lastUserIndex + 1));
    await runStream(stored.slice(0, lastUserIndex), retried.content, false);
  }, [readMessages, runStream, setMessages]);

  const cancelStream = useCallback(() => {
    cancelRef.current?.();
  }, []);

  return {
    messages,
    isStreaming,
    crisisFallback,
    streamError,
    sendMessage,
    retryLastMessage,
    cancelStream,
  };
}
