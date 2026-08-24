import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { DataTable, type DataTableColumn } from './DataTable';
import { DataTableEmpty } from './DataTableEmpty';
import { DataTableToolbar } from './DataTableToolbar';
import { useDataTableSelection } from './useDataTableSelection';
import { Pill } from '@/presentation/ui/Pill';

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

// Approximates the four real bulk buttons Tasks 4–6 pass into `actions`, so
// the toolbar's layout tests exercise the actions branch with content that
// can actually overflow a single line, not an empty one.
const BULK_ACTIONS = (
  <>
    <button type="button">Editar</button>
    <button type="button">Pausar</button>
    <button type="button">Ativar</button>
    <button type="button">Excluir</button>
  </>
);

function Harness({ rows = ROWS }: { rows?: Row[] }) {
  const selection = useDataTableSelection(rows, { singular: 'gestor', article: 'um' });
  return (
    <DataTable
      caption="Gestores"
      columns={COLUMNS}
      rows={rows}
      selection={selection}
      rowActions={(row) => <button type="button">Reenviar convite de {row.name}</button>}
      toolbar={
        <DataTableToolbar
          selection={selection}
          search=""
          onSearchChange={() => {}}
          actions={BULK_ACTIONS}
        />
      }
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

  // A Pill carries its own border and background, so an ancestor `truncate`
  // wrapper can only hide the whole box or show it — it cannot slice the text
  // inside the border gracefully. The floor has to live on the Pill itself:
  // it clamps to its cell's width and ellipsizes its own text, while its
  // wrapper still cuts off anything that manages to overflow that, so a
  // longer status label added later degrades inside its cell instead of
  // escaping into the actions column next to it.
  it('contains a Pill cell instead of letting it escape into the actions column, and lets the Pill ellipsize its own text', () => {
    const pillColumns: DataTableColumn<Row>[] = [
      { key: 'name', header: 'Nome', width: 'w-[60%]', cell: (row) => row.name },
      {
        key: 'status',
        header: 'Status',
        width: 'w-[40%]',
        cell: (row) => <Pill tone={row.isActive ? 'positive' : 'neutral'}>{row.isActive ? 'Ativa' : 'Inativa'}</Pill>,
      },
    ];
    function PillHarness() {
      const selection = useDataTableSelection(ROWS, { singular: 'gestor', article: 'um' });
      return (
        <DataTable
          caption="Gestores"
          columns={pillColumns}
          rows={ROWS}
          selection={selection}
          rowActions={() => null}
          toolbar={<DataTableToolbar selection={selection} search="" onSearchChange={() => {}} actions={null} />}
          emptyState={<p>Nenhum gestor por aqui.</p>}
        />
      );
    }

    render(<PillHarness />);

    const pill = screen.getByText('Ativa');
    expect(pill.className).toContain('max-w-full');
    expect(pill.className).toContain('overflow-hidden');
    expect(pill.className).toContain('text-ellipsis');

    const pillWrapper = pill.parentElement as HTMLElement;
    expect(pillWrapper.className).toContain('block');
    expect(pillWrapper.className).toContain('overflow-hidden');

    expect(screen.getByText('Ana').className).toContain('truncate');
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
  // selection does. jsdom has no layout engine, so this cannot measure actual
  // pixels; it verifies the structural invariants that guarantee them: a
  // fixed (not floored) height on an unconditional wrapper, and a
  // non-wrapping actions row so overflow scrolls instead of growing the row.
  it('keeps the toolbar row at the same fixed height when a selection appears', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const toolbar = screen.getByTestId('data-table-toolbar');
    const classNameBeforeSelection = toolbar.className;
    expect(classNameBeforeSelection).toContain('h-14');
    expect(classNameBeforeSelection).not.toContain('min-h-14');

    await user.click(screen.getByRole('checkbox', { name: 'Selecionar Ana' }));

    expect(screen.getByTestId('data-table-toolbar')).toBe(toolbar);
    expect(toolbar.className).toBe(classNameBeforeSelection);
  });

  it('does not let the bulk-action row wrap to a second line', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('checkbox', { name: 'Selecionar Ana' }));

    const actionsRow = screen.getByTestId('data-table-toolbar-actions');
    expect(actionsRow.className).toContain('flex-nowrap');
    expect(actionsRow.className).not.toContain('flex-wrap');
    expect(actionsRow.className).toContain('overflow-x-auto');
    expect(within(actionsRow).getByRole('button', { name: 'Editar' })).toBeInTheDocument();
    expect(within(actionsRow).getByRole('button', { name: 'Excluir' })).toBeInTheDocument();
  });
});

describe('DataTableEmpty', () => {
  it('renders the title and hint, with the hint visually subordinate', () => {
    render(<DataTableEmpty title="Nenhum gestor por aqui." hint="Adicione o primeiro gestor." />);

    const title = screen.getByText('Nenhum gestor por aqui.');
    const hint = screen.getByText('Adicione o primeiro gestor.');
    expect(title).toBeInTheDocument();
    expect(hint).toBeInTheDocument();
    expect(title.className).toContain('text-ink');
    expect(hint.className).toContain('text-muted');
  });
});
