# Hotkeys Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the core hotkey infrastructure (registry, `useHotkey` hook, global listener,
Shift+? discovery modal) plus two worked reference applications — the médico's primary
navigation as the `global`-scope example, and `AdminInstitutionsPage`'s own CRUD buttons as the
`page`-scope example — so every later screen can adopt the same one-line `useHotkey(...)`
pattern with zero new architecture.

**Architecture:** A Zustand store (`hotkey.store.ts`) holds `key → { handler, label, scope }`.
A `useHotkey` hook registers into it on mount and unregisters on unmount (or when `enabled`
flips off), holding `handler` in a ref so re-renders alone never re-register. A single
`<HotkeyListener />`, mounted once in `App.tsx`, owns the app's one `document` keydown
listener and dispatches by looking the pressed key straight up in the registry — no scope
logic at dispatch time, since `enabled` already means "this entry should not exist right now."
Suppressing a page's hotkeys while a modal sits on top of it is the page's own responsibility,
via the same `enabled` boolean already driving that modal's `isOpen` — not a hidden mechanism
inside `Modal`, since `Modal` keeps its children mounted for its whole lifetime and never
gives a reliable open/close mount signal to hang automatic layering off of.

**Tech Stack:** React 19, TypeScript, Zustand, Vitest + @testing-library/react + user-event,
react-router.

**Spec:** `docs/superpowers/specs/2026-09-08-hotkeys-design.md`

## Global Constraints

- Every hotkey is a single bare key (no Ctrl/Cmd/Alt combos). A keydown with `metaKey`,
  `ctrlKey`, or `altKey` held is never treated as a hotkey.
- No hotkey fires while `document.activeElement` is an `<input>`, `<textarea>`, a `<select>`,
  or anything `contenteditable` — no exceptions, including the `?` help hotkey itself.
- A hotkey's handler must be the exact same function the equivalent button's own `onClick`
  already calls. Never a shortcut that skips a confirmation step.
- Two registrations of the same key with the same `label` and `scope` merge silently (a
  reference count) — expected whenever `Sidebar` and `BottomNav` are both mounted at once and
  each registers the same nav destination. Two registrations of the same key with a
  *different* label keep the first and log a dev-only `console.warn`; nothing throws.
- New Zustand stores in this codebase are plain `create<T>()((set, get) => ({...}))` with no
  `persist` middleware unless the state must survive a reload — hotkey registrations are
  runtime-only and must not persist.

---

### Task 1: The hotkey registry (`hotkey.store.ts`)

**Files:**
- Create: `apps/web/src/stores/hotkey.store.ts`
- Test: `apps/web/src/stores/hotkey.store.test.ts`

**Interfaces:**
- Produces: `useHotkeyStore` (Zustand hook), `HotkeyScope = "global" | "page"`, `HotkeyEntry {
  handler: () => void; label: string; scope: HotkeyScope }`. State shape: `{ entries:
  Map<string, HotkeyEntry & { count: number }>; register(key: string, entry: HotkeyEntry):
  boolean; unregister(key: string): void }`. `register` returns `true` if the entry is now
  live (either as the new owner or merged into an existing identical one), `false` if it lost
  to a genuine conflict and the caller must not call `unregister` for it.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/stores/hotkey.store.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useHotkeyStore } from "./hotkey.store";

function noop() {}

