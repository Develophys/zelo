import { useState } from 'react';
import { deleteConflictMessage } from '@/ports/manager-admin.port';

export interface UseBulkDeleteOptions {
  /** A single delete call, e.g. `(id) => deleteManager.mutateAsync(id)`. */
  deleteOne(id: string): Promise<unknown>;
  /** Singular noun used in the dialog title and the default per-row precondition text. */
  noun: { singular: string };
  /** Called once, only when every id in the batch succeeds — the caller clears its own selection. */
  onSuccess?(): void;
}

export interface UseBulkDelete {
  deleteTarget: { ids: string[] } | null;
  deleteBusy: boolean;
  deleteMessage: string | null;
  deleteCount: number;
  deleteTitle: string;
  openDeleteConfirm(ids: string[]): void;
  closeDeleteConfirm(): void;
  confirmDelete(): Promise<void>;
}

function plural(singular: string): string {
  return `${singular}es`;
}

export function useBulkDelete({ deleteOne, noun, onSuccess }: UseBulkDeleteOptions): UseBulkDelete {
  const [deleteTarget, setDeleteTarget] = useState<{ ids: string[] } | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteMessage, setDeleteMessage] = useState<string | null>(null);

  const openDeleteConfirm = (ids: string[]) => {
    setDeleteTarget({ ids });
    setDeleteMessage(null);
  };

  const closeDeleteConfirm = () => {
    setDeleteTarget(null);
    setDeleteMessage(null);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    const attempted = deleteTarget.ids.length;
    let succeeded = 0;
    const failedIds: string[] = [];
    const refusals = new Set<string>();
    for (const id of deleteTarget.ids) {
      try {
        await deleteOne(id);
        succeeded += 1;
      } catch (error) {
        failedIds.push(id);
        refusals.add(deleteConflictMessage(error) ?? 'Não foi possível excluir. Tente de novo.');
      }
    }
    setDeleteBusy(false);

    if (failedIds.length === 0) {
      onSuccess?.();
      closeDeleteConfirm();
      return;
    }

    const refusalText = [...refusals].join(' ');
    setDeleteTarget({ ids: failedIds });
    setDeleteMessage(succeeded > 0 ? `${succeeded} de ${attempted} excluídos. ${refusalText}` : refusalText);
  };

  const deleteCount = deleteTarget?.ids.length ?? 0;
  const deleteTitle = deleteCount === 1 ? `Excluir ${noun.singular}?` : `Excluir ${deleteCount} ${plural(noun.singular)}?`;

  return {
    deleteTarget,
    deleteBusy,
    deleteMessage,
    deleteCount,
    deleteTitle,
    openDeleteConfirm,
    closeDeleteConfirm,
    confirmDelete,
  };
}
