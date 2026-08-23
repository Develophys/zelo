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
  // Guarding the click handler (not the `disabled` attribute) keeps the
  // button focusable, so the tooltip explaining why it's off stays reachable
  // by keyboard — a `disabled` button drops out of the tab order entirely.
  return state.reason ? <Tooltip content={state.reason}>{button}</Tooltip> : button;
}
