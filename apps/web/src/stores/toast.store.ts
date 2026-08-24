import { create } from 'zustand';

export type ToastTone = 'success' | 'error' | 'info';

export interface Toast {
  id: string;
  tone: ToastTone;
  message: string;
}

/** How long a toast stays up before dismissing itself. Errors get longer — they carry more to read. */
export const TOAST_DURATION_MS: Record<ToastTone, number> = {
  success: 4000,
  info: 4000,
  error: 7000,
};

/**
 * Newest first, capped: a burst of bulk-action results must not build a column
 * of toasts taller than the viewport, which would bury the newest one offscreen.
 */
export const MAX_VISIBLE_TOASTS = 3;

interface ToastState {
  toasts: Toast[];
  show: (tone: ToastTone, message: string) => string;
  dismiss: (id: string) => void;
  clear: () => void;
}

let sequence = 0;

export const useToastStore = create<ToastState>()((set) => ({
  toasts: [],
  show: (tone, message) => {
    sequence += 1;
    const id = `toast-${sequence}`;
    set((state) => ({ toasts: [{ id, tone, message }, ...state.toasts].slice(0, MAX_VISIBLE_TOASTS) }));
    return id;
  },
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
  clear: () => set({ toasts: [] }),
}));

export const toast = {
  success: (message: string) => useToastStore.getState().show('success', message),
  error: (message: string) => useToastStore.getState().show('error', message),
  info: (message: string) => useToastStore.getState().show('info', message),
};
