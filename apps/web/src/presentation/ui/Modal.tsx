import { useEffect, useId, useRef, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  ariaLabel?: string;
  size?: 'sm' | 'md' | 'lg';
  dismissible?: boolean;
  footer?: ReactNode;
  children: ReactNode;
}

const SIZE_CLASS: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'max-w-[340px]',
  md: 'max-w-[480px]',
  lg: 'max-w-[640px]',
};

export function Modal({
  isOpen,
  onClose,
  title,
  ariaLabel,
  size = 'sm',
  dismissible = true,
  footer,
  children,
}: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) {
      dialog.showModal();
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  // Clicking the ::backdrop dispatches a click whose target is the <dialog>
  // itself (content clicks target a descendant instead) — no separate
  // backdrop element needed to detect "outside" clicks.
  const handleBackdropClick = (event: MouseEvent<HTMLDialogElement>) => {
    if (dismissible && event.target === dialogRef.current) {
      onClose();
    }
  };

  // Explicit (not the native `cancel` event) so it's testable in jsdom,
  // which doesn't implement the dialog focusing/cancel machinery behind
  // showModal().
  const handleKeyDown = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (dismissible && event.key === 'Escape') {
      onClose();
    }
  };

  return (
    <dialog
      ref={dialogRef}
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      aria-label={title ? undefined : ariaLabel}
      aria-labelledby={title ? titleId : undefined}
      className={`w-[calc(100%-3rem)] ${SIZE_CLASS[size]} rounded-card-lg bg-surface p-[22px] shadow-card-lg backdrop:bg-ink/50`}
    >
      {title && (
        <div className="flex items-start justify-between">
          <h2 id={titleId} className="pr-12 text-h2 text-ink">
            {title}
          </h2>
          <button
            type="button"
            autoFocus
            onClick={onClose}
            aria-label="Fechar"
            className="flex h-11 w-11 flex-none items-center justify-center rounded-full text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <X size={20} />
          </button>
        </div>
      )}
      <div className={title ? 'mt-3' : ''}>{children}</div>
      {footer && <div className="mt-4 flex items-center gap-2">{footer}</div>}
    </dialog>
  );
}
