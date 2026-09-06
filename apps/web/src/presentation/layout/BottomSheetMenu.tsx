import { useEffect, useRef, type ComponentType, type KeyboardEvent, type MouseEvent, type RefObject } from 'react';
import { NavLink } from 'react-router';

export interface BottomSheetMenuItem {
  id: string;
  label: string;
  icon: ComponentType<{ size?: number }>;
  route?: string;
  onSelect?: () => void;
  danger?: boolean;
}

export interface BottomSheetMenuGroup {
  label?: string;
  items: readonly BottomSheetMenuItem[];
}

interface BottomSheetMenuProps {
  open: boolean;
  onClose: () => void;
  returnFocusRef: RefObject<HTMLElement | null>;
  ariaLabel: string;
  groups: readonly BottomSheetMenuGroup[];
}

const ITEM_CLASS =
  'flex min-h-11 w-full items-center gap-3 rounded-control px-3 py-nav-y font-sans text-label font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand';

/**
 * Native `<dialog>` sheet shared by every bottom-nav "Mais" overflow — showModal()
 * puts it in the top layer, which is what traps focus and restores it to the
 * trigger on close, all without ad-hoc focus bookkeeping.
 */
export function BottomSheetMenu({ open, onClose, returnFocusRef, ariaLabel, groups }: BottomSheetMenuProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      dialog.querySelector<HTMLElement>('a, button')?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
      returnFocusRef.current?.focus();
    }
  }, [open, returnFocusRef]);

  const closeThen = (action?: () => void) => () => {
    onClose();
    action?.();
  };

  const dismissOnBackdrop = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target === dialogRef.current) onClose();
  };

  const dismissOnEscape = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (event.key === 'Escape') onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      aria-label={ariaLabel}
      onClick={dismissOnBackdrop}
      onKeyDown={dismissOnEscape}
      onClose={onClose}
      className="mt-auto mb-0 w-full max-w-none bg-transparent p-0 backdrop:bg-scrim/50"
    >
      <div className="rounded-t-card border-t border-surface-brand bg-surface p-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)]">
        <span aria-hidden="true" className="mx-auto mt-1 mb-3 block h-1 w-10 rounded-pill bg-track" />

        {groups.map((group, groupIndex) => (
          <div key={groupIndex} className={groupIndex > 0 ? 'mt-2 border-t border-surface-brand pt-2' : ''}>
            {group.label && (
              <h2 className="px-3 pb-1 font-mono text-eyebrow text-muted uppercase">{group.label}</h2>
            )}
            {group.items.map((item) => {
              const Icon = item.icon;
              const toneClass = item.danger
                ? 'cursor-pointer text-danger hover:bg-danger-bg'
                : 'text-ink hover:bg-canvas';
              return item.route ? (
                <NavLink
                  key={item.id}
                  to={item.route}
                  onClick={closeThen(item.onSelect)}
                  className={`${ITEM_CLASS} ${toneClass}`}
                >
                  <Icon size={20} aria-hidden="true" />
                  {item.label}
                </NavLink>
              ) : (
                <button
                  key={item.id}
                  type="button"
                  onClick={closeThen(item.onSelect)}
                  className={`${ITEM_CLASS} ${toneClass}`}
                >
                  <Icon size={20} aria-hidden="true" />
                  {item.label}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </dialog>
  );
}
