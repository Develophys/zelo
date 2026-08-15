import type { ButtonHTMLAttributes, Ref } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  ref?: Ref<HTMLButtonElement>;
  // "unstyled" keeps only shared behavior (focus ring, disabled/loading state,
  // cursor, the full-width toggle) and contributes no color, shape, spacing,
  // or hover effect — bring your own visuals via className.
  variant?: 'primary' | 'soft' | 'ghost' | 'outline' | 'danger' | 'unstyled';
  full?: boolean;
  loading?: boolean;
}

const VARIANT_CLASS: Record<'primary' | 'soft' | 'ghost' | 'outline' | 'danger', string> = {
  primary: 'bg-brand text-white enabled:hover:bg-brand-hover',
  soft: 'bg-surface-brand text-brand enabled:hover:bg-track',
  ghost: 'bg-transparent text-muted',
  outline: 'bg-surface text-ink border border-line',
  danger: 'bg-danger text-white',
};

export function Button({
  variant = 'primary',
  full = true,
  loading = false,
  disabled,
  className = '',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={[
        'cursor-pointer transition disabled:cursor-not-allowed disabled:opacity-50',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
        variant !== 'unstyled' &&
          'inline-flex items-center justify-center gap-2 rounded-pill py-4 px-2 font-sans text-[16px] font-semibold min-h-13',
        variant !== 'unstyled' &&
          variant !== 'ghost' &&
          'enabled:hover:shadow-[0_2px_4px_rgba(33,48,43,0.12),0_18px_32px_-10px_rgba(33,48,43,0.3)] transition-shadow duration-300 ease-out',
        variant === 'unstyled' ? '' : VARIANT_CLASS[variant],
        full ? 'w-full' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && (
        <span
          aria-hidden="true"
          data-testid="button-spinner"
          className="mx-auto block h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      )}
      <span className={loading ? 'sr-only' : 'contents'}>{children}</span>
    </button>
  );
}
