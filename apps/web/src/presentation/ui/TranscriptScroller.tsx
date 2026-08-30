import type { ReactNode, Ref, UIEventHandler } from 'react';

interface TranscriptScrollerProps {
  children: ReactNode;
  scrollerRef: Ref<HTMLDivElement>;
  onScroll: UIEventHandler<HTMLDivElement>;
  label: string;
  // The AI transcript is a region the user tabs into and reads; the peer
  // transcript is a log, because messages arrive from someone else and must be
  // announced as they land.
  role: 'region' | 'log';
  live?: 'polite' | 'off';
  busy?: boolean;
  className?: string;
}

/**
 * The scroll mechanics a transcript needs and nothing else: a focusable,
 * labelled scroll region wired to useStickToBottom. What goes inside — bubbles,
 * alerts, empty states, error boundaries — is the caller's business.
 */
export function TranscriptScroller({
  children,
  scrollerRef,
  onScroll,
  label,
  role,
  live,
  busy,
  className = '',
}: TranscriptScrollerProps) {
  return (
    <div
      ref={scrollerRef}
      onScroll={onScroll}
      role={role}
      aria-label={label}
      aria-live={live}
      aria-busy={busy}
      tabIndex={0}
      className={`no-scrollbar flex-1 overflow-y-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset ${className}`}
    >
      {children}
    </div>
  );
}
