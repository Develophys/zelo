import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BulkDeleteConfirmModal } from './BulkDeleteConfirmModal';
import type { UseBulkDelete } from './useBulkDelete';

function bulk(overrides: Partial<UseBulkDelete> = {}): UseBulkDelete {
  return {
    deleteTarget: { ids: ['a'] },
    deleteBusy: false,
    deleteMessage: null,
    deleteCount: 1,
    deleteTitle: 'Excluir gestor?',
    openDeleteConfirm: vi.fn(),
    closeDeleteConfirm: vi.fn(),
    confirmDelete: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('BulkDeleteConfirmModal', () => {
  it('stays closed while nothing is targeted for deletion', () => {
    render(<BulkDeleteConfirmModal bulk={bulk({ deleteTarget: null })} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it("opens under the hook's own title and warns that the deletion is final", () => {
    render(<BulkDeleteConfirmModal bulk={bulk()} />);

    expect(screen.getByRole('dialog', { name: 'Excluir gestor?' })).toBeInTheDocument();
    expect(screen.getByText('Esta ação não pode ser desfeita.')).toBeInTheDocument();
  });

  it('cancels through the hook rather than closing itself', async () => {
    const closeDeleteConfirm = vi.fn();
    const user = userEvent.setup();
    render(<BulkDeleteConfirmModal bulk={bulk({ closeDeleteConfirm })} />);

    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(closeDeleteConfirm).toHaveBeenCalledTimes(1);
  });

  it('confirms through the hook', async () => {
    const confirmDelete = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<BulkDeleteConfirmModal bulk={bulk({ confirmDelete })} />);

    await user.click(screen.getByRole('button', { name: 'Excluir' }));
    expect(confirmDelete).toHaveBeenCalledTimes(1);
  });

  // A partial failure leaves the dialog open carrying the refusal, so the text
  // has to reach assistive tech without the user hunting for it.
  it('announces a refusal message as an alert, keeping the dialog open', () => {
    render(
      <BulkDeleteConfirmModal
        bulk={bulk({ deleteMessage: '1 de 2 excluídos. Não foi possível excluir. Tente de novo.' })}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('1 de 2 excluídos.');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('shows the delete button busy while the batch runs', () => {
    render(<BulkDeleteConfirmModal bulk={bulk({ deleteBusy: true })} />);
    expect(screen.getByRole('button', { name: 'Excluir' })).toBeDisabled();
  });
});
