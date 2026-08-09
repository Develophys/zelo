import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EncryptionInfoModal } from './EncryptionInfoModal';

describe('EncryptionInfoModal', () => {
  it('renders nothing when closed', () => {
    render(<EncryptionInfoModal isOpen={false} onClose={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders the title, body, and documentation link when open', () => {
    render(<EncryptionInfoModal isOpen onClose={vi.fn()} />);

    expect(screen.getByRole('dialog', { name: 'Criptografia AES-256' })).toBeInTheDocument();
    expect(
      screen.getByText(/AES-256 é um método de criptografia usado por bancos/),
    ).toBeInTheDocument();
    expect(screen.getByText(/nem o\s*Zelo consegue abrir esse código/)).toBeInTheDocument();
    expect(
      screen.getByText(/suas respostas ficam protegidas, e sua identidade permanece\s*anônima/),
    ).toBeInTheDocument();

    const link = screen.getByRole('link', { name: /Para mais informações/ });
    expect(link).toHaveAttribute(
      'href',
      'https://pt.wikipedia.org/wiki/Advanced_Encryption_Standard',
    );
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('calls onClose when the close button is clicked', async () => {
    const onClose = vi.fn();
    render(<EncryptionInfoModal isOpen onClose={onClose} />);

    await userEvent.click(screen.getByRole('button', { name: 'Fechar' }));

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn();
    render(<EncryptionInfoModal isOpen onClose={onClose} />);

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

    expect(onClose).toHaveBeenCalledOnce();
  });
});
