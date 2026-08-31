import { useEffect, useRef, type InputHTMLAttributes, type Ref } from 'react';
import { Check, Minus } from 'lucide-react';

interface CheckboxProps extends InputHTMLAttributes<HTMLInputElement> {
  ref?: Ref<HTMLInputElement>;
  /** Select-all in a partially selected table. Only settable from JS, never from markup. */
  indeterminate?: boolean;
}

/**
 * A real `<input type="checkbox">` kept in the accessibility tree and driven by
 * the keyboard, with the visible box drawn by a sibling that reads the input's
 * state through `peer-*`. Styling the input itself would cost the native focus,
 * label association and form behaviour for nothing.
 */
export function Checkbox({ indeterminate = false, className = '', ...rest }: CheckboxProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current) inputRef.current.indeterminate = indeterminate;
  }, [indeterminate]);

  // 20px is a comfortable target but a small thing to see. On a phone the drawn
  // box grows to 24px and the input's bleed shrinks to match, so the touch
  // target stays 44px at either size.
  return (
    <span
      className={['relative inline-flex h-5 w-5 max-md:h-6 max-md:w-6 flex-none', className]
        .filter(Boolean)
        .join(' ')}
    >
      <input
        ref={inputRef}
        type="checkbox"
        className="peer absolute -inset-3 max-md:-inset-2.5 z-10 cursor-pointer appearance-none disabled:cursor-not-allowed"
        {...rest}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none inline-flex h-5 w-5 max-md:h-6 max-md:w-6 items-center justify-center rounded-status border border-track bg-surface text-transparent transition-colors duration-150 peer-checked:border-brand-fill peer-checked:bg-brand-fill peer-checked:text-on-fill peer-indeterminate:border-brand-fill peer-indeterminate:bg-brand-fill peer-indeterminate:text-on-fill peer-focus-visible:ring-2 peer-focus-visible:ring-brand peer-focus-visible:ring-offset-2 peer-disabled:opacity-50"
      >
        {/* The mark is always in the DOM and hidden by colour, not by a `peer-*`
            class of its own: `peer-*` compiles to a sibling selector, and this
            icon is a descendant of the sibling, not a sibling itself. */}
        {indeterminate ? (
          <Minus size={14} strokeWidth={3} className="size-3.5 max-md:size-4" />
        ) : (
          <Check size={14} strokeWidth={3} className="size-3.5 max-md:size-4" />
        )}
      </span>
    </span>
  );
}
