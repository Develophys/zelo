import { Lock } from 'lucide-react';

interface PrivacyBadgeProps {
  label?: string;
  variant?: 'chip' | 'inline';
  onClick?: () => void;
}

const CHIP_CLASS =
  'inline-flex items-center gap-1 rounded-status bg-surface-brand px-3 py-1.75 font-mono text-mono-data text-brand';

export function PrivacyBadge({ label = 'anônimo', variant = 'chip', onClick }: PrivacyBadgeProps) {
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

  if (onClick) {
    return (
      <button
        type="button"
        data-testid="privacy-badge"
        onClick={onClick}
        aria-label="Saiba mais sobre a criptografia AES-256"
        className="group flex min-h-11 cursor-pointer items-center rounded-status focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <span
          data-testid="privacy-badge-chip"
          className={`${CHIP_CLASS} transition-colors duration-150 group-hover:bg-brand-fill group-hover:text-on-fill`}
        >
          <Lock size={14} />
          {label}
        </span>
      </button>
    );
  }

  return (
    <span data-testid="privacy-badge" className={CHIP_CLASS}>
      <Lock size={14} />
      {label}
    </span>
  );
}
