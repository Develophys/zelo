import type { ReactNode } from 'react';
import { HelpCircle } from 'lucide-react';
import { Tooltip } from './Tooltip';

interface MetricHelpProps {
  label: string;
  content: ReactNode;
}

/**
 * O alvo é 44×44, o piso que o PRODUCT.md assume — o ícone continua em 14px e
 * a margem negativa devolve os 20px extras, então a linha do rótulo do card
 * mantém a mesma altura de antes.
 */
export function MetricHelp({ label, content }: MetricHelpProps) {
  return (
    <Tooltip content={content} align="start" trigger="click">
      <button
        type="button"
        aria-label={`Sobre: ${label}`}
        className="-m-2.5 inline-flex h-11 w-11 touch-manipulation items-center justify-center rounded-control text-muted-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <HelpCircle size={14} aria-hidden="true" />
      </button>
    </Tooltip>
  );
}
