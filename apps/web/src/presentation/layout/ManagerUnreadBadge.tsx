const CAP = 99;

interface ManagerUnreadBadgeProps {
  count: number;
  /** In a collapsed rail there is no room for a number, so the badge becomes a dot. */
  asDot?: boolean;
}

/**
 * The count is capped at 99 in the visible text but never in the accessible
 * name: "104 notificações não lidas" is the fact, and `99+` is only how it fits
 * next to a 22px icon.
 */
export function ManagerUnreadBadge({ count, asDot = false }: ManagerUnreadBadgeProps) {
  if (count <= 0) return null;

  const label = `${count} ${count === 1 ? 'notificação não lida' : 'notificações não lidas'}`;

  if (asDot) {
    return (
      <span
        role="status"
        aria-label={label}
        className="absolute top-1 right-1 h-2.5 w-2.5 rounded-pill bg-warn ring-2 ring-surface"
      />
    );
  }

  return (
    <span
      role="status"
      aria-label={label}
      className="ml-auto inline-flex min-w-6 items-center justify-center rounded-status bg-warn-bg px-1.5 py-0.5 font-mono text-mono-data text-warn-ink"
    >
      <span aria-hidden="true">{count > CAP ? `${CAP}+` : count}</span>
    </span>
  );
}
