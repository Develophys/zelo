import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from './Button';

describe('Button', () => {
  it('renders the primary variant by default with brand background', () => {
    render(<Button>Começar</Button>);
    expect(screen.getByRole('button', { name: 'Começar' })).toHaveClass('bg-brand-fill');
  });

  it.each([
    ['soft', 'bg-surface-brand'],
    ['ghost', 'bg-transparent'],
    ['outline', 'border-line'],
    ['danger', 'bg-danger-fill'],
  ] as const)('applies %s variant classes', (variant, expectedClass) => {
    render(<Button variant={variant}>Label</Button>);
    expect(screen.getByRole('button', { name: 'Label' })).toHaveClass(expectedClass);
  });

  it('soft variant differs from primary only in color, keeping the shared shape and typography', () => {
    render(<Button variant="soft">Label</Button>);
    const button = screen.getByRole('button', { name: 'Label' });
    expect(button).toHaveClass('rounded-control', 'py-4', 'min-h-13', 'font-sans', 'text-control');
    expect(button).toHaveClass('bg-surface-brand', 'text-brand', 'enabled:hover:bg-track');
  });

  it('lays out leading icons beside the label without per-page flex classes', () => {
    render(
      <Button>
        <svg data-testid="icon" />
        Label
      </Button>,
    );
    expect(screen.getByRole('button', { name: 'Label' })).toHaveClass(
      'inline-flex',
      'items-center',
      'justify-center',
      'gap-2',
    );
  });

  it('calls onClick when clicked and not loading', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Tap</Button>);
    await userEvent.click(screen.getByRole('button', { name: 'Tap' }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('disables the button and shows a spinner when loading, while keeping an accessible name', () => {
    render(<Button isLoading>Enviar</Button>);
    const button = screen.getByRole('button', { name: 'Enviar' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByTestId('button-spinner')).toBeInTheDocument();
    expect(screen.getByTestId('button-spinner')).toHaveAttribute('aria-hidden', 'true');
  });

  it('keeps the spinner animating under reduced motion, since loading hides the label and a frozen ring would be the only thing left on screen', () => {
    render(<Button isLoading>Enviar</Button>);

    expect(screen.getByTestId('button-spinner')).toHaveClass('motion-essential');
  });

  it('is full width by default', () => {
    render(<Button>Label</Button>);
    expect(screen.getByRole('button')).toHaveClass('w-full');
  });

  it('unstyled variant keeps shared behavior but contributes no visual classes', () => {
    render(
      <Button variant="unstyled" className="bg-surface-brand p-3.25">
        Label
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Label' });
    // Behavior kept: full-width toggle, disabled dimming, focus ring, cursor.
    expect(button).toHaveClass(
      'w-full',
      'disabled:opacity-50',
      'focus-visible:ring-2',
      'cursor-pointer',
    );
    // Visuals not contributed: no variant color, no default shape/padding/font.
    expect(button).not.toHaveClass('bg-brand', 'rounded-control', 'py-4', 'font-sans', 'min-h-13');
    // Caller's own classes survive untouched.
    expect(button).toHaveClass('bg-surface-brand', 'p-3.25');
  });

  it('keeps the full-size geometry when no size is given, so existing callers are untouched', () => {
    render(<Button>Label</Button>);
    const button = screen.getByRole('button', { name: 'Label' });
    expect(button).toHaveClass('min-h-13', 'py-4', 'text-control', 'rounded-control');
    expect(button).not.toHaveClass('min-h-11', 'text-label');
  });

  it('swaps to the compact control geometry with size=sm', () => {
    render(
      <Button size="sm" variant="soft">
        Label
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Label' });
    expect(button).toHaveClass(
      'min-h-11',
      'py-2.5',
      'px-4',
      'gap-1.5',
      'text-label',
      'rounded-control',
    );
    expect(button).not.toHaveClass('min-h-13', 'text-control');
    expect(button).toHaveClass('bg-surface-brand', 'text-brand');
  });

  it('gives an unstyled button the system geometry when a size is passed, which is how a control keeps system sizing while bringing its own colors', () => {
    render(
      <Button variant="unstyled" size="sm" className="bg-danger-strong-fill text-on-fill">
        Label
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Label' });
    expect(button).toHaveClass('min-h-11', 'text-label', 'rounded-control', 'gap-1.5');
    // Still no variant colour of its own, so the caller's classes cannot lose a
    // same-property ordering fight with the variant.
    expect(button).not.toHaveClass('bg-brand-fill', 'bg-surface-brand', 'text-ink');
    expect(button).toHaveClass('bg-danger-strong-fill', 'text-on-fill');
  });

  it('shows a not-allowed cursor when disabled', () => {
    render(<Button disabled>Label</Button>);
    expect(screen.getByRole('button', { name: 'Label' })).toHaveClass(
      'disabled:cursor-not-allowed',
    );
  });

  it('scopes hover effects to the enabled state so disabled buttons show none', () => {
    render(<Button>Label</Button>);
    const button = screen.getByRole('button', { name: 'Label' });
    expect(button).toHaveClass('enabled:hover:bg-brand-fill-hover');
    expect(button).toHaveClass('enabled:hover:shadow-lift');
    expect(button).not.toHaveClass('hover:bg-brand-fill-hover');
  });
  /**
   * `size` already carries padding, and a `p-*` on the same element is a
   * same-property fight the class order does not settle — Tailwind resolves it
   * by CSS source order, so which one wins is a property of the build. It also
   * cannot shrink the button below `min-h-*`, so the usual intent behind it
   * (a smaller button) is better served by `size="sm"`, which stays above the
   * 44px target.
   */
  it('is never given a padding override at a call site, which would fight its own size', () => {
    function sourceFiles(dir: string): string[] {
      return readdirSync(dir).flatMap((entry) => {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) return sourceFiles(full);
        if (!/\.tsx$/.test(entry) || /\.test\.tsx$/.test(entry)) return [];
        return [full];
      });
    }

    const offenders = sourceFiles(join(__dirname, '..')).flatMap((file) => {
      // An arrow function in the props ends the tag match early, and the
      // className often sits after one.
      const source = readFileSync(file, 'utf8').replace(/=>/g, '=»');
      return [...source.matchAll(/<Button\b[^>]*>/g)]
        .map((match) => match[0])
        // `unstyled` with no size opts out of SHAPE_BASE and SIZE_CLASS, so it
        // has no padding of its own to fight.
        .filter((tag) => !/variant="unstyled"/.test(tag) || /size=/.test(tag))
        .filter((tag) => /className="(?:[^"]*\s)?(?:p|px|py)-/.test(tag))
        .map((tag) => `${file.replace(/.*[\\\/]src[\\\/]/, '')}: ${tag.slice(0, 100)}`);
    });

    expect(offenders).toEqual([]);
  });
});
