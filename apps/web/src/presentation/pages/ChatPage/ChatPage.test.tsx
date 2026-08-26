import { describe, expect, it, vi } from 'vitest';
import { act, createEvent, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router';
import { ChatPage } from './ChatPage';
import * as container from '@/app/container';

const CONVERSATION_ID = '00000000-0000-4000-8000-000000000001';
const HANDOFF_LABEL = 'Falar com uma pessoa real';
const SCROLL_HEIGHT = 1200;
const CLIENT_HEIGHT = 400;
const SMOOTH_SCROLL_MS = 320;

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

// scrollHeight has to be able to grow mid-test: the whole point of the
// jump-to-bottom animation is that the transcript keeps getting taller under it.
function stubGrowableScrollGeometry(element: HTMLElement) {
  let scrollHeight = SCROLL_HEIGHT;
  let scrollTop = 0;
  Object.defineProperty(element, 'scrollHeight', { configurable: true, get: () => scrollHeight });
  Object.defineProperty(element, 'clientHeight', { configurable: true, get: () => CLIENT_HEIGHT });
  Object.defineProperty(element, 'scrollTop', {
    configurable: true,
    get: () => scrollTop,
    set: (value: number) => {
      scrollTop = value;
    },
  });
  return {
    element,
    grow: (by: number) => {
      scrollHeight += by;
    },
    top: () => scrollTop,
    setTop: (value: number) => {
      scrollTop = value;
    },
  };
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

// Drives the jump-to-bottom animation frame by frame with advancing
// timestamps. captureAnimationFrames above always passes 0, which is fine for
// the token-batching frame but would freeze an eased animation at progress 0.
// cancelAnimationFrame is stubbed too, not just requestAnimationFrame: a
// harness that ignores cancellation would replay a frame the hook had already
// torn down, and the gesture-abort path would pass without ever being run.
function driveAnimationFrames() {
  let nextId = 1;
  let queued = new Map<number, FrameRequestCallback>();
  const request = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    const id = nextId;
    nextId += 1;
    queued.set(id, callback);
    return id;
  });
  const cancel = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id: number) => {
    queued.delete(id);
  });
  return {
    pending: () => queued.size,
    step: (time: number) => {
      const running = [...queued.values()];
      queued = new Map();
      running.forEach((callback) => callback(time));
    },
    restore: () => {
      request.mockRestore();
      cancel.mockRestore();
    },
  };
}

function getScroller() {
  return screen.getByRole('region', { name: 'Conversa' });
}

