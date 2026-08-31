import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DataTableToolbar } from './DataTableToolbar';
import { useDataTableSelection } from './useDataTableSelection';

const ROWS = [
  { id: 'a', name: 'Ana', isActive: true },
  { id: 'b', name: 'Bruno', isActive: false },
];

function SelectableOne({ actions }: { actions?: ReactNode }) {
  const selection = useDataTableSelection([ROWS[0]!], { singular: 'gestor', article: 'um' });
  return (
    <DataTableToolbar
      selection={selection}
      search=""
      onSearchChange={() => {}}
      actions={actions}
    />
  );
}

function Selectable({ actions, action }: { actions?: ReactNode; action?: ReactNode }) {
  const selection = useDataTableSelection(ROWS, { singular: 'gestor', article: 'um' });
  return (
    <DataTableToolbar
      selection={selection}
      search=""
      onSearchChange={() => {}}
      actions={actions}
      action={action}
    />
  );
}

describe('DataTableToolbar', () => {
  it('anchors the page action to the right of the search field', () => {
    render(
      <Selectable
        actions={<button type="button">Excluir</button>}
        action={<button type="button">+ Adicionar</button>}
      />,
    );

    const slot = screen.getByTestId('data-table-toolbar-action');
    expect(within(slot).getByRole('button', { name: '+ Adicionar' })).toBeInTheDocument();
    expect(slot.className).toContain('ml-auto');
    expect(slot.className).toContain('flex-none');
  });

  it('keeps the page action in place once rows are selected, so it never moves under the pointer', async () => {
    render(
      <Selectable
        actions={<button type="button">Excluir</button>}
        action={<button type="button">+ Adicionar</button>}
      />,
    );
    await userEvent.click(screen.getByLabelText('Selecionar todos'));

    expect(screen.getByTestId('data-table-toolbar-actions')).toBeInTheDocument();
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ Adicionar' })).toBeInTheDocument();
  });

  it('drops the select-all checkbox when the table has no selection to make', () => {
    render(
      <DataTableToolbar
        search=""
        onSearchChange={() => {}}
        action={<button type="button">Gerar análise</button>}
      />,
    );

    expect(screen.queryByLabelText('Selecionar todos')).not.toBeInTheDocument();
    expect(screen.getByRole('searchbox')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gerar análise' })).toBeInTheDocument();
  });

  it('renders no action slot at all when the page has no primary action', () => {
    render(<Selectable actions={null} />);
    expect(screen.queryByTestId('data-table-toolbar-action')).not.toBeInTheDocument();
  });

  it('keeps the row at one fixed height whichever branch is showing', () => {
    render(
      <DataTableToolbar
        search=""
        onSearchChange={() => {}}
        action={<button type="button">Gerar análise</button>}
      />,
    );
    expect(screen.getByTestId('data-table-toolbar')).toHaveClass('h-14', 'border-b', 'border-line');
  });

  it('states how many rows the bulk actions will act on', async () => {
    const user = userEvent.setup();
    render(<Selectable actions={<button type="button">Excluir</button>} />);

    // Five icon buttons and no statement of scope: a user with a dozen rows
    // selected, scrolled away from them, can press delete without knowing it.
    await user.click(screen.getByRole('checkbox', { name: 'Selecionar todos' }));

    const count = screen.getByTestId('selection-count');
    expect(count).toHaveTextContent('2 selecionados');
    expect(count).toHaveAttribute('aria-live', 'polite');
  });

  it('agrees in number for a single selected row', async () => {
    const user = userEvent.setup();
    render(<SelectableOne actions={<button type="button">Excluir</button>} />);

    await user.click(screen.getByRole('checkbox', { name: 'Selecionar todos' }));

    expect(screen.getByTestId('selection-count')).toHaveTextContent('1 selecionado');
  });

  it('says nothing about selection when nothing is selected', () => {
    render(<Selectable actions={<button type="button">Excluir</button>} />);
    expect(screen.queryByTestId('selection-count')).not.toBeInTheDocument();
  });

  it('gives the search a field surface on phones, where no toolbar box frames it', () => {
    render(<Selectable />);

    // Inside the shell's box a bare input reads as a toolbar row. Free-standing
    // on the page it is an icon and a grey placeholder, with nothing saying it
    // can be typed into.
    const input = screen.getByRole('searchbox');
    expect(input.className).toContain('max-md:border');
    expect(input.className).toContain('max-md:bg-surface');
  });

  it('gives the bulk actions their own line on phones instead of a scroller', async () => {
    const user = userEvent.setup();
    render(
      <Selectable
        actions={<button type="button">Excluir</button>}
        action={<button type="button">+ Adicionar</button>}
      />,
    );
    await user.click(screen.getByRole('checkbox', { name: 'Selecionar todos' }));

    // Destructive actions hidden behind a horizontal scroll are worse than
    // actions that wrap. There is no room for a count, four icon buttons and a
    // page action on one 360px row.
    const actions = screen.getByTestId('data-table-toolbar-actions');
    expect(actions.className).toContain('max-md:w-full');
    expect(actions.className).toContain('max-md:order-last');
    expect(screen.getByTestId('data-table-toolbar').className).toContain('max-md:flex-wrap');
  });
});
