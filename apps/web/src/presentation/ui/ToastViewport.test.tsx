import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastViewport } from './ToastViewport';
import { MAX_VISIBLE_TOASTS, TOAST_DURATION_MS, toast, useToastStore } from '@/stores/toast.store';

describe('ToastViewport', () => {
  beforeEach(() => {
    useToastStore.getState().clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('anchors the stack to the bottom right, where a toast belongs, not to the top of the page', () => {
    render(<ToastViewport />);
    const viewport = screen.getByTestId('toast-viewport');
    expect(viewport.className).toContain('fixed');
    expect(viewport.className).toContain('bottom-4');
    expect(viewport.className).toContain('right-4');
  });

  it('shows a raised message and colours it by tone', () => {
    render(<ToastViewport />);

    act(() => {
      toast.success('Convite enviado para ana@zelo-demo.local.');
    });

    const row = screen.getByTestId('toast');
    expect(row).toHaveTextContent('Convite enviado para ana@zelo-demo.local.');
    expect(row.dataset.tone).toBe('success');
  });

  it('announces the newest message from a region that stays in the DOM, since a popover is display:none until shown and would announce nothing', () => {
    render(<ToastViewport />);

    act(() => {
      toast.error('Não foi possível pausar 1 gestor.');
    });

    expect(screen.getByTestId('toast-announcer')).toHaveTextContent(
      'Não foi possível pausar 1 gestor.',
    );
  });

  it('dismisses itself once its time is up, so the reader never has to clear it', () => {
    vi.useFakeTimers();
    render(<ToastViewport />);

    act(() => {
      toast.success('Setor excluído.');
    });
    expect(screen.getByTestId('toast')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(TOAST_DURATION_MS.success);
    });
    expect(screen.queryByTestId('toast')).not.toBeInTheDocument();
  });

  it('keeps an error up past the point a success would have gone, since it carries more to read', () => {
    vi.useFakeTimers();
    render(<ToastViewport />);

    act(() => {
      toast.error('Não foi possível excluir 2 setores.');
    });

    act(() => {
      vi.advanceTimersByTime(TOAST_DURATION_MS.success);
    });
    expect(screen.getByTestId('toast')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(TOAST_DURATION_MS.error - TOAST_DURATION_MS.success);
    });
    expect(screen.queryByTestId('toast')).not.toBeInTheDocument();
  });

  it('lets the reader dismiss one early without waiting out the timer', async () => {
    const user = userEvent.setup();
    render(<ToastViewport />);

    act(() => {
      toast.info('Atualizado.');
    });
    await user.click(screen.getByRole('button', { name: 'Fechar aviso' }));

    expect(screen.queryByTestId('toast')).not.toBeInTheDocument();
  });

  it('caps the stack so a burst of bulk-action results cannot bury the newest one offscreen', () => {
    render(<ToastViewport />);

    act(() => {
      for (let index = 0; index < MAX_VISIBLE_TOASTS + 3; index += 1) {
        toast.info(`Aviso ${index}`);
      }
    });

    const rows = screen.getAllByTestId('toast');
    expect(rows).toHaveLength(MAX_VISIBLE_TOASTS);
    expect(rows[0]).toHaveTextContent(`Aviso ${MAX_VISIBLE_TOASTS + 2}`);
  });
});
