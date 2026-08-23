import {
  cloneElement,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FocusEvent,
  type PointerEvent,
  type ReactElement,
  type ReactNode,
} from 'react';

const LONG_PRESS_MS = 450;

interface TooltipProps {
  content: ReactNode;
  children: ReactElement<Record<string, unknown>>;
}

/**
 * Hover, focus and touch long-press all reveal the same bubble. Long-press is
 * not a nicety here: row actions are icon-only, and on a phone there is no
 * hover to fall back on, so without it their labels are unreachable.
 *
 * When the trigger's accessible name already *is* the tooltip text — every
 * `IconButton` — the bubble is left out of the accessibility tree instead of
 * being wired up with `aria-describedby`, which would make a screen reader read
 * the same words twice.
 */
export function Tooltip({ content, children }: TooltipProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPress = useCallback(() => {
    if (pressTimer.current === null) return;
    clearTimeout(pressTimer.current);
    pressTimer.current = null;
  }, []);

  useEffect(() => clearPress, [clearPress]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  const restatesTheName =
    typeof content === 'string' && children.props['aria-label'] === content;

  const chain =
    <E,>(theirs: unknown, ours: (event: E) => void) =>
    (event: E) => {
      (theirs as ((event: E) => void) | undefined)?.(event);
      ours(event);
    };

  const trigger = cloneElement(children, {
    'aria-describedby': open && !restatesTheName ? id : children.props['aria-describedby'],
    onPointerEnter: chain<PointerEvent>(children.props.onPointerEnter, (event) => {
      if (event.pointerType !== 'touch') setOpen(true);
    }),
    onPointerLeave: chain<PointerEvent>(children.props.onPointerLeave, () => {
      clearPress();
      setOpen(false);
    }),
    onPointerDown: chain<PointerEvent>(children.props.onPointerDown, (event) => {
      if (event.pointerType !== 'touch') return;
      clearPress();
      pressTimer.current = setTimeout(() => setOpen(true), LONG_PRESS_MS);
    }),
    onPointerUp: chain<PointerEvent>(children.props.onPointerUp, clearPress),
    onPointerCancel: chain<PointerEvent>(children.props.onPointerCancel, () => {
      clearPress();
      setOpen(false);
    }),
    onFocus: chain<FocusEvent>(children.props.onFocus, () => setOpen(true)),
    onBlur: chain<FocusEvent>(children.props.onBlur, () => setOpen(false)),
  });

  return (
    <span className="relative inline-flex">
      {trigger}
      {open && (
        <span
          id={id}
          data-testid="tooltip"
          role="tooltip"
          aria-hidden={restatesTheName || undefined}
          className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-max max-w-[16rem] -translate-x-1/2 rounded-control bg-ink px-2.5 py-1.5 text-center font-sans text-caption font-semibold text-surface shadow-lift"
        >
          {content}
        </span>
      )}
    </span>
  );
}
