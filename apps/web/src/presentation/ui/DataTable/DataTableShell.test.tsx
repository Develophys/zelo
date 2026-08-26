import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DataTableShell } from './DataTableShell';

describe('DataTableShell', () => {
  it('frames the toolbar and the body in one bordered card', () => {
    render(
      <DataTableShell toolbar={<p>sub-header</p>}>
        <p>corpo</p>
      </DataTableShell>,
    );

    const shell = screen.getByTestId('data-table-shell');
    expect(shell).toHaveClass('rounded-card', 'border', 'border-line', 'bg-surface');
    expect(shell).toHaveTextContent('sub-header');
    expect(shell).toHaveTextContent('corpo');
  });

  it('lets the page scroll past it by default', () => {
    render(<DataTableShell toolbar={null}>corpo</DataTableShell>);
    expect(screen.getByTestId('data-table-shell').className).not.toContain('md:flex-1');
  });

  it('claims the remaining height from the tablet breakpoint up when filling', () => {
    render(
      <DataTableShell fill toolbar={null}>
        corpo
      </DataTableShell>,
    );
    const shell = screen.getByTestId('data-table-shell');
    expect(shell.className).toContain('md:flex');
    expect(shell.className).toContain('md:min-h-0');
    expect(shell.className).toContain('md:flex-1');
    expect(shell.className).toContain('md:flex-col');
  });

  it('hands the scroll to the body rather than the card, so the toolbar stays put', () => {
    render(
      <DataTableShell fill toolbar={<p>sub-header</p>}>
        corpo
      </DataTableShell>,
    );
    const body = screen.getByTestId('data-table-shell-body');
    expect(body.className).toContain('md:overflow-y-auto');
    expect(body.className).toContain('md:min-h-0');
    expect(body.className).toContain('md:flex-1');
  });

  it('leaves the body unscrolled when not filling, so short tables keep their natural height', () => {
    render(<DataTableShell toolbar={null}>corpo</DataTableShell>);
    expect(screen.getByTestId('data-table-shell-body').className).not.toContain('overflow-y-auto');
  });
});
