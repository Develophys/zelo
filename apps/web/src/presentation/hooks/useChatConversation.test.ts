import { describe, expect, it, vi, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { useChatConversation } from './useChatConversation';
import * as container from '@/app/container';

const CONVERSATION_ID = '00000000-0000-4000-8000-000000000001';

function streamOf(deltas: string[]) {
  return async function* () {
    for (const [index, delta] of deltas.entries()) {
      yield {
        conversationId: CONVERSATION_ID,
        delta,
        done: index === deltas.length - 1,
      };
    }
  };
}

describe('useChatConversation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps sendMessage and retryLastMessage identical across every streamed token, so memoized children below them do not re-render per token', async () => {
    const deltas = ['um ', 'dois ', 'três ', 'quatro ', 'cinco'];
    vi.spyOn(container.sendChatMessageUseCase, 'execute').mockImplementation(streamOf(deltas));

    const { result } = renderHook(() => useChatConversation(CONVERSATION_ID));
    const initialSend = result.current.sendMessage;
    const initialRetry = result.current.retryLastMessage;

    await act(async () => {
      await result.current.sendMessage('Estou exausto', false);
    });

    await waitFor(() => expect(result.current.messages).toHaveLength(2));
    expect(result.current.messages[1]?.content).toBe(deltas.join(''));

    expect(result.current.sendMessage).toBe(initialSend);
    expect(result.current.retryLastMessage).toBe(initialRetry);
  });

  it('still streams a reply under StrictMode, whose double-invoked effects must not leave the abort flag stuck on', async () => {
    const deltas = ['tudo ', 'bem'];
    vi.spyOn(container.sendChatMessageUseCase, 'execute').mockImplementation(streamOf(deltas));

    const { result } = renderHook(() => useChatConversation(CONVERSATION_ID), {
      wrapper: StrictMode,
    });

    await act(async () => {
      await result.current.sendMessage('Estou exausto', false);
    });

    await waitFor(() => expect(result.current.messages).toHaveLength(2));
    expect(result.current.messages[1]?.content).toBe('tudo bem');
  });

  it('gives up on a stream that connects and then hangs, instead of leaving the composer disabled forever', async () => {
    vi.useFakeTimers();
    vi.spyOn(container.sendChatMessageUseCase, 'execute').mockImplementation(
      () =>
        ({
          next: () => new Promise(() => {}),
          return: async () => ({ done: true, value: undefined }),
          [Symbol.asyncIterator]() {
            return this;
          },
        }) as never,
    );

    const { result } = renderHook(() => useChatConversation(CONVERSATION_ID));
    act(() => {
      void result.current.sendMessage('Estou exausto', false);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(45_000);
    });

    expect(result.current.streamError).toBe('provider');
    expect(result.current.isStreaming).toBe(false);
    vi.useRealTimers();
  });

  it('gives up on a stream that dribbles a token slower than the stall window forever, which the per-chunk timer alone never catches', async () => {
    vi.useFakeTimers();
    vi.spyOn(container.sendChatMessageUseCase, 'execute').mockImplementation(
      () =>
        ({
          next: () =>
            new Promise((resolve) => {
              setTimeout(
                () => resolve({ done: false, value: { conversationId: 'c', delta: '.' } }),
                44_000,
              );
            }),
          return: async () => ({ done: true, value: undefined }),
          [Symbol.asyncIterator]() {
            return this;
          },
        }) as never,
    );

    const { result } = renderHook(() => useChatConversation(CONVERSATION_ID));
    act(() => {
      void result.current.sendMessage('Estou exausto', false);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(180_000);
    });

    expect(result.current.streamError).toBe('provider');
    expect(result.current.isStreaming).toBe(false);
    vi.useRealTimers();
  });

  it('names a failure that happened with the device offline as a connection problem, not as the AI failing to answer', async () => {
    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    vi.spyOn(container.sendChatMessageUseCase, 'execute').mockImplementation(async function* () {
      yield { error: 'ai_unavailable' as const };
    });

    const { result } = renderHook(() => useChatConversation(CONVERSATION_ID));
    await act(async () => {
      await result.current.sendMessage('Estou exausto', false);
    });

    expect(result.current.streamError).toBe('offline');
    onLine.mockRestore();
  });

  it('retries a stream that failed after streaming part of a reply, instead of leaving the retry a no-op because a half-written assistant turn is last', async () => {
    const execute = vi
      .spyOn(container.sendChatMessageUseCase, 'execute')
      .mockImplementationOnce(async function* () {
        yield { conversationId: CONVERSATION_ID, delta: 'Meio caminho', done: false };
        yield { error: 'ai_unavailable' as const };
      })
      .mockImplementationOnce(streamOf(['resposta inteira']));

    const { result } = renderHook(() => useChatConversation(CONVERSATION_ID));

    await act(async () => {
      await result.current.sendMessage('Estou exausto', false);
    });
    await waitFor(() => expect(result.current.streamError).toBe('provider'));
    expect(result.current.messages.at(-1)?.role).toBe('assistant');

    await act(async () => {
      await result.current.retryLastMessage();
    });

    await waitFor(() => expect(result.current.messages).toHaveLength(2));
    expect(result.current.messages.map((message) => message.content)).toEqual([
      'Estou exausto',
      'resposta inteira',
    ]);
    expect(execute.mock.calls[1]?.[0].rawUserText).toBe('Estou exausto');
  });

  it('marks a reply that was cut off, so a half-finished sentence is not left reading as the whole answer', async () => {
    vi.spyOn(container.sendChatMessageUseCase, 'execute').mockImplementationOnce(
      async function* () {
        yield { conversationId: CONVERSATION_ID, delta: 'Comecei a dizer que', done: false };
        yield { error: 'ai_unavailable' as const };
      },
    );

    const { result } = renderHook(() => useChatConversation(CONVERSATION_ID));
    await act(async () => {
      await result.current.sendMessage('Estou exausto', false);
    });

    await waitFor(() => expect(result.current.messages).toHaveLength(2));
    expect(result.current.messages[1]?.interrupted).toBe(true);
  });

  it('stops a stream on request and keeps what already arrived, marked as cut off', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let call = 0;

    vi.spyOn(container.sendChatMessageUseCase, 'execute').mockImplementation(
      () =>
        ({
          next: async () => {
            call += 1;
            if (call === 1) {
              return { done: false, value: { conversationId: 'c', delta: 'começo', done: false } };
            }
            await gate;
            return { done: false, value: { conversationId: 'c', delta: ' fim', done: false } };
          },
          return: async () => ({ done: true, value: undefined }),
          [Symbol.asyncIterator]() {
            return this;
          },
        }) as never,
    );

    const { result } = renderHook(() => useChatConversation(CONVERSATION_ID));
    act(() => {
      void result.current.sendMessage('Estou exausto', false);
    });
    await waitFor(() => expect(result.current.messages[1]?.content).toBe('começo'));

    await act(async () => {
      result.current.cancelStream();
    });

    await waitFor(() => expect(result.current.isStreaming).toBe(false));
    expect(result.current.messages[1]?.content).toBe('começo');
    expect(result.current.messages[1]?.interrupted).toBe(true);
    expect(result.current.streamError).toBeNull();
    release();
  });

  it('gives every message a stable identity, so a bubble is never reused for a different turn as the placeholder comes and goes', async () => {
    vi.spyOn(container.sendChatMessageUseCase, 'execute')
      .mockImplementationOnce(async function* () {
        yield { error: 'ai_unavailable' as const };
      })
      .mockImplementationOnce(streamOf(['resposta']));

    const { result } = renderHook(() => useChatConversation(CONVERSATION_ID));

    await act(async () => {
      await result.current.sendMessage('primeira', false);
    });
    const userId = result.current.messages[0]?.id;

    await act(async () => {
      await result.current.retryLastMessage();
    });

    await waitFor(() => expect(result.current.messages).toHaveLength(2));
    const ids = result.current.messages.map((message) => message.id);
    expect(result.current.messages[0]?.id).toBe(userId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('cancels an in-flight stream when the page unmounts, rather than reading it to completion in the background', async () => {
    const returnSpy = vi.fn(async () => ({ done: true, value: undefined }));
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let call = 0;

    vi.spyOn(container.sendChatMessageUseCase, 'execute').mockImplementation(
      () =>
        ({
          next: async () => {
            call += 1;
            if (call === 1) {
              return { done: false, value: { conversationId: 'c', delta: 'oi', done: false } };
            }
            await gate;
            return { done: false, value: { conversationId: 'c', delta: ' mais', done: false } };
          },
          return: returnSpy,
          [Symbol.asyncIterator]() {
            return this;
          },
        }) as never,
    );

    const { result, unmount } = renderHook(() => useChatConversation(CONVERSATION_ID));
    act(() => {
      void result.current.sendMessage('Estou exausto', false);
    });
    await waitFor(() => expect(result.current.messages).toHaveLength(2));

    unmount();
    await act(async () => {
      release();
      await Promise.resolve();
    });

    await waitFor(() => expect(returnSpy).toHaveBeenCalled());
  });

  it('still reads the up-to-date history through the ref, so the retry resends the last turn with the turns before it as context', async () => {
    const execute = vi
      .spyOn(container.sendChatMessageUseCase, 'execute')
      .mockImplementationOnce(streamOf(['primeira resposta']))
      .mockImplementationOnce(async function* () {
        yield { error: 'ai_unavailable' as const };
      })
      .mockImplementationOnce(streamOf(['segunda resposta']));

    const { result } = renderHook(() => useChatConversation(CONVERSATION_ID));

    await act(async () => {
      await result.current.sendMessage('primeira', false);
    });
    await act(async () => {
      await result.current.sendMessage('segunda', false);
    });
    await waitFor(() => expect(result.current.streamError).toBe('provider'));

    await act(async () => {
      await result.current.retryLastMessage();
    });

    await waitFor(() => expect(result.current.messages).toHaveLength(4));
    expect(result.current.messages.map((message) => message.content)).toEqual([
      'primeira',
      'primeira resposta',
      'segunda',
      'segunda resposta',
    ]);

    const retryCall = execute.mock.calls[2]?.[0];
    expect(retryCall?.rawUserText).toBe('segunda');
    expect(retryCall?.history.map((message) => message.content)).toEqual([
      'primeira',
      'primeira resposta',
    ]);
  });
});
