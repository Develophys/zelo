import type { ReactNode } from 'react';
import { HelpCircle } from 'lucide-react';
import { Tooltip } from './Tooltip';

interface MetricHelpProps {
  label: string;
  content: ReactNode;
}

/**
 * 24px é o alvo mínimo do WCAG 2.5.8 e o maior que cabe ao lado de um rótulo
 * de card sem empurrar a linha.
 */
export function MetricHelp({ label, content }: MetricHelpProps) {
  return (
    <Tooltip content={content} align="start">
      <button
        type="button"
        aria-label={`Sobre: ${label}`}
        className="inline-flex h-6 w-6 items-center justify-center rounded-control text-muted-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <HelpCircle size={14} aria-hidden="true" />
      </button>
    </Tooltip>
  );
}
