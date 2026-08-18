import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SelectField, TextField } from './TextField';

describe('TextField', () => {
  it('ships a visible focus ring, which 12 of the 21 hand-rolled inputs it replaced were missing', () => {
    render(<TextField aria-label="Nome" />);

    expect(screen.getByLabelText('Nome')).toHaveClass(
      'focus-visible:ring-2',
      'focus-visible:ring-brand',
    );
  });

  it('tints placeholders with muted at 5.61:1 instead of faint at 2.50:1, which failed AA', () => {
    render(<TextField aria-label="Nome" placeholder="Digite seu nome" />);
    const field = screen.getByLabelText('Nome');

    expect(field).toHaveClass('placeholder:text-muted');
    expect(field).not.toHaveClass('placeholder:text-faint');
  });

  it('keeps the caller layout classes alongside the shared surface', () => {
    render(<TextField aria-label="Nome" className="mt-2" />);

    expect(screen.getByLabelText('Nome')).toHaveClass('mt-2', 'rounded-pill', 'border-line');
  });

  it('forwards arbitrary input attributes rather than swallowing them', () => {
    render(<TextField aria-label="Email" type="email" required id="email-field" />);
    const field = screen.getByLabelText('Email');

    expect(field).toHaveAttribute('type', 'email');
    expect(field).toBeRequired();
    expect(field).toHaveAttribute('id', 'email-field');
  });

  it('gives a select the same surface as an input, so the two never drift apart', () => {
    render(
      <SelectField aria-label="Setor">
        <option value="uti">UTI</option>
      </SelectField>,
    );

    expect(screen.getByLabelText('Setor')).toHaveClass(
      'rounded-pill',
      'border-line',
      'focus-visible:ring-brand',
    );
  });
});
