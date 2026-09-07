import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChatEmptyState } from './ChatEmptyState';

describe('ChatEmptyState', () => {
  it('states exactly what the anonymizer covers, instead of an unqualified "anonimizado" a médico could test and find false', () => {
    render(<ChatEmptyState />);

    const note = screen.getByTestId('anonymity-note');
    expect(note.textContent).toContain('CRM');
    expect(note.textContent).toContain('e-mail');
    expect(note.textContent).toContain('telefone');
  });
});
