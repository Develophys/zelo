import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router';
import { ChatPage } from './ChatPage';

const transcript = vi.hoisted(() => ({ broken: true }));

vi.mock('./ChatEmptyState', () => ({
  ChatEmptyState: () => {
    if (transcript.broken) throw new Error('render falhou');
    return <p>Comece por onde quiser</p>;
  },
}));

const HANDOFF_LABEL = 'Falar com uma pessoa real';

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

describe('ChatPage transcript crash', () => {
  beforeEach(() => {
    transcript.broken = true;
  });

  it('keeps the escalation path alive when the transcript throws, because PRODUCT principle 2 makes the human handoff survive failures rather than share them', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});

    renderChat();

    expect(screen.getByTestId('chat-transcript-fallback')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: HANDOFF_LABEL })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Avaliar como estou' })).toBeInTheDocument();
    expect(screen.getByLabelText('Mensagem')).toBeInTheDocument();
    expect(screen.getByTestId('app-header')).toBeInTheDocument();

    log.mockRestore();
  });

  it('offers the CVV line straight from the crash panel, since a broken screen is exactly when the number should not need another tap to find', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});

    renderChat();
    const fallback = screen.getByTestId('chat-transcript-fallback');

    expect(fallback).toHaveTextContent(/não foi possível mostrar a conversa/i);
    expect(screen.getByRole('link', { name: /ligar para o cvv/i })).toHaveAttribute(
      'href',
      'tel:188',
    );

    log.mockRestore();
  });

  it('stays out of the danger palette, keeping the two-step severity ladder for the AI failing and for real risk', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});

    renderChat();
    const fallback = screen.getByTestId('chat-transcript-fallback');

    expect(fallback).toHaveClass('bg-surface-brand');
    expect(fallback).not.toHaveClass('bg-danger-bg', 'bg-danger-strong-bg');

    log.mockRestore();
  });

  it('hands focus to the restored conversation when the retry works, rather than dropping a keyboard user on the body along with the crash panel', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const user = userEvent.setup();
    renderChat();

    const retry = screen.getByRole('button', { name: /tentar de novo/i });
    transcript.broken = false;
    await user.click(retry);

    expect(screen.queryByTestId('chat-transcript-fallback')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Conversa' })).toHaveFocus();

    log.mockRestore();
  });

  it('leaves focus on the retry button when the transcript throws again, since the panel the user is reading never went away', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const user = userEvent.setup();
    renderChat();

    const retry = screen.getByRole('button', { name: /tentar de novo/i });
    await user.click(retry);

    expect(screen.getByTestId('chat-transcript-fallback')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /tentar de novo/i })).toHaveFocus();

    log.mockRestore();
  });
});
