import type { HTMLAttributes, ReactNode, Ref } from 'react';

type PillTone = 'neutral' | 'positive' | 'warning' | 'danger';

interface PillProps extends HTMLAttributes<HTMLSpanElement> {
  ref?: Ref<HTMLSpanElement>;
  tone: PillTone;
  children: ReactNode;
}

// Only `warning` carries a border. It is the tone that asks for an action —
// a pending or unread item — so it needs an edge the other three do not, and
// the border is what separates it from a merely tinted background.
const TONE_CLASS: Record<PillTone, string> = {
  neutral: 'bg-canvas-alt text-muted',
  positive: 'bg-surface-brand text-brand',
  warning: 'border border-warn bg-warn-bg text-warn-ink',
  danger: 'bg-danger-bg text-danger-ink',
};

export function Pill({ tone, children, className = '', ...rest }: PillProps) {
  return (
    <span
      className={[
        'inline-block max-w-full overflow-hidden text-ellipsis rounded-status px-2 py-0.5 align-middle font-sans text-caption font-semibold whitespace-nowrap',
        TONE_CLASS[tone],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {children}
    </span>
  );
}
