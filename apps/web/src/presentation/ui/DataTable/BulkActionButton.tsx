import type { ReactNode } from 'react';
import { Trash2, Pause, Pencil, Play } from 'lucide-react';
import { IconButton } from '@/presentation/ui/IconButton';
import type { BulkActionState } from './useDataTableSelection';

const ICON_BY_LABEL: Record<string, ReactNode> = {
  Excluir: <Trash2 size={16} aria-hidden="true" />,
  Pausar: <Pause size={16} aria-hidden="true" />,
  Editar: <Pencil size={16} aria-hidden="true" />,
  Ativar: <Play size={16} aria-hidden="true" />,
};

const VARIANT_BY_LABEL: Record<string, 'danger' | 'warn' | 'ink' | 'success'> = {
  Excluir: 'danger',
  Pausar: 'warn',
  Editar: 'ink',
  Ativar: 'success',
};

export function BulkActionButton({
  label,
  state,
  onClick,
}: {
  label: string;
  state: BulkActionState;
  onClick: () => void;
}) {
  return (
    <IconButton
      label={label}
      tooltip={state.reason ?? label}
      icon={ICON_BY_LABEL[label]}
      variant={VARIANT_BY_LABEL[label]}
      aria-disabled={!state.enabled}
      onClick={() => {
        if (state.enabled) onClick();
      }}
    />
  );
}
