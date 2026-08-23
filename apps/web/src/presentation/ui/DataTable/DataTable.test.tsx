import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { DataTable, type DataTableColumn } from './DataTable';
import { DataTableToolbar } from './DataTableToolbar';
import { useDataTableSelection } from './useDataTableSelection';

interface Row {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
}

const ROWS: Row[] = [
  { id: 'a', name: 'Ana', email: 'ana@zelo-demo.local', isActive: true },
  { id: 'b', name: 'Bruno', email: 'bruno@zelo-demo.local', isActive: false },
];

const COLUMNS: DataTableColumn<Row>[] = [
  { key: 'name', header: 'Nome', width: 'w-[40%]', cell: (row) => row.name },
  { key: 'email', header: 'Email', width: 'w-[40%]', cell: (row) => row.email, breakAll: true },
  { key: 'status', header: 'Status', width: 'w-[20%]', cell: (row) => (row.isActive ? 'Ativa' : 'Inativa'), hideBelowLg: true },
];

function Harness({ rows = ROWS }: { rows?: Row[] }) {
  const selection = useDataTableSelection(rows, { singular: 'gestor', article: 'um' });
  return (
    <DataTable
      caption="Gestores"
      columns={COLUMNS}
      rows={rows}
      selection={selection}
      rowActions={(row) => <button type="button">Reenviar convite de {row.name}</button>}
      toolbar={<DataTableToolbar selection={selection} search="" onSearchChange={() => {}} actions={null} />}
      emptyState={<p>Nenhum gestor por aqui.</p>}
    />
  );
}

describe('DataTable', () => {
  it('lays out with a fixed table so no column can blow the width out', () => {
    render(<Harness />);
    expect(screen.getByRole('table').className).toContain('table-fixed');
    expect(screen.getByRole('table').className).toContain('w-full');
  });

  it('gives every header an explicit width', () => {
    render(<Harness />);
    for (const column of COLUMNS) {
      expect(screen.getByRole('columnheader', { name: column.header }).className).toContain(column.width);
    }
  });

  it('drops a hideBelowLg column below lg rather than squeezing it', () => {
    render(<Harness />);
    expect(screen.getByRole('columnheader', { name: 'Status' }).className).toContain('hidden lg:table-cell');
  });

  // A truncated email cannot be copied, which defeats the column's purpose.
  it('breaks the email rather than truncating it', () => {
    render(<Harness />);
    const cell = screen.getByText('ana@zelo-demo.local');
    expect(cell.className).toContain('break-all');
    expect(cell.className).not.toContain('truncate');
  });

  it('gives a truncated cell a title so the full value stays discoverable', () => {
    render(<Harness />);
    expect(screen.getByText('Ana')).toHaveAttribute('title', 'Ana');
  });

  it('selects a row from its checkbox', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('checkbox', { name: 'Selecionar Ana' }));
    expect(screen.getByRole('checkbox', { name: 'Selecionar Ana' })).toBeChecked();
  });

  it('renders the empty state instead of a header row when there is nothing to show', () => {
    render(<Harness rows={[]} />);
    expect(screen.getByText('Nenhum gestor por aqui.')).toBeInTheDocument();
    expect(screen.queryByRole('columnheader')).not.toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    const { container } = render(<Harness />);
    expect(await axe(container, { rules: { region: { enabled: false } } })).toHaveNoViolations();
  });

  // A class-string assertion alone would not catch the toolbar's fixed row
  // being swapped for a taller/shorter one when the bulk-action branch takes
  // over — comparing the same DOM node's className before and after a real
  // selection does.
  it('keeps the toolbar row at the same fixed height when a selection appears', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const toolbar = screen.getByTestId('data-table-toolbar');
    const classNameBeforeSelection = toolbar.className;
    expect(classNameBeforeSelection).toContain('min-h-14');

    await user.click(screen.getByRole('checkbox', { name: 'Selecionar Ana' }));

    expect(screen.getByTestId('data-table-toolbar')).toBe(toolbar);
    expect(toolbar.className).toBe(classNameBeforeSelection);
  });
});