// The visible counter and the sr-only live region carry the same sentence at
// the cap, so both queries must name which one they mean.
function visibleCounter() {
  return document.getElementById('chat-composer-remaining');
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

// jsdom has no layout, so the autosizing composer has to be modelled. The part
// that matters is destructive: a browser clamps scrollTop to the scrollable
// range every time it lays the element out, and `height: auto` briefly makes
// the field tall enough for its own content, so that range is momentarily zero.
// Clamping on the scrollHeight read puts it exactly where the real flush happens.
function stubAutosizeGeometry(field: HTMLTextAreaElement) {
  const LINE_HEIGHT = 24;
  const PADDING = 26;
  let scrollTop = 0;

  const contentHeight = () => field.value.split('\n').length * LINE_HEIGHT + PADDING;
  const boxHeight = () =>
    field.style.height === '' || field.style.height === 'auto'
      ? contentHeight()
      : Number.parseFloat(field.style.height);

  Object.defineProperty(field, 'clientHeight', { configurable: true, get: boxHeight });
  Object.defineProperty(field, 'scrollHeight', {
    configurable: true,
    get: () => {
      scrollTop = Math.min(scrollTop, Math.max(contentHeight() - boxHeight(), 0));
      return Math.max(contentHeight(), boxHeight());
    },
  });
  Object.defineProperty(field, 'scrollTop', {
    configurable: true,
    get: () => scrollTop,
    set: (value: number) => {
      scrollTop = value;
    },
  });

  return { bottom: () => Math.max(contentHeight() - boxHeight(), 0) };
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

    const frames = driveAnimationFrames();
    try {
      await user.click(await screen.findByRole('button', { name: /ver novas mensagens/i }));
      frames.step(0);
      frames.step(SMOOTH_SCROLL_MS);

      expect(scroller.scrollTop).toBe(SCROLL_HEIGHT);
      expect(
        screen.queryByRole('button', { name: /ver novas mensagens/i }),
      ).not.toBeInTheDocument();
    } finally {
      frames.restore();
    }
  });

  it('lands on the bottom that exists when the animation ends, not the one captured when it started', async () => {
    const { stream, release } = gatedAssistantStream();
    vi.spyOn(container.sendChatMessageUseCase, 'execute').mockReturnValue(stream);
    const user = userEvent.setup();
    renderChat();
    const scroller = stubGrowableScrollGeometry(getScroller());

    await user.type(screen.getByPlaceholderText('Escreva como você está…'), 'Estou bem');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));
    await screen.findByText('Primeira parte.');

    scroller.setTop(0);
    fireEvent.scroll(scroller.element);
    await act(async () => {
      release();
    });

    const frames = driveAnimationFrames();
    try {
      await user.click(await screen.findByRole('button', { name: /ver novas mensagens/i }));
      frames.step(0);

      // Tokens keep arriving while the pill's animation is in flight.
      scroller.grow(600);
      frames.step(SMOOTH_SCROLL_MS);

      expect(scroller.top()).toBe(SCROLL_HEIGHT + 600);
    } finally {
      frames.restore();
    }
  });

  it('does not read its own animation as the user scrolling away, which used to bring the pill straight back without ever reaching the bottom', async () => {
    const { stream, release } = gatedAssistantStream();
    vi.spyOn(container.sendChatMessageUseCase, 'execute').mockReturnValue(stream);
    const user = userEvent.setup();
    renderChat();
    const scroller = stubGrowableScrollGeometry(getScroller());

    await user.type(screen.getByPlaceholderText('Escreva como você está…'), 'Estou bem');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));
    await screen.findByText('Primeira parte.');

    scroller.setTop(0);
    fireEvent.scroll(scroller.element);
    await act(async () => {
      release();
    });

    const frames = driveAnimationFrames();
    try {
      await user.click(await screen.findByRole('button', { name: /ver novas mensagens/i }));

      // A real browser dispatches scroll on every animated frame. Each one is
      // still far from the bottom, which is what used to flip following off.
      frames.step(0);
      fireEvent.scroll(scroller.element);
      scroller.grow(600);
      fireEvent.scroll(scroller.element);
      frames.step(SMOOTH_SCROLL_MS);

      expect(scroller.top()).toBe(SCROLL_HEIGHT + 600);
      expect(
        screen.queryByRole('button', { name: /ver novas mensagens/i }),
      ).not.toBeInTheDocument();
    } finally {
      frames.restore();
    }
  });

  it('hands control back the moment the user swipes during the animation, rather than fighting them to the bottom', async () => {
    const { stream, release } = gatedAssistantStream();
    vi.spyOn(container.sendChatMessageUseCase, 'execute').mockReturnValue(stream);
    const user = userEvent.setup();
    renderChat();
    const scroller = stubGrowableScrollGeometry(getScroller());

    await user.type(screen.getByPlaceholderText('Escreva como você está…'), 'Estou bem');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));
    await screen.findByText('Primeira parte.');

    scroller.setTop(0);
    fireEvent.scroll(scroller.element);
    await act(async () => {
      release();
    });

    const frames = driveAnimationFrames();
    try {
      await user.click(await screen.findByRole('button', { name: /ver novas mensagens/i }));
      frames.step(0);

      fireEvent.wheel(scroller.element);
      scroller.setTop(0);
      fireEvent.scroll(scroller.element);
      frames.step(SMOOTH_SCROLL_MS);

      expect(scroller.top()).toBe(0);
    } finally {
      frames.restore();
    }
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

  it('does not re-run the crisis-line use case once per streamed token, which is what the chat chrome re-rendering with the transcript used to cost', async () => {
    const TOKENS = 12;
    const crisisLine = vi.spyOn(container.requestHumanHandoffUseCase, 'execute');
    vi.spyOn(container.sendChatMessageUseCase, 'execute').mockImplementation(
      streamOfTokens(TOKENS),
    );
    const user = userEvent.setup();
    renderChat();

    const beforeStream = crisisLine.mock.calls.length;

    await user.type(screen.getByPlaceholderText('Escreva como você está…'), 'Estou bem');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));
    await within(getScroller()).findByText(/t11/);

    expect(crisisLine.mock.calls.length - beforeStream).toBeLessThan(TOKENS);
    crisisLine.mockRestore();
  });

  it('collapses the action tray on send, so the conversation gets the space back without hiding the crisis lifeline', async () => {
    vi.spyOn(container.sendChatMessageUseCase, 'execute').mockReturnValue(fakeAssistantStream());
    const user = userEvent.setup();
    renderChat();

    expect(screen.getByRole('button', { name: /recolher atalhos/i })).toHaveAttribute(
      'aria-pressed',
      'false',
    );

    await user.type(screen.getByPlaceholderText('Escreva como você está…'), 'Estou bem');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));

    expect(await screen.findByRole('button', { name: /expandir atalhos/i })).toHaveAttribute(
      'aria-pressed',
      'true',
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

  it('warns as the message approaches the 2000-character cap instead of silently truncating it', async () => {
    renderChat();
    const input = screen.getByPlaceholderText('Escreva como você está…');

    expect(visibleCounter()).toBeNull();

    fireEvent.change(input, { target: { value: 'a'.repeat(1950) } });
    expect(visibleCounter()).toHaveTextContent('50 caracteres restantes');
    expect(input).toHaveAttribute('aria-describedby', 'chat-composer-keys chat-composer-remaining');

    fireEvent.change(input, { target: { value: 'a'.repeat(2000) } });
    expect(visibleCounter()).toHaveTextContent(/limite de 2000 caracteres atingido/i);
  });

  it('reserves the counter slot inside the field before the counter appears, so crossing into the warning band does not push the transcript up', () => {
    renderChat();
    const input = screen.getByPlaceholderText('Escreva como você está…');
    const slot = screen.getByTestId('composer-counter-slot');

    expect(slot).toBeEmptyDOMElement();

    fireEvent.change(input, { target: { value: 'a'.repeat(1950) } });

    expect(slot).toContainElement(visibleCounter());
  });

  it('keeps the browser spellchecker and writing extensions off the composer, since both read the raw text upstream of the anonymizer the header promises', () => {
    renderChat();
    const field = screen.getByLabelText('Mensagem');

    expect(field).toHaveAttribute('spellcheck', 'false');
    expect(field).toHaveAttribute('data-gramm', 'false');
    expect(field).toHaveAttribute('data-gramm_editor', 'false');
    expect(field).toHaveAttribute('data-enable-grammarly', 'false');
  });

  it('leaves the phone keyboard free to autocorrect, because spellcheck is the leak and autocorrect is the help a tired doctor still needs', () => {
    renderChat();
    const field = screen.getByLabelText('Mensagem');

    expect(field).not.toHaveAttribute('autocorrect');
    expect(field).not.toHaveAttribute('autocapitalize');
  });

  it('keeps the visible counter out of the live region, so a screen reader is not interrupted once per keystroke through the last 120 characters', () => {
    renderChat();
    const input = screen.getByPlaceholderText('Escreva como você está…');

    fireEvent.change(input, { target: { value: 'a'.repeat(1950) } });

    expect(visibleCounter()).not.toHaveAttribute('role', 'status');
    expect(visibleCounter()).not.toHaveAttribute('aria-live');
    expect(input).toHaveAttribute('aria-describedby', 'chat-composer-keys chat-composer-remaining');
  });

  it('mounts the live region before there is anything to say, since a region inserted alongside its first text is missed by several screen readers', () => {
    renderChat();
    const live = screen.getByTestId('composer-remaining-announcement');

    expect(live).toHaveAttribute('aria-live', 'polite');
    expect(live).toHaveAttribute('aria-atomic', 'true');
    expect(live).toHaveClass('sr-only');
    expect(live).toBeEmptyDOMElement();
  });

  it('speaks only when a threshold is crossed, so typing through the warning band costs four announcements rather than one hundred and twenty', () => {
    renderChat();
    const input = screen.getByPlaceholderText('Escreva como você está…');
    const live = screen.getByTestId('composer-remaining-announcement');

    fireEvent.change(input, { target: { value: 'a'.repeat(1879) } });
    expect(live).toBeEmptyDOMElement();

    fireEvent.change(input, { target: { value: 'a'.repeat(1880) } });
    expect(live).toHaveTextContent('120 caracteres restantes.');

    fireEvent.change(input, { target: { value: 'a'.repeat(1919) } });
    expect(live).toHaveTextContent('120 caracteres restantes.');

    fireEvent.change(input, { target: { value: 'a'.repeat(1950) } });
    expect(live).toHaveTextContent('50 caracteres restantes.');

    fireEvent.change(input, { target: { value: 'a'.repeat(1980) } });
    expect(live).toHaveTextContent('20 caracteres restantes.');

    fireEvent.change(input, { target: { value: 'a'.repeat(2000) } });
    expect(live).toHaveTextContent('Limite de 2000 caracteres atingido.');
  });

  it('reports where a paste actually landed rather than the threshold it skipped past', () => {
    renderChat();
    const input = screen.getByPlaceholderText('Escreva como você está…');

    fireEvent.change(input, { target: { value: 'a'.repeat(1997) } });

    expect(screen.getByTestId('composer-remaining-announcement')).toHaveTextContent(
      '3 caracteres restantes.',
    );
  });

  it('stays quiet while the user deletes back across a threshold, so rephrasing near the cap does not chatter', () => {
    renderChat();
    const input = screen.getByPlaceholderText('Escreva como você está…');
    const live = screen.getByTestId('composer-remaining-announcement');

    fireEvent.change(input, { target: { value: 'a'.repeat(1985) } });
    expect(live).toHaveTextContent('15 caracteres restantes.');

    fireEvent.change(input, { target: { value: 'a'.repeat(1900) } });
    expect(live).toHaveTextContent('15 caracteres restantes.');

    fireEvent.change(input, { target: { value: 'a'.repeat(1985) } });
    expect(live).toHaveTextContent('15 caracteres restantes.');
  });

  it('rearms the warnings once the message drops clear of the band, so a second approach to the cap is announced again', () => {
    renderChat();
    const input = screen.getByPlaceholderText('Escreva como você está…');
    const live = screen.getByTestId('composer-remaining-announcement');

    fireEvent.change(input, { target: { value: 'a'.repeat(1985) } });
    expect(live).toHaveTextContent('15 caracteres restantes.');

    fireEvent.change(input, { target: { value: 'a'.repeat(500) } });
    expect(live).toBeEmptyDOMElement();

    fireEvent.change(input, { target: { value: 'a'.repeat(1900) } });
    expect(live).toHaveTextContent('100 caracteres restantes.');
  });

  it('keeps the conversation when the user leaves through a tray shortcut and comes back', async () => {
    vi.spyOn(container.sendChatMessageUseCase, 'execute').mockReturnValue(fakeAssistantStream());
    const user = userEvent.setup();
    const { unmount } = renderChat();

    await user.type(screen.getByPlaceholderText('Escreva como você está…'), 'Estou exausto');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));
    await screen.findByText('Oi, tudo bem?');

    // Leaving for /assessment or /crisis unmounts the page.
    unmount();
    renderChat();

    expect(screen.getByText('Estou exausto')).toBeInTheDocument();
    expect(screen.getByText('Oi, tudo bem?')).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Comece por onde quiser' }),
    ).not.toBeInTheDocument();
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

  it('returns focus to the composer when a successful retry unmounts the button the user was standing on', async () => {
    vi.spyOn(container.sendChatMessageUseCase, 'execute')
      .mockImplementationOnce(() => {
        async function* onlyError() {
          yield { error: 'ai_unavailable' as const };
        }
        return onlyError();
      })
      .mockImplementationOnce(() => fakeAssistantStream());
    const user = userEvent.setup();
    renderChat();

    await user.type(screen.getByLabelText('Mensagem'), 'Estou exausto');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));
    await user.click(await screen.findByRole('button', { name: /tentar de novo/i }));

    await screen.findByText('Oi, tudo bem?');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Mensagem')).toHaveFocus();
  });

  it('leaves focus on the retry button when the retry fails the same way, since the alert the user is reading never went anywhere', async () => {
    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const user = userEvent.setup();
    renderChat();

    await user.type(screen.getByLabelText('Mensagem'), 'Estou exausto');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));

    const retry = await screen.findByRole('button', { name: /tentar de novo/i });
    await user.click(retry);

    expect(await screen.findByRole('alert')).toHaveTextContent(/sem conexão/i);
    expect(retry).toHaveFocus();
    onLine.mockRestore();
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

  it('shows one alert when the crisis fallback and a stream failure land in the same attempt, so the CVV line is never stacked against a retry that competes with it', async () => {
    vi.spyOn(container.sendChatMessageUseCase, 'execute').mockImplementation(() => {
      async function* crisisThenFailure() {
        yield { error: 'crisis_fallback_required' as const };
        throw new TypeError('Failed to fetch');
      }
      return crisisThenFailure();
    });
    const user = userEvent.setup();
    renderChat();

    await user.type(screen.getByLabelText('Mensagem'), 'Não aguento mais');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));

    const alerts = await screen.findAllByRole('alert');

    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toHaveTextContent(/se você está em risco/i);
    expect(alerts[0]).not.toHaveTextContent(/não respondeu/i);
    expect(screen.queryByRole('button', { name: /tentar de novo/i })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /ligar para o cvv/i })).toHaveAttribute(
      'href',
      'tel:188',
    );
  });

  it('still returns focus to the composer when a retry surfaces the crisis fallback, since that alert carries no retry to stay on', async () => {
    vi.spyOn(container.sendChatMessageUseCase, 'execute')
      .mockImplementationOnce(() => {
        async function* onlyError() {
          yield { error: 'ai_unavailable' as const };
        }
        return onlyError();
      })
      .mockImplementationOnce(() => {
        async function* crisis() {
          yield { error: 'crisis_fallback_required' as const };
        }
        return crisis();
      });
    const user = userEvent.setup();
    renderChat();

    await user.type(screen.getByLabelText('Mensagem'), 'Não aguento mais');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));
    await user.click(await screen.findByRole('button', { name: /tentar de novo/i }));

    expect(await screen.findByRole('link', { name: /ligar para o cvv/i })).toBeInTheDocument();
    expect(screen.getByLabelText('Mensagem')).toHaveFocus();
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
    expect(screen.getByTestId('app-header')).toHaveClass('md:min-h-app-header');
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

  it('grows the composer with a long message instead of hiding it in a one-line field', async () => {
    renderChat();
    const field = screen.getByLabelText('Mensagem');

    expect(field.tagName).toBe('TEXTAREA');
    expect(field).toHaveClass('resize-none', 'max-h-38.25');
    expect(field).toHaveAttribute('rows', '1');
  });

  it('centres the send button on the field box rather than on the line of text, since the counter slot makes the box taller than the text it holds', () => {
    renderChat();
    const field = screen.getByLabelText('Mensagem');
    const row = field.parentElement?.parentElement;

    // The field's padding is deliberately lopsided — pt-3.25 (13px) against
    // pb-8.5 (34px), the latter reserving room for the character counter — so
    // the first line of text sits well above the box's own centre. Aligning
    // the button to the text (items-start) or to the bottom edge (items-end)
    // both read as misaligned against the rounded box the eye actually sees.
    expect(row).toHaveClass('items-center');
    expect(row).not.toHaveClass('items-start');
    expect(row).not.toHaveClass('items-end');
    expect(screen.getByRole('button', { name: 'Enviar' })).not.toHaveClass('mt-1');
  });

  it('measures the height cap once rather than forcing a style recalc per keystroke, and re-measures when the viewport changes so it still follows browser zoom', () => {
    renderChat();
    const field = screen.getByLabelText('Mensagem');
    const computed = vi.spyOn(window, 'getComputedStyle');
    const readsOfField = () => computed.mock.calls.filter(([element]) => element === field).length;

    fireEvent.change(field, { target: { value: 'a' } });
    fireEvent.change(field, { target: { value: 'ab' } });
    fireEvent.change(field, { target: { value: 'abc' } });
    expect(readsOfField()).toBe(0);

    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    expect(readsOfField()).toBe(1);

    computed.mockRestore();
  });

  it('keeps a long message scrolled where the caret left it, instead of snapping back to the first line on every keystroke once the field has hit its height cap', () => {
    renderChat();
    const field = screen.getByLabelText('Mensagem') as HTMLTextAreaElement;
    const geometry = stubAutosizeGeometry(field);
    const CAP_PX = 132;
    vi.spyOn(window, 'getComputedStyle').mockImplementation(
      (element: Element) =>
        (element === field
          ? { maxHeight: `${CAP_PX}px` }
          : { maxHeight: '' }) as CSSStyleDeclaration,
    );
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });

    const longMessage = Array.from({ length: 12 }, (_, line) => `linha ${line}`).join('\n');
    fireEvent.change(field, { target: { value: longMessage } });

    // What the browser does on its own before React hears about the keystroke:
    // the caret is on the last line, so the field is already scrolled to it.
    field.scrollTop = geometry.bottom();
    expect(field.scrollTop).toBeGreaterThan(0);

    fireEvent.change(field, { target: { value: `${longMessage}!` } });

    expect(field.scrollTop).toBe(geometry.bottom());
    vi.mocked(window.getComputedStyle).mockRestore();
  });

  it('keeps the overflow scrollbar clear of the rounded edge instead of letting it ride the border', () => {
    renderChat();
    expect(screen.getByLabelText('Mensagem')).toHaveClass('inset-scrollbar', 'rounded-card-lg');
  });

  it('draws the typing indicator from the same shape constant as the assistant bubble, so the two cannot drift apart', async () => {
    const gate = new Promise<void>(() => {});
    vi.spyOn(container.sendChatMessageUseCase, 'execute').mockImplementation(() => {
      async function* gatedFirstToken() {
        await gate;
        yield { conversationId: CONVERSATION_ID, delta: 'Oi.', done: true };
      }
      return gatedFirstToken();
    });
    const user = userEvent.setup();
    renderChat();

    await user.type(screen.getByLabelText('Mensagem'), 'Estou bem');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));

    expect(await screen.findByTestId('assistant-typing')).toHaveClass(
      'rounded-[20px]',
      'rounded-bl-md',
      'bg-surface',
      'shadow-card',
    );
  });

  it('sizes the composer action on the system 44px control height rather than a bespoke 46px', () => {
    renderChat();

    expect(screen.getByRole('button', { name: 'Enviar' })).toHaveClass('h-11', 'w-11');
  });

  it('hangs the header gutter outside the reading column, so its content shares a left edge with the bubbles instead of sitting inboard of them on a wide window', () => {
    renderChat();
    const header = screen.getByTestId('app-header');

    expect(header).toHaveClass('px-4');
    expect(header.firstElementChild).toHaveClass('max-w-chat', 'mx-auto');
    expect(header.firstElementChild?.className).not.toMatch(/(^|\s)(px-|pl-|pr-|p-\[)/);
  });

  it('keeps the tray shortcuts on the same column as the conversation rather than padding them in by another 16px', () => {
    renderChat();
    const tray = screen.getByTestId('chat-action-tray');

    expect(tray.parentElement).toHaveClass('px-4');
    expect(tray.firstElementChild).toHaveClass('max-w-chat');
    expect(tray.firstElementChild?.className).not.toMatch(/(^|\s)(px-|pl-|pr-)/);
  });

  it('anchors the tray tab to the column and to its own height, so it tracks the conversation on a wide window and stays welded to the border on a short one', () => {
    renderChat();
    const tab = screen.getByRole('button', { name: /recolher atalhos/i });

    expect(tab).toHaveClass('-top-7', 'h-7', 'right-0');
    expect(tab.parentElement).toHaveClass('max-w-chat', 'relative');
  });

  it('keeps the disclaimer band on the 4px spacing scale', () => {
    renderChat();
    const band = screen.getByText(/não substitui atendimento profissional/i).parentElement;

    expect(band).toHaveClass('px-4', 'py-2');
    expect(band).not.toHaveClass('p-2.25');
  });

  it('gives the anonymity promise one brand signature wherever it appears, instead of the faintest gray on the page', () => {
    renderChat();
    const promises = [
      screen.getByTestId('app-header-subtitle'),
      ...screen.getAllByTestId('anonymity-note'),
    ];

    expect(promises).toHaveLength(2);
    promises.forEach((promise) => expect(promise).toHaveClass('text-brand'));
  });

  it('tints the typing dots with the assistant voice rather than leaving them as gray system chrome', async () => {
    const gate = new Promise<void>(() => {});
    vi.spyOn(container.sendChatMessageUseCase, 'execute').mockImplementation(() => {
      async function* gatedFirstToken() {
        await gate;
        yield { conversationId: CONVERSATION_ID, delta: 'Oi.', done: true };
      }
      return gatedFirstToken();
    });
    const user = userEvent.setup();
    renderChat();

    await user.type(screen.getByLabelText('Mensagem'), 'Estou bem');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));

    expect(await screen.findByTestId('assistant-typing')).toHaveClass('text-brand');
  });

  it('keeps the typing dots animating under reduced motion, since the indicator is aria-hidden and the live region that would replace it is invisible to a sighted user', async () => {
    const gate = new Promise<void>(() => {});
    vi.spyOn(container.sendChatMessageUseCase, 'execute').mockImplementation(() => {
      async function* gatedFirstToken() {
        await gate;
        yield { conversationId: CONVERSATION_ID, delta: 'nunca chega', done: true };
      }
      return gatedFirstToken();
    });
    const user = userEvent.setup();
    renderChat();

    await user.type(screen.getByPlaceholderText('Escreva como você está…'), 'Estou bem');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));

    const dots = (await screen.findByTestId('assistant-typing')).querySelectorAll('span');

    expect(dots).toHaveLength(3);
    dots.forEach((dot) => expect(dot).toHaveClass('motion-essential'));
  });

  it('keeps the standing disclaimer and the offline alert on different palettes, so two identical blocks never stack meaning unrelated things', async () => {
    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    vi.spyOn(container.sendChatMessageUseCase, 'execute').mockImplementation(() => {
      async function* offline() {
        yield { error: 'ai_unavailable' as const };
      }
      return offline();
    });
    const user = userEvent.setup();
    renderChat();

    await user.type(screen.getByLabelText('Mensagem'), 'Estou exausto');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveClass('bg-surface-brand');
    expect(alert).not.toHaveClass('bg-warn-bg');
    expect(screen.getByText(/não substitui atendimento profissional/i).parentElement).toHaveClass(
      'bg-warn-bg',
    );
    onLine.mockRestore();
  });

  it('drops the text caret for an arrow over the scrollbar, so it reads as draggable rather than as more text to click into', () => {
    renderChat();
    const field = screen.getByLabelText('Mensagem');
    Object.defineProperty(field, 'clientWidth', { configurable: true, value: 300 });

    const overText = createEvent.mouseMove(field);
    Object.defineProperty(overText, 'offsetX', { value: 120 });
    fireEvent(field, overText);
    expect(field).not.toHaveClass('cursor-default');

    const overScrollbar = createEvent.mouseMove(field);
    Object.defineProperty(overScrollbar, 'offsetX', { value: 308 });
    fireEvent(field, overScrollbar);
    expect(field).toHaveClass('cursor-default');

    fireEvent.mouseLeave(field);
    expect(field).not.toHaveClass('cursor-default');
  });

  it('sends on Enter and keeps Shift+Enter for a new paragraph', async () => {
    const execute = vi
      .spyOn(container.sendChatMessageUseCase, 'execute')
      .mockReturnValue(fakeAssistantStream());
    const user = userEvent.setup();
    renderChat();

    const field = screen.getByLabelText('Mensagem');
    await user.type(field, 'primeira linha{Shift>}{Enter}{/Shift}segunda linha');
    expect(field).toHaveValue('primeira linha\nsegunda linha');
    expect(execute).not.toHaveBeenCalled();

    await user.type(field, '{Enter}');
    expect(await screen.findByTestId('chat-bubble-user')).toHaveTextContent(
      'primeira linha segunda linha',
    );
    expect(execute.mock.calls[0]?.[0].rawUserText).toBe('primeira linha\nsegunda linha');
    expect(field).toHaveValue('');
  });

  it('says why Enter did nothing mid-reply, rather than swallowing the keystroke silently', async () => {
    const { stream, release } = gatedAssistantStream();
    vi.spyOn(container.sendChatMessageUseCase, 'execute').mockReturnValue(stream);
    const user = userEvent.setup();
    renderChat();

    const field = screen.getByLabelText('Mensagem');
    await user.type(field, 'Estou bem');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));
    await screen.findByText('Primeira parte.');

    await user.type(field, 'mais uma{Enter}');
    expect(screen.getByText(/espere a resposta terminar/i)).toBeInTheDocument();

    await act(async () => {
      release();
    });
    await screen.findByText('Primeira parte. Segunda parte.');
    expect(screen.queryByText(/espere a resposta terminar/i)).not.toBeInTheDocument();
  });

  it('offers a way out of a reply that is still arriving, and keeps the part that did arrive marked as cut off', async () => {
    const { stream, release } = gatedAssistantStream();
    vi.spyOn(container.sendChatMessageUseCase, 'execute').mockReturnValue(stream);
    const user = userEvent.setup();
    renderChat();

    await user.type(screen.getByLabelText('Mensagem'), 'Estou bem');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));
    await screen.findByText('Primeira parte.');

    await user.click(screen.getByRole('button', { name: 'Parar resposta' }));

    expect(await screen.findByTestId('chat-reply-interrupted')).toBeInTheDocument();
    expect(screen.getByText('Primeira parte.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enviar' })).toBeInTheDocument();
    release();
  });

  it('keeps CVV 188 dialable when the failure was the device being offline, since the call does not need the network', async () => {
    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    vi.spyOn(container.sendChatMessageUseCase, 'execute').mockImplementation(() => {
      async function* offline() {
        yield { error: 'ai_unavailable' as const };
      }
      return offline();
    });
    const user = userEvent.setup();
    renderChat();

    await user.type(screen.getByLabelText('Mensagem'), 'Estou exausto');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/sem conexão/i);
    expect(alert).not.toHaveTextContent(/não respondeu/i);
    expect(within(alert).getByRole('link', { name: /ligar para o cvv/i })).toHaveAttribute(
      'href',
      'tel:188',
    );
    expect(within(alert).getByRole('button', { name: /tentar de novo/i })).toBeInTheDocument();
    onLine.mockRestore();
  });

  it('fails fast when the device is already offline, instead of holding a doctor in distress at a typing indicator for the full 45s stall timeout', async () => {
    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const execute = vi.spyOn(container.sendChatMessageUseCase, 'execute');
    const user = userEvent.setup();
    renderChat();

    await user.type(screen.getByLabelText('Mensagem'), 'Estou exausto');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/sem conexão/i);
    expect(execute).not.toHaveBeenCalled();
    expect(screen.queryByTestId('assistant-typing')).not.toBeInTheDocument();
    expect(screen.getByText('Estou exausto')).toBeInTheDocument();
    onLine.mockRestore();
  });

  it('notices the connection coming back on its own, rather than asking a user underground to keep guessing when to retry', async () => {
    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const user = userEvent.setup();
    renderChat();

    await user.type(screen.getByLabelText('Mensagem'), 'Estou exausto');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/você está sem conexão/i);

    onLine.mockReturnValue(true);
    act(() => {
      window.dispatchEvent(new Event('online'));
    });

    expect(alert).toHaveTextContent(/a conexão voltou/i);
    expect(alert).not.toHaveTextContent(/você está sem conexão/i);
    expect(within(alert).getByRole('button', { name: /tentar de novo/i })).toBeInTheDocument();
    expect(within(alert).getByRole('link', { name: /ligar para o cvv/i })).toHaveAttribute(
      'href',
      'tel:188',
    );
    onLine.mockRestore();
  });

  it('announces the tray tab as a density toggle rather than a disclosure, since neither state hides either shortcut from a screen reader', async () => {
    const user = userEvent.setup();
    renderChat();

    const tab = screen.getByRole('button', { name: /recolher atalhos/i });
    expect(tab).not.toHaveAttribute('aria-expanded');
    expect(tab).not.toHaveAttribute('aria-controls');

    expect(screen.getByRole('button', { name: HANDOFF_LABEL })).toBeInTheDocument();
    await user.click(tab);
    expect(screen.getByRole('button', { name: HANDOFF_LABEL })).toBeInTheDocument();
  });

  // IBM Plex Mono's advance is a uniform 0.6em, so mono-data (12px) costs
  // exactly 7.2px per character and the header's width budget is arithmetic:
  // 360px − 32 (px-4) − 44 (back) − 12 − 12 − 44 (theme) − 19 (lock + gap) = 197px.
  it('keeps the header anonymity promise inside the width a 360px phone leaves once the theme switch has taken its 56px', () => {
    const NARROWEST_PHONE = 360;
    const CHROME = 32 + 44 + 12 + 12 + 44 + 19;
    const MONO_ADVANCE = 0.6 * 12;

    renderChat();
    const header = screen.getByTestId('app-header');
    const promise = within(header).getByTestId('app-header-subtitle').textContent ?? '';

    expect(promise).toBe('anonimizado antes do envio');
    expect(promise.length * MONO_ADVANCE).toBeLessThanOrEqual(NARROWEST_PHONE - CHROME);
  });

  it('makes the anonymity promise the only part of the header that yields at 320px, so the theme switch can never squeeze itself or push the header onto a second line', () => {
    renderChat();
    const header = screen.getByTestId('app-header');
    const row = header.firstElementChild;
    const theme = within(header).getByTestId('theme-switch');
    const subtitle = within(header).getByTestId('app-header-subtitle');

    expect(row?.children).toHaveLength(2);
    expect(theme).toHaveClass('min-w-11');
    expect(theme.parentElement).toHaveClass('flex-none');
    expect(subtitle.parentElement).toHaveClass('min-w-0');
    expect(subtitle).toHaveClass('min-w-0', 'truncate');
  });

  it('lets the header anonymity promise shrink, since truncate alone never overrides a flex item min-width and the line would push the header past its 65px', () => {
    renderChat();
    const header = screen.getByTestId('app-header');
    const subtitle = within(header).getByTestId('app-header-subtitle');

    expect(subtitle).toHaveClass('min-w-0', 'truncate');
  });
});
