import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ManagerActionBar } from './ManagerActionBar';

describe('ManagerActionBar', () => {
  it('rules a line above the actions, separating them from the page header', () => {
    render(
      <ManagerActionBar>
        <button type="button">Adicionar</button>
      </ManagerActionBar>,
    );

    const bar = screen.getByTestId('manager-action-bar');
    const rule = bar.querySelector('hr');
    expect(rule).not.toBeNull();
    expect(
      rule!.compareDocumentPosition(screen.getByRole('button', { name: 'Adicionar' })),
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('aligns the actions to the start of the content, not to the far edge of the page', () => {
    render(
      <ManagerActionBar>
        <button type="button">Adicionar</button>
      </ManagerActionBar>,
    );

    const row = screen.getByRole('button', { name: 'Adicionar' }).parentElement;
    expect(row?.className).toContain('flex');
    expect(row?.className).not.toContain('justify-between');
    expect(row?.className).not.toContain('justify-end');
  });

  it('wraps its actions rather than letting them overflow a narrow viewport', () => {
    render(
      <ManagerActionBar>
        <button type="button">Adicionar</button>
      </ManagerActionBar>,
    );

    expect(screen.getByRole('button', { name: 'Adicionar' }).parentElement?.className).toContain(
      'flex-wrap',
    );
  });
});
