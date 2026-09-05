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
  sm: 'md:max-w-[400px]',
  md: 'md:max-w-[520px]',
  lg: 'md:max-w-[640px]',
};

const FOCUSABLE_SELECTOR =
  'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

export function Modal({
  isOpen,
  onClose,
  title,
  ariaLabel,
  size = 'md',
  dismissible = true,
  footer,
  children,
}: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) {
      dialog.showModal();
      // A keyboard user entering a form starts on its first field, not on the
      // ✕: the close button is where the visit ends, not where it begins.
      const firstField = bodyRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      (firstField ?? closeButtonRef.current)?.focus();
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
      className={`mt-auto mb-0 w-full max-w-none bg-transparent p-0 backdrop:bg-scrim/50 md:m-auto md:w-[calc(100%-3rem)] ${SIZE_CLASS[size]}`}
    >
      <div className="flex max-h-[94dvh] flex-col rounded-t-card bg-surface md:max-h-[85dvh] md:rounded-card md:shadow-card-lg">
        <span
          aria-hidden="true"
          data-testid="modal-drag-handle"
          className="mx-auto mt-2 mb-1 block h-1 w-10 flex-none rounded-pill bg-track md:hidden"
        />
        {title && (
          <div className="flex flex-none items-start justify-between px-5.5 pt-3 md:pt-5.5">
            <h2 id={titleId} className="pr-12 text-h2 text-ink">
              {title}
            </h2>
            {/* dismissible gates implicit dismissal (backdrop click, Escape) only — the explicit close button always closes. */}
            <button
              type="button"
              ref={closeButtonRef}
              onClick={onClose}
              aria-label="Fechar"
              className="flex h-11 w-11 flex-none items-center justify-center rounded-control text-muted focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
            >
              <X size={20} aria-hidden="true" />
            </button>
          </div>
        )}
        <div
          ref={bodyRef}
          data-testid="modal-body"
          className={`min-h-0 flex-1 overflow-y-auto px-5.5 ${title ? 'pt-3' : 'pt-5.5'} pb-5.5`}
        >
          {children}
        </div>
        {footer && (
          <div className="flex flex-none items-center gap-2 border-t border-line px-5.5 py-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] md:pb-4">
            {footer}
          </div>
        )}
      </div>
    </dialog>
  );
}
