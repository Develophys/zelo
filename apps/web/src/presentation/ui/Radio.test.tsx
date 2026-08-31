import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Radio } from './Radio';

describe('Radio', () => {
  it('keeps a real radio in the accessibility tree', () => {
    render(<Radio name="g" value="a" checked={false} onChange={vi.fn()} aria-label="Opção A" />);
    expect(screen.getByRole('radio', { name: 'Opção A' })).toBeInTheDocument();
  });

  it('reflects and reports its checked state', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <>
        <Radio name="g" value="a" checked onChange={onChange} aria-label="A" />
        <Radio name="g" value="b" checked={false} onChange={onChange} aria-label="B" />
      </>,
    );

    expect(screen.getByRole('radio', { name: 'A' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'B' })).not.toBeChecked();

    await user.click(screen.getByRole('radio', { name: 'B' }));
    expect(onChange).toHaveBeenCalled();
  });

  it('honours disabled', () => {
    render(<Radio name="g" value="a" checked={false} onChange={vi.fn()} aria-label="A" disabled />);
    expect(screen.getByRole('radio', { name: 'A' })).toBeDisabled();
  });

  it('expands a 20px control to a 44px touch target without growing the row', () => {
    render(<Radio name="g" value="a" checked={false} onChange={vi.fn()} aria-label="A" />);
    const input = screen.getByRole('radio', { name: 'A' });

    // 20px box + 12px of bleed on each side = 44px, the same trick Checkbox
    // uses so a dense row keeps its height.
    expect(input.className).toContain('-inset-3');
    expect(input.parentElement?.className).toContain('h-5');
    expect(input.parentElement?.className).toContain('w-5');
  });
});
