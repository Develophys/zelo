import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Modal } from './Modal';

describe('Modal', () => {
  it('renders nothing accessible when isOpen is false', () => {
    render(
      <Modal isOpen={false} onClose={vi.fn()} title="Test modal">
        <p>Body</p>
      </Modal>,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders the title and body content when open', () => {
    render(
      <Modal isOpen onClose={vi.fn()} title="Test modal">
        <p>Body content</p>
      </Modal>,
    );
    expect(screen.getByRole('dialog', { name: 'Test modal' })).toBeInTheDocument();
    expect(screen.getByText('Body content')).toBeInTheDocument();
  });

  it('renders the footer when provided', () => {
    render(
      <Modal
        isOpen
        onClose={vi.fn()}
        title="Test modal"
        footer={<button type="button">Confirmar</button>}
      >
        <p>Body</p>
      </Modal>,
    );
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeInTheDocument();
  });

  it('omits the header row and close button when title is not provided, using ariaLabel for the accessible name', () => {
    render(
      <Modal isOpen onClose={vi.fn()} ariaLabel="Modal sem título">
        <p>Body</p>
      </Modal>,
    );
    expect(screen.getByRole('dialog', { name: 'Modal sem título' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Fechar' })).not.toBeInTheDocument();
  });

  it('calls onClose when the close button is clicked', async () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen onClose={onClose} title="Test modal">
        <p>Body</p>
      </Modal>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose when clicking the dialog's backdrop area", async () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen onClose={onClose} title="Test modal">
        <p>Body</p>
      </Modal>,
    );
    await userEvent.click(screen.getByRole('dialog'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('does not call onClose when clicking content inside the dialog', async () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen onClose={onClose} title="Test modal">
        <p>Body content</p>
      </Modal>,
    );
    await userEvent.click(screen.getByText('Body content'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen onClose={onClose} title="Test modal">
        <p>Body</p>
      </Modal>,
    );
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('does not call onClose on backdrop click or Escape when dismissible is false', async () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen onClose={onClose} title="Test modal" dismissible={false}>
        <p>Body</p>
      </Modal>,
    );
    const dialog = screen.getByRole('dialog');
    await userEvent.click(dialog);
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('gives the close button a 44x44px hit target', () => {
    render(
      <Modal isOpen onClose={vi.fn()} title="Test modal">
        <p>Body</p>
      </Modal>,
    );
    expect(screen.getByRole('button', { name: 'Fechar' })).toHaveClass('h-11', 'w-11');
  });

  it.each([
    ['sm', 'max-w-[340px]'],
    ['md', 'max-w-[480px]'],
    ['lg', 'max-w-[640px]'],
  ] as const)('applies the %s size class', (size, expectedClass) => {
    render(
      <Modal isOpen onClose={vi.fn()} title="Test modal" size={size}>
        <p>Body</p>
      </Modal>,
    );
    expect(screen.getByRole('dialog')).toHaveClass(expectedClass);
  });
});
