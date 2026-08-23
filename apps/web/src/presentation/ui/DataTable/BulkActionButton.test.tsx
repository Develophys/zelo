import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BulkActionButton } from './BulkActionButton';

describe('BulkActionButton', () => {
  it('calls onClick when enabled', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<BulkActionButton label="Excluir" state={{ enabled: true, reason: null }} onClick={onClick} />);

    await user.click(screen.getByRole('button', { name: 'Excluir' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('carries aria-disabled but not the disabled attribute when refused, keeping it focusable', () => {
    render(
      <BulkActionButton
        label="Editar"
        state={{ enabled: false, reason: 'Selecione apenas um gestor para editar' }}
        onClick={vi.fn()}
      />,
    );

    const button = screen.getByRole('button', { name: 'Editar' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    // A `disabled` button drops out of the tab order, which would make its
    // tooltip unreachable by keyboard — aria-disabled keeps it focusable.
    expect(button).not.toBeDisabled();
  });

  it('guards the click handler instead of relying on the disabled attribute', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(
      <BulkActionButton label="Editar" state={{ enabled: false, reason: 'Selecione um gestor' }} onClick={onClick} />,
    );

    await user.click(screen.getByRole('button', { name: 'Editar' }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('shows the refusal reason in a tooltip on focus', () => {
    render(
      <BulkActionButton
        label="Pausar"
        state={{ enabled: false, reason: 'Selecione apenas gestores com o mesmo status' }}
        onClick={vi.fn()}
      />,
    );

    const button = screen.getByRole('button', { name: 'Pausar' });
    expect(screen.queryByTestId('tooltip')).not.toBeInTheDocument();
    fireEvent.focus(button);
    expect(screen.getByTestId('tooltip')).toHaveTextContent('Selecione apenas gestores com o mesmo status');
  });

  it('renders no tooltip at all when enabled, with nothing to explain', () => {
    render(<BulkActionButton label="Excluir" state={{ enabled: true, reason: null }} onClick={vi.fn()} />);

    const button = screen.getByRole('button', { name: 'Excluir' });
    fireEvent.focus(button);
    expect(screen.queryByTestId('tooltip')).not.toBeInTheDocument();
  });
});
