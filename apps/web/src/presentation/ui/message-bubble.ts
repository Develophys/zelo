// Shared by the AI chat and the anonymous peer chat. The two surfaces differ in
// what they wrap around a transcript — error boundaries, alerts, typing state —
// but a message reads the same in both, and a doctor arriving at peer support
// from the AI chat should not feel a drop in quality.
const RADIUS = 'rounded-bubble';

export const BUBBLE_BODY =
  'max-w-[min(80%,65ch)] p-[13px_15px] text-body leading-normal whitespace-pre-wrap break-words';

export const OWN_BUBBLE = `self-end ${RADIUS} rounded-br-md bg-brand-fill text-on-fill`;

export const OTHER_BUBBLE = `self-start ${RADIUS} rounded-bl-md bg-surface shadow-card`;
