import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router';
import { ChatPage } from './ChatPage';
import * as container from '@/app/container';

const CONVERSATION_ID = '00000000-0000-4000-8000-000000000001';
const HANDOFF_LABEL = 'Falar com uma pessoa real';
const SCROLL_HEIGHT = 1200;
const CLIENT_HEIGHT = 400;

function stubScrollGeometry(element: HTMLElement) {
  let scrollTop = 0;
  Object.defineProperty(element, 'scrollHeight', { configurable: true, get: () => SCROLL_HEIGHT });
  Object.defineProperty(element, 'clientHeight', { configurable: true, get: () => CLIENT_HEIGHT });
  Object.defineProperty(element, 'scrollTop', {
    configurable: true,
    get: () => scrollTop,
    set: (value: number) => {
      scrollTop = value;
    },
  });
  return element;
}

function stubScrollGeometryCountingWrites(element: HTMLElement) {
  let scrollTop = 0;
  let writes = 0;
  Object.defineProperty(element, 'scrollHeight', { configurable: true, get: () => SCROLL_HEIGHT });
  Object.defineProperty(element, 'clientHeight', { configurable: true, get: () => CLIENT_HEIGHT });
  Object.defineProperty(element, 'scrollTop', {
    configurable: true,
    get: () => scrollTop,
    set: (value: number) => {
      writes += 1;
      scrollTop = value;
    },
  });
  return { getWrites: () => writes, getScrollTop: () => scrollTop };
}

function captureAnimationFrames() {
  const queued: FrameRequestCallback[] = [];
  const spy = vi
    .spyOn(window, 'requestAnimationFrame')
    .mockImplementation((callback: FrameRequestCallback) => queued.push(callback));
  return {
    pending: () => queued.length,
    flush: () => queued.splice(0).forEach((callback) => callback(0)),
    restore: () => spy.mockRestore(),
  };
}

// Each token lands in its own macrotask, the way network chunks actually
// arrive. Yielding them synchronously instead lets React's auto-batching
// collapse the whole burst into one commit, which hides what this measures.
function streamOfTokens(count: number) {
  return async function* () {
    for (let index = 0; index < count; index += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      yield {
        conversationId: CONVERSATION_ID,
        delta: `t${index} `,
        done: index === count - 1,
      };
    }
  };
}

function getScroller() {
  return screen.getByRole('region', { name: 'Conversa' });
}

function gatedAssistantStream() {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  async function* stream() {
    yield { conversationId: CONVERSATION_ID, delta: 'Primeira parte.', done: false };
    await gate;
    yield { conversationId: CONVERSATION_ID, delta: ' Segunda parte.', done: true };
  }
  return { stream: stream(), release: () => release() };
}

