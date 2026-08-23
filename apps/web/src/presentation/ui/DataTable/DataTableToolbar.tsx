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
    // h-14 is fixed, not floored, and identical in both branches: min-h only
    // guarantees a floor, and once the actions branch holds more buttons than
    // fit one line, flex-wrap would push it past that floor and shift the
    // table. The actions branch is flex-nowrap + overflow-x-auto instead, so
    // overflow scrolls horizontally rather than growing the row.
    // data-testid anchors a regression test that swaps branches on the same
    // node and diffs its className, rather than asserting the class in isolation.
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
