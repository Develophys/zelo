import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Checkbox } from './Checkbox';

describe('Checkbox', () => {
  it('draws a larger box on phones without changing the touch target', () => {
    render(<Checkbox checked={false} onChange={() => {}} aria-label="Selecionar" />);
    const input = screen.getByRole('checkbox');
    expect(input.parentElement?.className).toContain('max-md:h-6');
    expect(input.className).toContain('-inset-3');
    expect(input.className).toContain('max-md:-inset-2.5');
  });
});
