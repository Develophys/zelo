import { useEffect } from 'react';
import { useManagerPrefsStore } from '@/stores/manager-prefs.store';

/**
 * Projects the appearance preferences onto `<html>` as attributes, which is
 * the only place any of them is read from. Mounted once at the app root:
 * accent and corners move tokens every screen uses, not only the panel's. Components style themselves with tokens
 * (`py-cell-y`, `bg-brand`, `rounded-card`) and never subscribe to the store,
 * so a density, accent or corner change repaints through the cascade instead
 * of re-rendering the panel.
 *
 * All three attributes are removed on unmount: they live on the document
 * root, which the manager panel shares with the rest of the app.
 */
export function useApplyAppearancePrefs(): void {
  const density = useManagerPrefsStore((state) => state.density);
  const accent = useManagerPrefsStore((state) => state.accent);
  const corners = useManagerPrefsStore((state) => state.corners);

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

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.corners = corners;
    return () => {
      delete root.dataset.corners;
    };
  }, [corners]);
}
