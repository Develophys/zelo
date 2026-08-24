import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useBulkDelete } from './useBulkDelete';
import { AdminDeleteConflictError } from '@/ports/manager-admin.port';
import { useToastStore } from '@/stores/toast.store';

function setup(deleteOne: (id: string) => Promise<unknown>, onSuccess?: () => void) {
  return renderHook(() => useBulkDelete({ deleteOne, noun: { singular: 'gestor' }, onSuccess }));
}

beforeEach(() => {
  useToastStore.getState().clear();
});

describe('useBulkDelete — dialog state', () => {
  it('starts closed, and opens with the requested ids', () => {
    const { result } = setup(vi.fn());
    expect(result.current.deleteTarget).toBeNull();

    act(() => result.current.openDeleteConfirm(['a', 'b']));
    expect(result.current.deleteTarget).toEqual({ ids: ['a', 'b'] });
    expect(result.current.deleteCount).toBe(2);
  });

  it('titles a single deletion in the singular, and a plural count otherwise', () => {
    const { result } = setup(vi.fn());
    act(() => result.current.openDeleteConfirm(['a']));
    expect(result.current.deleteTitle).toBe('Excluir gestor?');

    act(() => result.current.openDeleteConfirm(['a', 'b', 'c']));
    expect(result.current.deleteTitle).toBe('Excluir 3 gestores?');
  });

  it('closes and clears any pending message on close', () => {
    const { result } = setup(vi.fn());
    act(() => result.current.openDeleteConfirm(['a']));
    act(() => result.current.closeDeleteConfirm());
    expect(result.current.deleteTarget).toBeNull();
    expect(result.current.deleteMessage).toBeNull();
  });
});

describe('useBulkDelete — confirming', () => {
  it('deletes every id, calls onSuccess and closes the dialog on the happy path', async () => {
    const deleteOne = vi.fn().mockResolvedValue(undefined);
    const onSuccess = vi.fn();
    const { result } = setup(deleteOne, onSuccess);

    act(() => result.current.openDeleteConfirm(['a', 'b']));
    await act(() => result.current.confirmDelete());

    expect(deleteOne).toHaveBeenNthCalledWith(1, 'a');
    expect(deleteOne).toHaveBeenNthCalledWith(2, 'b');
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(result.current.deleteTarget).toBeNull();
  });

  it('raises a success toast naming the count and noun when every id succeeds', async () => {
    const deleteOne = vi.fn().mockResolvedValue(undefined);
    const { result } = setup(deleteOne);

    act(() => result.current.openDeleteConfirm(['a', 'b', 'c']));
    await act(() => result.current.confirmDelete());

    expect(useToastStore.getState().toasts).toEqual([
      expect.objectContaining({ tone: 'success', message: '3 gestores excluídos.' }),
    ]);
  });

  it('agrees the success toast to the singular for a single deletion', async () => {
    const deleteOne = vi.fn().mockResolvedValue(undefined);
    const { result } = setup(deleteOne);

    act(() => result.current.openDeleteConfirm(['a']));
    await act(() => result.current.confirmDelete());

    expect(useToastStore.getState().toasts).toEqual([
      expect.objectContaining({ tone: 'success', message: '1 gestor excluído.' }),
    ]);
  });

  it('keeps the dialog open and surfaces the refusal sentence when every id fails', async () => {
    const deleteOne = vi.fn().mockRejectedValue(new AdminDeleteConflictError('LAST_ADMIN'));
    const onSuccess = vi.fn();
    const { result } = setup(deleteOne, onSuccess);

    act(() => result.current.openDeleteConfirm(['a']));
    await act(() => result.current.confirmDelete());

    expect(onSuccess).not.toHaveBeenCalled();
    expect(result.current.deleteTarget).toEqual({ ids: ['a'] });
    expect(result.current.deleteMessage).toBe(
      'Este é o último administrador ativo do hospital. Cadastre outro antes de excluí-lo.',
    );
  });

  // The core narrowing behaviour: a retry after a partial failure must only
  // re-attempt the ids that are still refused, not the ones that already
  // succeeded.
  it('narrows the dialog to only the still-failing ids on a partial failure', async () => {
    const deleteOne = vi.fn().mockImplementation(async (id: string) => {
      if (id === 'b') throw new AdminDeleteConflictError('LAST_ADMIN');
    });
    const onSuccess = vi.fn();
    const { result } = setup(deleteOne, onSuccess);

    act(() => result.current.openDeleteConfirm(['a', 'b']));
    await act(() => result.current.confirmDelete());

    expect(onSuccess).not.toHaveBeenCalled();
    expect(result.current.deleteTarget).toEqual({ ids: ['b'] });
    expect(result.current.deleteMessage).toBe(
      '1 de 2 excluídos. Este é o último administrador ativo do hospital. Cadastre outro antes de excluí-lo.',
    );

    deleteOne.mockClear();
    deleteOne.mockResolvedValue(undefined);
    await act(() => result.current.confirmDelete());

    expect(deleteOne).toHaveBeenCalledTimes(1);
    expect(deleteOne).toHaveBeenCalledWith('b');
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(result.current.deleteTarget).toBeNull();
  });

  it('falls back to a generic message for an error that is not a delete conflict', async () => {
    const deleteOne = vi.fn().mockRejectedValue(new Error('network down'));
    const { result } = setup(deleteOne);

    act(() => result.current.openDeleteConfirm(['a']));
    await act(() => result.current.confirmDelete());

    expect(result.current.deleteMessage).toBe('Não foi possível excluir. Tente de novo.');
  });

  it('reports busy only while the deletion is in flight', async () => {
    let resolveDelete!: () => void;
    const deleteOne = vi.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveDelete = resolve;
        }),
    );
    const { result } = setup(deleteOne);

    act(() => result.current.openDeleteConfirm(['a']));
    expect(result.current.deleteBusy).toBe(false);

    let confirmPromise!: Promise<void>;
    act(() => {
      confirmPromise = result.current.confirmDelete();
    });
    expect(result.current.deleteBusy).toBe(true);

    resolveDelete();
    await act(() => confirmPromise);
    expect(result.current.deleteBusy).toBe(false);
  });
});
