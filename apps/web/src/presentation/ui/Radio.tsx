import type { InputHTMLAttributes, Ref } from 'react';

interface RadioProps extends InputHTMLAttributes<HTMLInputElement> {
  ref?: Ref<HTMLInputElement>;
}

/**
 * A real `<input type="radio">` kept in the accessibility tree and driven by the
 * keyboard, with the visible dot drawn by a sibling that reads the input's state
 * through `peer-*`. Same construction as Checkbox: styling the input itself
 * would cost native arrow-key group navigation and label association for
 * nothing, and the `-inset-3` bleed buys a 44px target without growing the row.
 */
export function Radio({ className = '', ...rest }: RadioProps) {
  return (
    <span
      className={['relative inline-flex h-5 w-5 flex-none', className].filter(Boolean).join(' ')}
    >
      <input
        type="radio"
        className="peer absolute -inset-3 z-10 cursor-pointer appearance-none disabled:cursor-not-allowed"
        {...rest}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none inline-flex h-5 w-5 items-center justify-center rounded-pill border border-control-edge bg-surface text-transparent transition-colors duration-150 peer-checked:border-brand-fill peer-checked:text-brand-fill peer-focus-visible:ring-2 peer-focus-visible:ring-brand peer-focus-visible:ring-offset-2 peer-disabled:opacity-50"
      >
        {/* Hidden by colour rather than by a `peer-*` class of its own: `peer-*`
            compiles to a sibling selector, and this dot is a descendant of the
            sibling, not a sibling itself. */}
        <span className="h-2.5 w-2.5 rounded-pill bg-current" />
      </span>
    </span>
  );
}
