import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { SectorPillPicker } from './SectorPillPicker';

const SECTORS = [
  { id: 's1', name: 'UTI' },
  { id: 's2', name: 'Pronto-Socorro' },
];

function mount(props: Partial<Parameters<typeof SectorPillPicker>[0]> = {}) {
  return render(
    <MemoryRouter>
      <SectorPillPicker
        sectors={SECTORS}
        selectedIds={[]}
        onToggle={() => {}}
        emptyHref="/manager/admin/sectors"
        emptyLabel="Cadastrar um setor"
        {...props}
      />
    </MemoryRouter>,
  );
}

describe('SectorPillPicker', () => {
  it('signals selection with pressed state, not a checkbox', async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    mount({ onToggle });

    const uti = screen.getByRole('button', { name: 'UTI' });
    expect(uti).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();

    await user.click(uti);
    expect(onToggle).toHaveBeenCalledWith('s1');
  });

  it('marks a selected sector pressed', () => {
    mount({ selectedIds: ['s1'] });
    expect(screen.getByRole('button', { name: 'UTI' })).toHaveAttribute('aria-pressed', 'true');
  });

  // A pill that wraps mid-label reads as two pills.
  it('never wraps a label mid-pill', () => {
    mount();
    expect(screen.getByRole('button', { name: 'Pronto-Socorro' }).className).toContain('whitespace-nowrap');
  });

  it('offers the way out instead of an empty box when there are no sectors', () => {
    mount({ sectors: [] });
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Cadastrar um setor' })).toHaveAttribute(
      'href',
      '/manager/admin/sectors',
    );
  });
});
