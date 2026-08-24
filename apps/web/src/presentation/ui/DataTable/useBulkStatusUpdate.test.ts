import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useBulkStatusUpdate } from './useBulkStatusUpdate';
import { useToastStore } from '@/stores/toast.store';

function setup(
  updateOne: (id: string, isActive: boolean) => Promise<unknown>,
  conflictMessage?: (error: unknown) => string | null,
) {
  return renderHook(() =>
    useBulkStatusUpdate({ updateOne, conflictMessage, noun: { singular: 'gestor' } }),
  );
}

beforeEach(() => {
  useToastStore.getState().clear();
});

describe('useBulkStatusUpdate — happy path', () => {
  it('raises a success toast naming the count and noun when every id is paused', async () => {
    const updateOne = vi.fn().mockResolvedValue(undefined);
    const { result } = setup(updateOne);

    const { failedIds } = await act(() => result.current.run(['a', 'b', 'c'], false));

    expect(failedIds).toEqual([]);
    expect(updateOne).toHaveBeenNthCalledWith(1, 'a', false);
    expect(useToastStore.getState().toasts).toEqual([
      expect.objectContaining({ tone: 'success', message: '3 gestores pausados.' }),
    ]);
  });

  it('agrees the success toast to the singular for a single id', async () => {
    const updateOne = vi.fn().mockResolvedValue(undefined);
    const { result } = setup(updateOne);

    await act(() => result.current.run(['a'], false));

    expect(useToastStore.getState().toasts).toEqual([
      expect.objectContaining({ tone: 'success', message: '1 gestor pausado.' }),
    ]);
  });

  it('uses the ativado participle when activating', async () => {
    const updateOne = vi.fn().mockResolvedValue(undefined);
    const { result } = setup(updateOne);

    await act(() => result.current.run(['a', 'b'], true));

    expect(useToastStore.getState().toasts).toEqual([
      expect.objectContaining({ tone: 'success', message: '2 gestores ativados.' }),
    ]);
  });

  it('reports busy only while the run is in flight', async () => {
    let resolveUpdate!: () => void;
    const updateOne = vi.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveUpdate = resolve;
        }),
    );
    const { result } = setup(updateOne);

    expect(result.current.busy).toBe(false);

    let runPromise!: Promise<{ failedIds: string[] }>;
    act(() => {
      runPromise = result.current.run(['a'], false);
    });
    expect(result.current.busy).toBe(true);

    resolveUpdate();
    await act(() => runPromise);
    expect(result.current.busy).toBe(false);
  });
});

describe('useBulkStatusUpdate — failures', () => {
  it('raises an error toast naming how many succeeded on a partial failure', async () => {
    const updateOne = vi.fn().mockImplementation(async (id: string) => {
      if (id === 'b') throw new Error('conflict');
    });
    const conflictMessage = () => 'Este gestor não pode ser pausado agora.';
    const { result } = setup(updateOne, conflictMessage);

    const { failedIds } = await act(() => result.current.run(['a', 'b'], false));

    expect(failedIds).toEqual(['b']);
    expect(useToastStore.getState().toasts).toEqual([
      expect.objectContaining({
        tone: 'error',
        message: '1 de 2 pausados. Este gestor não pode ser pausado agora.',
      }),
    ]);
  });

  it('raises just the refusal, with no "de N" prefix, when every id fails', async () => {
    const updateOne = vi.fn().mockRejectedValue(new Error('down'));
    const { result } = setup(updateOne);

    const { failedIds } = await act(() => result.current.run(['a'], false));

    expect(failedIds).toEqual(['a']);
    expect(useToastStore.getState().toasts).toEqual([
      expect.objectContaining({ tone: 'error', message: 'Não foi possível atualizar. Tente de novo.' }),
    ]);
  });

  it('falls back to the generic refusal when no conflictMessage is given', async () => {
    const updateOne = vi.fn().mockRejectedValue(new Error('down'));
    const { result } = setup(updateOne);

    await act(() => result.current.run(['a'], true));

    expect(useToastStore.getState().toasts).toEqual([
      expect.objectContaining({ tone: 'error', message: 'Não foi possível atualizar. Tente de novo.' }),
    ]);
  });
});
