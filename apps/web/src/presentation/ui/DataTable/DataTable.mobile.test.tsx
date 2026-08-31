import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { DataTable } from './DataTable';
import type { DataTableSelection } from './useDataTableSelection';

interface Row {
  id: string;
  name: string;
  isActive: boolean;
}

const ROWS: Row[] = [
  { id: 'a', name: 'Ana', isActive: true },
  { id: 'b', name: 'Bruno', isActive: true },
];

const SELECTION = {
  selectedIds: [],
  isSelected: () => false,
  toggle: vi.fn(),
  toggleAll: vi.fn(),
  clear: vi.fn(),
  allSelected: false,
  someSelected: false,
} as unknown as DataTableSelection<Row>;

function renderTable(rows: Row[]) {
  return render(
    <DataTable
      columns={[{ key: 'name', header: 'Nome', width: 'w-1/2', cell: (row) => row.name }]}
      rows={rows}
      selection={SELECTION}
      rowActions={() => null}
      toolbar={<div data-testid="toolbar">toolbar</div>}
      emptyState={<p>Nada aqui</p>}
      caption="Tabela de teste"
      mobileList={
        <ul data-testid="mobile-list">
          {rows.map((row) => (
            <li key={row.id}>{row.name}</li>
          ))}
        </ul>
      }
    />,
  );
}

describe('DataTable mobile fallback', () => {
  it('keeps the phone list inside the same box as the toolbar that filters it', () => {
    renderTable(ROWS);

    const shell = screen.getByTestId('data-table-shell');
    // Search and bulk actions act on this list; rendering it as a sibling
    // outside the shell left a bordered box containing only a toolbar on phones.
    expect(within(shell).getByTestId('toolbar')).toBeInTheDocument();
    expect(within(shell).getByTestId('mobile-list')).toBeInTheDocument();
  });

  it('hides the phone list from the breakpoint where the table takes over', () => {
    renderTable(ROWS);
    expect(screen.getByTestId('data-table-mobile').className).toContain('md:hidden');
  });

  it('shows the empty state once, not once per viewport', () => {
    renderTable([]);

    expect(screen.getAllByText('Nada aqui')).toHaveLength(1);
    expect(screen.queryByTestId('mobile-list')).not.toBeInTheDocument();
  });
});
