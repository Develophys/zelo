import { useEffect, useRef } from "react";
import { useHotkeyStore, type HotkeyScope } from "@/stores/hotkey.store";

interface UseHotkeyOptions {
  scope?: HotkeyScope;
  enabled?: boolean;
}

export function useHotkey(
  key: string,
  handler: () => void,
  label: string,
  options: UseHotkeyOptions = {},
): void {
  const { scope = "page", enabled = true } = options;
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  const register = useHotkeyStore((state) => state.register);
  const unregister = useHotkeyStore((state) => state.unregister);

  useEffect(() => {
    if (!enabled) return;
    const registered = register(key, {
      handler: () => handlerRef.current(),
      label,
      scope,
    });
    if (!registered) return;
    return () => unregister(key);
  }, [key, label, scope, enabled, register, unregister]);
}
