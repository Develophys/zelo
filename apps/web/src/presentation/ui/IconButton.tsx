import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';
import { Tooltip } from './Tooltip';

type IconButtonVariant = 'outline' | 'ghost' | 'danger' | 'warn' | 'success' | 'ink';

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> {
  ref?: Ref<HTMLButtonElement>;
  /** Doubles as the accessible name and, absent `tooltip`, the tooltip text — an icon-only control has no other way to say what it does. */
  label: string;
  icon: ReactNode;
  variant?: IconButtonVariant;
  /** Overrides the tooltip text without touching the accessible name — for a control that must explain a temporary refusal instead of restating what it does. */
  tooltip?: string;
}

const VARIANT_CLASS: Record<IconButtonVariant, string> = {
  outline: 'border border-line bg-surface text-ink enabled:hover:bg-canvas-alt',
  ghost: 'bg-transparent text-muted enabled:hover:bg-canvas-alt enabled:hover:text-brand',
  danger: 'bg-transparent text-danger enabled:hover:bg-danger-bg',
  warn: 'bg-transparent text-warn enabled:hover:bg-warn-bg',
  success: 'bg-transparent text-success enabled:hover:bg-success-bg',
  ink: 'bg-transparent text-ink enabled:hover:bg-canvas-alt',
};

/**
 * 32px of visual box, 44px of tap target: the `before` pseudo-element expands
 * the hit area past the border without pushing the row taller, which is how a
 * dense table row still satisfies the touch minimum.
 *
 * On a phone the box grows to 40px and the bleed shrinks to 2px. The target is
 * 44px either way; what changes is how big the control is to see and aim at.
 */
export function IconButton({
  label,
  icon,
  variant = 'ghost',
  tooltip,
  className = '',
  ...rest
}: IconButtonProps) {
  return (
    <Tooltip content={tooltip ?? label}>
      <button
        type="button"
        className={[
          'relative inline-flex h-8 w-8 max-md:h-10 max-md:w-10 flex-none cursor-pointer items-center justify-center rounded-control',
          'before:absolute before:-inset-1.5 max-md:before:-inset-0.5 before:content-[""]',
          '[&_svg]:size-4 max-md:[&_svg]:size-5',
          'transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50',
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