describe("useHotkeyStore", () => {
  beforeEach(() => {
    useHotkeyStore.setState({ entries: new Map() });
  });

  it("registers a new key and reports success", () => {
    const registered = useHotkeyStore
      .getState()
      .register("a", { handler: noop, label: "Adicionar", scope: "page" });

    expect(registered).toBe(true);
    const entry = useHotkeyStore.getState().entries.get("a");
    expect(entry).toMatchObject({ label: "Adicionar", scope: "page", count: 1 });
  });

  it("merges an identical registration (same key, label, scope) into a reference count instead of warning", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const store = useHotkeyStore.getState();

    const first = store.register("i", { handler: noop, label: "Início", scope: "global" });
    const second = store.register("i", { handler: noop, label: "Início", scope: "global" });

    expect(first).toBe(true);
    expect(second).toBe(true);
    expect(useHotkeyStore.getState().entries.get("i")?.count).toBe(2);
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("keeps the first registration and warns in dev when a different label claims the same key", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const store = useHotkeyStore.getState();

    const first = store.register("a", { handler: noop, label: "Adicionar instituição", scope: "page" });
    const second = store.register("a", { handler: noop, label: "Ativar", scope: "page" });

    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(useHotkeyStore.getState().entries.get("a")).toMatchObject({ label: "Adicionar instituição", count: 1 });
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Adicionar instituição"));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Ativar"));
    warnSpy.mockRestore();
  });

  it("decrements the count on unregister, only removing the entry once the count reaches zero", () => {
    const store = useHotkeyStore.getState();
    store.register("i", { handler: noop, label: "Início", scope: "global" });
    store.register("i", { handler: noop, label: "Início", scope: "global" });

    store.unregister("i");
    expect(useHotkeyStore.getState().entries.get("i")?.count).toBe(1);

    store.unregister("i");
    expect(useHotkeyStore.getState().entries.has("i")).toBe(false);
  });

  it("does nothing when asked to unregister a key that was never registered", () => {
    expect(() => useHotkeyStore.getState().unregister("z")).not.toThrow();
    expect(useHotkeyStore.getState().entries.size).toBe(0);
  });

  it("fires the handler that was actually registered, not a stale closure", () => {
    const handler = vi.fn();
    useHotkeyStore.getState().register("a", { handler, label: "Adicionar", scope: "page" });

    useHotkeyStore.getState().entries.get("a")?.handler();

    expect(handler).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/stores/hotkey.store.test.ts` (from `apps/web`)
Expected: FAIL — `./hotkey.store` does not exist yet.

- [ ] **Step 3: Write the minimal implementation**

```ts
// apps/web/src/stores/hotkey.store.ts
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
  register: (key: string, entry: HotkeyEntry) => boolean;
  unregister: (key: string) => void;
}

export const useHotkeyStore = create<HotkeyState>()((set, get) => ({
  entries: new Map(),
  register: (key, entry) => {
    const { entries } = get();
    const existing = entries.get(key);

    if (!existing) {
      const next = new Map(entries);
      next.set(key, { ...entry, count: 1 });
      set({ entries: next });
      return true;
    }

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
}));
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/stores/hotkey.store.test.ts` (from `apps/web`)
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/stores/hotkey.store.ts apps/web/src/stores/hotkey.store.test.ts
git commit -m "feat(web): add the hotkey registry store"
```

---

### Task 2: The `useHotkey` hook

**Files:**
- Create: `apps/web/src/presentation/hooks/useHotkey.ts`
- Test: `apps/web/src/presentation/hooks/useHotkey.test.ts`

**Interfaces:**
- Consumes: `useHotkeyStore` from Task 1 (`register(key, entry): boolean`, `unregister(key):
  void`, and reading `entries` for assertions in tests).
- Produces: `useHotkey(key: string, handler: () => void, label: string, options?: { scope?:
  HotkeyScope; enabled?: boolean }): void`. Default `scope` is `"page"`, default `enabled` is
  `true`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/presentation/hooks/useHotkey.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, act } from "@testing-library/react";
import { useHotkey } from "./useHotkey";
import { useHotkeyStore } from "@/stores/hotkey.store";

function Probe({
  hotkeyKey,
  handler,
  label = "Testar",
  enabled = true,
}: {
  hotkeyKey: string;
  handler: () => void;
  label?: string;
  enabled?: boolean;
}) {
  useHotkey(hotkeyKey, handler, label, { enabled });
  return null;
}

describe("useHotkey", () => {
  beforeEach(() => {
    useHotkeyStore.setState({ entries: new Map() });
  });

  it("registers the key on mount", () => {
    render(<Probe hotkeyKey="a" handler={() => {}} />);
    expect(useHotkeyStore.getState().entries.get("a")?.label).toBe("Testar");
  });

  it("unregisters on unmount", () => {
    const { unmount } = render(<Probe hotkeyKey="a" handler={() => {}} />);
    unmount();
    expect(useHotkeyStore.getState().entries.has("a")).toBe(false);
  });

  it("never registers while enabled is false", () => {
    render(<Probe hotkeyKey="a" handler={() => {}} enabled={false} />);
    expect(useHotkeyStore.getState().entries.has("a")).toBe(false);
  });

  it("registers once enabled flips to true, and unregisters once it flips back to false", () => {
    const { rerender } = render(<Probe hotkeyKey="a" handler={() => {}} enabled={false} />);
    expect(useHotkeyStore.getState().entries.has("a")).toBe(false);

    rerender(<Probe hotkeyKey="a" handler={() => {}} enabled />);
    expect(useHotkeyStore.getState().entries.has("a")).toBe(true);

    rerender(<Probe hotkeyKey="a" handler={() => {}} enabled={false} />);
    expect(useHotkeyStore.getState().entries.has("a")).toBe(false);
  });

  it("re-registers under the new key when key changes, dropping the old one", () => {
    const { rerender } = render(<Probe hotkeyKey="a" handler={() => {}} />);
    rerender(<Probe hotkeyKey="b" handler={() => {}} />);

    expect(useHotkeyStore.getState().entries.has("a")).toBe(false);
    expect(useHotkeyStore.getState().entries.has("b")).toBe(true);
  });

  it("calls the latest handler even though a re-render never re-registers it", () => {
    const firstHandler = vi.fn();
    const secondHandler = vi.fn();
    const { rerender } = render(<Probe hotkeyKey="a" handler={firstHandler} />);

    rerender(<Probe hotkeyKey="a" handler={secondHandler} />);
    act(() => {
      useHotkeyStore.getState().entries.get("a")?.handler();
    });

    expect(firstHandler).not.toHaveBeenCalled();
    expect(secondHandler).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/presentation/hooks/useHotkey.test.ts` (from `apps/web`)
Expected: FAIL — `./useHotkey` does not exist yet.

- [ ] **Step 3: Write the minimal implementation**

```ts
// apps/web/src/presentation/hooks/useHotkey.ts
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
    // handlerRef absorbs handler changes; re-registering on every render
    // would thrash the registry for a prop that changes on every keystroke
    // in a caller with local state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, label, scope, enabled, register, unregister]);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/presentation/hooks/useHotkey.test.ts` (from `apps/web`)
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/presentation/hooks/useHotkey.ts apps/web/src/presentation/hooks/useHotkey.test.ts
git commit -m "feat(web): add the useHotkey registration hook"
```

---

### Task 3: The global listener (`HotkeyListener`)

**Files:**
- Create: `apps/web/src/presentation/layout/HotkeyListener.tsx`
- Test: `apps/web/src/presentation/layout/HotkeyListener.test.tsx`
- Modify: `apps/web/src/app/App.tsx`

**Interfaces:**
- Consumes: `useHotkeyStore.getState().entries` (read directly in the keydown handler, not via
  the reactive selector — the listener itself never re-renders on registry changes, it just
  needs the latest map at the moment a key is pressed).
- Produces: `HotkeyListener` — a component with no props that renders `null` and owns the
  single `document` `keydown` listener for the whole app.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/src/presentation/layout/HotkeyListener.test.tsx
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { HotkeyListener } from "./HotkeyListener";
import { useHotkeyStore } from "@/stores/hotkey.store";

describe("HotkeyListener", () => {
  beforeEach(() => {
    useHotkeyStore.setState({ entries: new Map() });
  });

  it("fires the registered handler for a matching keydown", () => {
    const handler = vi.fn();
    useHotkeyStore.getState().register("a", { handler, label: "Adicionar", scope: "page" });
    render(<HotkeyListener />);

    fireEvent.keyDown(document, { key: "a" });

    expect(handler).toHaveBeenCalledOnce();
  });

  it("does nothing for a key with no registered handler", () => {
    render(<HotkeyListener />);
    expect(() => fireEvent.keyDown(document, { key: "z" })).not.toThrow();
  });

  it("ignores a matching key while the focused element is a text input", () => {
    const handler = vi.fn();
    useHotkeyStore.getState().register("a", { handler, label: "Adicionar", scope: "page" });
    render(
      <>
        <input data-testid="text-input" />
        <HotkeyListener />
      </>,
    );
    const input = screen.getByTestId("text-input");
    input.focus();

    fireEvent.keyDown(input, { key: "a" });

    expect(handler).not.toHaveBeenCalled();
  });

  it("ignores a matching key while the focused element is a textarea", () => {
    const handler = vi.fn();
    useHotkeyStore.getState().register("a", { handler, label: "Adicionar", scope: "page" });
    render(
      <>
        <textarea data-testid="textarea" />
        <HotkeyListener />
      </>,
    );
    const textarea = screen.getByTestId("textarea");
    textarea.focus();

    fireEvent.keyDown(textarea, { key: "a" });

    expect(handler).not.toHaveBeenCalled();
  });

  it("ignores a keydown held with Ctrl, Cmd, or Alt, leaving browser/OS shortcuts alone", () => {
    const handler = vi.fn();
    useHotkeyStore.getState().register("a", { handler, label: "Adicionar", scope: "page" });
    render(<HotkeyListener />);

    fireEvent.keyDown(document, { key: "a", ctrlKey: true });
    fireEvent.keyDown(document, { key: "a", metaKey: true });
    fireEvent.keyDown(document, { key: "a", altKey: true });

    expect(handler).not.toHaveBeenCalled();
  });

  it("removes its listener on unmount", () => {
    const handler = vi.fn();
    useHotkeyStore.getState().register("a", { handler, label: "Adicionar", scope: "page" });
    const { unmount } = render(<HotkeyListener />);
    unmount();

    fireEvent.keyDown(document, { key: "a" });

    expect(handler).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/presentation/layout/HotkeyListener.test.tsx` (from `apps/web`)
Expected: FAIL — `./HotkeyListener` does not exist yet.

- [ ] **Step 3: Write the minimal implementation**

```tsx
// apps/web/src/presentation/layout/HotkeyListener.tsx
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/presentation/layout/HotkeyListener.test.tsx` (from `apps/web`)
Expected: PASS, 6 tests.

- [ ] **Step 5: Mount it in `App.tsx`**

Read `apps/web/src/app/App.tsx` first — it currently renders `<RouterProvider router={router}
/>` and `<ToastViewport />` as siblings inside `QueryClientProvider`. Add the import and mount
`<HotkeyListener />` next to `<ToastViewport />`:

```tsx
// apps/web/src/app/App.tsx
import { useEffect } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router";
import { router } from "./router";
import { createQueryClient } from "./query-client";
import { watchSystemTheme } from "@/presentation/lib/theme";
import { useThemeStore } from "@/stores/theme.store";
import { ToastViewport } from "@/presentation/ui/ToastViewport";
import { HotkeyListener } from "@/presentation/layout/HotkeyListener";
import { useApplyAppearancePrefs } from "@/presentation/hooks/useApplyAppearancePrefs";

const queryClient = createQueryClient();

export function App() {
  const syncSystemTheme = useThemeStore((state) => state.syncSystemTheme);

  useApplyAppearancePrefs();

  useEffect(() => watchSystemTheme(syncSystemTheme), [syncSystemTheme]);

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <ToastViewport />
      <HotkeyListener />
    </QueryClientProvider>
  );
}
```

There is no existing `App.test.tsx` to update — App.tsx is exercised only indirectly today
(via `main.tsx`), so this mount has no direct test in this task; Task 4's `HotkeyHelpModal`
mount and Tasks 5–7's end-to-end hotkey tests are what actually exercise `HotkeyListener`
running for real once wired into a page.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/presentation/layout/HotkeyListener.tsx apps/web/src/presentation/layout/HotkeyListener.test.tsx apps/web/src/app/App.tsx
git commit -m "feat(web): mount a single global hotkey listener"
```

---

### Task 4: The discovery modal (`HotkeyHelpModal`, Shift+?)

**Files:**
- Create: `apps/web/src/presentation/components/HotkeyHelpModal.tsx`
- Test: `apps/web/src/presentation/components/HotkeyHelpModal.test.tsx`
- Modify: `apps/web/src/app/App.tsx`

**Interfaces:**
- Consumes: `useHotkey` (Task 2), `useHotkeyStore` (Task 1, reactive `entries` selector for
  rendering), `Modal` from `@/presentation/ui/Modal`.
- Produces: `HotkeyHelpModal` — a component with no props, manages its own open/closed state,
  opens itself via its own `useHotkey("?", …, "Ver atalhos", { scope: "global" })`.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/src/presentation/components/HotkeyHelpModal.test.tsx
import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { HotkeyHelpModal } from "./HotkeyHelpModal";
import { useHotkeyStore } from "@/stores/hotkey.store";

function noop() {}

describe("HotkeyHelpModal", () => {
  beforeEach(() => {
    useHotkeyStore.setState({ entries: new Map() });
  });

  it("renders nothing when closed", () => {
    render(<HotkeyHelpModal />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens on '?'", () => {
    render(<HotkeyHelpModal />);
    fireEvent.keyDown(document, { key: "?" });
    expect(screen.getByRole("dialog", { name: "Atalhos de teclado" })).toBeInTheDocument();
  });

  it("lists global and page-scoped entries in their own sections", () => {
    useHotkeyStore.getState().register("i", { handler: noop, label: "Início", scope: "global" });
    useHotkeyStore.getState().register("a", { handler: noop, label: "Adicionar instituição", scope: "page" });
    render(<HotkeyHelpModal />);

    fireEvent.keyDown(document, { key: "?" });

    const dialog = screen.getByRole("dialog");
    const globalSection = within(dialog).getByRole("region", { name: "Atalhos globais" });
    expect(within(globalSection).getByText("Início")).toBeInTheDocument();
    expect(within(globalSection).getByText("i")).toBeInTheDocument();

    const pageSection = within(dialog).getByRole("region", { name: "Nesta página" });
    expect(within(pageSection).getByText("Adicionar instituição")).toBeInTheDocument();
    expect(within(pageSection).getByText("a")).toBeInTheDocument();
  });

  it("says there is nothing page-specific when only global entries are registered", () => {
    useHotkeyStore.getState().register("i", { handler: noop, label: "Início", scope: "global" });
    render(<HotkeyHelpModal />);

    fireEvent.keyDown(document, { key: "?" });

    const dialog = screen.getByRole("dialog");
    const pageSection = within(dialog).getByRole("region", { name: "Nesta página" });
    expect(within(pageSection).getByText("Nenhum atalho nesta página.")).toBeInTheDocument();
  });

  it("closes on Escape, same as every other modal", () => {
    render(<HotkeyHelpModal />);
    fireEvent.keyDown(document, { key: "?" });
    const dialog = screen.getByRole("dialog");

    fireEvent.keyDown(dialog, { key: "Escape" });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/presentation/components/HotkeyHelpModal.test.tsx` (from `apps/web`)
Expected: FAIL — `./HotkeyHelpModal` does not exist yet.

- [ ] **Step 3: Write the minimal implementation**

```tsx
// apps/web/src/presentation/components/HotkeyHelpModal.tsx
import { useState } from "react";
import { Modal } from "@/presentation/ui/Modal";
import { useHotkey } from "@/presentation/hooks/useHotkey";
import { useHotkeyStore } from "@/stores/hotkey.store";

function HotkeyRow({ hotkeyKey, label }: { hotkeyKey: string; label: string }) {
  return (
    <li className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-label text-ink-2">{label}</span>
      <kbd className="rounded-control border border-line bg-canvas-alt px-2 py-0.5 font-mono text-label text-muted">
        {hotkeyKey}
      </kbd>
    </li>
  );
}

export function HotkeyHelpModal() {
  const [isOpen, setIsOpen] = useState(false);
  useHotkey("?", () => setIsOpen(true), "Ver atalhos", { scope: "global" });

  const entries = useHotkeyStore((state) => state.entries);
  const globalEntries = [...entries].filter(([, entry]) => entry.scope === "global");
  const pageEntries = [...entries].filter(([, entry]) => entry.scope === "page");

  return (
    <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title="Atalhos de teclado" size="sm">
      <section aria-label="Atalhos globais">
        <h3 className="text-label font-semibold text-ink-2">Atalhos globais</h3>
        <ul className="mt-2">
          {globalEntries.map(([hotkeyKey, entry]) => (
            <HotkeyRow key={hotkeyKey} hotkeyKey={hotkeyKey} label={entry.label} />
          ))}
        </ul>
      </section>
      <section aria-label="Nesta página" className="mt-4">
        <h3 className="text-label font-semibold text-ink-2">Nesta página</h3>
        {pageEntries.length === 0 ? (
          <p className="mt-2 text-label text-muted">Nenhum atalho nesta página.</p>
        ) : (
          <ul className="mt-2">
            {pageEntries.map(([hotkeyKey, entry]) => (
              <HotkeyRow key={hotkeyKey} hotkeyKey={hotkeyKey} label={entry.label} />
            ))}
          </ul>
        )}
      </section>
    </Modal>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/presentation/components/HotkeyHelpModal.test.tsx` (from `apps/web`)
Expected: PASS, 5 tests.

- [ ] **Step 5: Mount it in `App.tsx`**

```tsx
// apps/web/src/app/App.tsx — add the import and the element
import { HotkeyHelpModal } from "@/presentation/components/HotkeyHelpModal";
// …
      <ToastViewport />
      <HotkeyListener />
      <HotkeyHelpModal />
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/presentation/components/HotkeyHelpModal.tsx apps/web/src/presentation/components/HotkeyHelpModal.test.tsx apps/web/src/app/App.tsx
git commit -m "feat(web): add the Shift+? hotkey discovery modal"
```

---

### Task 5: Nav-item hotkeys (`nav-tabs.ts` + `useNavHotkeys`)

**Files:**
- Modify: `apps/web/src/presentation/layout/nav-tabs.ts`
- Modify: `apps/web/src/presentation/layout/nav-tabs.test.ts`
- Create: `apps/web/src/presentation/layout/useNavHotkeys.ts`
- Create: `apps/web/src/presentation/layout/useNavHotkeys.test.tsx`

**Interfaces:**
- Consumes: `useHotkey` (Task 2), `useNavigate` from `react-router`, `NAV_TABS` /
  `SECONDARY_NAV_ITEMS` from `nav-tabs.ts`.
- Produces: `NavDestination` gains an optional `hotkey?: string` field. `useNavHotkeys(): void`
  — call it from a component already inside a router context; registers one `global`-scope
  hotkey per médico destination that has a `hotkey`.

Key assignments (picked by hand to avoid collisions within this one nav — see the spec's
"Assigning keys"): Início → `i`, Check-in → `k` (not `c`, which Conversar gets — the more
frequently used destination keeps the more obvious letter), Conversar → `c`, Apoio → `a`,
Você → `v`, Configurações → `g` (not `c`, already taken).

- [ ] **Step 1: Write the failing test**

Add to the existing `apps/web/src/presentation/layout/nav-tabs.test.ts` (append; do not remove
any existing test):

```ts
describe("nav destination hotkeys", () => {
  it("assigns a distinct single-letter hotkey to each of the five médico destinations", () => {
    const hotkeys = NAV_TABS.map((tab) => tab.hotkey);
    expect(hotkeys).toEqual(["i", "k", "c", "a", "v"]);
    expect(new Set(hotkeys).size).toBe(hotkeys.length);
  });

  it("assigns Configurações a hotkey that does not collide with any médico destination", () => {
    const settings = SECONDARY_NAV_ITEMS.find((item) => item.id === "settings");
    expect(settings?.hotkey).toBe("g");
    expect(NAV_TABS.map((tab) => tab.hotkey)).not.toContain(settings?.hotkey);
  });
});
```

Then create the new test file for the hook:

```tsx
// apps/web/src/presentation/layout/useNavHotkeys.test.tsx
import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { useNavHotkeys } from "./useNavHotkeys";
import { useHotkeyStore } from "@/stores/hotkey.store";
import { routes } from "@/presentation/lib/routes";

function Probe() {
  useNavHotkeys();
  return null;
}

function renderAt(pathname: string) {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <Routes>
        <Route path={routes.home} element={<><Probe /><p>Home screen</p></>} />
        <Route path={routes.chat} element={<p>Chat screen</p>} />
        <Route path={routes.crisis} element={<p>Crisis screen</p>} />
        <Route path={routes.settings} element={<p>Settings screen</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("useNavHotkeys", () => {
  beforeEach(() => {
    useHotkeyStore.setState({ entries: new Map() });
  });

  it("registers a global hotkey for every médico destination and Configurações", () => {
    renderAt(routes.home);
    const entries = useHotkeyStore.getState().entries;
    expect(entries.get("i")).toMatchObject({ label: "Início", scope: "global" });
    expect(entries.get("c")).toMatchObject({ label: "Conversar", scope: "global" });
    expect(entries.get("g")).toMatchObject({ label: "Configurações", scope: "global" });
  });

  it("navigates to a destination's route when its hotkey fires", async () => {
    renderAt(routes.home);
    // useNavHotkeys only registers; calling the handler directly proves the
    // wiring without depending on HotkeyListener also being mounted here —
    // that dispatch path is HotkeyListener's own responsibility, covered by
    // its own tests, and end-to-end by Task 6's Sidebar/BottomNav tests.
    useHotkeyStore.getState().entries.get("c")?.handler();

    expect(await screen.findByText("Chat screen")).toBeInTheDocument();
  });

  it("navigates to Apoio when its hotkey fires", async () => {
    renderAt(routes.home);
    useHotkeyStore.getState().entries.get("a")?.handler();
    expect(await screen.findByText("Crisis screen")).toBeInTheDocument();
  });

  it("navigates to Configurações when its hotkey fires", async () => {
    renderAt(routes.home);
    useHotkeyStore.getState().entries.get("g")?.handler();
    expect(await screen.findByText("Settings screen")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/presentation/layout/nav-tabs.test.ts src/presentation/layout/useNavHotkeys.test.tsx` (from `apps/web`)
Expected: FAIL — `nav-tabs.test.ts`'s new tests fail because `hotkey` is `undefined` on every
destination; `useNavHotkeys.test.tsx` fails because `./useNavHotkeys` does not exist yet.

- [ ] **Step 3: Write the minimal implementation**

Edit `apps/web/src/presentation/layout/nav-tabs.ts`:

```ts
// In NavDestination, add the optional field:
export interface NavDestination {
  id: string;
  label: string;
  icon: ComponentType<{ size?: number }>;
  route: string;
  hotkey?: string;
}

// NAV_TABS gains a hotkey per entry:
export const NAV_TABS: NavTab[] = [
  { id: "home", label: "Início", icon: Home, route: routes.home, hotkey: "i" },
  { id: "checkin", label: "Check-in", icon: ClipboardCheck, route: routes.assessment, hotkey: "k" },
  { id: "chat", label: "Conversar", icon: MessageCircle, route: routes.chat, hotkey: "c" },
  { id: "apoio", label: "Apoio", icon: HandHeart, route: routes.crisis, hotkey: "a" },
  { id: "you", label: "Você", icon: UserRound, route: routes.you, hotkey: "v" },
];

// SETTINGS_NAV_ITEM gains one too:
export const SETTINGS_NAV_ITEM: NavDestination = {
  id: "settings",
  label: "Configurações",
  icon: SlidersHorizontal,
  route: routes.settings,
  hotkey: "g",
};

// ADMIN_NAV_ITEM and PEER_PARTNER_NAV_ITEM are unchanged — out of Phase 1 scope,
// so they get no `hotkey` (the field is optional for exactly this reason).
```

Create `apps/web/src/presentation/layout/useNavHotkeys.ts`:

```ts
import { useNavigate } from "react-router";
import { useHotkey } from "@/presentation/hooks/useHotkey";
import { NAV_TABS, SECONDARY_NAV_ITEMS, type NavDestination } from "./nav-tabs";

function findDestination(id: string, destinations: readonly NavDestination[]): NavDestination {
  const found = destinations.find((destination) => destination.id === id);
  if (!found) throw new Error(`useNavHotkeys: no nav destination with id "${id}"`);
  return found;
}

/**
 * One `useHotkey` call per médico destination, spelled out rather than looped —
 * React's rules of hooks forbid a variable-length loop of hook calls, and this
 * list is fixed at six entries by hand in nav-tabs.ts.
 */
export function useNavHotkeys(): void {
  const navigate = useNavigate();

  const home = findDestination("home", NAV_TABS);
  const checkin = findDestination("checkin", NAV_TABS);
  const chat = findDestination("chat", NAV_TABS);
  const apoio = findDestination("apoio", NAV_TABS);
  const you = findDestination("you", NAV_TABS);
  const settings = findDestination("settings", SECONDARY_NAV_ITEMS);

  useHotkey(home.hotkey ?? "", () => navigate(home.route), home.label, {
    scope: "global",
    enabled: Boolean(home.hotkey),
  });
  useHotkey(checkin.hotkey ?? "", () => navigate(checkin.route), checkin.label, {
    scope: "global",
    enabled: Boolean(checkin.hotkey),
  });
  useHotkey(chat.hotkey ?? "", () => navigate(chat.route), chat.label, {
    scope: "global",
    enabled: Boolean(chat.hotkey),
  });
  useHotkey(apoio.hotkey ?? "", () => navigate(apoio.route), apoio.label, {
    scope: "global",
    enabled: Boolean(apoio.hotkey),
  });
  useHotkey(you.hotkey ?? "", () => navigate(you.route), you.label, {
    scope: "global",
    enabled: Boolean(you.hotkey),
  });
  useHotkey(settings.hotkey ?? "", () => navigate(settings.route), settings.label, {
    scope: "global",
    enabled: Boolean(settings.hotkey),
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/presentation/layout/nav-tabs.test.ts src/presentation/layout/useNavHotkeys.test.tsx` (from `apps/web`)
Expected: PASS — 9 tests in `nav-tabs.test.ts` (7 existing + 2 new), 4 tests in
`useNavHotkeys.test.tsx`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/presentation/layout/nav-tabs.ts apps/web/src/presentation/layout/nav-tabs.test.ts apps/web/src/presentation/layout/useNavHotkeys.ts apps/web/src/presentation/layout/useNavHotkeys.test.tsx
git commit -m "feat(web): assign médico nav destinations a hotkey each"
```

---

### Task 6: Wire `useNavHotkeys` into `Sidebar` and `BottomNav`

**Files:**
- Modify: `apps/web/src/presentation/layout/Sidebar.tsx`
- Modify: `apps/web/src/presentation/layout/Sidebar.test.tsx`
- Modify: `apps/web/src/presentation/layout/BottomNav.tsx`
- Modify: `apps/web/src/presentation/layout/BottomNav.test.tsx`

**Interfaces:**
- Consumes: `useNavHotkeys` (Task 5), `HotkeyListener` (Task 3, mounted directly in these
  tests to exercise the full path from keydown to navigation).

- [ ] **Step 1: Write the failing test**

`BottomNav.test.tsx` already exists, rendering `<BottomNav />` inside a bare `<MemoryRouter>`
with no `<Routes>` (it only asserts on link attributes, never on a second page actually
rendering after a navigation). The new test below needs an actual second route to land on, so
its import line gains `Routes`/`Route`/`fireEvent` alongside what's already there.

Append to `Sidebar.test.tsx`:

```tsx
// apps/web/src/presentation/layout/Sidebar.test.tsx — add these imports at the top
import { HotkeyListener } from './HotkeyListener';
import { useHotkeyStore } from '@/stores/hotkey.store';

// and append this describe block at the end of the file
describe('Sidebar hotkeys', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useHotkeyStore.setState({ entries: new Map() });
  });

  it("navigates to Conversar when its hotkey fires", async () => {
    render(
      <MemoryRouter initialEntries={[routes.home]}>
        <Routes>
          <Route path={routes.home} element={<><Sidebar /><HotkeyListener /></>} />
          <Route path={routes.chat} element={<p>Chat screen</p>} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.keyDown(document, { key: 'c' });

    expect(await screen.findByText('Chat screen')).toBeInTheDocument();
  });
});
```

`BottomNav.test.tsx` currently imports only `{ describe, expect, it }` from `vitest`, `{
render, screen }` from `@testing-library/react`, and `{ MemoryRouter }` from `react-router` —
none of `beforeEach`, `fireEvent`, `Routes`, `Route`, `HotkeyListener`, or `useHotkeyStore`.
Change its import lines to:

```tsx
// apps/web/src/presentation/layout/BottomNav.test.tsx — replace the existing import lines with:
import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router";
import { BottomNav } from "./BottomNav";
import { HotkeyListener } from "./HotkeyListener";
import { useHotkeyStore } from "@/stores/hotkey.store";
import { routes } from "@/presentation/lib/routes";
```

Then append this describe block at the end of the file (same shape as the one just added to
`Sidebar.test.tsx`, rendering `<BottomNav />` instead of `<Sidebar />`):

```tsx
describe('BottomNav hotkeys', () => {
  beforeEach(() => {
    useHotkeyStore.setState({ entries: new Map() });
  });

  it("navigates to Conversar when its hotkey fires", async () => {
    render(
      <MemoryRouter initialEntries={[routes.home]}>
        <Routes>
          <Route path={routes.home} element={<><BottomNav /><HotkeyListener /></>} />
          <Route path={routes.chat} element={<p>Chat screen</p>} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.keyDown(document, { key: 'c' });

    expect(await screen.findByText('Chat screen')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/presentation/layout/Sidebar.test.tsx src/presentation/layout/BottomNav.test.tsx` (from `apps/web`)
Expected: FAIL — pressing `c` does nothing yet, since neither component calls `useNavHotkeys`.

- [ ] **Step 3: Write the minimal implementation**

Edit `apps/web/src/presentation/layout/Sidebar.tsx` — add the import and call the hook at the
top of the component body:

```tsx
import { NAV_TABS, SECONDARY_NAV_ITEMS, type NavDestination } from './nav-tabs';
import { SidebarHeader } from './SidebarHeader';
import { useNavHotkeys } from './useNavHotkeys';
// … (routes / storage imports unchanged)

export const Sidebar = memo(function Sidebar() {
  useNavHotkeys();
  const [collapsed, setCollapsed] = useState(readStoredCollapsed);
  // … rest unchanged
```

Edit `apps/web/src/presentation/layout/BottomNav.tsx` the same way:

```tsx
import { NAV_TABS, SECONDARY_NAV_ITEMS } from './nav-tabs';
import { NavSlotLink } from './nav-slot';
import { useNavHotkeys } from './useNavHotkeys';

export function BottomNav() {
  useNavHotkeys();
  return (
    <nav
      // … unchanged
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/presentation/layout/Sidebar.test.tsx src/presentation/layout/BottomNav.test.tsx` (from `apps/web`)
Expected: PASS — all existing tests plus the two new ones.

- [ ] **Step 5: Confirm the two navs mounted together do not spam a dev warning**

This is a manual check, not an automated test — the point is to confirm the reference-count
merge from Task 1 actually prevents the console.warn when both Sidebar and BottomNav register
"Início" at once, which happens on every real médico page (`PhoneShell` mounts both, toggling
visibility with CSS). Run the full web suite once and confirm no new `console.warn` output
appears from any test that renders a full `PhoneShell`-based page:

Run: `npx vitest run` (from `apps/web`)
Expected: PASS, no new failures, no unexpected `[hotkeys]` warnings printed to the test runner
output for any existing page test.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/presentation/layout/Sidebar.tsx apps/web/src/presentation/layout/Sidebar.test.tsx apps/web/src/presentation/layout/BottomNav.tsx apps/web/src/presentation/layout/BottomNav.test.tsx
git commit -m "feat(web): navigate the médico app with a keypress"
```

---

### Task 7: `AdminInstitutionsPage`'s CRUD hotkeys

**Files:**
- Modify: `apps/web/src/presentation/pages/AdminInstitutionsPage.tsx`
- Modify: `apps/web/src/presentation/pages/AdminInstitutionsPage.test.tsx`

**Interfaces:**
- Consumes: `useHotkey` (Task 2), `HotkeyListener` (Task 3, mounted alongside the page in these
  tests).

Key assignments: Adicionar instituição → `a` (opens the create modal — the toolbar button, not
the modal's own submit button), bulk-toolbar Editar → `e`, Salvar (inside the edit modal) →
`s`, bulk-toolbar Desativar → `d`, bulk-toolbar Ativar → `t` (not `a` — already claimed by
Adicionar instituição, which is registered whenever no modal is open, i.e. whenever Ativar
could also be enabled; see the spec's "Assigning keys"). Every one of these is disabled while
either modal on this page (`formMode !== null`, or the QR modal `qrInstitution !== null`) is
open, except Salvar, which is enabled only while the edit modal specifically is open.

- [ ] **Step 1: Write the failing test**

Read `apps/web/src/presentation/pages/AdminInstitutionsPage.test.tsx` first (already large —
add to it, don't replace it) and append a new `describe` block at the end, before the file's
closing. It needs `HotkeyListener` mounted alongside the page and the registry reset between
tests:

The file's current `@testing-library/react` import line is `import { render, screen, waitFor,
within } from "@testing-library/react";` — it does not include `fireEvent`, which every test
below needs.

```tsx
// Change the @testing-library/react import line to:
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

// Add these two new imports alongside the existing ones:
import { HotkeyListener } from "@/presentation/layout/HotkeyListener";
import { useHotkeyStore } from "@/stores/hotkey.store";

// Change renderPage() to also mount HotkeyListener alongside the page:
function renderPage() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/admin"]}>
        <Routes>
          <Route
            path="/admin"
            element={
              <>
                <AdminInstitutionsPage />
                <HotkeyListener />
              </>
            }
          />
          <Route path={routes.home} element={<p>Início do médico</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// Reset the hotkey registry alongside the existing beforeEach resets:
beforeEach(() => {
  sessionStorage.clear();
  useAdminSessionStore.getState().setSession("token", new Date(Date.now() + 60_000).toISOString());
  useToastStore.getState().clear();
  useHotkeyStore.setState({ entries: new Map() });
});

// Append this describe block at the end of the file, before the final closing:
describe("hotkeys", () => {
  it("opens the create modal on 'a'", async () => {
    vi.spyOn(container.listInstitutionsUseCase, "execute").mockResolvedValue(page([]));
    renderPage();
    await screen.findByRole("button", { name: "+ Adicionar instituição" });

    fireEvent.keyDown(document, { key: "a" });

    expect(await screen.findByRole("dialog", { name: "Adicionar instituição" })).toBeInTheDocument();
  });

  it("opens the edit modal on 'e' once exactly one row is selected", async () => {
    vi.spyOn(container.listInstitutionsUseCase, "execute").mockResolvedValue(
      page([
        { id: "1", name: "Hospital Teste", inviteCode: "teste-2026", isActive: true, createdAt: "2026-08-01T00:00:00.000Z", hospitalAdminNames: [] },
      ]),
    );
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("checkbox", { name: "Selecionar Hospital Teste" }));

    fireEvent.keyDown(document, { key: "e" });

    expect(await screen.findByRole("dialog", { name: "Editar Hospital Teste" })).toBeInTheDocument();
  });

  it("does nothing on 'e' with nothing selected", async () => {
    vi.spyOn(container.listInstitutionsUseCase, "execute").mockResolvedValue(page([]));
    renderPage();
    await screen.findByRole("button", { name: "+ Adicionar instituição" });

    fireEvent.keyDown(document, { key: "e" });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("saves the edit on 's' while the edit modal is open", async () => {
    vi.spyOn(container.listInstitutionsUseCase, "execute").mockResolvedValue(
      page([
        { id: "1", name: "Hospital Teste", inviteCode: "teste-2026", isActive: true, createdAt: "2026-08-01T00:00:00.000Z", hospitalAdminNames: [] },
      ]),
    );
    const updateInstitution = vi.spyOn(container.updateInstitutionUseCase, "execute").mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage();
    const table = within(await screen.findByRole("table"));
    await user.click(table.getByRole("button", { name: "Editar Hospital Teste" }));
    await screen.findByRole("dialog", { name: "Editar Hospital Teste" });

    fireEvent.keyDown(document, { key: "s" });

    await waitFor(() => expect(updateInstitution).toHaveBeenCalledWith("token", "1", { name: "Hospital Teste" }));
  });

  it("does nothing on 's' while no modal is open", async () => {
    vi.spyOn(container.listInstitutionsUseCase, "execute").mockResolvedValue(page([]));
    const updateInstitution = vi.spyOn(container.updateInstitutionUseCase, "execute");
    renderPage();
    await screen.findByRole("button", { name: "+ Adicionar instituição" });

    fireEvent.keyDown(document, { key: "s" });

    expect(updateInstitution).not.toHaveBeenCalled();
  });

  it("deactivates the selection on 'd'", async () => {
    vi.spyOn(container.listInstitutionsUseCase, "execute").mockResolvedValue(
      page([
        { id: "1", name: "Hospital Teste", inviteCode: "teste-2026", isActive: true, createdAt: "2026-08-01T00:00:00.000Z", hospitalAdminNames: [] },
      ]),
    );
    const updateInstitution = vi.spyOn(container.updateInstitutionUseCase, "execute").mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("checkbox", { name: "Selecionar Hospital Teste" }));

    fireEvent.keyDown(document, { key: "d" });

    await waitFor(() => expect(updateInstitution).toHaveBeenCalledWith("token", "1", { isActive: false }));
  });

  it("activates the selection on 't'", async () => {
    vi.spyOn(container.listInstitutionsUseCase, "execute").mockResolvedValue(
      page([
        { id: "1", name: "Hospital Pausado", inviteCode: "pausado-2026", isActive: false, createdAt: "2026-08-01T00:00:00.000Z", hospitalAdminNames: [] },
      ]),
    );
    const updateInstitution = vi.spyOn(container.updateInstitutionUseCase, "execute").mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("checkbox", { name: "Selecionar Hospital Pausado" }));

    fireEvent.keyDown(document, { key: "t" });

    await waitFor(() => expect(updateInstitution).toHaveBeenCalledWith("token", "1", { isActive: true }));
  });

  it("does nothing on 'd' — a different page hotkey — while the create modal sits on top", async () => {
    // Proves modal-scoped suppression applies to every page hotkey, not only
    // the one belonging to whichever modal happens to be open.
    vi.spyOn(container.listInstitutionsUseCase, "execute").mockResolvedValue(page([]));
    const createInstitution = vi.spyOn(container.createInstitutionUseCase, "execute");
    const updateInstitution = vi.spyOn(container.updateInstitutionUseCase, "execute");
    const user = userEvent.setup();
    renderPage();
    await openCreateModal(user);

    fireEvent.keyDown(document, { key: "d" });

    expect(createInstitution).not.toHaveBeenCalled();
    expect(updateInstitution).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Adicionar instituição" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/presentation/pages/AdminInstitutionsPage.test.tsx` (from `apps/web`)
Expected: FAIL — none of the hotkeys exist yet, so every new test in the `hotkeys` block fails
(the rest of the file's existing tests keep passing).

- [ ] **Step 3: Write the minimal implementation**

Edit `apps/web/src/presentation/pages/AdminInstitutionsPage.tsx`. Add the import:

```tsx
import { useHotkey } from "@/presentation/hooks/useHotkey";
```

Add a small derived boolean and the five `useHotkey` calls right after `selection` is computed
(after the line `const selection = useDataTableSelection(...)`, before `const openCreate = ()
=> {`):

```tsx
  const selection = useDataTableSelection(filteredInstitutions, { singular: "instituição", article: "uma" });

  const isAnyModalOpen = formMode !== null || qrInstitution !== null;

  const openCreate = () => {
    // … unchanged
```

Then, after `handleBulkActivate` is defined (right before `const hospitalAdminEmailError =`),
add the five hotkey registrations:

```tsx
  const handleBulkActivate = async () => {
    const { failedIds } = await runStatusUpdate(selection.selectedIds, true);
    if (failedIds.length === 0) selection.clear();
  };

  useHotkey("a", openCreate, "Adicionar instituição", { enabled: !isAnyModalOpen });
  useHotkey("e", () => selection.selectedRows[0] && openEdit(selection.selectedRows[0]), "Editar", {
    enabled: !isAnyModalOpen && selection.edit.enabled,
  });
  useHotkey("s", handleSaveEdit, "Salvar", { enabled: formMode === "edit" });
  useHotkey("d", handleBulkDeactivate, "Desativar", { enabled: !isAnyModalOpen && selection.pause.enabled });
  useHotkey("t", handleBulkActivate, "Ativar", { enabled: !isAnyModalOpen && selection.activate.enabled });

  const hospitalAdminEmailError =
    // … unchanged
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/presentation/pages/AdminInstitutionsPage.test.tsx` (from `apps/web`)
Expected: PASS — all existing tests plus the 8 new ones in the `hotkeys` block.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/presentation/pages/AdminInstitutionsPage.tsx apps/web/src/presentation/pages/AdminInstitutionsPage.test.tsx
git commit -m "feat(web): add hotkeys to AdminInstitutionsPage's CRUD actions"
```

---

### Task 8: Full-suite verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full web test suite**

Run: `npx vitest run` (from `apps/web`)
Expected: PASS, no regressions anywhere in the suite.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json` (from `apps/web`)
Expected: no output (clean).

- [ ] **Step 3: Lint the touched files**

Run (from `apps/web`):
```bash
npx eslint src/stores/hotkey.store.ts src/stores/hotkey.store.test.ts \
  src/presentation/hooks/useHotkey.ts src/presentation/hooks/useHotkey.test.ts \
  src/presentation/layout/HotkeyListener.tsx src/presentation/layout/HotkeyListener.test.tsx \
  src/presentation/components/HotkeyHelpModal.tsx src/presentation/components/HotkeyHelpModal.test.tsx \
  src/presentation/layout/nav-tabs.ts src/presentation/layout/nav-tabs.test.ts \
  src/presentation/layout/useNavHotkeys.ts src/presentation/layout/useNavHotkeys.test.tsx \
  src/presentation/layout/Sidebar.tsx src/presentation/layout/Sidebar.test.tsx \
  src/presentation/layout/BottomNav.tsx src/presentation/layout/BottomNav.test.tsx \
  src/presentation/pages/AdminInstitutionsPage.tsx src/presentation/pages/AdminInstitutionsPage.test.tsx \
  src/app/App.tsx
```
Expected: no output (clean).

- [ ] **Step 4: Manual smoke test**

Start the dev server (`pnpm dev` from `apps/web`, or however this session already has it
running) and, in a browser: on any médico screen (e.g. Home), press `c` and confirm it
navigates to Conversar; press `Shift+?` and confirm the discovery modal lists at least Início,
Check-in, Conversar, Apoio, Você, Configurações under "Atalhos globais". Log in to `/admin`,
press `a` and confirm the create-institution modal opens; close it, select a row, press `e` and
confirm the edit modal opens with that row's name; press `s` and confirm it saves. This step
has no automated assertion — it is the final human check that the wiring behaves in a real
browser, not just under jsdom.

- [ ] **Step 5: Report**

No commit for this task — it is verification only. If any step surfaces a regression, fix it
as part of the task that introduced it (amend that task's commit is not appropriate this late;
create a new small fix commit instead) and re-run Steps 1–3.

## Self-Review Notes

- **Spec coverage:** registry (Task 1), `useHotkey` (Task 2), global listener + typing-safety +
  modifier-key exclusion (Task 3), discovery modal (Task 4), nav-item key assignment (Task 5),
  Sidebar/BottomNav wiring including the ref-count merge behavior (Task 6), AdminInstitutionsPage's
  five action hotkeys including modal-scoped suppression (Task 7). The spec's "Destructive actions
  stay safe" principle is satisfied structurally in Task 7 — every hotkey calls the exact same
  handler (`handleBulkDeactivate`, `openEdit`, etc.) the existing `onClick` already calls, no new
  handler was written.
- **Placeholder scan:** none found — every step carries real, complete code.
- **Type consistency:** `HotkeyEntry`/`HotkeyScope` (Task 1) are the exact names imported in
  Tasks 2–7; `useHotkey`'s signature (Task 2) matches every call site in Tasks 4–7; `NavDestination.hotkey`
  (Task 5) is the exact field `useNavHotkeys` reads.
