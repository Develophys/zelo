import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useInlineConfirm } from './useInlineConfirm';

function Demo() {
  const { isConfirming, triggerRef, confirmRef, requestConfirm, cancel } = useInlineConfirm();

  return isConfirming ? (
    <div ref={confirmRef} tabIndex={-1}>
      <span>Tem certeza?</span>
      <button type="button" onClick={cancel}>
        Cancelar
      </button>
    </div>
  ) : (
    <button ref={triggerRef} type="button" onClick={requestConfirm}>
      Excluir
    </button>
  );
}

describe('useInlineConfirm', () => {
  it('starts idle, with nothing to confirm', () => {
    render(<Demo />);
    expect(screen.queryByText('Tem certeza?')).not.toBeInTheDocument();
  });

  it('moves focus onto the confirm panel as soon as it appears', async () => {
    render(<Demo />);
    await userEvent.click(screen.getByRole('button', { name: 'Excluir' }));

    expect(screen.getByText('Tem certeza?').parentElement).toHaveFocus();
  });

  it('returns focus to the trigger when cancelled', async () => {
    render(<Demo />);
    await userEvent.click(screen.getByRole('button', { name: 'Excluir' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByText('Tem certeza?')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Excluir' })).toHaveFocus();
  });
});
