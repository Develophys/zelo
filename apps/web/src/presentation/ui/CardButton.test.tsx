import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CardButton } from './CardButton';

describe('CardButton', () => {
  it('defaults to the plain surface tone', () => {
    render(<CardButton>Label</CardButton>);
    const button = screen.getByRole('button', { name: 'Label' });
    expect(button.className).toContain('bg-surface');
    expect(button.className).not.toContain('border-brand');
  });

  it('applies the accent tone for tiles that outrank a plain card', () => {
    render(<CardButton tone="accent">Label</CardButton>);
    const button = screen.getByRole('button', { name: 'Label' });
    expect(button.className).toContain('border-brand');
    expect(button.className).toContain('bg-brand/5');
    expect(button.className).not.toContain('bg-surface');
  });

  it('gives every tap visible press feedback, since hover means nothing on a touchscreen', () => {
    render(<CardButton>Label</CardButton>);
    const button = screen.getByRole('button', { name: 'Label' });
    expect(button.className).toContain('active:scale-');
  });
});
