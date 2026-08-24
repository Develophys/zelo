import { useState } from 'react';
import { toast } from '@/stores/toast.store';
import { plural } from './plural';

export interface UseBulkStatusUpdateOptions {
  /** A single update call, e.g. `(id, isActive) => updateManager.mutateAsync({ id, patch: { isActive } })`. */
  updateOne(id: string, isActive: boolean): Promise<unknown>;
  /** Maps a caught error to user-facing copy; `null` falls back to the generic message. */
  conflictMessage?(error: unknown): string | null;
  /** Singular noun used in the success toast, e.g. `{ singular: 'gestor' }`. */
  noun: { singular: string };
}

export interface UseBulkStatusUpdate {
  busy: boolean;
  /** Runs every id, awaiting each; returns the ids that failed so the caller can decide what to do with the selection. */
  run(ids: string[], isActive: boolean): Promise<{ failedIds: string[] }>;
}

function statusSuccessMessage(count: number, noun: { singular: string }, isActive: boolean): string {
  const participle = isActive ? 'ativado' : 'pausado';
  return count === 1 ? `1 ${noun.singular} ${participle}.` : `${count} ${plural(noun.singular)} ${participle}s.`;
}

export function useBulkStatusUpdate({ updateOne, conflictMessage, noun }: UseBulkStatusUpdateOptions): UseBulkStatusUpdate {
  const [busy, setBusy] = useState(false);

  const run = async (ids: string[], isActive: boolean): Promise<{ failedIds: string[] }> => {
    setBusy(true);
    const attempted = ids.length;
    let succeeded = 0;
    const failedIds: string[] = [];
    const refusals = new Set<string>();
    for (const id of ids) {
      try {
        await updateOne(id, isActive);
        succeeded += 1;
      } catch (error) {
        failedIds.push(id);
        refusals.add(conflictMessage?.(error) ?? 'Não foi possível atualizar. Tente de novo.');
      }
    }
    setBusy(false);

    if (failedIds.length === 0) {
      toast.success(statusSuccessMessage(succeeded, noun, isActive));
      return { failedIds };
    }

    const verb = isActive ? 'ativados' : 'pausados';
    const refusalText = [...refusals].join(' ');
    toast.error(succeeded > 0 ? `${succeeded} de ${attempted} ${verb}. ${refusalText}` : refusalText);
    return { failedIds };
  };

  return { busy, run };
}
