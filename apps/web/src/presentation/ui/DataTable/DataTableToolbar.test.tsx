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
});
