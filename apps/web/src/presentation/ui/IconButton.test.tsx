import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Pencil } from 'lucide-react';
import { IconButton } from './IconButton';

describe('IconButton', () => {
  it('takes its accessible name from the label an icon cannot carry', () => {
    render(<IconButton label="Editar" icon={<Pencil size={16} />} />);
    expect(screen.getByRole('button', { name: 'Editar' })).toBeInTheDocument();
  });

  it('draws a bigger control on phones while holding the 44px target', () => {
    render(<IconButton label="Editar" icon={<Pencil size={16} />} />);
    const button = screen.getByRole('button', { name: 'Editar' });

    // 32px of box + 6px of bleed on desktop; 40px + 2px on a phone. The target
    // is 44px either way — what changes is how big the thing is to see and aim
    // at on a small screen.
    expect(button.className).toContain('max-md:h-10');
    expect(button.className).toContain('max-md:w-10');
    expect(button.className).toContain('max-md:before:-inset-0.5');
    expect(button.className).toContain('max-md:[&_svg]:size-5');
  });

  it('keeps the icon out of the accessibility tree', () => {
    render(<IconButton label="Editar" icon={<Pencil size={16} />} />);
    const button = screen.getByRole('button', { name: 'Editar' });
    expect(button.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });
});
