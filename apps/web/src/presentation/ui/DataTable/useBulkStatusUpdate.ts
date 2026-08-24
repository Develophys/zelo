import { useState } from 'react';

export interface UseBulkStatusUpdateOptions {
  /** A single update call, e.g. `(id, isActive) => updateManager.mutateAsync({ id, patch: { isActive } })`. */
  updateOne(id: string, isActive: boolean): Promise<unknown>;
  /** Maps a caught error to user-facing copy; `null` falls back to the generic message. */
  conflictMessage?(error: unknown): string | null;
}

export interface UseBulkStatusUpdate {
  busy: boolean;
  message: string | null;
  clearMessage(): void;
  /** Runs every id, awaiting each; returns the ids that failed so the caller can decide what to do with the selection. */
  run(ids: string[], isActive: boolean): Promise<{ failedIds: string[] }>;
}

export function useBulkStatusUpdate({ updateOne, conflictMessage }: UseBulkStatusUpdateOptions): UseBulkStatusUpdate {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const run = async (ids: string[], isActive: boolean): Promise<{ failedIds: string[] }> => {
    setBusy(true);
    setMessage(null);
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
      return { failedIds };
    }

    const verb = isActive ? 'ativados' : 'pausados';
    const refusalText = [...refusals].join(' ');
    setMessage(succeeded > 0 ? `${succeeded} de ${attempted} ${verb}. ${refusalText}` : refusalText);
    return { failedIds };
  };

  return { busy, message, clearMessage: () => setMessage(null), run };
}
