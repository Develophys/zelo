import { useEffect } from "react";
import { useHotkeyStore } from "@/stores/hotkey.store";

function isEditableElement(element: Element | null): boolean {
  if (!element) return false;
  const tag = element.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return (element as HTMLElement).isContentEditable;
}

/** Mounted once at the app root — see App.tsx. Owns the app's single `document` keydown listener. */
export function HotkeyListener() {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isEditableElement(document.activeElement)) return;

      const entry = useHotkeyStore.getState().entries.get(event.key);
      if (!entry) return;

      event.preventDefault();
      entry.handler();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  return null;
}
