import type { ButtonHTMLAttributes, Ref } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  ref?: Ref<HTMLButtonElement>;
  // "unstyled" keeps only shared behavior (focus ring, disabled/loading state,
  // cursor, the full-width toggle) and contributes no color, shape, spacing,
  // or hover effect — bring your own visuals via className.
  variant?: 'primary' | 'soft' | 'ghost' | 'outline' | 'danger' | 'unstyled';
  // Geometry only: height, padding, radius, gap and type role. Left unset it
  // stays the default full-size control. Passing it explicitly also works with
  // `unstyled`, which is how a control keeps system geometry while bringing its
  // own colors — the one case where className cannot safely override a variant,
  // since two same-property utilities are ordered by Tailwind, not by source.
  size?: 'md' | 'sm';
  full?: boolean;
  isLoading?: boolean;
}

const VARIANT_CLASS: Record<'primary' | 'soft' | 'ghost' | 'outline' | 'danger', string> = {
  primary: 'bg-brand-fill text-on-fill border border-fill-edge enabled:hover:bg-brand-fill-hover',
  // The label darkens with the background on hover. Keeping `text-brand`
  // against `track` measured 4.29-4.36:1 across the four accents — under the
  // 4.5 floor, and invisible to a token test that only reads literal hex.
  soft: 'bg-surface-brand text-brand enabled:hover:bg-track enabled:hover:text-brand-hover',
  ghost: 'bg-transparent text-muted',
  outline: 'bg-surface text-ink border border-line',
  danger: 'bg-danger-fill text-on-fill border border-fill-edge',
};

const SHAPE_BASE =
  'inline-flex items-center justify-center rounded-control font-sans font-semibold';

const SIZE_CLASS: Record<'md' | 'sm', string> = {
  md: 'gap-2 py-4 px-5 text-control min-h-13',
  sm: 'gap-1.5 py-2.5 px-4 text-label min-h-11',
};

export function Button({
  variant = 'primary',
  size,
  full = true,
  isLoading = false,
  disabled,
  className = '',
  children,
  ...rest
}: ButtonProps) {
  const hasShape = variant !== 'unstyled' || size !== undefined;

  return (
    <button
      className={[
        'cursor-pointer transition disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
        hasShape && SHAPE_BASE,
        hasShape && SIZE_CLASS[size ?? 'md'],
        variant !== 'unstyled' &&
          variant !== 'ghost' &&
          'enabled:hover:shadow-lift aria-disabled:hover:shadow-none transition-shadow duration-300 ease-out',
        variant === 'unstyled' ? '' : VARIANT_CLASS[variant],
        full ? 'w-full' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      {...rest}
    >
      {isLoading && (
        <span
          aria-hidden="true"
          data-testid="button-spinner"
          className="motion-essential mx-auto block h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      )}
      <span className={isLoading ? 'sr-only' : 'contents'}>{children}</span>
    </button>
  );
}
