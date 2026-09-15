import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DataTableMobileCard } from './DataTableMobileCard';

function renderCard(overrides: Partial<Parameters<typeof DataTableMobileCard>[0]> = {}) {
  return render(
    <ul>
      <DataTableMobileCard
        label="Ana Konder, Ativa"
        fields={[
          { label: 'Nome', value: 'Ana Konder' },
          { label: 'Email', value: 'ana@zelo-demo.local', breakAll: true },
        ]}
        status={{ tone: 'positive', text: 'Ativa' }}
        selected={false}
        onToggle={vi.fn()}
        actions={<button type="button">Editar Ana Konder</button>}
        {...overrides}
      />
    </ul>,
  );
}

describe('DataTableMobileCard', () => {
  it('lists every field as a label/value pair, plus the status', () => {
    renderCard();

    expect(screen.getByText('Nome')).toBeInTheDocument();
    expect(screen.getByText('Ana Konder')).toBeInTheDocument();
    expect(screen.getByText('Email')).toBeInTheDocument();
    expect(screen.getByText('ana@zelo-demo.local')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Ativa')).toBeInTheDocument();
  });

  // Pages word this differently (the institutions table lowercases the status),
  // so the card must not assemble the name itself.
  it('uses the caller-supplied accessible name for the select toggle', () => {
    renderCard({ label: 'Hospital São Lucas, ativa' });
    expect(screen.getByRole('button', { name: 'Hospital São Lucas, ativa' })).toBeInTheDocument();
  });

  it('exposes selection as a toggle button rather than a checkbox', async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    renderCard({ onToggle });

    const toggle = screen.getByRole('button', { name: 'Ana Konder, Ativa' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');

    await user.click(toggle);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('marks itself pressed and tints the border once selected', () => {
    const { container } = renderCard({ selected: true });

    expect(screen.getByRole('button', { name: 'Ana Konder, Ativa' })).toHaveAttribute('aria-pressed', 'true');
    expect(container.querySelector('li')!.className).toContain('border-brand');
  });

  // Row actions sit outside the select button: nesting them would make every
  // action click also toggle the selection.
  it('keeps the row actions out of the select button', () => {
    renderCard();

    const toggle = screen.getByRole('button', { name: 'Ana Konder, Ativa' });
    const action = screen.getByRole('button', { name: 'Editar Ana Konder' });
    expect(within(toggle).queryByRole('button')).toBeNull();
    expect(toggle).not.toContainElement(action);
  });

  it('lets a long unbroken value wrap mid-word when the field asks for it', () => {
    renderCard();
    expect(screen.getByText('ana@zelo-demo.local').className).toContain('break-all');
  });

  it('leads with the first field as the headline', () => {
    renderCard();
    expect(screen.getByText('Ana Konder').className).toContain('font-semibold');
    expect(screen.getByText('ana@zelo-demo.local').className).not.toContain('font-semibold');
  });
});
