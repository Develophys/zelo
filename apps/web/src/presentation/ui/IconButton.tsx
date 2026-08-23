import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';
import { Tooltip } from './Tooltip';

type IconButtonVariant = 'outline' | 'ghost' | 'danger';

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> {
  ref?: Ref<HTMLButtonElement>;
  /** Doubles as the accessible name and the tooltip text — an icon-only control has no other way to say what it does. */
  label: string;
  icon: ReactNode;
  variant?: IconButtonVariant;
}

const VARIANT_CLASS: Record<IconButtonVariant, string> = {
  outline: 'border border-line bg-surface text-ink enabled:hover:bg-canvas-alt',
  ghost: 'bg-transparent text-muted enabled:hover:bg-canvas-alt enabled:hover:text-brand',
  danger: 'bg-transparent text-danger enabled:hover:bg-danger-bg',
};

/**
 * 32px of visual box, 44px of tap target: the `before` pseudo-element expands
 * the hit area past the border without pushing the row taller, which is how a
 * dense table row still satisfies the touch minimum.
 */
export function IconButton({
  label,
  icon,
  variant = 'ghost',
  className = '',
  ...rest
}: IconButtonProps) {
  return (
    <Tooltip content={label}>
      <button
        type="button"
        className={[
          'relative inline-flex h-8 w-8 flex-none cursor-pointer items-center justify-center rounded-control',
          'before:absolute before:-inset-1.5 before:content-[""]',
          'transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
          VARIANT_CLASS[variant],
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        {...rest}
        // After the spread on purpose: TypeScript does not apply excess-property
        // checks to hyphenated JSX attributes, so `Omit<…, 'aria-label'>` cannot
        // actually stop a caller from passing one. This can.
        aria-label={label}
      >
        <span aria-hidden="true" className="pointer-events-none inline-flex">
          {icon}
        </span>
      </button>
    </Tooltip>
  );
}
