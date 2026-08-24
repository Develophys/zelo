import {
  cloneElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type PointerEvent,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react';
import { createPortal } from 'react-dom';

const LONG_PRESS_MS = 450;
const VIEWPORT_MARGIN = 8;
const TRIGGER_GAP = 8;

interface TooltipProps {
  content: ReactNode;
  children: ReactElement<Record<string, unknown>>;
}

interface BubblePosition {
  top: number;
  left: number;
}

function mergeRefs<T>(refs: Array<Ref<T> | null | undefined>) {
  return (node: T | null) => {
    const cleanups = refs.map((ref) => {
      if (!ref) return undefined;
      if (typeof ref === 'function') return ref(node);
      (ref as { current: T | null }).current = node;
      return undefined;
    });

    return () => {
      refs.forEach((ref, index) => {
        const cleanup = cleanups[index];
        if (typeof cleanup === 'function') cleanup();
        else if (typeof ref === 'function') ref(null);
        else if (ref) (ref as { current: T | null }).current = null;
      });
    };
  };
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
 *
 * The bubble portals into `document.body` and positions itself with
 * `position: fixed` from the trigger's measured rect, rather than living
 * `absolute` inside the trigger's own stacking context — an `overflow-hidden`
 * ancestor (a table row's rounded card, a list item) clips the latter no
 * matter how high its `z-index` is.
 */
export function Tooltip({ content, children }: TooltipProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<BubblePosition>({ top: 0, left: 0 });
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const bubbleRef = useRef<HTMLSpanElement | null>(null);

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

  const measure = useCallback(() => {
    const trigger = triggerRef.current;
    const bubble = bubbleRef.current;
    if (!trigger || !bubble) return;
    const triggerRect = trigger.getBoundingClientRect();
    const bubbleWidth = bubble.offsetWidth;
    const bubbleHeight = bubble.offsetHeight;
    const centered = triggerRect.left + triggerRect.width / 2 - bubbleWidth / 2;
    const maxLeft = Math.max(window.innerWidth - VIEWPORT_MARGIN - bubbleWidth, VIEWPORT_MARGIN);
    const left = Math.min(Math.max(centered, VIEWPORT_MARGIN), maxLeft);

    const fitsAbove = triggerRect.top - TRIGGER_GAP - bubbleHeight >= VIEWPORT_MARGIN;
    const top = fitsAbove
      ? triggerRect.top - bubbleHeight - TRIGGER_GAP
      : triggerRect.bottom + TRIGGER_GAP;
    const maxTop = Math.max(window.innerHeight - VIEWPORT_MARGIN - bubbleHeight, VIEWPORT_MARGIN);
    const clampedTop = Math.min(Math.max(top, VIEWPORT_MARGIN), maxTop);

    setPosition((current) => (current.top === clampedTop && current.left === left ? current : { top: clampedTop, left }));
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    measure();
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [open, measure]);

  const restatesTheName =
    typeof content === 'string' && children.props['aria-label'] === content;

  const chain =
    <E,>(theirs: unknown, ours: (event: E) => void) =>
    (event: E) => {
      (theirs as ((event: E) => void) | undefined)?.(event);
      ours(event);
    };

  const childRef = children.props.ref as Ref<HTMLElement> | undefined;
  const mergedRef = useMemo(() => mergeRefs<HTMLElement>([childRef, triggerRef]), [childRef]);

  const trigger = cloneElement(children, {
    ref: mergedRef,
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

  const bubble = open && (
    <span
      ref={bubbleRef}
      id={id}
      data-testid="tooltip"
      role="tooltip"
      aria-hidden={restatesTheName || undefined}
      style={{ top: `${position.top}px`, left: `${position.left}px` }}
      className="pointer-events-none fixed z-50 w-max max-w-[16rem] rounded-control bg-ink px-2.5 py-1.5 text-center font-sans text-caption font-semibold text-surface shadow-lift"
    >
      {content}
    </span>
  );

  return (
    <span className="inline-flex">
      {trigger}
      {bubble && typeof document !== 'undefined' ? createPortal(bubble, document.body) : bubble}
    </span>
  );
}
