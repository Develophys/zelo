import { create } from "zustand";

export type HotkeyScope = "global" | "page";

export interface HotkeyEntry {
  handler: () => void;
  label: string;
  scope: HotkeyScope;
}

interface RegisteredHotkey extends HotkeyEntry {
  count: number;
}

interface HotkeyState {
  entries: Map<string, RegisteredHotkey>;
  helpOpen: boolean;
  register: (key: string, entry: HotkeyEntry) => boolean;
  unregister: (key: string) => void;
  setHelpOpen: (open: boolean) => void;
}

export const useHotkeyStore = create<HotkeyState>()((set, get) => ({
  entries: new Map(),
  helpOpen: false,
  register: (key, entry) => {
    const { entries } = get();
    const existing = entries.get(key);

    if (!existing) {
      const next = new Map(entries);
      next.set(key, { ...entry, count: 1 });
      set({ entries: next });
      return true;
    }

    // Identical (key, label, scope) is assumed to mean identical behavior —
    // only the first registrant's handler is kept, the rest just bump the count.
    if (existing.label === entry.label && existing.scope === entry.scope) {
      const next = new Map(entries);
      next.set(key, { ...existing, count: existing.count + 1 });
      set({ entries: next });
      return true;
    }

    if (import.meta.env.DEV) {
      console.warn(
        `[hotkeys] "${key}" is already registered for "${existing.label}" — "${entry.label}" will not respond until the conflict is resolved.`,
      );
    }
    return false;
  },
  unregister: (key) => {
    const { entries } = get();
    const existing = entries.get(key);
    if (!existing) return;

    const next = new Map(entries);
    if (existing.count <= 1) {
      next.delete(key);
    } else {
      next.set(key, { ...existing, count: existing.count - 1 });
    }
    set({ entries: next });
  },
  setHelpOpen: (open) => set({ helpOpen: open }),
}));