function renderChat() {
  return render(
    <MemoryRouter initialEntries={['/chat']}>
      <Routes>
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/crisis" element={<div>Crisis offer screen</div>} />
        <Route path="/home" element={<div>Home screen</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

async function* fakeAssistantStream() {
  yield {
    conversationId: '00000000-0000-4000-8000-000000000001',
    delta: 'Oi, tudo bem?',
    done: true,
  };
}

describe('ChatPage', () => {
  it('always shows the non-dismissable disclaimer and the handoff shortcut', () => {
    renderChat();
    expect(screen.getByText(/não substitui atendimento profissional/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /falar com uma pessoa real/i })).toBeInTheDocument();
  });

  it('navigates to /crisis on the handoff shortcut, with no network call', async () => {
    const user = userEvent.setup();
    renderChat();
    await user.click(screen.getByRole('button', { name: /falar com uma pessoa real/i }));
    expect(screen.getByText('Crisis offer screen')).toBeInTheDocument();
  });

  it('sends a message and streams the assistant reply into a styled bubble', async () => {
    vi.spyOn(container.sendChatMessageUseCase, 'execute').mockReturnValue(fakeAssistantStream());
    const user = userEvent.setup();
    renderChat();

    await user.type(screen.getByPlaceholderText('Escreva como você está…'), 'Estou bem');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));

    expect(await screen.findByText('Estou bem')).toBeInTheDocument();
    expect(await screen.findByText('Oi, tudo bem?')).toBeInTheDocument();
  });

  it('follows the streaming reply to the bottom while the user is already at the bottom', async () => {
    vi.spyOn(container.sendChatMessageUseCase, 'execute').mockReturnValue(fakeAssistantStream());
    const user = userEvent.setup();
    renderChat();
    const scroller = stubScrollGeometry(getScroller());

    await user.type(screen.getByPlaceholderText('Escreva como você está…'), 'Estou bem');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));
    await screen.findByText('Oi, tudo bem?');

    expect(scroller.scrollTop).toBe(SCROLL_HEIGHT);
  });

  it('stops following once the user scrolls up mid-reply, and offers a way back', async () => {
    const { stream, release } = gatedAssistantStream();
    vi.spyOn(container.sendChatMessageUseCase, 'execute').mockReturnValue(stream);
    const user = userEvent.setup();
    renderChat();
    const scroller = stubScrollGeometry(getScroller());

    await user.type(screen.getByPlaceholderText('Escreva como você está…'), 'Estou bem');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));
    await screen.findByText('Primeira parte.');

    scroller.scrollTop = 0;
    fireEvent.scroll(scroller);
    await act(async () => {
      release();
    });

    await screen.findByText('Primeira parte. Segunda parte.');
    expect(scroller.scrollTop).toBe(0);
    expect(screen.getByRole('button', { name: /ver novas mensagens/i })).toBeInTheDocument();
  });

  it('returns to the bottom and dismisses the affordance when it is activated', async () => {
    const { stream, release } = gatedAssistantStream();
    vi.spyOn(container.sendChatMessageUseCase, 'execute').mockReturnValue(stream);
    const user = userEvent.setup();
    renderChat();
    const scroller = stubScrollGeometry(getScroller());

    await user.type(screen.getByPlaceholderText('Escreva como você está…'), 'Estou bem');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));
    await screen.findByText('Primeira parte.');

    scroller.scrollTop = 0;
    fireEvent.scroll(scroller);
    await act(async () => {
      release();
    });

    await user.click(await screen.findByRole('button', { name: /ver novas mensagens/i }));

    expect(scroller.scrollTop).toBe(SCROLL_HEIGHT);
    expect(screen.queryByRole('button', { name: /ver novas mensagens/i })).not.toBeInTheDocument();
  });

  it('queues one animation frame for a whole burst of streamed tokens, instead of one layout-forcing scrollTop write per commit', async () => {
    const TOKENS = 12;
    const frames = captureAnimationFrames();
    try {
      vi.spyOn(container.sendChatMessageUseCase, 'execute').mockImplementation(
        streamOfTokens(TOKENS),
      );
      const user = userEvent.setup();
      renderChat();
      const scroller = stubScrollGeometryCountingWrites(getScroller());

      await user.type(screen.getByPlaceholderText('Escreva como você está…'), 'Estou bem');
      await user.click(screen.getByRole('button', { name: 'Enviar' }));
      await within(getScroller()).findByText(/t11/);

      expect(frames.pending()).toBe(1);
      expect(scroller.getWrites()).toBe(0);

      frames.flush();

      expect(scroller.getWrites()).toBe(1);
      expect(scroller.getScrollTop()).toBe(SCROLL_HEIGHT);
    } finally {
      frames.restore();
    }
  });

  it('collapses the action tray on send, so the conversation gets the space back without hiding the crisis lifeline', async () => {
    vi.spyOn(container.sendChatMessageUseCase, 'execute').mockReturnValue(fakeAssistantStream());
    const user = userEvent.setup();
    renderChat();

    expect(screen.getByRole('button', { name: /recolher atalhos/i })).toHaveAttribute(
      'aria-expanded',
      'true',
    );

    await user.type(screen.getByPlaceholderText('Escreva como você está…'), 'Estou bem');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));

    expect(await screen.findByRole('button', { name: /expandir atalhos/i })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.getByRole('button', { name: HANDOFF_LABEL })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Avaliar como estou' })).toBeInTheDocument();
  });

  it('toggles the tray by hand and keeps both shortcuts reachable in either state', async () => {
    const user = userEvent.setup();
    renderChat();

    await user.click(screen.getByRole('button', { name: /recolher atalhos/i }));
    expect(screen.getByRole('button', { name: HANDOFF_LABEL })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /expandir atalhos/i }));
    expect(screen.getByRole('button', { name: HANDOFF_LABEL })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /recolher atalhos/i })).toBeInTheDocument();
  });

  it('still routes to /crisis from the collapsed shortcut', async () => {
    const user = userEvent.setup();
    renderChat();

    await user.click(screen.getByRole('button', { name: /recolher atalhos/i }));
    await user.click(screen.getByRole('button', { name: HANDOFF_LABEL }));

    expect(screen.getByText('Crisis offer screen')).toBeInTheDocument();
  });

  it('keeps the conversation reachable by keyboard alone', () => {
    renderChat();
    expect(getScroller()).toHaveAttribute('tabindex', '0');
  });

  it('shows a typing indicator while the first token is pending, instead of an empty bubble', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.spyOn(container.sendChatMessageUseCase, 'execute').mockImplementation(() => {
      async function* gatedFirstToken() {
        await gate;
        yield { conversationId: CONVERSATION_ID, delta: 'Oi.', done: true };
      }
      return gatedFirstToken();
    });
    const user = userEvent.setup();
    renderChat();

    await user.type(screen.getByPlaceholderText('Escreva como você está…'), 'Estou bem');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));

    expect(await screen.findByTestId('assistant-typing')).toBeInTheDocument();

    await act(async () => {
      release();
    });

    await screen.findByText('Oi.');
    expect(screen.queryByTestId('assistant-typing')).not.toBeInTheDocument();
  });

  it('invites a first message instead of opening on a blank screen', () => {
    renderChat();
    expect(screen.getByRole('heading', { name: 'Comece por onde quiser' })).toBeInTheDocument();
  });

  it('keeps the composer usable after the stream throws — an offline blip must not permanently lock sending', async () => {
    vi.spyOn(container.sendChatMessageUseCase, 'execute').mockImplementation(() => {
      async function* boom(): AsyncGenerator<never> {
        throw new TypeError('Failed to fetch');
      }
      return boom();
    });
    const user = userEvent.setup();
    renderChat();

    await user.type(screen.getByPlaceholderText('Escreva como você está…'), 'Estou exausto');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/não respondeu/i);
    await user.type(screen.getByPlaceholderText('Escreva como você está…'), 'de novo');
    expect(screen.getByRole('button', { name: 'Enviar' })).toBeEnabled();
  });

  it('leaves no empty assistant bubble behind when the reply never arrives', async () => {
    vi.spyOn(container.sendChatMessageUseCase, 'execute').mockImplementation(() => {
      async function* onlyError() {
        yield { error: 'ai_unavailable' as const };
      }
      return onlyError();
    });
    const user = userEvent.setup();
    renderChat();

    await user.type(screen.getByPlaceholderText('Escreva como você está…'), 'Estou exausto');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));
    await screen.findByRole('alert');

    expect(screen.queryAllByTestId('chat-bubble-assistant')).toHaveLength(0);
    expect(screen.getAllByTestId('chat-bubble-user')).toHaveLength(1);
  });

  it('retries the last message without duplicating it in the conversation', async () => {
    const execute = vi
      .spyOn(container.sendChatMessageUseCase, 'execute')
      .mockImplementationOnce(() => {
        async function* onlyError() {
          yield { error: 'ai_unavailable' as const };
        }
        return onlyError();
      })
      .mockImplementationOnce(() => fakeAssistantStream());
    const user = userEvent.setup();
    renderChat();

    await user.type(screen.getByPlaceholderText('Escreva como você está…'), 'Estou exausto');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));
    await user.click(await screen.findByRole('button', { name: /tentar de novo/i }));

    expect(await screen.findByText('Oi, tudo bem?')).toBeInTheDocument();
    expect(screen.getAllByText('Estou exausto')).toHaveLength(1);
    expect(execute.mock.calls[1]?.[0].history).toEqual([]);
    expect(execute.mock.calls[1]?.[0].rawUserText).toBe('Estou exausto');
  });

  it('makes CVV 188 dialable when the crisis fallback fires, so escalation works with the provider down', async () => {
    vi.spyOn(container.sendChatMessageUseCase, 'execute').mockImplementation(() => {
      async function* crisis() {
        yield { error: 'crisis_fallback_required' as const };
      }
      return crisis();
    });
    const user = userEvent.setup();
    renderChat();

    await user.type(screen.getByPlaceholderText('Escreva como você está…'), 'Não aguento mais');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));

    expect(await screen.findByRole('link', { name: /ligar para o cvv/i })).toHaveAttribute(
      'href',
      'tel:188',
    );
  });

  it('announces the settled reply once instead of narrating every streamed token', async () => {
    const { stream, release } = gatedAssistantStream();
    vi.spyOn(container.sendChatMessageUseCase, 'execute').mockReturnValue(stream);
    const user = userEvent.setup();
    renderChat();

    await user.type(screen.getByPlaceholderText('Escreva como você está…'), 'Estou bem');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));
    await screen.findByText('Primeira parte.');
    expect(screen.getByRole('status')).toHaveTextContent('Escrevendo…');

    await act(async () => {
      release();
    });

    await screen.findByText('Primeira parte. Segunda parte.');
    expect(screen.getByRole('status')).toHaveTextContent('Primeira parte. Segunda parte.');
  });

  it('wraps unbroken text inside the bubble instead of overflowing the message list', async () => {
    vi.spyOn(container.sendChatMessageUseCase, 'execute').mockReturnValue(fakeAssistantStream());
    const user = userEvent.setup();
    renderChat();

    fireEvent.change(screen.getByPlaceholderText('Escreva como você está…'), {
      target: { value: 'a'.repeat(200) },
    });
    await user.click(screen.getByRole('button', { name: 'Enviar' }));

    const bubble = await screen.findByText('a'.repeat(200));
    expect(bubble).toHaveClass('break-words', 'whitespace-pre-wrap');
  });

  it('trims surrounding whitespace before sending rather than posting padded text', async () => {
    const execute = vi
      .spyOn(container.sendChatMessageUseCase, 'execute')
      .mockReturnValue(fakeAssistantStream());
    const user = userEvent.setup();
    renderChat();

    await user.type(screen.getByPlaceholderText('Escreva como você está…'), '   Estou bem   ');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));
    await screen.findByText('Oi, tudo bem?');

    expect(execute.mock.calls[0]?.[0].rawUserText).toBe('Estou bem');
  });

  it('caps the conversation to a reading column so the two voices do not drift to opposite edges on a wide window', () => {
    renderChat();
    expect(getScroller().firstElementChild).toHaveClass('max-w-chat', 'mx-auto');
  });

  it("lets the chat own the full viewport height instead of riding the shell's scroll", () => {
    renderChat();
    expect(screen.getByTestId('phone-shell-root')).toHaveClass('h-dvh');
    expect(screen.getByTestId('phone-shell-body')).not.toHaveClass('md:max-w-170');
  });

  it('locks the chat header to the same height token as the sidebar header, so the two bottom rules line up on wide screens', () => {
    renderChat();
    expect(screen.getByTestId('chat-header')).toHaveClass('md:min-h-app-header');
    expect(screen.getByTestId('sidebar-header')).toHaveClass('md:min-h-app-header');
  });

  it('labels the composer input for screen readers rather than relying on the placeholder', () => {
    renderChat();
    expect(screen.getByLabelText('Mensagem')).toBeInTheDocument();
  });

  it('shows an assessment CTA that navigates to /assessment', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/chat']}>
        <Routes>
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/assessment" element={<div>Assessment select screen</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: /avaliar como estou/i }));
    expect(screen.getByText('Assessment select screen')).toBeInTheDocument();
  });
});
