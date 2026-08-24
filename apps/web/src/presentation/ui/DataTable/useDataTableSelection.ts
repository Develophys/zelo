import { useMemo, useState } from 'react';
import { plural } from './plural';

export interface BulkActionState {
  enabled: boolean;
  reason: string | null;
}

export interface DataTableSelection<T> {
  selectedIds: string[];
  isSelected(id: string): boolean;
  toggle(id: string): void;
  toggleAll(): void;
  clear(): void;
  allSelected: boolean;
  someSelected: boolean;
  selectedRows: T[];
  edit: BulkActionState;
  pause: BulkActionState;
  activate: BulkActionState;
  remove: BulkActionState;
}

const ok: BulkActionState = { enabled: true, reason: null };
const no = (reason: string): BulkActionState => ({ enabled: false, reason });

export function useDataTableSelection<T extends { id: string; isActive: boolean }>(
  rows: T[],
  noun: { singular: string; article: string },
): DataTableSelection<T> {
  const [selected, setSelected] = useState<string[]>([]);

  const present = useMemo(() => new Set(rows.map((row) => row.id)), [rows]);
  const selectedIds = useMemo(() => selected.filter((id) => present.has(id)), [selected, present]);
  const selectedRows = useMemo(
    () => rows.filter((row) => selectedIds.includes(row.id)),
    [rows, selectedIds],
  );

  const count = selectedIds.length;
  const activeCount = selectedRows.filter((row) => row.isActive).length;
  const allActive = count > 0 && activeCount === count;
  const allInactive = count > 0 && activeCount === 0;
  const mixed = count > 0 && !allActive && !allInactive;

  const sameStatus = `Selecione apenas ${plural(noun.singular)} com o mesmo status`;

  return {
    selectedIds,
    selectedRows,
    isSelected: (id) => selectedIds.includes(id),
    toggle: (id) =>
      setSelected((current) =>
        current.includes(id) ? current.filter((each) => each !== id) : [...current, id],
      ),
    toggleAll: () =>
      setSelected((current) =>
        current.filter((id) => present.has(id)).length === rows.length
          ? []
          : rows.map((row) => row.id),
      ),
    clear: () => setSelected([]),
    allSelected: rows.length > 0 && count === rows.length,
    someSelected: count > 0 && count < rows.length,
    edit:
      count === 1
        ? ok
        : count === 0
          ? no(`Selecione ${noun.article} ${noun.singular}`)
          : no(`Selecione apenas ${noun.article} ${noun.singular} para editar`),
    pause: allActive
      ? ok
      : count === 0
        ? no(`Selecione ao menos um ${noun.singular}`)
        : mixed
          ? no(sameStatus)
          : no(`Os selecionados já estão inativos`),
    activate: allInactive
      ? ok
      : count === 0
        ? no(`Selecione ao menos um ${noun.singular}`)
        : mixed
          ? no(sameStatus)
          : no(`Os selecionados já estão ativos`),
    remove: count > 0 ? ok : no(`Selecione ao menos um ${noun.singular}`),
  };
}
