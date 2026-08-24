import { Button } from '@/presentation/ui/Button';
import { Tooltip } from '@/presentation/ui/Tooltip';
import type { BulkActionState } from './useDataTableSelection';

export function BulkActionButton({
  label,
  state,
  onClick,
}: {
  label: string;
  state: BulkActionState;
  onClick: () => void;
}) {
  const button = (
    <Button
      type="button"
      variant="outline"
      size="sm"
      full={false}
      aria-disabled={!state.enabled}
      onClick={() => {
        if (state.enabled) onClick();
      }}
    >
      {label}
    </Button>
  );
  return state.reason ? <Tooltip content={state.reason}>{button}</Tooltip> : button;
}
