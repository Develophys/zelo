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
    expect(screen.getByRole('button', { name: '+ Adicionar' })).toBeInTheDocument();
  });

  // A sidebar and a not-quite-maximized window leave much less room than a
  // full-width phone screenshot suggests — a fixed md:w-64 search field once
  // clipped the bulk actions well above the phone breakpoint. Hiding it at
  // every width, not just below md, is what actually guarantees the fit.
  it('hides the search field at every width once a selection replaces it with the bulk actions', async () => {
    render(<Selectable actions={<button type="button">Excluir</button>} />);
    await userEvent.click(screen.getByLabelText('Selecionar todos'));

    const search = screen.getByRole('searchbox');
    expect(search.closest('label')?.className).toContain('hidden');
    expect(screen.getByTestId('data-table-toolbar-actions')).toBeInTheDocument();
  });

  it('gives the search field the full row width once the selection clears', async () => {
    const user = userEvent.setup();
    render(<Selectable actions={<button type="button">Excluir</button>} />);
    await user.click(screen.getByLabelText('Selecionar todos'));
    await user.click(screen.getByLabelText('Selecionar todos'));

    const search = screen.getByRole('searchbox');
    expect(search.closest('label')?.className).not.toContain('hidden');
    expect(search.closest('label')?.className).toContain('flex-1');
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

  it('keeps a fixed row height on desktop, and at least that height on a phone where actions can wrap', () => {
    render(
      <DataTableToolbar
        search=""
        onSearchChange={() => {}}
        action={<button type="button">Gerar análise</button>}
      />,
    );
    expect(screen.getByTestId('data-table-toolbar')).toHaveClass(
      'md:h-14',
      'max-md:min-h-14',
      'border-b',
      'border-line',
    );
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

  it('wraps the page action to its own row on a phone instead of scrolling the bulk actions out of sight', async () => {
    const user = userEvent.setup();
    render(
      <Selectable
        actions={<button type="button">Excluir</button>}
        action={<button type="button">+ Adicionar</button>}
      />,
    );
    await user.click(screen.getByRole('checkbox', { name: 'Selecionar todos' }));

    const toolbar = screen.getByTestId('data-table-toolbar');
    expect(toolbar.className).toContain('flex-wrap');
    expect(toolbar.className).toContain('md:flex-nowrap');
  });

  it('keeps the page action in its own full-width top row on a phone, whether or not a selection is in progress', async () => {
    const user = userEvent.setup();
    render(
      <Selectable
        actions={<button type="button">Excluir</button>}
        action={<button type="button">+ Adicionar</button>}
      />,
    );

    const slot = screen.getByTestId('data-table-toolbar-action');
    const classesBefore = slot.className;
    expect(classesBefore).toContain('max-md:order-first');
    expect(classesBefore).toContain('max-md:basis-full');

    await user.click(screen.getByRole('checkbox', { name: 'Selecionar todos' }));
    expect(screen.getByTestId('data-table-toolbar-action').className).toBe(classesBefore);
  });
  it('wraps the bulk actions on a phone instead of scrolling them, keeping the desktop scroll cue for the rare overflow there', async () => {
    render(<Selectable actions={<button type="button">Excluir</button>} />);
    await userEvent.click(screen.getByLabelText('Selecionar todos'));

    // A horizontally scrolling row with no visible scrollbar (the previous
    // design) gave a phone user no sign that more actions existed off-screen.
    const scroller = screen.getByTestId('data-table-toolbar-actions');
    expect(scroller.className).toContain('flex-wrap');
    expect(scroller.className).toContain('md:overflow-x-auto');
    expect(scroller.className).not.toContain('no-scrollbar');
  });

  it('keeps the select-all checkbox visible on a phone once a selection is live, instead of hiding it', async () => {
    render(<Selectable actions={<button type="button">Excluir</button>} />);
    const checkbox = screen.getByLabelText('Selecionar todos');

    expect(checkbox.parentElement?.className).not.toContain('hidden');

    await userEvent.click(checkbox);

    expect(screen.getByLabelText('Selecionar todos')).toBeInTheDocument();
    expect(checkbox.parentElement?.className).not.toContain('hidden');
  });

  it('tightens the row and action gaps once a selection is live, so four icon buttons fit a 360px phone without scrolling', async () => {
    render(<Selectable actions={<button type="button">Excluir</button>} />);
    const toolbar = screen.getByTestId('data-table-toolbar');

    expect(toolbar.className).toContain('gap-3');

    await userEvent.click(screen.getByLabelText('Selecionar todos'));

    expect(toolbar.className).toContain('gap-2');
    expect(screen.getByTestId('data-table-toolbar-actions').className).toContain('gap-1');
  });
});
