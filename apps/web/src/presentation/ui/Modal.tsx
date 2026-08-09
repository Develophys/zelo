import {
  useEffect,
  useId,
  useRef,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { X } from 'lucide-react';

// `children` stay mounted in the DOM for the component's lifetime — Modal
// toggles native <dialog> open/closed state rather than conditionally
// rendering. A consumer putting a form, data fetch, or focus-stealing
// element in children should account for mount-on-first-render, not
// mount-on-open.
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
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) {
      dialog.showModal();
      closeButtonRef.current?.focus();
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
      onCancel={(event) => {
        if (!dismissible) {
          event.preventDefault();
        }
      }}
      // Native <dialog> `close` event (fires on any close, not just ours) —
      // resyncs React state if the dialog closed outside our own showModal()/
      // close() calls. Distinct from the onClose prop it invokes below.
      onClose={() => {
        if (isOpen) {
          onClose();
        }
      }}
      aria-label={title ? undefined : ariaLabel}
      aria-labelledby={title ? titleId : undefined}
      className={`m-auto w-[calc(100%-3rem)] ${SIZE_CLASS[size]} bg-transparent backdrop:bg-ink/50`}
    >
      <div className="rounded-card-lg bg-surface p-[22px] shadow-card-lg">
        {title && (
          <div className="flex items-start justify-between">
            <h2 id={titleId} className="pr-12 text-h2 text-ink">
              {title}
            </h2>
            {/* dismissible gates implicit dismissal (backdrop click, Escape) only — the explicit close button always closes. */}
            <button
              type="button"
              ref={closeButtonRef}
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
      </div>
    </dialog>
  );
}
