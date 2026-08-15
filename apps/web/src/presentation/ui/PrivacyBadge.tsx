import { Lock } from 'lucide-react';

interface PrivacyBadgeProps {
  label?: string;
  variant?: 'chip' | 'inline';
}

export function PrivacyBadge({ label = 'anônimo', variant = 'chip' }: PrivacyBadgeProps) {
  if (variant === 'inline') {
    return (
      <span
        data-testid="privacy-badge"
        className="inline-flex items-center gap-1 font-mono text-caption text-muted-2"
      >
        <Lock size={14} />
        {label}
      </span>
    );
  }
  return (
    <span
      data-testid="privacy-badge"
      className="inline-flex items-center gap-1 rounded-pill bg-surface-brand px-3 py-1.75 font-mono text-[12px] text-brand"
    >
      <Lock size={14} />
      {label}
    </span>
  );
}
