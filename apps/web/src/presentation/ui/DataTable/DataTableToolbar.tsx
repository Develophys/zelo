import type { ReactNode } from 'react';
import { Search } from 'lucide-react';
import { Checkbox } from '@/presentation/ui/Checkbox';
import type { DataTableSelection } from './useDataTableSelection';

interface DataTableToolbarProps<T> {
  selection: DataTableSelection<T>;
  search: string;
  onSearchChange(value: string): void;
  /** The bulk buttons, shown in place of the search field once a row is selected. */
  actions: ReactNode;
}

export function DataTableToolbar<T>({
  selection,
  search,
  onSearchChange,
  actions,
}: DataTableToolbarProps<T>) {
  const hasSelection = selection.selectedIds.length > 0;

  return (
    <div
      data-testid="data-table-toolbar"
      className="flex h-14 items-center gap-3 border-b border-line px-cell-x"
    >
      <Checkbox
        aria-label="Selecionar todos"
        checked={selection.allSelected}
        indeterminate={selection.someSelected}
        onChange={selection.toggleAll}
      />
      {hasSelection ? (
        <div
          data-testid="data-table-toolbar-actions"
          className="no-scrollbar flex flex-nowrap items-center gap-2 overflow-x-auto"
        >
          {actions}
        </div>
      ) : (
        <label className="flex min-w-0 flex-1 items-center gap-2">
          <Search size={16} aria-hidden="true" className="flex-none text-muted" />
          <span className="sr-only">Buscar</span>
          <input
            type="search"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Buscar…"
            className="min-w-0 flex-1 bg-transparent py-control-y text-label text-ink placeholder:text-muted focus-visible:outline-none"
          />
        </label>
      )}
    </div>
  );
}
