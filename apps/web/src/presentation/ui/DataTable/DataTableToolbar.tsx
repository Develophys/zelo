import type { ReactNode } from 'react';
import { Search } from 'lucide-react';
import { Checkbox } from '@/presentation/ui/Checkbox';
import type { DataTableSelection } from './useDataTableSelection';

interface DataTableToolbarProps<T> {
  /** Omitted by tables whose rows cannot be selected, which also drops the checkbox. */
  selection?: DataTableSelection<T>;
  search: string;
  onSearchChange(value: string): void;
  /** The bulk buttons, shown in place of the search field once a row is selected. */
  actions?: ReactNode;
  /** The page's own primary action. Anchored right, and never moves with the selection. */
  action?: ReactNode;
}

export function DataTableToolbar<T>({
  selection,
  search,
  onSearchChange,
  actions,
  action,
}: DataTableToolbarProps<T>) {
  const hasSelection = (selection?.selectedIds.length ?? 0) > 0;

  return (
    <div
      data-testid="data-table-toolbar"
      // The bottom rule and the inset only make sense inside the shell's box.
      // On phones the toolbar sits above a free-standing card list, so it aligns
      // with the card edges instead.
      className="flex h-14 flex-none items-center gap-3 border-b border-line px-cell-x max-md:border-b-0 max-md:px-0"
    >
      {selection && (
        <Checkbox
          aria-label="Selecionar todos"
          checked={selection.allSelected}
          indeterminate={selection.someSelected}
          onChange={selection.toggleAll}
        />
      )}
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
            className="min-h-11 min-w-0 flex-1 rounded-control bg-transparent px-1 py-control-y text-label text-ink placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          />
        </label>
      )}
      {action && (
        <div
          data-testid="data-table-toolbar-action"
          className="ml-auto flex flex-none items-center gap-2"
        >
          {action}
        </div>
      )}
    </div>
  );
}
