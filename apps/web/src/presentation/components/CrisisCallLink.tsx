import { Phone } from 'lucide-react';
import type { CrisisLine } from '@/presentation/lib/crisis-line';

interface CrisisCallLinkProps {
  line: CrisisLine;
  className: string;
}

/**
 * The crisis line must always be one tap from a dialer. Reading a number off
 * the screen and retyping it is a chain that breaks in exactly the state this
 * link exists for, so every surface that shows the number uses this — the
 * chat alerts, the transcript error boundary, and both crisis screens.
 */
export function CrisisCallLink({ line, className }: CrisisCallLinkProps) {
  return (
    <a
      href={line.telHref}
      className={`inline-flex min-h-11 items-center gap-1.5 rounded-control px-4 text-label font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 ${className}`}
    >
      <Phone size={15} className="shrink-0" aria-hidden="true" />
      Ligar para o {line.label} · {line.phone}
    </a>
  );
}
