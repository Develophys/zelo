import { useEffect } from 'react';
import { useManagerPrefsStore } from '@/stores/manager-prefs.store';

/**
 * Projects the manager's preferences onto `<html>` as attributes, which is the
 * only place either one is read from. Components style themselves with tokens
 * (`py-cell-y`, `bg-brand`) and never subscribe to the store, so a density or
 * accent change repaints through the cascade instead of re-rendering the panel.
 *
 * Both attributes are removed on unmount: they live on the document root, which
 * the manager panel shares with the rest of the app.
 */
export function useApplyManagerPrefs(): void {
  const density = useManagerPrefsStore((state) => state.density);
  const accent = useManagerPrefsStore((state) => state.accent);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.density = density;
    return () => {
      delete root.dataset.density;
    };
  }, [density]);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.accent = accent;
    return () => {
      delete root.dataset.accent;
    };
  }, [accent]);
}
