import { useEffect } from "react";
import { useHotkeyStore } from "@/stores/hotkey.store";

const NON_TEXT_INPUT_TYPES = new Set([
  "checkbox",
  "radio",
  "button",
  "submit",
  "reset",
  "range",
  "color",
  "file",
  "image",
]);

function isEditableElement(element: Element | null): boolean {
  if (!element) return false;
  const tag = element.tagName;
  if (tag === "INPUT") {
    const type = (element as HTMLInputElement).type.toLowerCase();
    return !NON_TEXT_INPUT_TYPES.has(type);
  }
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  return (element as HTMLElement).isContentEditable;
}

/** Mounted once at the app root — see App.tsx. Owns the app's single `document` keydown listener. */
export function HotkeyListener() {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (useHotkeyStore.getState().helpOpen) return;
      if (event.repeat) return;
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
