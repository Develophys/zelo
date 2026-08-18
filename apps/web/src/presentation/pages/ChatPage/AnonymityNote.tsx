import { Lock } from 'lucide-react';

export function AnonymityNote({
  children,
  truncate = false,
  className = '',
}: {
  children: string;
  truncate?: boolean;
  className?: string;
}) {
  return (
    <p data-testid="anonymity-note" className={`flex items-center gap-1.5 text-brand ${className}`}>
      <Lock size={13} aria-hidden="true" className="shrink-0" />
      <span className={truncate ? 'min-w-0 truncate' : ''}>{children}</span>
    </p>
  );
}
