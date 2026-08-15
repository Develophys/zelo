import { describe, expect, it, vi, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
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
    await waitFor(() => expect(result.current.providerError).toBe(true));

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
