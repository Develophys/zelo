import { useEffect, useRef } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import {
  TOAST_DURATION_MS,
  useToastStore,
  type Toast,
  type ToastTone,
} from '@/stores/toast.store';

const TONE_ICON: Record<ToastTone, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
};

const TONE_CLASS: Record<ToastTone, string> = {
  success: 'text-brand',
  error: 'text-danger',
  info: 'text-muted',
};

const SUPPORTS_POPOVER =
  typeof HTMLElement !== 'undefined' && Object.hasOwn(HTMLElement.prototype, 'popover');

function ToastRow({ toast }: { toast: Toast }) {
  const dismiss = useToastStore((state) => state.dismiss);
  const Icon = TONE_ICON[toast.tone];

  useEffect(() => {
    const timer = setTimeout(() => dismiss(toast.id), TOAST_DURATION_MS[toast.tone]);
    return () => clearTimeout(timer);
  }, [toast.id, toast.tone, dismiss]);

  return (
    <li
      data-testid="toast"
      data-tone={toast.tone}
      className="pointer-events-auto flex w-full items-start gap-2.5 rounded-card border border-line bg-surface p-3.5 shadow-lift"
    >
      <Icon size={18} aria-hidden="true" className={`mt-0.5 flex-none ${TONE_CLASS[toast.tone]}`} />
      <p className="min-w-0 flex-1 text-label text-ink">{toast.message}</p>
      <button
        type="button"
        aria-label="Fechar aviso"
        onClick={() => dismiss(toast.id)}
        className="-m-1 flex-none cursor-pointer rounded-control p-1 text-muted transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
      >
        <X size={16} aria-hidden="true" />
      </button>
    </li>
  );
}

/**
 * Renders the toast stack in the browser's top layer via `popover`, so it paints
 * above a `<dialog>` opened with `showModal()`. Mount once, at the app root.
 */
export function ToastViewport() {
  const toasts = useToastStore((state) => state.toasts);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node || !SUPPORTS_POPOVER) return;
    try {
      if (toasts.length > 0) node.showPopover();
      else node.hidePopover();
    } catch {
      /* already in the requested state */
    }
  }, [toasts.length]);

  return (
    <>
      <p aria-live="polite" role="status" data-testid="toast-announcer" className="sr-only">
        {toasts[0]?.message ?? ''}
      </p>

      <div
        ref={ref}
        data-testid="toast-viewport"
        {...(SUPPORTS_POPOVER ? { popover: 'manual' } : {})}
        className="pointer-events-none fixed inset-auto right-4 bottom-4 z-50 m-0 w-[min(22rem,calc(100vw-2rem))] bg-transparent p-0"
      >
        <ul className="flex flex-col gap-2">
          {toasts.map((toast) => (
            <ToastRow key={toast.id} toast={toast} />
          ))}
        </ul>
      </div>
    </>
  );
}
