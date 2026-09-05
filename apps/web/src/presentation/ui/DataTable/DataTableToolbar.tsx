import type { ReactNode } from 'react';
import { Search } from 'lucide-react';
import { Checkbox } from '@/presentation/ui/Checkbox';
import type { DataTableSelection } from './useDataTableSelection';

interface DataTableToolbarProps<T> {
  /** Omitted by tables whose rows cannot be selected, which also drops the checkbox. */
  selection?: DataTableSelection<T>;
  search: string;
  onSearchChange(value: string): void;
  /** The bulk buttons, shown once a row is selected — beside the search from md up, in its place on a phone. */
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
  const selectedCount = selection?.selectedIds.length ?? 0;
  const hasSelection = selectedCount > 0;

  return (
    <div
      data-testid="data-table-toolbar"
      // The bottom rule and the inset only make sense inside the shell's box.
      // On phones the toolbar sits above a free-standing card list, so it aligns
      // with the card edges instead.
      className="flex h-14 flex-none items-center gap-3 border-b border-line px-cell-x max-md:border-b-0 max-md:px-0 max-md:py-2"
    >
      {selection && (
        <Checkbox
          aria-label="Selecionar todos"
          checked={selection.allSelected}
          indeterminate={selection.someSelected}
          onChange={selection.toggleAll}
        />
      )}
      <label
        className={`relative flex min-w-0 items-center gap-2 max-md:gap-0 ${
          hasSelection ? 'max-md:hidden md:w-64' : 'flex-1'
        }`}
      >
        <Search
          size={16}
          aria-hidden="true"
          className="flex-none text-muted max-md:pointer-events-none max-md:absolute max-md:left-3"
        />
        <span className="sr-only">Buscar</span>
        <input
          type="search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Buscar…"
          // On phones the toolbar has no box around it, so the input needs its
          // own surface — otherwise it is an icon and a placeholder floating on
          // the page. From md up the shell's frame does that job.
          className="min-h-11 min-w-0 flex-1 rounded-control bg-transparent px-1 py-control-y text-label text-ink placeholder:text-muted max-md:border max-md:border-line max-md:bg-surface max-md:pr-3 max-md:pl-9 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        />
      </label>
      {hasSelection && (
        <>
          {/* The bulk actions are icon-only, and the rows they act on may be
              scrolled out of view. Saying how many are selected is what stops a
              delete being pressed over a count the user has lost track of. */}
          <span
            data-testid="selection-count"
            aria-live="polite"
            className="flex-none text-label font-semibold whitespace-nowrap text-ink"
          >
            {selectedCount} {selectedCount === 1 ? 'selecionado' : 'selecionados'}
          </span>
          <div
            data-testid="data-table-toolbar-actions"
            className="max-md:no-scrollbar flex flex-nowrap items-center gap-2 overflow-x-auto"
          >
            {actions}
          </div>
        </>
      )}
      {action && (
        <div
          data-testid="data-table-toolbar-action"
          // The page action collapses to its icon on a phone while a selection
          // is live, so the bulk actions keep the row instead of being pushed
          // into a scroller. The label stays in the accessibility tree.
          data-selecting={hasSelection}
          className="group/action ml-auto flex flex-none items-center gap-2"
        >
          {action}
        </div>
      )}
    </div>
  );
}
